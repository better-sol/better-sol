import { describe, expect, test } from "bun:test";
import { bs } from "../src/program";
import { encodeField, decodeField, encodeAccount, decodeAccount, decodeZeroCopyAccount, encodeInstruction, anchorDiscriminator, accountDiscriminator } from "../src/codec";
import { decodeEventData, buildErrorIndex, buildEventDiscriminatorIndex, extractEventLogs, parseEventLog, ProgramError, TransactionFailedError } from "../src/client/events";
import { seedToBytes } from "../src/client/signer";
import { buildAccountMetas, withComputeBudget, createTransactionNotifier } from "../src/client/transaction";
import { resolveWithLookupTables, type LookupTableIndex } from "../src/client/lookup-tables";
import { fromIdl } from "../src/idl";
import { betterSol } from "../src/index";
import { AccountRole, address, type Instruction } from "@solana/kit";

const signer = {
  address: address("11111111111111111111111111111111"),
  signTransactions: async <T extends readonly unknown[]>(transactions: T): Promise<T> => transactions,
};

describe("codec: integer encoding round-trips", () => {
  test("u8 round-trips at boundaries", () => {
    for (const v of [0, 1, 127, 128, 255]) {
      expect(decodeField(bs.u8(), encodeField(bs.u8(), v), 0).value).toBe(v);
    }
  });

  test("u16 round-trips at boundaries including high bit", () => {
    for (const v of [0, 1, 255, 256, 32767, 32768, 65535]) {
      const encoded = encodeField(bs.u16(), v);
      expect(encoded.length).toBe(2);
      expect(decodeField(bs.u16(), encoded, 0).value).toBe(v);
    }
  });

  test("u32 round-trips at boundaries including max unsigned", () => {
    for (const v of [0, 1, 65535, 65536, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const decoded = decodeField(bs.u32(), encodeField(bs.u32(), v), 0).value;
      expect(decoded).toBe(v);
      expect(decoded).toBeGreaterThan(-1);
    }
  });

  test("i8 round-trips at boundaries", () => {
    for (const v of [-128, -1, 0, 1, 127]) {
      expect(decodeField(bs.i8(), encodeField(bs.i8(), v), 0).value).toBe(v);
    }
  });

  test("i16 round-trips at boundaries", () => {
    for (const v of [-32768, -1, 0, 1, 32767]) {
      expect(decodeField(bs.i16(), encodeField(bs.i16(), v), 0).value).toBe(v);
    }
  });

  test("i32 round-trips at boundaries", () => {
    for (const v of [-2147483648, -1, 0, 1, 2147483647]) {
      expect(decodeField(bs.i32(), encodeField(bs.i32(), v), 0).value).toBe(v);
    }
  });

  test("u64 round-trips with small and large values", () => {
    for (const v of [0n, 1n, 255n, 65535n, (1n << 63n) - 1n]) {
      expect(decodeField(bs.u64(), encodeField(bs.u64(), v), 0).value).toBe(v);
    }
  });

  test("u128 round-trips with small and large values", () => {
    for (const v of [0n, 1n, (1n << 127n) - 1n]) {
      expect(decodeField(bs.u128(), encodeField(bs.u128(), v), 0).value).toBe(v);
    }
  });

  test("i64 round-trips at boundaries", () => {
    for (const v of [-(1n << 63n), -1n, 0n, 1n, (1n << 63n) - 1n]) {
      expect(decodeField(bs.i64(), encodeField(bs.i64(), v), 0).value).toBe(v);
    }
  });

  test("i128 round-trips at boundaries", () => {
    for (const v of [-(1n << 127n), -1n, 0n, 1n, (1n << 127n) - 1n]) {
      expect(decodeField(bs.i128(), encodeField(bs.i128(), v), 0).value).toBe(v);
    }
  });
});

describe("codec: float encoding round-trips", () => {
  test("f32 round-trips", () => {
    for (const v of [0, 1.5, -1.5, 3.14, Math.fround(42.5)]) {
      expect(decodeField(bs.f32(), encodeField(bs.f32(), v), 0).value).toBeCloseTo(v, 6);
    }
  });

  test("f64 round-trips", () => {
    for (const v of [0, 1.5, -1.5, Math.PI]) {
      expect(decodeField(bs.f64(), encodeField(bs.f64(), v), 0).value).toBeCloseTo(v, 15);
    }
  });
});

describe("codec: other types round-trips", () => {
  test("bool round-trips", () => {
    expect(decodeField(bs.bool(), encodeField(bs.bool(), true), 0).value).toBe(true);
    expect(decodeField(bs.bool(), encodeField(bs.bool(), false), 0).value).toBe(false);
  });

  test("pubkey round-trips", () => {
    const addr = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    expect(decodeField(bs.pubkey(), encodeField(bs.pubkey(), addr), 0).value).toBe(addr);
  });

  test("string round-trips with utf-8", () => {
    for (const s of ["", "hello", "hello world", "こんにちは"]) {
      expect(decodeField(bs.string(), encodeField(bs.string(), s), 0).value).toBe(s);
    }
  });

  test("bytes round-trips", () => {
    const data = new Uint8Array([0, 127, 255]);
    const decoded = decodeField(bs.bytes(), encodeField(bs.bytes(), data), 0);
    expect(decoded.value).toEqual(data);
  });

  test("option some round-trips", () => {
    const opt = bs.optional(bs.u64());
    expect(decodeField(opt, encodeField(opt, 42n), 0).value).toBe(42n);
  });

  test("option none round-trips", () => {
    const opt = bs.optional(bs.u64());
    expect(decodeField(opt, encodeField(opt, null), 0).value).toBe(null);
  });

  test("vec round-trips", () => {
    const vec = bs.vector(bs.u8());
    expect(decodeField(vec, encodeField(vec, [1, 2, 3]), 0).value).toEqual([1, 2, 3]);
  });

  test("array round-trips with exact size", () => {
    const arr = bs.array(bs.u64(), 2);
    expect(decodeField(arr, encodeField(arr, [10n, 20n]), 0).value).toEqual([10n, 20n]);
  });
});

describe("codec: full account round-trip", () => {
  test("encodeAccount and decodeAccount round-trip", () => {
    const fields = { count: bs.u64(), authority: bs.pubkey(), isActive: bs.bool(), label: bs.string() };
    const data = { count: 99n, authority: "11111111111111111111111111111111", isActive: true, label: "test" };
    expect(decodeAccount(fields, encodeAccount(fields, data))).toEqual(data);
  });
});

describe("codec: zero-copy account decode", () => {
  test("decodes packed layout with correct alignment", () => {
    const owner = "11111111111111111111111111111111";
    const Order = bs.struct({ quantity: bs.u64(), owner: bs.pubkey() });
    const fields = { orders: bs.array(Order, 2), market: bs.pubkey() };
    const data = new Uint8Array(112);
    data.set(encodeField(bs.u64(), 42n), 0);
    data.set(encodeField(bs.pubkey(), owner), 8);
    data.set(encodeField(bs.u64(), 7n), 40);
    data.set(encodeField(bs.pubkey(), owner), 48);
    data.set(encodeField(bs.pubkey(), owner), 80);
    const decoded = decodeZeroCopyAccount(fields, data);
    expect(decoded.orders[0]!.quantity).toBe(42n);
    expect(decoded.orders[1]!.quantity).toBe(7n);
    expect(decoded.market).toBe(owner);
  });
});

describe("codec: input validation rejects bad values", () => {
  test("u8 rejects out of range and non-integers", () => {
    expect(() => encodeField(bs.u8(), 256)).toThrow("u8 out of range");
    expect(() => encodeField(bs.u8(), -1)).toThrow("u8 out of range");
    expect(() => encodeField(bs.u8(), 1.5)).toThrow("u8 expects an integer number");
  });

  test("u64 rejects negative bigint", () => {
    expect(() => encodeField(bs.u64(), -1n)).toThrow("u64 out of range");
  });

  test("f32 and f64 reject non-finite", () => {
    expect(() => encodeField(bs.f32(), Infinity)).toThrow("expects a finite number");
    expect(() => encodeField(bs.f64(), NaN)).toThrow("f64 expects a finite number");
  });

  test("array rejects wrong length", () => {
    expect(() => encodeField(bs.array(bs.u8(), 2), [1])).toThrow("array length must be 2");
  });

  test("vec rejects exceeding max", () => {
    expect(() => encodeField(bs.vector(bs.u8(), 2), [1, 2, 3])).toThrow("vec exceeds max entries 2");
  });
});

describe("codec: decoding rejects corrupt data", () => {
  test("truncated buffer for u64", () => {
    expect(() => decodeField(bs.u64(), new Uint8Array([1, 2, 3]), 0)).toThrow("u64 requires 8 bytes");
  });

  test("invalid option tag", () => {
    expect(() => decodeField(bs.optional(bs.u8()), new Uint8Array([2]), 0)).toThrow("Invalid option tag");
  });

  test("invalid bool byte", () => {
    expect(() => decodeField(bs.bool(), new Uint8Array([2]), 0)).toThrow("Invalid boolean byte");
  });

  test("vec in data exceeds max", () => {
    const data = new Uint8Array([3, 0, 0, 0, 1, 2, 3]);
    expect(() => decodeField(bs.vector(bs.u8(), 2), data, 0)).toThrow("vec exceeds max entries 2");
  });
});

describe("codec: discriminators", () => {
  test("anchorDiscriminator produces 8 bytes", async () => {
    const disc = await anchorDiscriminator("increment");
    expect(disc.length).toBe(8);
    expect(disc[0]).toBeGreaterThan(0);
  });

  test("accountDiscriminator normalizes snake to pascal", async () => {
    const snake = await accountDiscriminator("trade_record");
    const pascal = await accountDiscriminator("TradeRecord");
    expect([...snake]).toEqual([...pascal]);
  });

  test("discriminator is cached (same input = same output)", async () => {
    const a = await anchorDiscriminator("transfer");
    const b = await anchorDiscriminator("transfer");
    expect([...a]).toEqual([...b]);
  });
});

describe("codec: instruction encoding", () => {
  test("encodeInstruction prepends discriminator to encoded args", async () => {
    const args = { amount: bs.u64() };
    const data = await encodeInstruction("increment", args, { amount: 42n });
    const disc = await anchorDiscriminator("increment");
    expect(data.length).toBe(16);
    expect(data.subarray(0, 8)).toEqual(disc);
  });

  test("encodeInstruction with no args returns only discriminator", async () => {
    const data = await encodeInstruction("ping", {}, {});
    expect(data.length).toBe(8);
  });
});

describe("events: decodeEventData", () => {
  test("rejects data shorter than 8 bytes", () => {
    for (const len of [0, 1, 7]) {
      expect(() => decodeEventData({}, new Uint8Array(len))).toThrow("Event data too short");
    }
  });

  test("accepts exactly 8 bytes with no fields", () => {
    expect(decodeEventData({}, new Uint8Array(8))).toEqual({});
  });

  test("decodes fields after 8-byte discriminator", () => {
    const fields = { amount: bs.u64() };
    const data = new Uint8Array(16);
    data.set(encodeField(bs.u64(), 100n), 8);
    const result = decodeEventData(fields, data);
    expect(result.amount).toBe(100n);
  });
});

describe("events: buildErrorIndex", () => {
  test("structured entries use Anchor error code as index", () => {
    const index = buildErrorIndex({
      Unauthorized: { message: "Only authority", code: 6000 },
    });
    expect(index[0]).toEqual({ name: "Unauthorized", message: "Only authority", index: 6000 });
  });

  test("plain string entries use sequential index", () => {
    const index = buildErrorIndex({ NotFound: "Not found" });
    expect(index[0]).toEqual({ name: "NotFound", message: "Not found", index: 0 });
  });
});

describe("events: buildEventDiscriminatorIndex", () => {
  test("concurrent calls produce identical results", async () => {
    const events = { transfer: { amount: bs.u64() } };
    const [a, b] = await Promise.all([
      buildEventDiscriminatorIndex(events),
      buildEventDiscriminatorIndex(events),
    ]);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe("events: extractEventLogs", () => {
  test("filters only event logs", () => {
    const logs = [
      "Program logged: hello",
      "program:log:event:abc123:AQ==",
      "program:log:event",
    ];
    expect(extractEventLogs(logs)).toEqual(["program:log:event:abc123:AQ==", "program:log:event"]);
  });

  test("returns empty for no events", () => {
    expect(extractEventLogs(["Program logged: hello"])).toEqual([]);
  });
});

describe("events: parseEventLog", () => {
  test("returns undefined for non-event lines", () => {
    expect(parseEventLog("not an event", new Map())).toBeUndefined();
  });

  test("returns undefined for event prefix with no data", () => {
    expect(parseEventLog("program:log:event", new Map())).toBeUndefined();
  });

  test("returns undefined for unknown discriminator", () => {
    expect(parseEventLog("program:log:event:unknown:data", new Map())).toBeUndefined();
  });
});

describe("events: ProgramError", () => {
  test("formats message with program and error name", () => {
    const err = new ProgramError("token", "Overflow", 6010, "Amount too large");
    expect(err.message).toBe("token.Overflow: Amount too large");
    expect(err.name).toBe("ProgramError");
    expect(err.programName).toBe("token");
    expect(err.errorName).toBe("Overflow");
    expect(err.errorIndex).toBe(6010);
  });
});

describe("events: TransactionFailedError", () => {
  test("uses program error message when available", () => {
    const programErr = new ProgramError("token", "Overflow", 6010, "Amount too large");
    const err = new TransactionFailedError("raw error", ["log1"], programErr, new Error("cause"));
    expect(err.message).toBe("token.Overflow: Amount too large");
    expect(err.logs).toEqual(["log1"]);
    expect(err.programError).toBe(programErr);
  });

  test("falls back to raw message without program error", () => {
    const err = new TransactionFailedError("tx failed", [], undefined, undefined);
    expect(err.message).toBe("tx failed");
    expect(err.programError).toBeUndefined();
  });
});

describe("signer: seedToBytes", () => {
  test("rejects non-integer numbers", () => {
    expect(() => seedToBytes(undefined, 1.5, address)).toThrow("Cannot encode non-integer number as PDA seed");
    expect(() => seedToBytes(undefined, NaN, address)).toThrow("Cannot encode non-integer number as PDA seed");
  });

  test("encodes integer number as u64 seed", () => {
    const result = seedToBytes(undefined, 42, address);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(8);
  });

  test("encodes bigint as u64 seed", () => {
    const result = seedToBytes(undefined, 42n, address);
    expect(result.length).toBe(8);
  });

  test("encodes string as address bytes", () => {
    const addr = "11111111111111111111111111111111";
    const result = seedToBytes(undefined, addr, address);
    expect(result.length).toBe(32);
  });
});

describe("transaction: withComputeBudget", () => {
  test("returns identity when config is undefined", () => {
    const instructions: readonly Instruction[] = [];
    expect(withComputeBudget(instructions, undefined)).toBe(instructions);
  });

  test("prepends compute budget instructions", () => {
    const limitResult = withComputeBudget([] as readonly Instruction[], { computeUnitLimit: 200000n });
    expect(limitResult).toHaveLength(1);
    const priceResult = withComputeBudget([] as readonly Instruction[], { computeUnitPrice: 1000n });
    expect(priceResult).toHaveLength(1);
    const bothResult = withComputeBudget([] as readonly Instruction[], { computeUnitLimit: 200000n, computeUnitPrice: 1000n });
    expect(bothResult).toHaveLength(2);
  });

});

describe("transaction: createTransactionNotifier", () => {
  test("fires callback on notify", () => {
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

describe("transaction: buildAccountMetas", () => {
  test("system program is auto-added for init constraints", async () => {
    const Data = bs.account({ value: bs.u64() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        init: ix({ accounts: { data: bs.init(Data), authority: bs.signer() }, run: () => {} }),
      }),
    );
    const metas = await buildAccountMetas(prog.instructions.init, { data: "11111111111111111111111111111111", authority: undefined }, "11111111111111111111111111111111", signer, "unsigned");
    const hasSystemProgram = metas.some((m) => "address" in m && m.address === "11111111111111111111111111111111");
    expect(hasSystemProgram).toBe(true);
  });

  test("signer meta uses signer address when value is undefined", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ ping: ix({ accounts: { authority: bs.signer() }, run: () => {} }) }),
    );
    const metas = await buildAccountMetas(prog.instructions.ping, { authority: undefined }, "11111111111111111111111111111111", signer, "unsigned");
    const signerMeta = metas.find((m) => "signer" in m);
    expect(signerMeta).toBeDefined();
    expect(signerMeta!.address).toBe(signer.address);
  });
});

describe("lookup-tables: resolveWithLookupTables", () => {
  test("returns identity for empty index", () => {
    const metas = [{ address: address("11111111111111111111111111111111"), role: AccountRole.READONLY }];
    expect(resolveWithLookupTables(metas, new Map())).toBe(metas);
  });

  test("resolves matching address to lookup meta", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const acc = address("11111111111111111111111111111111");
    const index: LookupTableIndex = new Map([[acc, { lookupTableAddress: altAddress, addressIndex: 3 }]]);
    const metas = [{ address: acc, role: AccountRole.READONLY }];
    const resolved = resolveWithLookupTables(metas, index);
    expect("addressIndex" in resolved[0]!).toBe(true);
  });

  test("preserves signer metas even if in lookup table", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const index: LookupTableIndex = new Map([[signer.address, { lookupTableAddress: altAddress, addressIndex: 0 }]]);
    const metas = [{ address: signer.address, role: AccountRole.READONLY_SIGNER, signer }];
    const resolved = resolveWithLookupTables(metas, index);
    expect("signer" in resolved[0]!).toBe(true);
    expect("addressIndex" in resolved[0]!).toBe(false);
  });

  test("maps writable role correctly", () => {
    const altAddress = address("ATokenGPvbdGYxrMbqyYAWJepXvXHkPKGtMvanPCmaqM");
    const acc = address("11111111111111111111111111111111");
    const index: LookupTableIndex = new Map([[acc, { lookupTableAddress: altAddress, addressIndex: 0 }]]);
    const metas = [{ address: acc, role: AccountRole.WRITABLE }];
    const resolved = resolveWithLookupTables(metas, index);
    expect(resolved[0]!.role).toBe(AccountRole.WRITABLE);
  });
});

describe("builder: account derivation", () => {
  test("derive stores seed templates", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    expect(Counter.seedValues).toEqual(["counter", "{authority}"]);
  });

  test("derive with no seeds stores empty array", () => {
    const Config = bs.account({ admin: bs.pubkey() }).derive(() => ["config"]);
    expect(Config.seedValues).toEqual(["config"]);
  });

  test("rejects dynamic string seed templates", () => {
    const Counter = bs.account({ id: bs.u64() });
    expect(() => Counter.derive(() => ["counter", "{id}"])).toThrow("Dynamic PDA seed template");
  });
});

describe("builder: constraint kinds", () => {
  test("init produces correct constraint kind and mutability", () => {
    const Data = bs.account({ value: bs.u64() });
    const constraint = bs.init(Data);
    expect(constraint.constraintKind).toBe("init");
    expect(constraint.mutable).toBe(true);
  });

  test("initIfNeeded produces correct constraint kind", () => {
    const Data = bs.account({ value: bs.u64() });
    expect(bs.initIfNeeded(Data).constraintKind).toBe("initIfNeeded");
  });

  test("close stores refund field", () => {
    const Data = bs.account({ value: bs.u64() });
    expect(bs.close(Data, "authority").refundTo).toBe("authority");
  });

  test("realloc stores space", () => {
    const Data = bs.account({ value: bs.string() });
    expect(bs.realloc(Data, 512).reallocSpace).toBe(512);
  });

  test("mint writable builder produces writable constraint", () => {
    const builder = bs.mint();
    expect(builder.constraintKind).toBe("mint");
    expect(builder.writable().mutable).toBe(true);
  });
});

describe("builder: hasOne", () => {
  test("hasOne adds field name", () => {
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

describe("builder: zero-copy", () => {
  test("zeroCopy enables flag on account definition", () => {
    const Order = bs.struct({ quantity: bs.u64(), owner: bs.pubkey() });
    const OrderBook = bs.account({ orders: bs.array(Order, 8) }).zeroCopy();
    expect(OrderBook.zeroCopyEnabled).toBe(true);
  });
});

describe("builder: name collisions", () => {
  test("rejects account and arg name collision", () => {
    const Data = bs.account({ count: bs.u64() });
    expect(() => bs.program(
      { name: "collision", address: "11111111111111111111111111111111" },
      (ix) => ({ test: ix({ accounts: { amount: bs.mut(Data) }, args: { amount: bs.u64() }, run: () => {} }) }),
    )).toThrow("conflicts with an instruction arg");
  });
});

describe("idl: fromIdl", () => {
  test("parses instructions with accounts and args", () => {
    const prog = fromIdl({
      name: "counter",
      instructions: [{
        name: "increment",
        accounts: [{ name: "counter", writable: true }, { name: "authority", signer: true }],
        args: [{ name: "amount", type: "u64" }],
      }],
    });
    expect(Object.keys(prog.instructions)).toEqual(["increment"]);
    const ix = prog.instructions.increment!;
    expect(Object.keys(ix.accounts)).toContain("counter");
    expect(Object.keys(ix.accounts)).toContain("authority");
    expect(Object.keys(ix.args!)).toContain("amount");
  });

  test("preserves error codes", () => {
    const prog = fromIdl({
      name: "test",
      instructions: [],
      errors: [
        { code: 6000, name: "Unauthorized", msg: "Only authority" },
        { code: 6001, name: "Overflow", msg: "Value too large" },
      ],
    });
    expect(prog.errors).toEqual({
      Unauthorized: { message: "Only authority", code: 6000 },
      Overflow: { message: "Value too large", code: 6001 },
    });
  });

  test("handles no errors", () => {
    const prog = fromIdl({ name: "test", instructions: [] });
    expect(prog.errors).toEqual({});
  });

  test("handles no accounts section", () => {
    const prog = fromIdl({ name: "test", instructions: [{ name: "ping", accounts: [], args: [] }] });
    expect(Object.keys(prog.accounts)).toEqual([]);
  });

  test("skips optional accounts", () => {
    const prog = fromIdl({
      name: "test",
      instructions: [{ name: "init", accounts: [{ name: "payer", signer: true }, { name: "rent", optional: true }], args: [] }],
    });
    expect("payer" in prog.instructions.init.accounts).toBe(true);
    expect("rent" in prog.instructions.init.accounts).toBe(false);
  });

  test("preserves explicit discriminators", () => {
    const disc = [1, 2, 3, 4, 5, 6, 7, 8];
    const prog = fromIdl({
      name: "test",
      instructions: [{ name: "init", discriminator: disc, accounts: [], args: [] }],
      accounts: [{ name: "state", discriminator: disc }],
      events: [{ name: "Created", discriminator: disc }],
    });
    expect(prog.instructions.init.discriminator).toEqual(new Uint8Array(disc));
  });

  test("rejects discriminators that are not 8 bytes", () => {
    expect(() => fromIdl({
      name: "test",
      instructions: [{ name: "init", discriminator: [1, 2, 3], accounts: [], args: [] }],
    })).toThrow("discriminator must contain exactly 8 bytes");
  });

  test("resolves defined type aliases", () => {
    const prog = fromIdl({
      name: "test",
      instructions: [{ name: "set", accounts: [], args: [{ name: "value", type: { defined: { name: "NodeId" } } }] }],
      types: [{ name: "NodeId", type: { kind: "type", alias: "pubkey" } }],
    });
    expect(prog.instructions.set!.args!.value!.kind).toBe("pubkey");
  });

  test("rejects recursive type aliases", () => {
    expect(() => fromIdl({
      name: "test",
      instructions: [{ name: "set", accounts: [], args: [{ name: "value", type: { defined: { name: "Self" } } }] }],
      types: [{ name: "Self", type: { kind: "type", alias: { defined: { name: "Self" } } } }],
    })).toThrow("Recursive IDL type aliases");
  });

  test("rejects 256-bit integers", () => {
    expect(() => fromIdl({
      name: "test",
      instructions: [{ name: "set", accounts: [], args: [{ name: "value", type: "u256" }] }],
    })).toThrow("Unsupported IDL primitive type: u256");
  });

  test("resolves events from types array", () => {
    const prog = fromIdl({
      name: "test",
      instructions: [],
      events: [{ name: "Transfer" }],
      types: [{ name: "Transfer", type: { kind: "struct", fields: [{ name: "amount", type: "u64" }] } }],
    });
    expect(prog.events.Transfer).toBeDefined();
    expect(prog.events.Transfer!.amount!.kind).toBe("u64");
  });

  test("auto-resolves PDA accounts from const seeds", () => {
    const prog = fromIdl({
      name: "test",
      address: "Test1111111111111111111111111111111111111",
      instructions: [],
      accounts: [{
        name: "config",
        pda: { seeds: [{ kind: "const", value: [99, 111, 110, 102, 105, 103] }] },
      }],
      types: [{ name: "config", type: { kind: "struct", fields: [{ name: "admin", type: "pubkey" }] } }],
    });
    expect("config" in prog.accounts).toBe(true);
  });
});

describe("client: factory", () => {
  test("read-only client has null payer", async () => {
    const client = await betterSol({ cluster: "devnet" });
    expect(client.payer).toBeNull();
  });

  test("read-only client rejects write operations", async () => {
    const client = await betterSol({ cluster: "devnet" });
    await expect(client.transfer({ to: "11111111111111111111111111111111", amount: 1n })).rejects.toThrow("No signer configured");
  });

  test("custom RPC without subscriptions leaves rpcSubscriptions undefined", async () => {
    const mockRpc = { getLatestBlockhash: () => ({ send: () => Promise.resolve({ value: { blockhash: "GHtXQBPsZMhGNUjDBaEuQ7oPrest2F2H_LA8iGYMPLgS", lastValidBlockHeight: 100n } }) }) } as never;
    const client = await betterSol({ rpc: mockRpc, payer: signer });
    expect(client.rpc).toBe(mockRpc);
    expect(client.rpcSubscriptions).toBeUndefined();
  });

  test("cluster-based client has rpcSubscriptions", async () => {
    const client = await betterSol({ cluster: "devnet" });
    expect(client.rpcSubscriptions).toBeDefined();
  });
});

describe("client: withSigner", () => {
  test("returns scoped client with new payer", async () => {
    const secondSigner = {
      address: address("Bi43bsYfqreLYcuHuBm7rmFinztHDDk4gDpTRNdtgqTm"),
      signTransactions: async <T extends readonly unknown[]>(txs: T): Promise<T> => txs,
    };
    const client = await betterSol({ cluster: "devnet", payer: signer });
    const scoped = await client.withSigner(secondSigner);
    expect(scoped.payer).toBe(secondSigner.address);
  });

  test("scoped client resolves signer accounts to scoped signer", async () => {
    const secondSigner = {
      address: address("Bi43bsYfqreLYcuHuBm7rmFinztHDDk4gDpTRNdtgqTm"),
      signTransactions: async <T extends readonly unknown[]>(txs: T): Promise<T> => txs,
    };
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ ping: ix({ accounts: { authority: bs.signer() }, run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", programs: { prog } });
    const scoped = await client.withSigner(secondSigner);
    const instruction = await scoped.prog.ping.instruction();
    expect(instruction.accounts?.[0]?.address).toBe(secondSigner.address);
  });
});

describe("client: proxy safety", () => {
  test("Object.prototype methods are not exposed as instructions", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ initialize: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    const proxy = client.test as unknown as Record<string, unknown>;
    expect(proxy.toString).toBeUndefined();
    expect(proxy.valueOf).toBeUndefined();
    expect(proxy.constructor).toBeUndefined();
    expect(proxy.hasOwnProperty).toBeUndefined();
    expect(proxy.toLocaleString).toBeUndefined();
  });

  test("has trap does not match inherited properties", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ initialize: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    expect("toString" in client.test).toBe(false);
    expect("initialize" in client.test).toBe(true);
  });

  test("ownKeys does not include inherited keys", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ initialize: ix({ run: () => {} }), close: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    const keys = Object.keys(client.test);
    expect(keys).toContain("initialize");
    expect(keys).toContain("close");
    expect(keys).not.toContain("toString");
  });
});

describe("client: instruction validation at runtime", () => {
  test("missing required account throws", async () => {
    const Data = bs.account({ value: bs.u64() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ close: ix({ accounts: { data: bs.mut(Data) }, run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect((client.prog.close.instruction as (p?: Record<string, unknown>) => Promise<unknown>)()).rejects.toThrow("Missing account 'data'");
  });

  test("wrong type for arg throws", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ set: ix({ accounts: { authority: bs.signer() }, args: { amount: bs.u64() }, run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.set.instruction({ amount: 42 as unknown as bigint })).rejects.toThrow("u64 (bigint)");
  });

  test("missing required arg throws", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ set: ix({ accounts: { authority: bs.signer() }, args: { amount: bs.u64() }, run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.set.instruction({} as { amount: bigint })).rejects.toThrow("requires arg");
  });
});

describe("client: runtime arg validation through builder API", () => {
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
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.batch.instruction({ ids: [1n, 42 as unknown as bigint] })).rejects.toThrow(
      'better-sol: instruction "batch" arg "ids[1]" expects u64 (bigint), got 42',
    );
  });

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
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    await expect(client.prog.increment.instruction({ amount: 42 as unknown as bigint })).rejects.toThrow(
      'better-sol: instruction "increment" arg "amount" expects u64 (bigint), got 42',
    );
  });

  test("rejects string where bool expected", async () => {
    const boolProg = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        setFlag: ix({
          accounts: { authority: bs.signer() },
          args: { flag: bs.bool() },
          run: () => {},
        }),
      }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog: boolProg } });
    await expect(client.prog.setFlag.instruction({ flag: "true" as unknown as boolean })).rejects.toThrow(
      'better-sol: instruction "set_flag" arg "flag" expects bool',
    );
  });
});

describe("client: PDA derivation seed validation", () => {
  test("rejects missing seed field", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    await expect(client.test.accounts.Counter.derive({} as { authority: string })).rejects.toThrow(
      'better-sol: derive requires seed field "authority" for account "Counter"',
    );
  });

  test("accepts all required seed fields and derives address", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    const derived = await client.test.accounts.Counter.derive({ authority: signer.address });
    expect(typeof derived).toBe("string");
  });
});

describe("builder: instruction return values", () => {
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

describe("builder: realloc constraint produces writable metas", () => {
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
});
