import { describe, expect, test } from "bun:test";
import { bs, cpi } from "../src/program";

describe("program builder", () => {
  test("creates typed account definitions", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() }).derive((seed) => ["counter", seed.authority]);
    expect(Counter.fields.count.kind).toBe("u64");
    expect(Counter.seedValues).toEqual(["counter", "{authority}"]);
  });

  test("creates typed instructions with account and arg context", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });
    const prog = bs.program(
      { name: "test", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      (ix) => ({
        increment: ix({
          accounts: {
            counter: bs.mut(Counter),
            authority: bs.signer(),
          },
          args: { amount: bs.u64() },
          run: ({ counter, authority }, { amount }, ctx) => {
            ctx.require(authority === counter.authority, "Unauthorized");
            counter.count += amount;
          },
        }),
      }),
    );

    const increment = prog.instructions.increment;

    type IncrementAccounts = import("../src/program").InstructionAccounts<typeof increment>;
    type IncrementArgs = import("../src/program").InstructionArgs<typeof increment>;
    const args: IncrementArgs = { amount: 1n };
    const counterAccount: IncrementAccounts["counter"] = {
      key: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
      count: 0n,
      authority: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
    };

    expect(args.amount).toBe(1n);
    expect(counterAccount.count).toBe(0n);
    expect(increment.accounts.counter.constraintKind).toBe("mut");
  });

  test("creates program with typed autocomplete for errors and events", () => {
    const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() });

    const counterProgram = bs.program(
      {
        name: "counter",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        errors: { Unauthorized: "Only authority" },
        events: { Incremented: { amount: bs.u64(), authority: bs.pubkey() } },
      },
      (ix) => ({
        increment: ix({
          accounts: {
            counter: bs.mut(Counter),
            authority: bs.signer(),
          },
          args: { amount: bs.u64() },
          run: ({ counter, authority }, { amount }, ctx) => {
            ctx.require(authority === counter.authority, "Unauthorized");
            counter.count += amount;
            ctx.emit("Incremented", { amount, authority });
          },
        }),
      }),
    );

    expect(counterProgram.errors.Unauthorized).toBe("Only authority");
    expect(counterProgram.events.Incremented.amount.kind).toBe("u64");
  });

  test("creates program with params-only instruction", () => {
    bs.program(
      {
        name: "ping_program",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        events: { Pinged: { value: bs.u64() } },
      },
      (ix) => ({
        ping: ix({
          args: { value: bs.u64() },
          run: ({ value }, ctx) => {
            ctx.emit("Pinged", { value });
          },
        }),
      }),
    );
  });

  test("creates program with no accounts and no params", () => {
    const heartbeatProgram = bs.program(
      { name: "heartbeat", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      (ix) => ({
        ping: ix({
          run: (ctx) => {
            ctx.log("ping");
          },
        }),
      }),
    );

    expect(Object.keys(heartbeatProgram.instructions.ping.accounts)).toEqual([]);
    expect(heartbeatProgram.instructions.ping.args).toBeUndefined();
  });

  test("supports nested zero-copy array field tokens", () => {
    const Order = bs.struct({ quantity: bs.u64(), owner: bs.pubkey() });
    const OrderBook = bs.account({ orders: bs.array(Order, 8), market: bs.pubkey() }).derive((seed) => ["orderbook", seed.market]).zeroCopy();
    expect(OrderBook.zeroCopyEnabled).toBe(true);
  });

  test("rejects dynamic string seed templates", () => {
    const Counter = bs.account({ id: bs.u64() });
    expect(() => Counter.derive(() => ["counter", "{id}"])).toThrow("Dynamic PDA seed template");
  });

  test("rejects account and arg name collisions", () => {
    const Counter = bs.account({ count: bs.u64() });
    expect(() => bs.program(
      { name: "collision", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      (ix) => ({
        increment: ix({
          accounts: { amount: bs.mut(Counter) },
          args: { amount: bs.u64() },
          run: ({ amount }, args) => {
            amount.count += args.amount;
          },
        }),
      }),
    )).toThrow("conflicts with an instruction arg");
  });

  test("exposes constraint kinds and CPI stubs", () => {
    const TransferState = bs.account({ owner: bs.pubkey(), amount: bs.u64(), decimals: bs.u8() });
    bs.program(
      {
        name: "transfer_program",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
      },
      (ix) => ({
        transfer: ix({
          accounts: {
            state: bs.mut(TransferState),
            from: bs.tokenAccount().writable(),
            to: bs.tokenAccount().writable(),
            mint: bs.mint(),
            authority: bs.signer(),
            tokenProgram: bs.tokenProgram(),
          },
          args: { amount: bs.u64() },
          run: ({ state, from, to, mint, authority }, { amount }) => {
            state.amount = amount;
            state.decimals = mint.decimals;
            cpi.token.transfer({ from, to, authority, amount });
            state.amount = cpi.sol.timestamp();
          },
        }),
      }),
    );
  });
});
