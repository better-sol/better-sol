import { describe, expect, test } from "bun:test";
import { account, array, p, program, pubkey, sol, struct, token, u8, u64, type InstructionAccounts, type InstructionArgs } from "../src/program";
import { version } from "../src/index";

test("exports a version", () => {
  expect(version).toBe("0.1.0");
});

describe("program builder stubs", () => {
  test("creates typed account definitions", () => {
    const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);
    expect(Counter.fields.count.kind).toBe("u64");
    expect(Counter.seedValues).toEqual(["counter", "{authority}"]);
  });

  test("creates typed instructions with account and arg context", () => {
    const Counter = account({ count: u64, authority: pubkey });
    const prog = program(
      { name: "test", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      ix => ({
        increment: ix({
          accounts: {
            counter: p.mut(Counter),
            authority: p.signer(),
          },
          args: { amount: u64 },
          run: ({ counter, authority }, { amount }, ctx) => {
            ctx.require(authority === counter.authority, "Unauthorized");
            counter.count += amount;
          },
        }),
      })
    );

    const increment = prog.instructions.increment;

    type IncrementAccounts = InstructionAccounts<typeof increment>;
    type IncrementArgs = InstructionArgs<typeof increment>;
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
    const Counter = account({ count: u64, authority: pubkey });

    const counterProgram = program(
      {
        name: "counter",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        errors: { Unauthorized: "Only authority" },
        events: { Incremented: { amount: u64, authority: pubkey } },
      },
      ix => ({
        increment: ix({
          accounts: {
            counter: p.mut(Counter),
            authority: p.signer(),
          },
          args: { amount: u64 },
          run: ({ counter, authority }, { amount }, ctx) => {
            ctx.require(authority === counter.authority, "Unauthorized");
            counter.count += amount;
            ctx.emit("Incremented", { amount, authority });
          },
        }),
      })
    );

    expect(counterProgram.errors.Unauthorized).toBe("Only authority");
    expect(counterProgram.events.Incremented.amount.kind).toBe("u64");
  });

  test("creates program with events only", () => {
    const pingProgram = program(
      {
        name: "ping_program",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
        events: { Pinged: { value: u64 } },
      },
      ix => ({
        ping: ix({
          accounts: {} as const,
          args: { value: u64 },
          run: (_accounts, { value }, ctx) => {
            ctx.emit("Pinged", { value });
          },
        }),
      })
    );

    expect(pingProgram.events.Pinged.value.kind).toBe("u64");
  });

  test("supports nested zero-copy array field tokens", () => {
    const Order = struct({ quantity: u64, owner: pubkey });
    const OrderBook = account({ orders: array(Order, 8), market: pubkey }).derive((seed) => ["orderbook", seed.market]).zeroCopy();
    expect(OrderBook.zeroCopyEnabled).toBe(true);
  });

  test("rejects dynamic string seed templates", () => {
    const Counter = account({ id: u64 });
    expect(() => Counter.derive(() => ["counter", "{id}"])).toThrow("Dynamic PDA seed template");
  });

  test("rejects account and arg name collisions", () => {
    const Counter = account({ count: u64 });
    expect(() => program(
      { name: "collision", address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs" },
      ix => ({
        increment: ix({
          accounts: { amount: p.mut(Counter) },
          args: { amount: u64 },
          run: ({ amount }, args) => {
            amount.count += args.amount;
          },
        }),
      }),
    )).toThrow("conflicts with an instruction arg");
  });

  test("exposes token and sysvar stubs", () => {
    const TransferState = account({ owner: pubkey, amount: u64, decimals: u8 });
    const transferProgram = program(
      {
        name: "transfer_program",
        address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
      },
      ix => ({
        transfer: ix({
          accounts: {
            state: p.mut(TransferState),
            from: p.tokenAccount().mut(),
            to: p.tokenAccount().mut(),
            mint: p.mint(),
            authority: p.signer(),
            tokenProgram: p.tokenProgram(),
          },
          args: { amount: u64 },
          run: ({ state, from, to, mint, authority }, { amount }) => {
            state.amount = amount;
            state.decimals = mint.decimals;
            token.transfer({ from, to, authority, amount });
            state.amount = sol.timestamp();
          },
        }),
      })
    );

    expect(transferProgram.instructions.transfer.accounts.tokenProgram.constraintKind).toBe("tokenProgram");
  });
});

