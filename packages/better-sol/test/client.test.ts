import { describe, expect, test } from "bun:test";
import { betterSol } from "../src/index";
import { account, bool, i64, p, program, pubkey, string, u8, u64 } from "../src/program";

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
    ix => ({ ping: ix({ accounts: {}, run: () => {} }) }),
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

