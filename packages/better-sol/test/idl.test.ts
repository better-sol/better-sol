import { describe, expect, test } from "bun:test";
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { AccountConstraint } from "../src/program";
import { buildAccountMetas } from "../src/client/transaction";
import { betterSol, fromIdl, type AnchorIdl } from "../src/index";

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

  test("parses an IDL with address at top level", () => {
    const idl = {
      address: "MyPr0g11111111111111111111111111111111111",
      metadata: { name: "my_program", version: "1.0.0", spec: "0.1.0" },
      instructions: [],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(prog.address).toBe("MyPr0g11111111111111111111111111111111111");
    expect(prog.name).toBe("my_program");
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

  test("resolves account fields from types array", () => {
    const idl = {
      name: "counter",
      address: "Ctr11111111111111111111111111111111111111",
      instructions: [],
      accounts: [
        { name: "Counter", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
        {
          name: "Counter",
          type: {
            kind: "struct" as const,
            fields: [
              { name: "count", type: "u64" as const },
              { name: "authority", type: "pubkey" as const },
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

  test("skips accounts with no matching type definition", () => {
    const idl = {
      name: "test",
      instructions: [],
      accounts: [
        { name: "NoFields", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(Object.keys(prog.accounts)).toEqual([]);
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
      address: "Cmpx11111111111111111111111111111111111111",
      instructions: [],
      accounts: [
        { name: "Complex", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
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
      address: "AMM111111111111111111111111111111111111111",
      metadata: { name: "amm", version: "1.0.0", spec: "0.1.0" },
      instructions: [
        { name: "initializeConfig", accounts: [{ name: "config", writable: true, signer: false }, { name: "admin", writable: false, signer: true }], args: [] },
        { name: "createPool", accounts: [{ name: "config", writable: true, signer: false }, { name: "pool", writable: true, signer: false }, { name: "creator", writable: false, signer: true }], args: [{ name: "feeBps", type: "u64" as const }] },
        { name: "swap", accounts: [{ name: "pool", writable: true, signer: false }, { name: "reserveIn", writable: true, signer: false }, { name: "reserveOut", writable: true, signer: false }, { name: "trader", writable: false, signer: true }], args: [{ name: "amountIn", type: "u64" as const }, { name: "minOut", type: "u64" as const }] },
      ],
      accounts: [
        { name: "Config", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
        { name: "Pool", discriminator: [9, 10, 11, 12, 13, 14, 15, 16] },
      ],
      types: [
        { name: "Config", type: { kind: "struct" as const, fields: [{ name: "admin", type: "pubkey" as const }, { name: "feeBps", type: "u64" as const }, { name: "bump", type: "u8" as const }] } },
        { name: "Pool", type: { kind: "struct" as const, fields: [{ name: "tokenAMint", type: "pubkey" as const }, { name: "tokenBMint", type: "pubkey" as const }, { name: "lpSupply", type: "u64" as const }] } },
      ],
      errors: [{ code: 6000, name: "SlippageExceeded", msg: "Output below minimum" }],
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

  test("accepts coption type", () => {
    const idl = {
      name: "test",
      address: "Test1111111111111111111111111111111111111",
      instructions: [],
      accounts: [
        { name: "Data", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
        {
          name: "Data",
          type: {
            kind: "struct" as const,
            fields: [{ name: "value", type: { coption: "u64" as const } }],
          },
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(prog.accounts["Data"]!.fields.value!.kind).toBe("option");
  });

  test("handles IdlInstructionAccounts (nested/composite accounts)", () => {
    const idl = {
      name: "test",
      instructions: [
        {
          name: "doThing",
          accounts: [
            {
              name: "nested",
              accounts: [
                { name: "mint", writable: false, signer: false },
                { name: "token", writable: true, signer: false },
              ],
            },
            { name: "authority", writable: false, signer: true },
          ],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const ix = prog.instructions.doThing!;
    expect(Object.keys(ix.accounts)).toEqual(["mint", "token", "authority"]);
  });

  test("skips optional accounts", () => {
    const idl = {
      name: "test",
      instructions: [
        {
          name: "maybe",
          accounts: [
            { name: "required", writable: true, signer: false },
            { name: "optional", writable: true, signer: false, optional: true },
          ],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const ix = prog.instructions.maybe!;
    expect(Object.keys(ix.accounts)).toEqual(["required"]);
  });

  test("resolves event fields from types array", () => {
    const idl = {
      name: "test",
      address: "Test1111111111111111111111111111111111111",
      instructions: [],
      events: [
        { name: "Staked", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
        {
          name: "Staked",
          type: {
            kind: "struct" as const,
            fields: [
              { name: "user", type: "pubkey" as const },
              { name: "amount", type: "u64" as const },
            ],
          },
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    expect(Object.keys(prog.events)).toEqual(["Staked"]);
    const stakedFields = prog.events["Staked"]!;
    expect(Object.keys(stakedFields)).toEqual(["user", "amount"]);
  });

  test("preserves explicit IDL discriminators", async () => {
    const instructionDiscriminator = [8, 7, 6, 5, 4, 3, 2, 1] as const;
    const accountDiscriminator = [1, 3, 5, 7, 9, 11, 13, 15] as const;
    const eventDiscriminator = [2, 4, 6, 8, 10, 12, 14, 16] as const;
    const idl = {
      address: "BPFLoader1111111111111111111111111111111111",
      name: "explicit",
      instructions: [
        { name: "custom", discriminator: instructionDiscriminator, args: [] },
      ],
      accounts: [
        { name: "Data", discriminator: accountDiscriminator },
      ],
      events: [
        { name: "Changed", discriminator: eventDiscriminator },
      ],
      types: [
        { name: "Data", type: { kind: "struct" as const, fields: [{ name: "value", type: "u64" as const }] } },
        { name: "Changed", type: { kind: "struct" as const, fields: [{ name: "value", type: "u64" as const }] } },
      ],
    } as AnchorIdl;

    const prog = fromIdl(idl);
    const client = await betterSol({ programs: { prog } });
    const customInstruction = client.prog.custom;
    if (customInstruction === undefined) throw new Error("custom instruction missing");
    const instruction = await customInstruction.instruction();
    if (instruction.data === undefined) throw new Error("instruction data missing");

    expect(Array.from(instruction.data.slice(0, 8))).toEqual([...instructionDiscriminator]);
    expect(Array.from(prog.accounts.Data!.discriminator ?? [])).toEqual([...accountDiscriminator]);
    expect(Array.from(prog.eventDiscriminators.Changed ?? [])).toEqual([...eventDiscriminator]);
  });

  test("rejects invalid explicit IDL discriminator lengths", () => {
    const idl = {
      name: "invalid_disc",
      instructions: [
        { name: "custom", discriminator: [1, 2, 3] },
      ],
    } as AnchorIdl;

    expect(() => fromIdl(idl)).toThrow("Instruction 'custom' discriminator must contain exactly 8 bytes");
  });

  test("auto-resolves IDL PDA accounts from const and signer account seeds", async () => {
    const signer = {
      address: address("11111111111111111111111111111111"),
      signTransactions: async <T extends readonly unknown[]>(transactions: T): Promise<T> => transactions,
    };
    const idl = {
      address: "BPFLoader1111111111111111111111111111111111",
      name: "staking",
      instructions: [
        {
          name: "claim",
          accounts: [
            { name: "user", writable: true, signer: true },
            {
              name: "stake_pool",
              writable: true,
              pda: {
                seeds: [
                  { kind: "const" as const, value: [115, 116, 97, 107, 101] },
                  { kind: "account" as const, path: "user" },
                ],
              },
            },
          ],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const metas = await buildAccountMetas(prog.instructions.claim!, {}, prog.address, signer, "unsigned");
    const [expectedPool] = await getProgramDerivedAddress({
      programAddress: address(prog.address),
      seeds: [new TextEncoder().encode("stake"), new Uint8Array(getAddressEncoder().encode(signer.address))],
    });

    expect(metas.map((meta) => meta.address)).toEqual([signer.address, expectedPool]);
  });

  test("auto-resolves and validates IDL fixed-address accounts", async () => {
    const idl = {
      address: "BPFLoader1111111111111111111111111111111111",
      name: "fixed",
      instructions: [
        {
          name: "ping",
          accounts: [{ name: "system_program", address: "11111111111111111111111111111111" }],
        },
      ],
    } as AnchorIdl;
    const prog = fromIdl(idl);
    const metas = await buildAccountMetas(prog.instructions.ping!, {}, prog.address, undefined, "unsigned");

    expect(metas[0]?.address).toBe(address("11111111111111111111111111111111"));
    await expect(buildAccountMetas(
      prog.instructions.ping!,
      { system_program: "BPFLoader1111111111111111111111111111111111" },
      prog.address,
      undefined,
      "unsigned",
    )).rejects.toThrow("Account 'system_program' must be 11111111111111111111111111111111");
  });

  test("resolves defined type aliases", () => {
    const idl = {
      name: "aliases",
      instructions: [
        {
          name: "setAmount",
          args: [{ name: "amount", type: { defined: { name: "Amount" } } }],
        },
      ],
      accounts: [
        { name: "Data", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
        { name: "Amount", type: { kind: "type" as const, alias: "u64" as const } },
        {
          name: "Data",
          type: {
            kind: "struct" as const,
            fields: [{ name: "amount", type: { defined: { name: "Amount" } } }],
          },
        },
      ],
    } as AnchorIdl;

    const prog = fromIdl(idl);

    expect(prog.instructions.setAmount!.args!.amount!.kind).toBe("u64");
    expect(prog.accounts.Data!.fields.amount!.kind).toBe("u64");
  });

  test("rejects unsupported defined struct field types", () => {
    const idl = {
      name: "struct_field",
      instructions: [],
      accounts: [
        { name: "Data", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      types: [
        {
          name: "Nested",
          type: {
            kind: "struct" as const,
            fields: [{ name: "value", type: "u64" as const }],
          },
        },
        {
          name: "Data",
          type: {
            kind: "struct" as const,
            fields: [{ name: "nested", type: { defined: { name: "Nested" } } }],
          },
        },
      ],
    } as AnchorIdl;

    expect(() => fromIdl(idl)).toThrow("Defined struct IDL field types are not supported: Nested");
  });

  test("rejects unsupported 256-bit integer primitives", () => {
    const idl = {
      name: "wide_int",
      instructions: [
        { name: "set", args: [{ name: "value", type: "u256" as const }] },
      ],
    } as AnchorIdl;

    expect(() => fromIdl(idl)).toThrow("Unsupported IDL primitive type: u256");
  });

  test("rejects recursive defined type aliases", () => {
    const idl = {
      name: "recursive_alias",
      instructions: [
        { name: "set", args: [{ name: "value", type: { defined: { name: "Amount" } } }] },
      ],
      types: [
        { name: "Amount", type: { kind: "type" as const, alias: { defined: { name: "Amount" } } } },
      ],
    } as AnchorIdl;

    expect(() => fromIdl(idl)).toThrow("Recursive IDL type aliases are not supported: Amount");
  });
});
