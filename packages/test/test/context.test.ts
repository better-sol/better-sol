import { describe, expect, test } from "bun:test";
import { bs } from "better-sol/program";
import { createTestContext, type TestContext } from "../src/context.ts";

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority]);

const counter = bs.program(
  {
    name: "counter",
    address: "11111111111111111111111111111111",
    accounts: { Counter },
  },
  (ix) => ({
    initialize: ix({
      accounts: {
        counter: bs.init(Counter),
        authority: bs.signer(),
      },
      args: { initialValue: bs.u64() },
      run: () => {},
    }),
    increment: ix({
      accounts: {
        counter: bs.mut(Counter),
      },
      args: { amount: bs.u64() },
      run: () => {},
    }),
  }),
);

describe("createTestContext", () => {
  test("creates context with funded payer", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    expect(typeof t.payer).toBe("string");
    expect(t.payer.length).toBeGreaterThan(0);
    expect(t.svm).toBeDefined();
    expect(t.svm.getBalance(t.payer)).not.toBeNull();
  });

  test("creates context without programs", async () => {
    const t = await createTestContext({ programs: {}, skipBinaries: true });
    expect(typeof t.payer).toBe("string");
    expect(t.svm).toBeDefined();
  });

  test("throws for missing binary without skipBinaries", async () => {
    await expect(
      createTestContext({ programs: { counter } }),
    ).rejects.toThrow('Compiled binary not found for program "counter"');
  });

  test("svm is frozen on context", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    expect(() => {
      (t as unknown as Record<string, unknown>).svm = null;
    }).toThrow();
  });

  test("respects custom commitment", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true, commitment: "confirmed" });
    expect(t).toBeDefined();
  });
});

describe("newSigner", () => {
  test("creates funded account with default 100 SOL", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const signer = await t.newSigner();
    const balance = t.svm.getBalance(signer.address);
    expect(balance).not.toBeNull();
  });

  test("creates funded account with custom amount", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const signer = await t.newSigner(50);
    const balance = t.svm.getBalance(signer.address);
    expect(balance).not.toBeNull();
  });

  test("creates distinct signers", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const a = await t.newSigner();
    const b = await t.newSigner();
    expect(a.address).not.toBe(b.address);
  });
});

describe("as", () => {
  test("scopes context to different signer", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const stranger = await t.newSigner();
    const scoped = await t.as(stranger);
    expect(scoped.payer).toBe(stranger.address);
  });

  test("scoped context shares the same svm", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const stranger = await t.newSigner();
    const scoped = await t.as(stranger);
    expect(scoped.svm).toBe(t.svm);
  });

  test("scoped context has test utilities", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const stranger = await t.newSigner();
    const scoped = await t.as(stranger);
    expect(typeof scoped.newSigner).toBe("function");
    expect(typeof scoped.as).toBe("function");
    expect(typeof scoped.warp).toBe("function");
    expect(typeof scoped.setClock).toBe("function");
    expect(typeof scoped.setBalance).toBe("function");
  });

  test("scoped context has program namespace", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const stranger = await t.newSigner();
    const scoped = await t.as(stranger);
    expect(scoped.counter).toBeDefined();
    expect(scoped.counter.address).toBeDefined();
  });
});

describe("warp", () => {
  test("advances slot forward", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const before = t.svm.getClock().slot;
    t.warp(100);
    const after = t.svm.getClock().slot;
    expect(after).toBeGreaterThan(before);
  });

  test("warp 0 does not change slot", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const before = t.svm.getClock().slot;
    t.warp(0);
    const after = t.svm.getClock().slot;
    expect(after).toBe(before);
  });
});

describe("setClock", () => {
  test("sets exact unix timestamp", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    t.setClock(1700000000n);
    expect(t.svm.getClock().unixTimestamp).toBe(1700000000n);
  });

  test("preserves other clock fields", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const epochBefore = t.svm.getClock().epoch;
    t.setClock(1700000000n);
    expect(t.svm.getClock().epoch).toBe(epochBefore);
  });
});

describe("setBalance", () => {
  test("overwrites balance for existing account", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const signer = await t.newSigner();
    t.setBalance(signer.address, 42);
    const balance = t.svm.getBalance(signer.address);
    expect(balance).not.toBeNull();
  });

  test("accepts string address", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const signer = await t.newSigner();
    expect(() => t.setBalance(signer.address as string, 42)).not.toThrow();
  });

  test("no-ops for nonexistent account", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    expect(() => t.setBalance(t.payer, 999)).not.toThrow();
  });
});

describe("program namespace", () => {
  test("exposes typed program client", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    expect(t.counter).toBeDefined();
    expect(t.counter.address).toBe("11111111111111111111111111111111");
    expect(t.counter.accounts.Counter).toBeDefined();
    expect(typeof t.counter.accounts.Counter.derive).toBe("function");
    expect(typeof t.counter.accounts.Counter.fetch).toBe("function");
  });

  test("exposes instruction methods", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    expect(typeof t.counter.initialize).toBe("function");
    expect(typeof t.counter.increment).toBe("function");
    expect(typeof t.counter.initialize.instruction).toBe("function");
    expect(typeof t.counter.increment.instruction).toBe("function");
  });
});

describe("profile", () => {
  test("wraps function and returns result", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const { result } = await t.profile(async () => 42);
    expect(result).toBe(42);
  });

  test("returns compute units and logs fields", async () => {
    const t = await createTestContext({ programs: { counter }, skipBinaries: true });
    const profiled = await t.profile(async () => "hello");
    expect(typeof profiled.computeUnits).toBe("bigint");
    expect(Array.isArray(profiled.logs)).toBe(true);
  });
});
