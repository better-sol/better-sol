import { describe, expect, test } from "bun:test";
import { bs } from "../src/program";
import { accountDiscriminator, anchorDiscriminator, decodeAccount, decodeField, decodeZeroCopyAccount, encodeAccount, encodeField, encodeInstruction } from "../src/codec";

describe("Borsh coder", () => {
  test("encodes and decodes u64", () => {
    const encoded = encodeField(bs.u64(), 42n);
    const decoded = decodeField(bs.u64(), encoded, 0);
    expect(decoded.value).toBe(42n);
    expect(decoded.offset).toBe(8);
  });

  test("encodes and decodes u8", () => {
    const encoded = encodeField(bs.u8(), 255);
    const decoded = decodeField(bs.u8(), encoded, 0);
    expect(decoded.value).toBe(255);
    expect(decoded.offset).toBe(1);
  });

  test("encodes and decodes bool", () => {
    const encTrue = encodeField(bs.bool(), true);
    const encFalse = encodeField(bs.bool(), false);
    expect(decodeField(bs.bool(), encTrue, 0).value).toBe(true);
    expect(decodeField(bs.bool(), encFalse, 0).value).toBe(false);
  });

  test("encodes and decodes pubkey", () => {
    const addr = "11111111111111111111111111111111";
    const encoded = encodeField(bs.pubkey(), addr);
    const decoded = decodeField(bs.pubkey(), encoded, 0);
    expect(decoded.value).toBe(addr);
    expect(decoded.offset).toBe(32);
  });

  test("encodes and decodes optional", () => {
    const opt = bs.optional(bs.u64());
    const encSome = encodeField(opt, 100n);
    const encNone = encodeField(opt, null);
    expect(decodeField(opt, encSome, 0).value).toBe(100n);
    expect(decodeField(opt, encNone, 0).value).toBe(null);
  });

  test("encodes and decodes vector", () => {
    const v = bs.vector(bs.u8());
    const encoded = encodeField(v, [1, 2, 3]);
    const decoded = decodeField(v, encoded, 0);
    expect(decoded.value).toEqual([1, 2, 3]);
  });

  test("encodes and decodes full account", () => {
    const fields = { count: bs.u64(), authority: bs.pubkey(), isActive: bs.bool() };
    const data = { count: 99n, authority: "11111111111111111111111111111111", isActive: true };
    const encoded = encodeAccount(fields, data);
    const decoded = decodeAccount(fields, encoded);
    expect(decoded.count).toBe(99n);
    expect(decoded.authority).toBe("11111111111111111111111111111111");
    expect(decoded.isActive).toBe(true);
  });

  test("computes Anchor discriminators", async () => {
    const disc = await anchorDiscriminator("increment");
    expect(disc.length).toBe(8);
    expect(disc[0]).toBeGreaterThan(0);
  });

  test("computes account discriminators", async () => {
    const disc = await accountDiscriminator("counter");
    expect(disc.length).toBe(8);
  });

  test("normalizes snake account names for discriminators", async () => {
    const snake = await accountDiscriminator("trade_record");
    const pascal = await accountDiscriminator("TradeRecord");
    expect([...snake]).toEqual([...pascal]);
  });

  test("encodeInstruction includes discriminator followed by encoded args", async () => {
    const args = { amount: bs.u64() };
    const data = await encodeInstruction("increment", args, { amount: 42n });
    const disc = await anchorDiscriminator("increment");
    expect(data.length).toBe(16);
    expect(data[0]).toBe(disc[0]);
    expect(data[7]).toBe(disc[7]);
  });

  test("encodeInstruction with no args returns only discriminator", async () => {
    const data = await encodeInstruction("ping", {}, {});
    expect(data.length).toBe(8);
  });

  test("encodeField handles signed integers", () => {
    const encoded = encodeField(bs.i64(), -1n);
    expect(encoded.length).toBe(8);
    expect(decodeField(bs.i64(), encoded, 0).value).toBe(-1n);
  });

  test("encodeField handles string", () => {
    const encoded = encodeField(bs.string(), "hello");
    expect(encoded.length).toBe(9);
    expect(decodeField(bs.string(), encoded, 0).value).toBe("hello");
  });

  test("decodeField rejects invalid bool bytes", () => {
    expect(() => decodeField(bs.bool(), new Uint8Array([2]), 0)).toThrow("Invalid boolean byte");
  });

  test("decodes nested zero-copy structs inside arrays", () => {
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
