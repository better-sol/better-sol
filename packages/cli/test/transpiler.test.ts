import { describe, expect, test } from "bun:test";
import { parseProgramsFromFile } from "../src/parser/ast";
import { generateAnchorProject } from "../src/generator/rust";

const counterSource = `import { bs, cpi } from 'better-sol/program'

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
}).derive((seed) => ["counter", seed.authority])

export const counter = bs.program({
  name: 'counter',
  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
  errors: {
    Unauthorized: 'Only the creator can perform this action',
    NotActive: 'Counter is not active',
  },
}, ix => ({
    initialize: ix({
      accounts: {
        counter: bs.init(Counter),
        authority: bs.signer(),
      },
      args: { initialValue: bs.u64() },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.isActive = true
      },
    }),
    increment: ix({
      accounts: {
        counter: bs.mut(Counter),
        authority: bs.signer(),
      },
      args: { amount: bs.u64() },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),
    close: ix({
      accounts: {
        counter: bs.close(Counter, 'authority'),
        authority: bs.signer(),
      },
      run: () => {},
    }),
}))`;

describe("AST parser", () => {
  test("parses program metadata", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs[0]!.name).toBe("counter");
    expect(programs[0]!.address).toBe("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs");
    expect(programs[0]!.instructions.length).toBe(3);
    expect(programs[0]!.accounts.length).toBe(1);
    expect(programs[0]!.errors.length).toBe(2);
  });

  test("parses account fields and seeds", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const account = programs[0]!.accounts[0]!;
    expect(account.name).toBe("Counter");
    expect(account.fields.length).toBe(3);
    expect(account.fields[0]!.name).toBe("count");
    expect(account.fields[0]!.type).toBe("u64");
    expect(account.fields[2]!.type).toBe("bool");
    expect(account.seeds.length).toBe(2);
    expect(account.seeds[0]).toEqual({ kind: "literal", value: "counter" });
    expect(account.seeds[1]).toEqual({ kind: "field", fieldName: "authority" });
    expect(account.space).toBe(49);
  });

  test("parses instruction constraints", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const initIx = programs[0]!.instructions[0]!;
    expect(initIx.accounts[0]!.constraint.kind).toBe("init");
    expect(initIx.accounts[1]!.constraint.kind).toBe("signer");
    expect(initIx.args[0]!.name).toBe("initialValue");
    expect(initIx.args[0]!.type).toBe("u64");

    const closeIx = programs[0]!.instructions[2]!;
    expect(closeIx.accounts[0]!.constraint.kind).toBe("close");
  });

  test("rejects dynamic string PDA seed templates", () => {
    const source = counterSource.replace('"counter", seed.authority', '"counter", "{authority}"');
    expect(() => parseProgramsFromFile(source, "counter.ts")).toThrow("Dynamic PDA seed template");
  });

  test("rejects account and arg name collisions", () => {
    const source = counterSource.replace("args: { initialValue: bs.u64() }", "args: { counter: bs.u64() }");
    expect(() => parseProgramsFromFile(source, "counter.ts")).toThrow("both an account and arg named 'counter'");
  });

  test("rejects zero-copy bool fields", () => {
    const source = "import { bs, cpi } from 'better-sol/program'\nconst Flags = bs.account({ paused: bs.bool(), bump: bs.u8() }).zeroCopy()\nexport const flags = bs.program({ name: 'flags', address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs' }, ix => ({\n  init: ix({ accounts: { flags: bs.init(Flags), authority: bs.signer() }, run: () => {} })\n}))";
    expect(() => parseProgramsFromFile(source, "flags.ts")).toThrow("not zero-copy safe");
  });
});

describe("Rust generator", () => {
  test("generates header with declare_id and imports", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain('declare_id!("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs")');
    expect(project.libRs).toContain("use anchor_lang::prelude::*;");
  });

  test("generates account struct with fields", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[account]");
    expect(project.libRs).toContain("pub struct Counter");
    expect(project.libRs).toContain("pub count: u64");
    expect(project.libRs).toContain("pub authority: Pubkey");
    expect(project.libRs).toContain("pub is_active: bool");
  });

  test("generates error enum with messages", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[error_code]");
    expect(project.libRs).toContain("pub enum ProgramError");
    expect(project.libRs).toContain('#[msg("Only the creator can perform this action")]');
    expect(project.libRs).toContain("Unauthorized,");
    expect(project.libRs).toContain("NotActive,");
  });

  test("generates program module with instruction fns", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[program]");
    expect(project.libRs).toContain("pub fn initialize(ctx: Context<Initialize>");
    expect(project.libRs).toContain("pub fn increment(ctx: Context<Increment>");
    expect(project.libRs).toContain("pub fn close(_ctx: Context<Close>");
  });

  test("generates Accounts structs with constraints", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[derive(Accounts)]");
    expect(project.libRs).toContain("pub struct Initialize<");
    expect(project.libRs).toContain("pub struct Increment<");
    expect(project.libRs).toContain("pub struct Close<");
    expect(project.libRs).toContain("init,");
    expect(project.libRs).toContain("payer = authority");
    expect(project.libRs).toContain("space = 49");
    expect(project.libRs).toContain('b"counter"');
    expect(project.libRs).toContain("close = authority");
  });

  test("generates Cargo.toml with dependencies", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.cargoToml).toContain('name = "counter"');
    expect(project.cargoToml).toContain('anchor-lang = { version = "=1.0.2"');
  });

  test("generates IDL with instructions, accounts, and errors", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    const idl = project.idl as Record<string, unknown>;
    expect(idl.name).toBe("counter");
    expect(idl.address).toBe("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs");
    expect(Array.isArray(idl.instructions)).toBe(true);
    expect(Array.isArray(idl.accounts)).toBe(true);
    expect(Array.isArray(idl.errors)).toBe(true);
    expect((idl.instructions as ReadonlyArray<Record<string, unknown>>).length).toBe(3);
  });
});

describe("Transpiler diagnostics", () => {
  function expectDiagnostic(runBody: string, expected: string): void {
    const source = "import { bs, cpi } from 'better-sol/program'\nconst Counter = bs.account({ count: bs.u64(), authority: bs.pubkey(), isActive: bs.bool() }).derive((seed) => ['counter', seed.authority])\nexport const counter = bs.program({\n  name: 'counter',\n  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',\n  errors: { Unauthorized: 'Unauthorized' },\n}, ix => ({\n    bad: ix({\n      accounts: { counter: bs.mut(Counter), authority: bs.signer() },\n      args: { amount: bs.u64() },\n      run: ({ counter, authority }, { amount }, ctx) => " + runBody + ",\n    }),\n}))";
    const program = parseProgramsFromFile(source, "bad.ts")[0]!;
    expect(() => generateAnchorProject(program)).toThrow(expected);
  }

  test("rejects destructuring declarations", () => {
    expectDiagnostic("{ const { count } = counter; counter.count = count }", "destructuring variable declarations");
  });

  test("rejects object spread", () => {
    expectDiagnostic("{ counter.count = { ...counter }.count }", "object spread");
  });

  test("rejects unknown external identifiers", () => {
    expectDiagnostic("{ counter.count = DEFAULT_AMOUNT }", "identifier 'DEFAULT_AMOUNT'");
  });

  test("rejects unknown account fields", () => {
    expectDiagnostic("{ counter.missingField = amount }", "unknown field 'missingField'");
  });

  test("rejects unsupported function calls", () => {
    expectDiagnostic("{ counter.count = Math.max(counter.count, amount) }", "Supported calls are ctx.require");
  });

  test("rejects return statements", () => {
    expectDiagnostic("{ return; }", "return statements");
  });

  test("rejects template string expressions", () => {
    expectDiagnostic("{ const size = 'size-' + String(amount); counter.count = 1n }", "unsupported TypeScript");
  });
});
