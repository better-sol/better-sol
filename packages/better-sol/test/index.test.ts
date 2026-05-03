import { describe, expect, test } from "bun:test";
import { version } from "../src/index";
import {
  account, array, p, program,
  pubkey, sol, struct, token, u8, u64,
  type InstructionAccounts, type InstructionArgs,
} from "../src/program";
import { anchorDiscriminator, accountDiscriminator, encodeField, decodeField, encodeAccount, decodeAccount } from "../src/coder";
import { bool, option, vec } from "../src/program";

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

describe("Borsh coder", () => {
  test("encodes and decodes u64", () => {
    const encoded = encodeField(u64, 42n);
    const decoded = decodeField(u64, encoded, 0);
    expect(decoded.value).toBe(42n);
    expect(decoded.offset).toBe(8);
  });

  test("encodes and decodes u8", () => {
    const encoded = encodeField(u8, 255);
    const decoded = decodeField(u8, encoded, 0);
    expect(decoded.value).toBe(255);
    expect(decoded.offset).toBe(1);
  });

  test("encodes and decodes bool", () => {
    const encTrue = encodeField(bool, true);
    const encFalse = encodeField(bool, false);
    expect(decodeField(bool, encTrue, 0).value).toBe(true);
    expect(decodeField(bool, encFalse, 0).value).toBe(false);
  });

  test("encodes and decodes pubkey", () => {
    const addr = "11111111111111111111111111111111";
    const encoded = encodeField(pubkey, addr);
    const decoded = decodeField(pubkey, encoded, 0);
    expect(decoded.value).toBe(addr);
    expect(decoded.offset).toBe(32);
  });

  test("encodes and decodes option", () => {
    const opt = option(u64);
    const encSome = encodeField(opt, 100n);
    const encNone = encodeField(opt, null);
    expect(decodeField(opt, encSome, 0).value).toBe(100n);
    expect(decodeField(opt, encNone, 0).value).toBe(null);
  });

  test("encodes and decodes vec", () => {
    const v = vec(u8);
    const encoded = encodeField(v, [1, 2, 3]);
    const decoded = decodeField(v, encoded, 0);
    expect(decoded.value).toEqual([1, 2, 3]);
  });

  test("encodes and decodes full account", () => {
    const fields = { count: u64, authority: pubkey, isActive: bool };
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
});

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
});

test("derive with no field seeds accepts empty object", () => {
  const Config = account({ admin: pubkey, bump: u8 }).derive(() => ["config"]);
  const prog = program(
    { name: "test", address: "11111111111111111111111111111111", accounts: { Config } },
    ix => ({ ping: ix({ accounts: {}, run: () => {} }) }),
  );
  expect([...prog.accounts.Config.seedValues]).toEqual(["config"]);
});
