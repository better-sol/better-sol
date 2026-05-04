import { describe, expect, test } from "bun:test";
import { parseProgramsFromFile } from "../src/parser/ast";
import { generateAnchorProject } from "../src/generator/rust";

describe("transpiler — bs/cpi namespace", () => {
  test("parses bs.* primitives in account fields", () => {
    const source = `
import { bs } from 'better-sol/program'
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey(), active: bs.bool() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  ping: ix({ accounts: { authority: bs.signer() }, run: () => {} })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toBe("u64");
    expect(program.accounts[0]!.fields[1]!.type).toBe("pubkey");
    expect(program.accounts[0]!.fields[2]!.type).toBe("bool");
  });

  test("parses bs.* constraints in instruction accounts", () => {
    const source = `
import { bs } from 'better-sol/program'
const Counter = bs.account({ count: bs.u64() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  init: ix({ accounts: { counter: bs.init(Counter), authority: bs.signer() }, args: { value: bs.u64() }, run: () => {} }),
  inc: ix({ accounts: { counter: bs.mut(Counter), authority: bs.signer() }, args: { amount: bs.u64() }, run: () => {} }),
  close: ix({ accounts: { counter: bs.close(Counter, "authority"), authority: bs.signer() }, run: () => {} })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.instructions[0]!.accounts[0]!.constraint.kind).toBe("init");
    expect(program.instructions[1]!.accounts[0]!.constraint.kind).toBe("mut");
    expect(program.instructions[2]!.accounts[0]!.constraint.kind).toBe("close");
    expect(program.instructions[0]!.accounts[1]!.constraint.kind).toBe("signer");
  });

  test("parses bs.optional and bs.vector in types", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.optional(bs.u64()), items: bs.vector(bs.u8()) })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { authority: bs.signer() }, args: { val: bs.optional(bs.u64()) }, run: () => {} })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toEqual({ kind: "option", inner: "u64" });
    expect(program.accounts[0]!.fields[1]!.type).toMatchObject({ kind: "vec", inner: "u8" });
    expect(program.instructions[0]!.args[0]!.type).toEqual({ kind: "option", inner: "u64" });
  });

  test("parses bs.mint().writable() and bs.tokenAccount().writable() chains", () => {
    const source = `
import { bs } from 'better-sol/program'
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  transfer: ix({
    accounts: {
      from: bs.tokenAccount().writable(),
      to: bs.tokenAccount().writable(),
      mint: bs.mint(),
      authority: bs.signer(),
      tokenProgram: bs.tokenProgram()
    },
    args: { amount: bs.u64() },
    run: () => {}
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.instructions[0]!.accounts[0]!.constraint.kind).toBe("tokenAccount");
    expect((program.instructions[0]!.accounts[0]!.constraint as { mutable: boolean }).mutable).toBe(true);
    expect(program.instructions[0]!.accounts[2]!.constraint.kind).toBe("mint");
    expect((program.instructions[0]!.accounts[2]!.constraint as { mutable: boolean }).mutable).toBe(false);
    expect(program.instructions[0]!.accounts[4]!.constraint.kind).toBe("tokenProgram");
  });

  test("parses cpi.token.transfer in run body", () => {
    const source = `
import { bs, cpi } from 'better-sol/program'
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  transfer: ix({
    accounts: {
      from: bs.tokenAccount().writable(),
      to: bs.tokenAccount().writable(),
      authority: bs.signer(),
      tokenProgram: bs.tokenProgram()
    },
    args: { amount: bs.u64() },
    run: ({ from, to, authority }, { amount }) => {
      cpi.token.transfer({ from, to, authority, amount })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("token::transfer");
    expect(project.libRs).toContain("CpiContext::new");
  });

  test("parses cpi.sol.timestamp in run body", () => {
    const source = `
import { bs, cpi } from 'better-sol/program'
const Data = bs.account({ ts: bs.i64() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  record: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    run: ({ data }) => {
      data.ts = cpi.sol.timestamp()
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("Clock::get()?.unix_timestamp");
  });

  test("generates full Anchor project from bs.* program", () => {
    const source = `
import { bs } from 'better-sol/program'
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority])
export const counter = bs.program({
  name: 'counter', address: '11111111111111111111111111111111',
  errors: { Unauthorized: 'Not authorized' },
  events: { Incremented: { newCount: bs.u64() } },
  accounts: { Counter }
}, ix => ({
  init: ix({ accounts: { counter: bs.init(Counter), authority: bs.signer() }, args: { val: bs.u64() }, run: () => {} }),
  inc: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      counter.count += amount
      ctx.emit("Incremented", { newCount: counter.count })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "counter.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("#[program]");
    expect(project.libRs).toContain("declare_id!");
    expect(project.libRs).toContain("struct Counter");
    expect(project.libRs).toContain("pub fn init");
    expect(project.libRs).toContain("pub fn inc");
    expect(project.libRs).toContain("require!");
    expect(project.libRs).toContain("emit!");
    expect(project.libRs).toContain("Unauthorized");
    expect(project.libRs).toContain("Incremented");
  });

  test("rejects old API with clear error message", () => {
    const source = `
import { program, account, u64, p } from 'better-sol/program'
const Counter = account({ count: u64 })
export const counter = program({ name: 'counter', address: '11111111111111111111111111111111' }, ix => ({
  init: ix({ accounts: { counter: p.create(Counter), authority: p.signer() }, run: () => {} })
}))`;
    expect(() => parseProgramsFromFile(source, "counter.ts")).toThrow("Old API detected");
  });
});

describe("transpiler — latest features", () => {
  test("generates init_if_needed for bs.initIfNeeded", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.u64(), authority: bs.pubkey(), bump: bs.u8() }).derive((seed) => ["data", seed.authority])
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  upsert: ix({
    accounts: { data: bs.initIfNeeded(Data), authority: bs.signer() },
    args: { val: bs.u64() },
    run: ({ data, authority }, { val }) => { data.value = val; data.authority = authority }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("init_if_needed,");
    expect(project.libRs).not.toContain("init,");
    expect(project.libRs).toContain("pub struct Upsert<");
  });

  test("initIfNeeded has writable role in account metas (Rust side)", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.u64(), authority: bs.pubkey(), bump: bs.u8() }).derive((seed) => ["data", seed.authority])
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  upsert: ix({
    accounts: { data: bs.initIfNeeded(Data), authority: bs.signer() },
    args: { val: bs.u64() },
    run: ({ data, authority }, { val }) => { data.value = val; data.authority = authority }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const ix = program.instructions[0]!;
    expect(ix.accounts[0]!.constraint.kind).toBe("initIfNeeded");
  });

  test("generates event structs", () => {
    const source = `
import { bs } from 'better-sol/program'
export const prog = bs.program({
  name: 'transfers', address: '11111111111111111111111111111111',
  events: {
    Transfer: { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() },
  },
}, ix => ({
  doTransfer: ix({
    accounts: { authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ authority }, { amount }, ctx) => {
      ctx.emit("Transfer", { from: authority, to: authority, amount })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "transfers.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("#[event]");
    expect(project.libRs).toContain("pub struct Transfer");
    expect(project.libRs).toContain("pub from: Pubkey");
    expect(project.libRs).toContain("pub to: Pubkey");
    expect(project.libRs).toContain("pub amount: u64");
    expect(project.libRs).toContain("emit!(Transfer");
  });

  test("rejects emit with unknown event name", () => {
    const source = `
import { bs } from 'better-sol/program'
export const prog = bs.program({ name: 'transfers', address: '11111111111111111111111111111111' }, ix => ({
  doTransfer: ix({
    accounts: { authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ authority }, { amount }, ctx) => {
      ctx.emit("UnknownEvent", { from: authority, to: authority, amount })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "transfers.ts")[0]!;
    expect(() => generateAnchorProject(program)).toThrow("unknown event");
  });

  test("rejects emit with missing event field", () => {
    const source = `
import { bs } from 'better-sol/program'
export const prog = bs.program({
  name: 'transfers', address: '11111111111111111111111111111111',
  events: {
    Transfer: { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() },
  },
}, ix => ({
  doTransfer: ix({
    accounts: { authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ authority }, { amount }, ctx) => {
      ctx.emit("Transfer", { from: authority, to: authority })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "transfers.ts")[0]!;
    expect(() => generateAnchorProject(program)).toThrow("without required field");
  });

  test("generates cpi.sol.timestamp() as Clock::get()?.unix_timestamp", () => {
    const source = `
import { bs, cpi } from 'better-sol/program'
const Data = bs.account({ created_at: bs.i64(), bump: bs.u8() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  record: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    run: ({ data, authority }, ctx) => {
      data.created_at = cpi.sol.timestamp();
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    expect(project.libRs).toContain("Clock::get()?.unix_timestamp");
  });
});

describe("transpiler IDL output", () => {
  test("IDL includes instruction definitions", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.u64(), bump: bs.u8() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  setValue: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    args: { val: bs.u64() },
    run: ({ data }, { val }) => { data.value = val }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    const idl = project.idl as Record<string, unknown>;
    const instructions = idl.instructions as ReadonlyArray<Record<string, unknown>>;
    expect(instructions.length).toBe(1);
    expect(instructions[0]!.name).toBe("set_value");
    expect(Array.isArray(instructions[0]!.accounts)).toBe(true);
  });

  test("IDL includes account definitions", () => {
    const source = `
import { bs } from 'better-sol/program'
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority])
export const counter = bs.program({
  name: 'counter', address: '11111111111111111111111111111111', accounts: { Counter }
}, ix => ({
  init: ix({
    accounts: { counter: bs.init(Counter), authority: bs.signer() },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }) => { counter.count = initialValue; counter.authority = authority }
  })
}))`;
    const program = parseProgramsFromFile(source, "counter.ts")[0]!;
    const project = generateAnchorProject(program);
    const idl = project.idl as Record<string, unknown>;
    const idlAccounts = idl.accounts as ReadonlyArray<Record<string, unknown>>;
    expect(idlAccounts.length).toBe(1);
    expect(idlAccounts[0]!.name).toBe("counter");
  });

  test("IDL includes error codes", () => {
    const source = `
import { bs } from 'better-sol/program'
export const prog = bs.program({
  name: 'prog', address: '11111111111111111111111111111111',
  errors: { Unauthorized: 'Not authorized', Overflow: 'Value overflow' }
}, ix => ({
  ping: ix({ accounts: { authority: bs.signer() }, run: () => {} })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const project = generateAnchorProject(program);
    const idl = project.idl as Record<string, unknown>;
    const errors = idl.errors as ReadonlyArray<Record<string, unknown>>;
    expect(errors.length).toBe(2);
    expect(errors[0]!.name).toBe("Unauthorized");
    expect(errors[0]!.code).toBe(6000);
    expect(errors[1]!.code).toBe(6001);
  });
});

describe("transpiler — compound types", () => {
  test("parses bs.optional type", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.optional(bs.u64()), owner: bs.pubkey(), bump: bs.u8() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    args: { val: bs.optional(bs.u64()) },
    run: ({ data }, { val }) => { data.value = val }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toEqual({ kind: "option", inner: "u64" });
    expect(program.instructions[0]!.args[0]!.type).toEqual({ kind: "option", inner: "u64" });
  });

  test("parses bs.vector type", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.vector(bs.u64()), owner: bs.pubkey(), bump: bs.u8() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    run: ({ data, authority }, ctx) => {
      ctx.require(authority === data.owner, "Unauthorized");
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toMatchObject({ kind: "vec", inner: "u64" });
  });

  test("parses bs.array type with size", () => {
    const source = `
import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.array(bs.u64(), 4), owner: bs.pubkey(), bump: bs.u8() })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: bs.mut(Data), authority: bs.signer() },
    run: ({ data, authority }, ctx) => {
      ctx.require(authority === data.owner, "Unauthorized");
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toMatchObject({ kind: "array", inner: "u64", size: 4 });
  });
});
