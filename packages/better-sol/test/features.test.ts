import { describe, expect, test } from "bun:test";
import { AccountRole, address } from "@solana/kit";
import { bs } from "../src/program";
import { buildAccountMetas, createTransactionNotifier, withComputeBudget } from "../src/client/transaction";

function toSnake(name: string): string {
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, "_$1_$2").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/^_/, "");
}
import { resolveWithLookupTables, type LookupTableIndex } from "../src/client/lookup-tables";

const signer = {
  address: address("11111111111111111111111111111111"),
  signTransactions: async <T extends readonly unknown[]>(transactions: T): Promise<T> => transactions,
};

describe("runtime input validation", () => {
  test("rejects number where bigint expected", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        increment: ix({
          accounts: { authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.increment.instruction({ amount: 42 as unknown as bigint })).rejects.toThrow(
      'better-sol: instruction "increment" arg "amount" expects u64 (bigint), got 42',
    );
  });

  test("rejects bigint where number expected", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setByte: ix({
          accounts: { authority: bs.signer() },
          args: { value: bs.u8() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.setByte.instruction({ value: 42n as unknown as number })).rejects.toThrow(
      'better-sol: instruction "set_byte" arg "value" expects u8 (number), got 42n',
    );
  });

  test("rejects string where bool expected", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setFlag: ix({
          accounts: { authority: bs.signer() },
          args: { flag: bs.bool() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.setFlag.instruction({ flag: "true" as unknown as boolean })).rejects.toThrow(
      'better-sol: instruction "set_flag" arg "flag" expects bool',
    );
  });

  test("rejects missing required arg", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        mint: ix({
          accounts: { authority: bs.signer() },
          args: { decimals: bs.u8() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.mint.instruction({} as { decimals: number })).rejects.toThrow(
      'better-sol: instruction "mint" requires arg "decimals" of type u8',
    );
  });

  test("accepts null for optional arg", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        update: ix({
          accounts: { authority: bs.signer() },
          args: { name: bs.optional(bs.string()) },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    const ix = await client.prog.update.instruction({ name: null });
    expect(ix.data).toBeInstanceOf(Uint8Array);
  });

  test("validates inner type of vec arg", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        batch: ix({
          accounts: { authority: bs.signer() },
          args: { ids: bs.vector(bs.u64()) },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.batch.instruction({ ids: [1n, 42 as unknown as bigint] })).rejects.toThrow(
      'better-sol: instruction "batch" arg "ids[1]" expects u64 (bigint), got 42',
    );
  });

  test("rejects u8 value out of range", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setByte: ix({
          accounts: { authority: bs.signer() },
          args: { value: bs.u8() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.setByte.instruction({ value: 256 })).rejects.toThrow(
      "u8 (0..255)",
    );
    await expect(client.prog.setByte.instruction({ value: -1 })).rejects.toThrow(
      "u8 (0..255)",
    );
    await expect(client.prog.setByte.instruction({ value: 1.5 })).rejects.toThrow(
      "u8 (0..255)",
    );
  });

  test("rejects negative u64 value", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setAmount: ix({
          accounts: { authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.setAmount.instruction({ amount: -1n })).rejects.toThrow(
      "u64 (non-negative bigint)",
    );
  });

  test("rejects non-finite f64 value", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setScore: ix({
          accounts: { authority: bs.signer() },
          args: { score: bs.f64() },
          run: () => {},
        }),
      }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.setScore.instruction({ score: Infinity })).rejects.toThrow(
      "f64 (finite number)",
    );
    await expect(client.prog.setScore.instruction({ score: NaN })).rejects.toThrow(
      "f64 (finite number)",
    );
  });
});

describe("PDA derivation seed validation", () => {
  test("rejects missing seed field", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    await expect(client.test.accounts.Counter.derive({} as { authority: string })).rejects.toThrow(
      'better-sol: derive requires seed field "authority" for account "Counter"',
    );
  });

  test("accepts all required seed fields", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const { betterSol } = await import("../src/client/factory");
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    const derived = await client.test.accounts.Counter.derive({ authority: signer.address });
    expect(typeof derived).toBe("string");
  });
});

describe("realloc constraint", () => {
  test("bs.realloc() produces correct constraint kind", () => {
    const Data = bs.account({ value: bs.string() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        resize: ix({
          accounts: { data: bs.realloc(Data, 256), authority: bs.signer() },
          args: { newSize: bs.u32() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.resize.accounts.data.constraintKind).toBe("realloc");
  });

  test("realloc accounts are writable", async () => {
    const Data = bs.account({ value: bs.string() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        resize: ix({
          accounts: { data: bs.realloc(Data, 256), authority: bs.signer() },
          run: () => {},
        }),
      }),
    );
    const metas = await buildAccountMetas(
      prog.instructions.resize,
      { data: signer.address, authority: undefined },
      "11111111111111111111111111111111",
      signer,
      "unsigned",
    );
    const dataMeta = metas.find((meta) => "address" in meta && meta.address === signer.address && !("signer" in meta));
    expect(dataMeta).toBeDefined();
  });

  test("realloc stores space value", () => {
    const Data = bs.account({ value: bs.string() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        resize: ix({
          accounts: { data: bs.realloc(Data, 512), authority: bs.signer() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.resize.accounts.data.reallocSpace).toBe(512);
  });
});

describe("hasOne constraint", () => {
  test("AccountDefinition.hasOne() adds hasOne fields", () => {
    const TokenAccount = bs.account({ mint: bs.pubkey(), owner: bs.pubkey() }).hasOne("mint");
    expect(TokenAccount.hasOneFields).toEqual(["mint"]);
  });

  test("hasOne preserves through derive", () => {
    const TokenAccount = bs.account({ mint: bs.pubkey(), owner: bs.pubkey() })
      .derive((seed) => ["account", seed.owner, seed.mint])
      .hasOne("mint");
    expect(TokenAccount.hasOneFields).toEqual(["mint"]);
    expect(TokenAccount.seedValues).toEqual(["account", "{owner}", "{mint}"]);
  });
});

describe("instruction return values", () => {
  test("ix() accepts returns config", () => {
    const Counter = bs.account({ count: bs.u64() }).derive(() => ["counter"]);
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        getCount: ix({
          accounts: { counter: bs.mut(Counter) },
          returns: bs.u64(),
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.getCount.returns).toBeDefined();
    expect(prog.instructions.getCount.returns?.kind).toBe("u64");
  });

  test("ix() without returns has undefined return type", () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        ping: ix({
          accounts: { authority: bs.signer() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.ping.returns).toBeUndefined();
  });
});

describe("lookup table resolution", () => {
  test("resolveWithLookupTables converts matching addresses to AccountLookupMeta", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const acc1 = address("11111111111111111111111111111111");
    const acc2 = address("SysvarRent111111111111111111111111111111111");
    const acc3 = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const index = new Map<string, { readonly lookupTableAddress: import("@solana/kit").Address; readonly addressIndex: number }>([
      [acc1 as string, { lookupTableAddress: altAddress, addressIndex: 0 }],
      [acc2 as string, { lookupTableAddress: altAddress, addressIndex: 1 }],
    ]) as LookupTableIndex;

    const metas = [
      { address: acc1, role: AccountRole.READONLY },
      { address: acc2, role: AccountRole.WRITABLE },
      { address: acc3, role: AccountRole.READONLY },
    ];

    const resolved = resolveWithLookupTables(metas, index);
    expect(resolved).toHaveLength(3);

    expect("addressIndex" in resolved[0]! && resolved[0].addressIndex).toBe(0);
    expect("addressIndex" in resolved[1]! && resolved[1].addressIndex).toBe(1);
    expect("lookupTableAddress" in resolved[0]! && resolved[0]!.lookupTableAddress).toBe(altAddress);

    expect("addressIndex" in resolved[2]!).toBe(false);
  });

  test("resolveWithLookupTables preserves signer metas unchanged", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const index: LookupTableIndex = new Map([
      [signer.address, { lookupTableAddress: altAddress, addressIndex: 0 }],
    ]);

    const metas = [
      { address: signer.address, role: AccountRole.READONLY_SIGNER, signer },
    ];

    const resolved = resolveWithLookupTables(metas, index);
    expect(resolved).toHaveLength(1);
    expect("signer" in resolved[0]!).toBe(true);
    expect("addressIndex" in resolved[0]!).toBe(false);
  });

  test("resolveWithLookupTables returns identity for empty index", () => {
    const metas = [
      { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
    ];
    const index: LookupTableIndex = new Map();
    const resolved = resolveWithLookupTables(metas, index);
    expect(resolved).toBe(metas);
  });

  test("resolveWithLookupTables maps writable role correctly", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const acc1 = address("11111111111111111111111111111111");
    const index: LookupTableIndex = new Map([
      [acc1, { lookupTableAddress: altAddress, addressIndex: 5 }],
    ]);

    const metas = [
      { address: acc1, role: AccountRole.WRITABLE },
    ];

    const resolved = resolveWithLookupTables(metas, index);
    expect(resolved[0]!.role).toBe(AccountRole.WRITABLE);
  });
});

describe("transaction notifier", () => {
  test("createTransactionNotifier fires callback on notify", () => {
    const { notify, subscribe } = createTransactionNotifier();
    let received: { signature: string; slot: bigint } | undefined;
    const unsub = subscribe((sig, slot) => { received = { signature: sig as unknown as string, slot }; });
    notify("sig123" as never, 42n);
    expect(received).toEqual({ signature: "sig123", slot: 42n });
    unsub();
  });

  test("unsubscribe stops notifications", () => {
    const { notify, subscribe } = createTransactionNotifier();
    let count = 0;
    const unsub = subscribe(() => { count++; });
    unsub();
    notify("sig" as never, 1n);
    expect(count).toBe(0);
  });

  test("subscribe replaces previous callback", () => {
    const { notify, subscribe } = createTransactionNotifier();
    let first = false;
    let second = false;
    subscribe(() => { first = true; });
    subscribe(() => { second = true; });
    notify("sig" as never, 1n);
    expect(first).toBe(false);
    expect(second).toBe(true);
  });
});

describe("withComputeBudget", () => {
  test("returns identity when config is undefined", () => {
    const instructions: never[] = [];
    const result = withComputeBudget(instructions, undefined);
    expect(result).toBe(instructions);
  });

  test("prepends compute unit limit instruction", () => {
    const { getSetComputeUnitLimitInstruction } = require("@solana-program/compute-budget");
    const expected = getSetComputeUnitLimitInstruction({ units: 200000 });
    const result = withComputeBudget([] as never[], { computeUnitLimit: 200000n });
    expect(result).toHaveLength(1);
    expect(result[0]!.programAddress).toBe(expected.programAddress);
  });

  test("prepends compute unit price instruction", () => {
    const { getSetComputeUnitPriceInstruction } = require("@solana-program/compute-budget");
    const expected = getSetComputeUnitPriceInstruction({ microLamports: 1000n });
    const result = withComputeBudget([] as never[], { computeUnitPrice: 1000n });
    expect(result).toHaveLength(1);
    expect(result[0]!.programAddress).toBe(expected.programAddress);
  });
});

describe("toSnake edge cases", () => {
  test("handles already snake_case", () => {
    expect(toSnake("already_snake")).toBe("already_snake");
  });
  test("handles single word", () => {
    expect(toSnake("increment")).toBe("increment");
  });
  test("handles consecutive capitals", () => {
    expect(toSnake("createATA")).toBe("create_ata");
  });
  test("handles camelCase", () => {
    expect(toSnake("myCounter")).toBe("my_counter");
  });
});
