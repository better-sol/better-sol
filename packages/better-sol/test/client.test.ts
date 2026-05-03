import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { betterSol } from "../src/index";
import { account, bool, i64, p, program, pubkey, string, u8, u64 } from "../src/program";

const signer = {
  address: address("11111111111111111111111111111111"),
  signTransactions: async <T extends readonly unknown[]>(transactions: T): Promise<T> => transactions,
};

describe("client SDK", () => {
  test("program accepts accounts config", () => {
    const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);
    const counterProg = program(
      {
        name: "counter",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        accounts: { Counter },
      },
      ix => ({
        increment: ix({
          accounts: { counter: p.mut(Counter), authority: p.signer() },
          args: { amount: u64 },
          run: () => {},
        }),
      }),
    );

    expect(counterProg.accounts.Counter.fields.count.kind).toBe("u64");
    expect(counterProg.accounts.Counter.seedValues).toEqual(["counter", "{authority}"]);
  });

  test("program works without accounts", () => {
    const counterProg = program(
      { name: "counter", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      ix => ({
        increment: ix({
          accounts: { authority: p.signer() },
          args: { amount: u64 },
          run: () => {},
        }),
      }),
    );

    expect(Object.keys(counterProg.accounts)).toEqual([]);
  });

  test("instruction methods expose .instruction() and .transaction() at type level", () => {
    const Counter = account({ count: u64, authority: pubkey });
    const prog = program(
      { name: "test", address: "11111111111111111111111111111111" },
      ix => ({
        increment: ix({
          accounts: { counter: p.mut(Counter), authority: p.signer() },
          args: { amount: u64 },
          run: () => {},
        }),
      }),
    );

    const method = prog.instructions.increment!;
    expect(method.accounts.counter!.constraintKind).toBe("mut");
    expect(method.accounts.authority!.constraintKind).toBe("signer");
  });

  test("instruction definition exposes p.signer and p.mut constraints correctly", () => {
    const Counter = account({ count: u64, authority: pubkey });
    const prog = program(
      { name: "test", address: "11111111111111111111111111111111" },
      ix => ({
        initialize: ix({
          accounts: { counter: p.create(Counter), authority: p.signer(), systemProgram: p.systemProgram() },
          args: { initialValue: u64 },
          run: () => {},
        }),
        transfer: ix({
          accounts: {
            from: p.tokenAccount().mut(),
            to: p.tokenAccount().mut(),
            authority: p.signer(),
            tokenProgram: p.tokenProgram(),
          },
          args: { amount: u64 },
          run: () => {},
        }),
        close: ix({
          accounts: { counter: p.close(Counter, "authority"), authority: p.signer() },
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
    const prog = program(
      { name: "multi", address: "11111111111111111111111111111111" },
      ix => ({
        multi: ix({
          accounts: { authority: p.signer() },
          args: { flag: bool, score: i64, name: string },
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
    const Counter = account({ count: u64, authority: pubkey });
    const prog = program(
      { name: "signatures", address: "11111111111111111111111111111111", accounts: { Counter } },
      ix => ({
        ping: ix({
          run: () => {},
        }),
        setAuthority: ix({
          args: { authority: pubkey },
          run: () => {},
        }),
        close: ix({
          accounts: { counter: p.mut(Counter) },
          run: () => {},
        }),
        increment: ix({
          accounts: { counter: p.mut(Counter), authority: p.signer() },
          args: { amount: u64 },
          run: () => {},
        }),
        signedPing: ix({
          accounts: { authority: p.signer() },
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
    const Counter = account({ count: u64 });
    const prog = program(
      { name: "runtime", address: "11111111111111111111111111111111" },
      ix => ({
        close: ix({
          accounts: { counter: p.mut(Counter) },
          run: () => {},
        }),
      }),
    );
    const client = await betterSol({ cluster: "devnet", payer: signer, programs: { prog } });
    const close = client.prog.close.instruction as (params?: Record<string, unknown>) => Promise<unknown>;
    await expect(close()).rejects.toThrow("Missing account 'counter'");
  });

  test("instruction with no args produces undefined args", () => {
    const prog = program(
      { name: "simple", address: "11111111111111111111111111111111" },
      ix => ({
        ping: ix({
          accounts: { authority: p.signer() },
          run: () => {},
        }),
      }),
    );
    expect(prog.instructions.ping.args).toBeUndefined();
  });
});

test("derive with no field seeds accepts empty object", () => {
  const Config = account({ admin: pubkey, bump: u8 }).derive(() => ["config"]);
  const prog = program(
    { name: "test", address: "11111111111111111111111111111111", accounts: { Config } },
    ix => ({ ping: ix({ run: () => {} }) }),
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

