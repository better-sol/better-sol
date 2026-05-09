import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { betterSol } from "../src/index";
import { bs } from "../src/program";

const signer = {
  address: address("11111111111111111111111111111111"),
  signTransactions: async <T extends readonly unknown[]>(transactions: T): Promise<T> => transactions,
};

describe("client SDK", () => {
  test("program accepts accounts config", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    const counterProg = bs.program(
      {
        name: "counter",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        accounts: { Counter },
      },
      (ix) => ({
        increment: ix({
          accounts: { counter: bs.mut(Counter), authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );

    expect(counterProg.accounts.Counter.fields.count.kind).toBe("u64");
    expect(counterProg.accounts.Counter.seedValues).toEqual(["counter", "{authority}"]);
  });

  test("program works without accounts", () => {
    const counterProg = bs.program(
      { name: "counter", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      (ix) => ({
        increment: ix({
          accounts: { authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );

    expect(Object.keys(counterProg.accounts)).toEqual([]);
  });

  test("instruction methods expose .instruction() and .transaction() at type level", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        increment: ix({
          accounts: { counter: bs.mut(Counter), authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );

    const method = prog.instructions.increment!;
    expect(method.accounts.counter!.constraintKind).toBe("mut");
    expect(method.accounts.authority!.constraintKind).toBe("signer");
  });

  test("instruction definition exposes constraint kinds correctly", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        initialize: ix({
          accounts: { counter: bs.init(Counter), authority: bs.signer(), systemProgram: bs.systemProgram() },
          args: { initialValue: bs.u64() },
          run: () => {},
        }),
        transfer: ix({
          accounts: {
            from: bs.tokenAccount().writable(),
            to: bs.tokenAccount().writable(),
            authority: bs.signer(),
            tokenProgram: bs.tokenProgram(),
          },
          args: { amount: bs.u64() },
          run: () => {},
        }),
        close: ix({
          accounts: { counter: bs.close(Counter, "authority"), authority: bs.signer() },
          run: () => {},
        }),
      }),
    );

    const init = prog.instructions.initialize;
    expect(init.accounts.counter.constraintKind).toBe("init");
    expect(init.accounts.authority.constraintKind).toBe("signer");
    expect(init.accounts.systemProgram.constraintKind).toBe("systemProgram");

    const tr = prog.instructions.transfer;
    expect(tr.accounts.tokenProgram.constraintKind).toBe("tokenProgram");

    const cl = prog.instructions.close;
    expect(cl.accounts.counter.constraintKind).toBe("close");
  });

  test("instruction args respect their type tokens", () => {
    const prog = bs.program(
      { name: "multi", address: "11111111111111111111111111111111" },
      (ix) => ({
        multi: ix({
          accounts: { authority: bs.signer() },
          args: { flag: bs.bool(), score: bs.i64(), name: bs.string() },
          run: () => {},
        }),
      }),
    );

    const args = prog.instructions.multi.args;
    expect(args.flag.kind).toBe("bool");
    expect(args.score.kind).toBe("i64");
    expect(args.name.kind).toBe("string");
  });

  test("instruction call signatures match required inputs", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });
    const prog = bs.program(
      { name: "signatures", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({
        ping: ix({
          run: () => {},
        }),
        setAuthority: ix({
          args: { authority: bs.pubkey() },
          run: () => {},
        }),
        close: ix({
          accounts: { counter: bs.mut(Counter) },
          run: () => {},
        }),
        increment: ix({
          accounts: { counter: bs.mut(Counter), authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
        signedPing: ix({
          accounts: { authority: bs.signer() },
          run: () => {},
        }),
      }),
    );

    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });

    await client.prog.ping.instruction();
    await client.prog.setAuthority.instruction({ authority: signer.address });
    await client.prog.close.instruction({ counter: signer.address });
    await client.prog.increment.instruction({ counter: signer.address, amount: 1n });
    await client.prog.signedPing.instruction();
    await client.prog.signedPing.instruction({ authority: signer.address });
  });

  test("instruction calls reject missing required accounts at runtime", async () => {
    const Counter = bs.account({ count: bs.u64() });
    const prog = bs.program(
      { name: "runtime", address: "11111111111111111111111111111111" },
      (ix) => ({
        close: ix({
          accounts: { counter: bs.mut(Counter) },
          run: () => {},
        }),
      }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    const close = client.prog.close.instruction as (params?: Record<string, unknown>) => Promise<unknown>;
    await expect(close()).rejects.toThrow("Missing account 'counter'");
  });

  test("instruction with no args produces undefined args", () => {
    const prog = bs.program(
      { name: "simple", address: "11111111111111111111111111111111" },
      (ix) => ({
        ping: ix({
          accounts: { authority: bs.signer() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.ping.args).toBeUndefined();
  });
});

test("derive with no field seeds accepts empty object", () => {
  const Config = bs.account({ admin: bs.pubkey(), bump: bs.u8() }).derive(() => ["config"]);
  const prog = bs.program(
    { name: "test", address: "11111111111111111111111111111111", accounts: { Config } },
    (ix) => ({ ping: ix({ run: () => {} }) }),
  );
  expect([...prog.accounts.Config.seedValues]).toEqual(["config"]);
});

describe("client factory", () => {
  test("supports read-only clients without a payer", async () => {
    const client = await betterSol({ cluster: "devnet" });
    expect(client.payer).toBeNull();
    await expect(client.transfer({ to: "11111111111111111111111111111111", amount: 1n })).rejects.toThrow("No signer configured");
  });
});

describe("new SDK features", () => {
  test("instruction methods expose .simulate() and .prepare() at type level", async () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        increment: ix({
          accounts: { counter: bs.mut(Counter), authority: bs.signer() },
          args: { amount: bs.u64() },
          run: () => {},
        }),
      }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { test: prog } });
    const fn = client.test.increment;
    expect(typeof fn.simulate).toBe("function");
    expect(typeof fn.prepare).toBe("function");
    expect(typeof fn.send).toBe("function");
    expect(typeof fn.instruction).toBe("function");
    expect(typeof fn.transaction).toBe("function");
  });

  test("BoundAccount exposes fetchMultiple", async () => {
    const Counter = bs.account({ count: bs.u64() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111", accounts: { Counter } },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", programs: { test: prog } });
    expect(typeof client.test.accounts.Counter.fetchMultiple).toBe("function");
  });

  test("bs.initIfNeeded() produces correct constraint kind", () => {
    const Counter = bs.account({ count: bs.u64() });
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({
        init: ix({
          accounts: { counter: bs.initIfNeeded(Counter), authority: bs.signer() },
          args: { value: bs.u64() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.init.accounts.counter.constraintKind).toBe("initIfNeeded");
  });

  test("program accepts inline event definitions", () => {
    const prog = bs.program(
      {
        name: "test",
        address: "11111111111111111111111111111111",
        events: {
          Transfer: { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() },
        },
      },
      (ix) => ({
        transfer: ix({
          accounts: { authority: bs.signer() },
          args: { amount: bs.u64() },
          run: (accounts, args, ctx) => {
            ctx.emit("Transfer", { from: accounts.authority, to: accounts.authority, amount: args.amount });
          },
        }),
      }),
    );
    expect(prog.events.Transfer).toBeDefined();
  });
});

describe("client factory — direct RPC", () => {
  const mockRpc = {
    getLatestBlockhash: () => ({ send: () => Promise.resolve({ value: { blockhash: "GHtXQBPsZMhGNUjDBaEuQ7oPrest2F2H_LA8iGYMPLgS", lastValidBlockHeight: 100n } }) }),
    getAccountInfo: () => ({ send: () => Promise.resolve({ value: null }) }),
    getMultipleAccounts: () => ({ send: () => Promise.resolve({ value: [] }) }),
    sendTransaction: () => ({ send: () => Promise.resolve("fake") }),
    getBalance: () => ({ send: () => Promise.resolve({ value: 0n }) }),
    getLatestBlockhashAndContext: () => ({ send: () => Promise.resolve({ value: { blockhash: "GHtXQBPsZMhGNUjDBaEuQ7oPrest2F2H_LA8iGYMPLgS", lastValidBlockHeight: 100n } }) }),
    getBlock: () => ({ send: () => Promise.resolve(null) }),
    getBlockHeight: () => ({ send: () => Promise.resolve(0n) }),
    getBlockProduction: () => ({ send: () => Promise.resolve({ value: {} }) }),
    getBlocks: () => ({ send: () => Promise.resolve([]) }),
    getBlocksWithLimit: () => ({ send: () => Promise.resolve([]) }),
    getBlockCommitment: () => ({ send: () => Promise.resolve({}) }),
    getBlockTime: () => ({ send: () => Promise.resolve(null) }),
    getClusterNodes: () => ({ send: () => Promise.resolve([]) }),
    getEpochInfo: () => ({ send: () => Promise.resolve({}) }),
    getEpochSchedule: () => ({ send: () => Promise.resolve({}) }),
    getFirstAvailableBlock: () => ({ send: () => Promise.resolve(0n) }),
    getGenesisHash: () => ({ send: () => Promise.resolve("") }),
    getHealth: () => ({ send: () => Promise.resolve("ok") }),
    getHighestSnapshotSlot: () => ({ send: () => Promise.resolve(null) }),
    getIdentity: () => ({ send: () => Promise.resolve({}) }),
    getInflationGovernor: () => ({ send: () => Promise.resolve({}) }),
    getInflationRate: () => ({ send: () => Promise.resolve({}) }),
    getLargestAccounts: () => ({ send: () => Promise.resolve({ value: [] }) }),
    getMaxRetransmitSlot: () => ({ send: () => Promise.resolve(null) }),
    getMaxShredInsertSlot: () => ({ send: () => Promise.resolve(null) }),
    getMinimumBalanceForRentExemption: () => ({ send: () => Promise.resolve(0n) }),
    getProgramAccounts: () => ({ send: () => Promise.resolve([]) }),
    getRecentPerformanceSamples: () => ({ send: () => Promise.resolve([]) }),
    getSignaturesForAddress: () => ({ send: () => Promise.resolve([]) }),
    getSignatureStatuses: () => ({ send: () => Promise.resolve({ value: [] }) }),
    getSlot: () => ({ send: () => Promise.resolve(0n) }),
    getSlotLeader: () => ({ send: () => Promise.resolve("") }),
    getSlotLeaders: () => ({ send: () => Promise.resolve([]) }),
    getStakeActivation: () => ({ send: () => Promise.resolve({}) }),
    getStakeMinimumDelegation: () => ({ send: () => Promise.resolve(0n) }),
    getSupply: () => ({ send: () => Promise.resolve({ value: {} }) }),
    getTokenAccountBalance: () => ({ send: () => Promise.resolve({ value: {} }) }),
    getTokenAccountsByDelegate: () => ({ send: () => Promise.resolve({ value: [] }) }),
    getTokenAccountsByOwner: () => ({ send: () => Promise.resolve({ value: [] }) }),
    getTokenLargestAccounts: () => ({ send: () => Promise.resolve({ value: [] }) }),
    getTokenSupply: () => ({ send: () => Promise.resolve({ value: {} }) }),
    getTransaction: () => ({ send: () => Promise.resolve(null) }),
    getTransactionCount: () => ({ send: () => Promise.resolve(0n) }),
    getVersion: () => ({ send: () => Promise.resolve({}) }),
    getVoteAccounts: () => ({ send: () => Promise.resolve({}) }),
    isBlockhashValid: () => ({ send: () => Promise.resolve({ value: false }) }),
    minimumLedgerSlot: () => ({ send: () => Promise.resolve(0n) }),
    requestAirdrop: () => ({ send: () => Promise.resolve("") }),
    simulateTransaction: () => ({ send: () => Promise.resolve({ value: { err: null, logs: [], unitsConsumed: 0 } }) }),
  } as never;

  test("accepts direct rpc in config", async () => {
    const client = await betterSol({ rpc: mockRpc, payer: signer, programs: {} });
    expect(client.rpc).toBe(mockRpc);
  });

  test("accepts direct rpc without rpcSubscriptions", async () => {
    const client = await betterSol({ rpc: mockRpc, payer: signer, programs: {} });
    expect(client.rpcSubscriptions).toBeUndefined();
  });

  test("rpcSubscriptions is undefined when only rpc is provided", async () => {
    const client = await betterSol({ rpc: mockRpc, payer: signer, programs: {} });
    expect(client.rpcSubscriptions).toBeUndefined();
  });

  test("cluster-based client still has rpcSubscriptions", async () => {
    const client = await betterSol({ cluster: "devnet" });
    expect(client.rpcSubscriptions).toBeDefined();
  });
});

describe("withSigner", () => {
  test("returns client scoped to new signer", async () => {
    const secondSigner = {
      address: address("Bi43bsYfqreLYcuHuBm7rmFinztHDDk4gDpTRNdtgqTm"),
      signTransactions: async <T extends readonly unknown[]>(txs: T): Promise<T> => txs,
    };
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: {} });
    const scoped = await client.withSigner(secondSigner);
    expect(scoped.payer).toBe(secondSigner.address);
  });

  test("scoped client preserves program namespace", async () => {
    const prog = bs.program(
      { name: "test", address: "11111111111111111111111111111111" },
      (ix) => ({ ping: ix({ run: () => {} }) }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    const secondSigner = {
      address: address("Bi43bsYfqreLYcuHuBm7rmFinztHDDk4gDpTRNdtgqTm"),
      signTransactions: async <T extends readonly unknown[]>(txs: T): Promise<T> => txs,
    };
    const scoped = await client.withSigner(secondSigner);
    expect(scoped.prog).toBeDefined();
    expect(typeof scoped.prog.ping).toBe("function");
  });
});
