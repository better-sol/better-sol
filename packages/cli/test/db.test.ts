import { describe, expect, test } from "bun:test";
import { generateDrizzleSchema, isDbDialect } from "../src/generator/db";
import { parseProgramsFromFile } from "../src/parser/ast";

function parseAndGenerate(source: string, dialect: "postgres" | "mysql" | "sqlite"): string {
  const programs = parseProgramsFromFile(source, "test.ts");
  return generateDrizzleSchema(programs, dialect);
}

const simpleSource = `import { bs } from 'better-sol/program'

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
  bump: bs.u8(),
}).derive((seed) => ["counter", seed.authority])

export const counter = bs.program({
  name: 'counter',
  address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
}, ix => ({
  init: ix({
    accounts: { counter: bs.init(Counter), authority: bs.signer() },
    args: { initialValue: u64 },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    }
  }),
}))`;

describe("db generator — column types", () => {
  test("isDbDialect validates dialect strings", () => {
    expect(isDbDialect("postgres")).toBe(true);
    expect(isDbDialect("mysql")).toBe(true);
    expect(isDbDialect("sqlite")).toBe(true);
    expect(isDbDialect("mongodb")).toBe(false);
    expect(isDbDialect("")).toBe(false);
  });

  test("generates postgres schema with proper column types", () => {
    const schema = parseAndGenerate(simpleSource, "postgres");
    expect(schema).toContain("import { bigint, boolean, jsonb, pgTable, text }");
    expect(schema).toContain('export const counterCounter = pgTable("counter_counter"');
    expect(schema).toContain('address: text("address").primaryKey()');
    expect(schema).toContain('count: bigint("count", { mode: "bigint" }).notNull()');
    expect(schema).toContain('authority: text("authority").notNull()');
    expect(schema).toContain('isActive: boolean("is_active").notNull()');
    expect(schema).toContain('bump: integer("bump").notNull()');
  });

  test("generates sqlite schema with proper column types", () => {
    const schema = parseAndGenerate(simpleSource, "sqlite");
    expect(schema).toContain("import { blob, integer, sqliteTable, text }");
    expect(schema).toContain('export const counterCounter = sqliteTable("counter_counter"');
    expect(schema).toContain('address: text("address").primaryKey()');
    expect(schema).toContain('count: integer("count").notNull()');
    expect(schema).toContain('authority: text("authority").notNull()');
    expect(schema).toContain('isActive: integer("is_active").notNull()');
    expect(schema).toContain('updatedAtSlot: integer("updated_at_slot").notNull()');
  });

  test("generates mysql schema with proper column types", () => {
    const schema = parseAndGenerate(simpleSource, "mysql");
    expect(schema).toContain("import { bigint, boolean, mysqlTable, varchar }");
    expect(schema).toContain('export const counterCounter = mysqlTable("counter_counter"');
    expect(schema).toContain('address: varchar("address", { length: 44 }).primaryKey()');
    expect(schema).toContain('count: bigint("count", { mode: "bigint" }).notNull()');
    expect(schema).toContain('authority: varchar("authority", { length: 255 }).notNull()');
  });
});

describe("db generator — option types", () => {
  test("bs.optional(u64) becomes nullable bigint", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ value: bs.optional(u64), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, args: { val: bs.optional(u64) }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('value: bigint("value", { mode: "bigint" })');
    expect(schema).not.toContain('value: bigint("value", { mode: "bigint" }).notNull()');
  });

  test("bs.optional(bool) becomes nullable boolean", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ flag: bs.optional(bool), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('flag: boolean("flag")');
    expect(schema).not.toContain('flag: boolean("flag").notNull()');
  });

  test("bs.optional(string) becomes nullable text", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ name: bs.optional(string), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('name: text("name")');
    expect(schema).not.toContain('name: text("name").notNull()');
  });

  test("bs.optional(pubkey) becomes nullable text", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ owner: bs.optional(pubkey), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('owner: text("owner")');
    expect(schema).not.toContain('owner: text("owner").notNull()');
  });
});

describe("db generator — vec and array types", () => {
  test("bs.vector(u64) uses postgres array", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.vector(u64), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('items: bigint("items", { mode: "bigint" }).array().notNull()');
  });

  test("bs.array(u64, 4) uses postgres array", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.array(u64, 4), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('items: bigint("items", { mode: "bigint" }).array().notNull()');
  });

  test("bs.vector(bool) uses postgres boolean array", () => {
    const source = `import { program, account, bool, vec, p, u8 } from 'better-sol/program'
const Data = bs.account({ flags: bs.vector(bool), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('flags: boolean("flags").array().notNull()');
  });

  test("bs.vector(u64) falls back to text for sqlite", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.vector(u64), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "sqlite");
    expect(schema).toContain('items: text("items")');
  });

  test("bs.vector(u64) falls back to text for mysql", () => {
    const source = `import { bs } from 'better-sol/program'
const Data = bs.account({ items: bs.vector(u64), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "mysql");
    expect(schema).toContain('items: text("items")');
  });

  test("bs.optional(bs.vector(u64)) produces nullable array", () => {
    const source = `import { program, account, u64, vec, option, p, u8 } from 'better-sol/program'
const Data = bs.account({ items: bs.optional(bs.vector(u64)), bump: u8 })
export const prog = bs.program({ name: 'prog', address: '11111111111111111111111111111111' }, ix => ({
  set: ix({ accounts: { data: bs.mut(Data), authority: bs.signer() }, run: () => {} })
}))`;
    const schema = parseAndGenerate(source, "postgres");
    expect(schema).toContain('items: bigint("items", { mode: "bigint" }).array()');
    expect(schema).not.toContain('items: bigint("items", { mode: "bigint" }).array().notNull()');
  });
});

describe("db generator — table structure", () => {
  test("generates table with address as primary key", () => {
    const schema = parseAndGenerate(simpleSource, "postgres");
    expect(schema).toContain('address: text("address").primaryKey()');
  });

  test("generates updatedAtSlot and updatedAt columns", () => {
    const schema = parseAndGenerate(simpleSource, "postgres");
    expect(schema).toContain('updatedAtSlot: bigint("updated_at_slot", { mode: "bigint" }).notNull()');
    expect(schema).toContain('updatedAt: bigint("updated_at", { mode: "bigint" }).notNull()');
  });

  test("generates table name from program and account names in snake_case", () => {
    const schema = parseAndGenerate(simpleSource, "postgres");
    expect(schema).toContain('counterCounter = pgTable("counter_counter"');
  });
});
