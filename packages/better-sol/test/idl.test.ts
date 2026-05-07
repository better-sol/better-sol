import { describe, expect, test } from "bun:test";
import { AccountConstraint } from "../src/program";
import { fromIdl, type AnchorIdl } from "../src/idl";

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
});
