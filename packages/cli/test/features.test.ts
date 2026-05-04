import { describe, expect, test } from "bun:test";
import { parseProgramsFromFile } from "../src/parser/ast";
import { generateAnchorProject } from "../src/generator/rust";

describe("transpiler — latest features", () => {
  test("generates init_if_needed for createIfNeeded", () => {
    const source = `
import { program, account, u64, pubkey, p, u8 } from 'better-sol/program'
const Data = account({ value: u64, authority: pubkey, bump: u8 }).derive((seed) => ["data", seed.authority])
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  upsert: ix({
    accounts: { data: p.createIfNeeded(Data), authority: p.signer() },
    args: { val: u64 },
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
import { program, account, u64, pubkey, p, u8 } from 'better-sol/program'
const Data = account({ value: u64, authority: pubkey, bump: u8 }).derive((seed) => ["data", seed.authority])
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  upsert: ix({
    accounts: { data: p.createIfNeeded(Data), authority: p.signer() },
    args: { val: u64 },
    run: ({ data, authority }, { val }) => { data.value = val; data.authority = authority }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    const ix = program.instructions[0]!;
    expect(ix.accounts[0]!.constraint.kind).toBe("initIfNeeded");
  });

  test("generates event structs", () => {
    const source = `
import { program, u64, pubkey, p } from 'better-sol/program'
export const prog = program({
  name: 'transfers', address: '11111111111111111111111111111111',
  events: {
    Transfer: { from: pubkey, to: pubkey, amount: u64 },
  },
}, ix => ({
  doTransfer: ix({
    accounts: { authority: p.signer() },
    args: { amount: u64 },
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
import { program, u64, pubkey, p } from 'better-sol/program'
export const prog = program({ name: 'transfers', address: '11111111111111111111111111111111' }, ix => ({
  doTransfer: ix({
    accounts: { authority: p.signer() },
    args: { amount: u64 },
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
import { program, u64, pubkey, p } from 'better-sol/program'
export const prog = program({
  name: 'transfers', address: '11111111111111111111111111111111',
  events: {
    Transfer: { from: pubkey, to: pubkey, amount: u64 },
  },
}, ix => ({
  doTransfer: ix({
    accounts: { authority: p.signer() },
    args: { amount: u64 },
    run: ({ authority }, { amount }, ctx) => {
      ctx.emit("Transfer", { from: authority, to: authority })
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "transfers.ts")[0]!;
    expect(() => generateAnchorProject(program)).toThrow("without required field");
  });

  test("generates sol.timestamp() as Clock::get()?.unix_timestamp", () => {
    const source = `
import { program, account, i64, u64, pubkey, p, sol, u8 } from 'better-sol/program'
const Data = account({ created_at: i64, bump: u8 })
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  record: ix({
    accounts: { data: p.mut(Data), authority: p.signer() },
    run: ({ data, authority }, ctx) => {
      data.created_at = sol.timestamp();
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
import { program, account, u64, p, u8 } from 'better-sol/program'
const Data = account({ value: u64, bump: u8 })
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  setValue: ix({
    accounts: { data: p.mut(Data), authority: p.signer() },
    args: { val: u64 },
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
import { program, account, u64, pubkey, p } from 'better-sol/program'
const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority])
export const counter = program({
  name: 'counter', address: '11111111111111111111111111111111', accounts: { Counter }
}, ix => ({
  init: ix({
    accounts: { counter: p.create(Counter), authority: p.signer() },
    args: { initialValue: u64 },
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
import { program, p } from 'better-sol/program'
export const prog = program({
  name: 'prog', address: '11111111111111111111111111111111',
  errors: { Unauthorized: 'Not authorized', Overflow: 'Value overflow' }
}, ix => ({
  ping: ix({ accounts: { authority: p.signer() }, run: () => {} })
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
  test("parses option type", () => {
    const source = `
import { program, account, u64, pubkey, option, p, u8 } from 'better-sol/program'
const Data = account({ value: option(u64), owner: pubkey, bump: u8 })
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: p.mut(Data), authority: p.signer() },
    args: { val: option(u64) },
    run: ({ data }, { val }) => { data.value = val }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toEqual({ kind: "option", inner: "u64" });
    expect(program.instructions[0]!.args[0]!.type).toEqual({ kind: "option", inner: "u64" });
  });

  test("parses vec type", () => {
    const source = `
import { program, account, u64, pubkey, vec, p, u8 } from 'better-sol/program'
const Data = account({ items: vec(u64), owner: pubkey, bump: u8 })
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: p.mut(Data), authority: p.signer() },
    run: ({ data, authority }, ctx) => {
      ctx.require(authority === data.owner, "Unauthorized");
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toMatchObject({ kind: "vec", inner: "u64" });
  });

  test("parses array type with size", () => {
    const source = `
import { program, account, u64, pubkey, array, p, u8 } from 'better-sol/program'
const Data = account({ items: array(u64, 4), owner: pubkey, bump: u8 })
export const prog = program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({
    accounts: { data: p.mut(Data), authority: p.signer() },
    run: ({ data, authority }, ctx) => {
      ctx.require(authority === data.owner, "Unauthorized");
    }
  })
}))`;
    const program = parseProgramsFromFile(source, "prog.ts")[0]!;
    expect(program.accounts[0]!.fields[0]!.type).toMatchObject({ kind: "array", inner: "u64", size: 4 });
  });
});
