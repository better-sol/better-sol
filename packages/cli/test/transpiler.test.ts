import { describe, expect, test } from "bun:test";
import { parseProgramsFromFile } from "../src/parser/ast";
import { generateAnchorProject } from "../src/generator/rust";

const counterSource = `
import { program, account, u64, bool, pubkey, p } from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).derive((seed) => ["counter", seed.authority])

export const counter = program({
  name: 'counter',
  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
  errors: {
    Unauthorized: 'Only the creator can perform this action',
    NotActive: 'Counter is not active',
  },
}, ix => ({
    initialize: ix({
      accounts: {
        counter: p.create(Counter),
        authority: p.signer(),
      },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.isActive = true
      },
    }),
    increment: ix({
      accounts: {
        counter: p.mut(Counter),
        authority: p.signer(),
      },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),
    close: ix({
      accounts: {
        counter: p.close(Counter, 'authority'),
        authority: p.signer(),
      },
      run: () => {},
    }),
}))
`;

describe("AST parser", () => {
  test("parses program name and address", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs.length).toBe(1);
    expect(programs[0]!.name).toBe("counter");
    expect(programs[0]!.address).toBe("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs");
  });

  test("parses accounts", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs[0]!.accounts.length).toBe(1);
    expect(programs[0]!.accounts[0]!.name).toBe("Counter");
    expect(programs[0]!.accounts[0]!.fields.length).toBe(3);
    expect(programs[0]!.accounts[0]!.fields[0]!.name).toBe("count");
    expect(programs[0]!.accounts[0]!.fields[0]!.type).toBe("u64");
    expect(programs[0]!.accounts[0]!.fields[1]!.name).toBe("authority");
    expect(programs[0]!.accounts[0]!.fields[1]!.type).toBe("pubkey");
    expect(programs[0]!.accounts[0]!.fields[2]!.name).toBe("isActive");
    expect(programs[0]!.accounts[0]!.fields[2]!.type).toBe("bool");
  });

  test("parses account seeds", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const seeds = programs[0]!.accounts[0]!.seeds;
    expect(seeds.length).toBe(2);
    expect(seeds[0]).toEqual({ kind: "literal", value: "counter" });
    expect(seeds[1]).toEqual({ kind: "field", fieldName: "authority" });
  });

  test("parses instructions", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs[0]!.instructions.length).toBe(3);
    expect(programs[0]!.instructions[0]!.name).toBe("initialize");
    expect(programs[0]!.instructions[1]!.name).toBe("increment");
    expect(programs[0]!.instructions[2]!.name).toBe("close");
  });

  test("parses instruction accounts with constraints", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const initIx = programs[0]!.instructions[0]!;
    expect(initIx.accounts.length).toBe(2);
    expect(initIx.accounts[0]!.name).toBe("counter");
    expect(initIx.accounts[0]!.constraint.kind).toBe("init");
    expect(initIx.accounts[1]!.name).toBe("authority");
    expect(initIx.accounts[1]!.constraint.kind).toBe("signer");
  });

  test("parses instruction args", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const initIx = programs[0]!.instructions[0]!;
    expect(initIx.args.length).toBe(1);
    expect(initIx.args[0]!.name).toBe("initialValue");
    expect(initIx.args[0]!.type).toBe("u64");
  });

  test("parses close constraint", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const closeIx = programs[0]!.instructions[2]!;
    expect(closeIx.accounts[0]!.constraint.kind).toBe("close");
  });

  test("parses errors", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs[0]!.errors.length).toBe(2);
    expect(programs[0]!.errors[0]!.name).toBe("Unauthorized");
    expect(programs[0]!.errors[0]!.message).toBe("Only the creator can perform this action");
  });

  test("calculates account space", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    expect(programs[0]!.accounts[0]!.space).toBe(49);
  });

  test("rejects dynamic string PDA seed templates", () => {
    const source = counterSource.replace('"counter", seed.authority', '"counter", "{authority}"');
    expect(() => parseProgramsFromFile(source, "counter.ts")).toThrow("Dynamic PDA seed template");
  });

  test("rejects account and arg name collisions", () => {
    const source = counterSource.replace("args: { initialValue: u64 }", "args: { counter: u64 }");
    expect(() => parseProgramsFromFile(source, "counter.ts")).toThrow("both an account and arg named 'counter'");
  });

  test("rejects zero-copy bool fields", () => {
    const source = `
import { program, account, bool, p } from 'better-sol/program'
const Flags = account({ paused: bool }).zeroCopy()
export const flags = program({ name: 'flags', address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs' }, ix => ({
  init: ix({ accounts: { flags: p.create(Flags) }, run: () => {} })
}))`;
    expect(() => parseProgramsFromFile(source, "flags.ts")).toThrow("not zero-copy safe");
  });
});

describe("Transpiler diagnostics", () => {
  function expectDiagnostic(runBody: string, expected: string): void {
    const source = `
import { program, account, u64, bool, pubkey, p } from 'better-sol/program'
const Counter = account({ count: u64, authority: pubkey, isActive: bool }).derive((seed) => ["counter", seed.authority])
export const counter = program({
  name: 'counter',
  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
  errors: { Unauthorized: 'Unauthorized' },
}, ix => ({
    bad: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => ${runBody},
    }),
}))`;
    const program = parseProgramsFromFile(source, "bad.ts")[0]!;
    expect(() => generateAnchorProject(program)).toThrow(expected);
  }

  test("rejects while loops with guidance", () => {
    expectDiagnostic(`{
      while (amount > 0n) {
        counter.count += 1n
      }
    }`, "while/do loops");
  });

  test("rejects custom function calls with supported alternatives", () => {
    expectDiagnostic(`{
      counter.count = Math.max(counter.count, amount)
    }`, "Supported calls are ctx.require");
  });

  test("rejects destructuring locals", () => {
    expectDiagnostic(`{
      const { count } = counter
      counter.count = count
    }`, "destructuring variable declarations");
  });

  test("rejects await expressions", () => {
    expectDiagnostic(`{
      counter.count = await fetchCount()
    }`, "await expressions");
  });

  test("rejects object spread", () => {
    expectDiagnostic(`{
      counter.count = { ...counter }.count
    }`, "object spread");
  });

  test("rejects external identifiers", () => {
    expectDiagnostic(`{
      counter.count = DEFAULT_AMOUNT
    }`, "identifier 'DEFAULT_AMOUNT'");
  });

  test("rejects unknown account fields", () => {
    expectDiagnostic(`{
      counter.missingField = amount
    }`, "unknown field 'missingField'");
  });
});

describe("Rust generator", () => {
  test("generates declare_id", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain('declare_id!("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs")');
  });

  test("generates account struct", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("pub struct Counter");
    expect(project.libRs).toContain("pub count: u64");
    expect(project.libRs).toContain("pub authority: Pubkey");
    expect(project.libRs).toContain("pub is_active: bool");
  });

  test("generates error enum", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[error_code]");
    expect(project.libRs).toContain("pub enum ProgramError");
    expect(project.libRs).toContain("Unauthorized");
  });

  test("generates program module with instructions", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[program]");
    expect(project.libRs).toContain("pub fn initialize");
    expect(project.libRs).toContain("pub fn increment");
    expect(project.libRs).toContain("pub fn close");
  });

  test("generates accounts validation structs", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("#[derive(Accounts)]");
    expect(project.libRs).toContain("pub struct Initialize<");
    expect(project.libRs).toContain("pub struct Increment<");
  });

  test("generates init constraint with seeds", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("init,");
    expect(project.libRs).toContain("payer = authority");
    expect(project.libRs).toContain("space = 49");
    expect(project.libRs).toContain("seeds = [");
    expect(project.libRs).toContain('b"counter"');
  });

  test("generates close constraint", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.libRs).toContain("close = authority");
  });

  test("generates Cargo.toml with correct name", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    expect(project.cargoToml).toContain('name = "counter"');
    expect(project.cargoToml).toContain("anchor-lang");
  });

  test("generates IDL with correct structure", () => {
    const programs = parseProgramsFromFile(counterSource, "counter.ts");
    const project = generateAnchorProject(programs[0]!);
    const idl = project.idl as Record<string, unknown>;
    expect(idl.name).toBe("counter");
    expect(idl.address).toBe("91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs");
    expect(Array.isArray(idl.instructions)).toBe(true);
    expect(Array.isArray(idl.accounts)).toBe(true);
    expect(Array.isArray(idl.errors)).toBe(true);
  });
});
