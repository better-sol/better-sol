import { describe, expect, test } from "bun:test";
import { version } from "../src/index";
import {
  account, AccountConstraint, array, p, program,
  pubkey, sol, struct, token, u8, u64,
  type InstructionAccounts, type InstructionArgs,
} from "../src/program";
import { anchorDiscriminator, accountDiscriminator, encodeField, decodeField, encodeAccount, decodeAccount, encodeInstruction } from "../src/coder";
import { bool, i64, option, string, vec } from "../src/program";
import { fromIdl } from "../src/idl";
import type { AnchorIdl } from "../src/idl";

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

  test("encodeInstruction includes discriminator followed by encoded args", async () => {
    const args = { amount: u64 };
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
    const encoded = encodeField(i64, -1n);
    expect(encoded.length).toBe(8);
    expect(decodeField(i64, encoded, 0).value).toBe(-1n);
  });

  test("encodeField handles string", () => {
    const encoded = encodeField(string, "hello");
    expect(encoded.length).toBe(9);
    expect(decodeField(string, encoded, 0).value).toBe("hello");
  });
});

describe("fromIdl", () => {
  test("parses a minimal IDL", () => {
    const idl = {
      name: "minimal",
      instructions: [],
    };
    const prog = fromIdl(idl);
    expect(prog.name).toBe("minimal");
    expect(prog.address).toBe("");
    expect(Object.keys(prog.instructions)).toEqual([]);
    expect(Object.keys(prog.accounts)).toEqual([]);
  });

  test("parses an IDL with address in metadata", () => {
    const idl = {
      name: "with_address",
      instructions: [],
      metadata: { address: "MyPr0g11111111111111111111111111111111111" },
    };
    const prog = fromIdl(idl);
    expect(prog.address).toBe("MyPr0g11111111111111111111111111111111111");
  });

  test("parses instructions with accounts and args", () => {
    const idl = {
      name: "counter",
      instructions: [
        {
          name: "initialize",
          accounts: [
            { name: "counter", writable: true, signer: false },
            { name: "authority", writable: false, signer: true },
          ],
          args: [{ name: "initialValue", type: "u64" as const }],
        },
        {
          name: "increment",
          accounts: [
            { name: "counter", writable: true, signer: false },
            { name: "authority", writable: false, signer: true },
          ],
          args: [{ name: "amount", type: "u64" as const }],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(Object.keys(prog.instructions)).toEqual(["initialize", "increment"]);

    const init = prog.instructions.initialize!;
    expect(init.args).toBeDefined();
    expect(init.args !== undefined ? Object.keys(init.args) : []).toEqual(["initialValue"]);
    expect(Object.keys(init.accounts)).toEqual(["counter", "authority"]);

    const authInput = init.accounts["authority"]!;
    expect(authInput instanceof AccountConstraint).toBe(true);
  });

  test("parses instructions without args", () => {
    const idl = {
      name: "simple",
      instructions: [
        {
          name: "ping",
          accounts: [{ name: "authority", writable: false, signer: true }],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(prog.instructions.ping!.args).toBeUndefined();
  });

  test("parses accounts", () => {
    const idl = {
      name: "counter",
      instructions: [],
      accounts: [
        {
          name: "Counter",
          type: {
            kind: "struct" as const,
            fields: [
              { name: "count", type: "u64" as const },
              { name: "authority", type: "publicKey" as const },
            ],
          },
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(Object.keys(prog.accounts)).toEqual(["Counter"]);
    expect(prog.accounts["Counter"]!.fields.count!.kind).toBe("u64");
    expect(prog.accounts["Counter"]!.fields.authority!.kind).toBe("pubkey");
  });

  test("parses errors", () => {
    const idl = {
      name: "counter",
      instructions: [],
      errors: [
        { code: 6000, name: "Unauthorized", msg: "Only authority" },
        { code: 6001, name: "Underflow", msg: "Arithmetic underflow" },
      ],
    };
    const prog = fromIdl(idl);
    expect(prog.errors).toEqual({ Unauthorized: "Only authority", Underflow: "Arithmetic underflow" });
  });

  test("handles missing errors gracefully", () => {
    const idl = {
      name: "no_errors",
      instructions: [],
    };
    const prog = fromIdl(idl);
    expect(prog.errors).toEqual({});
    expect(prog.events).toEqual({});
  });

  test("handles writable signer account", () => {
    const idl = {
      name: "test",
      instructions: [
        {
          name: "write",
          accounts: [
            { name: "feePayer", writable: true, signer: true },
            { name: "data", writable: true, signer: false },
          ],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const ix = prog.instructions.write!;
    const feePayer = ix.accounts["feePayer"]!;
    expect(feePayer instanceof AccountConstraint).toBe(true);
    if (feePayer instanceof AccountConstraint) {
      expect(feePayer.constraintKind).toBe("signer");
      expect(feePayer.mutable).toBe(true);
    }
  });

  test("handles readonly non-signer account", () => {
    const idl = {
      name: "test",
      instructions: [
        {
          name: "read",
          accounts: [
            { name: "sysvar", writable: false, signer: false },
          ],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const ix = prog.instructions.read!;
    const sysvar = ix.accounts["sysvar"]!;
    expect(sysvar instanceof AccountConstraint).toBe(true);
    if (sysvar instanceof AccountConstraint) {
      expect(sysvar.mutable).toBe(false);
    }
  });

  test("parses compound IDL types", () => {
    const idl = {
      name: "complex",
      instructions: [],
      accounts: [
        {
          name: "Complex",
          type: {
            kind: "struct" as const,
            fields: [
              { name: "optVal", type: { option: "u64" as const } },
              { name: "vecVal", type: { vec: "u8" as const } },
              { name: "arrVal", type: { array: ["u8" as const, 4] as const } },
            ],
          },
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(prog.accounts["Complex"]!.fields.optVal!.kind).toBe("option");
    expect(prog.accounts["Complex"]!.fields.vecVal!.kind).toBe("vec");
    expect(prog.accounts["Complex"]!.fields.arrVal!.kind).toBe("array");
  });

  test("parses an IDL with no accounts section", () => {
    const idl = {
      name: "no_accounts",
      instructions: [
        {
          name: "ping",
          accounts: [],
        },
      ],
    };
    const prog = fromIdl(idl);
    expect(Object.keys(prog.accounts)).toEqual([]);
  });

  test("parses a realistic multi-instruction IDL", () => {
    const idl = {
      name: "amm",
      instructions: [
        { name: "initializeConfig", accounts: [{ name: "config", writable: true, signer: false }, { name: "admin", writable: false, signer: true }], args: [] },
        { name: "createPool", accounts: [{ name: "config", writable: true, signer: false }, { name: "pool", writable: true, signer: false }, { name: "creator", writable: false, signer: true }], args: [{ name: "feeBps", type: "u64" as const }] },
        { name: "swap", accounts: [{ name: "pool", writable: true, signer: false }, { name: "reserveIn", writable: true, signer: false }, { name: "reserveOut", writable: true, signer: false }, { name: "trader", writable: false, signer: true }], args: [{ name: "amountIn", type: "u64" as const }, { name: "minOut", type: "u64" as const }] },
      ],
      accounts: [
        { name: "Config", type: { kind: "struct" as const, fields: [{ name: "admin", type: "publicKey" as const }, { name: "feeBps", type: "u64" as const }, { name: "bump", type: "u8" as const }] } },
        { name: "Pool", type: { kind: "struct" as const, fields: [{ name: "tokenAMint", type: "publicKey" as const }, { name: "tokenBMint", type: "publicKey" as const }, { name: "lpSupply", type: "u64" as const }] } },
      ],
      errors: [{ code: 6000, name: "SlippageExceeded", msg: "Output below minimum" }],
      metadata: { address: "AMM111111111111111111111111111111111111111" },
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(prog.name).toBe("amm");
    expect(prog.address).toBe("AMM111111111111111111111111111111111111111");
    expect(Object.keys(prog.instructions)).toEqual(["initializeConfig", "createPool", "swap"]);
    expect(Object.keys(prog.accounts)).toEqual(["Config", "Pool"]);

    const swap = prog.instructions.swap!;
    expect(Object.keys(swap.accounts)).toEqual(["pool", "reserveIn", "reserveOut", "trader"]);
    expect(swap.args).toBeDefined();
    if (swap.args) expect(Object.keys(swap.args)).toEqual(["amountIn", "minOut"]);

    expect(prog.errors).toEqual({ SlippageExceeded: "Output below minimum" });
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

describe("wallet adapter round-trip", () => {
  test("walletAdapter constructs a callable TransactionSigner", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const mockWallet = {
      publicKey: { toBase58: () => "11111111111111111111111111111111" },
      signTransaction: async <T>(tx: T): Promise<T> => tx,
    };
    const signer = walletAdapter(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("reownWallet constructs a callable TransactionSigner", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      walletProvider: {
        signTransaction: async <T>(tx: T): Promise<T> => tx,
      },
    };
    const signer = reownWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("privyWallet constructs a callable TransactionSigner", async () => {
    const { privyWallet } = await import("../src/wallets/privy");
    const mockWallet = {
      wallet: { address: "11111111111111111111111111111111" },
      signTransaction: async (_args: { transaction: Uint8Array; wallet: unknown }) => ({ signedTransaction: new Uint8Array(64) }),
    };
    const signer = privyWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("dynamicWallet constructs a callable TransactionSigner", async () => {
    const { dynamicWallet } = await import("../src/wallets/dynamic");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      getSigner: async () => ({ signTransaction: async <T>(tx: T): Promise<T> => tx }),
    };
    const signer = dynamicWallet(mockWallet);
    expect(typeof signer.address).toBe("string");
    expect(typeof (signer as Record<string, unknown>).signTransactions).toBe("function");
  });

  test("reownWallet throws when signTransaction is missing", async () => {
    const { reownWallet } = await import("../src/wallets/reown");
    const mockWallet = {
      address: "11111111111111111111111111111111",
      walletProvider: {},
    };
    expect(() => reownWallet(mockWallet)).toThrow("signTransaction");
  });

  test("walletAdapter throws when signTransaction is missing", async () => {
    const { walletAdapter } = await import("../src/wallets/wallet-adapter");
    const mockWallet = {
      publicKey: { toBase58: () => "11111111111111111111111111111111" },
    };
    expect(() => walletAdapter(mockWallet)).toThrow("signTransaction");
  });
});
