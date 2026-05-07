import { describe, expect, test } from "bun:test";
import { fromIdl, type AnchorIdl, type TypedIdlInstructionNames, type TypedIdlAccountNames, type TypedIdlErrorNames, type TypedIdlParams } from "../src/idl";
import { AccountConstraint } from "../src/program";

const stakingIdl = {
  address: "12b3t1cNiAUoYLiWFEnFa4w6qYxVAiqCWU7KZuzLPYtH",
  metadata: { name: "staking" },
  instructions: [
    {
      name: "claim",
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "stake_pool", writable: true, pda: { seeds: [{ kind: "const", value: [115] }] } },
      ],
      args: [],
    },
    {
      name: "stake",
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "profit_mint" },
      ],
      args: [{ name: "amount", type: "u64" as const }],
    },
  ],
  accounts: [
    {
      name: "StakePool",
      discriminator: [121, 34, 206, 21, 79, 127, 255, 28],
    },
  ],
  types: [
    {
      name: "StakePool",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "total_staked", type: "u64" as const },
          { name: "initialized", type: "bool" as const },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "ZeroAmount", msg: "Amount must be greater than zero" },
    { code: 6001, name: "Unauthorized", msg: "Unauthorized" },
  ],
} as const satisfies AnchorIdl;

describe("typed fromIdl", () => {
  test("instruction names are literal string types", () => {
    type Names = TypedIdlInstructionNames<typeof stakingIdl>
    const claim: Names = "claim"
    const stake: Names = "stake"
    expect(claim).toBe("claim")
    expect(stake).toBe("stake")
  })

  test("account names are literal string types", () => {
    type Names = TypedIdlAccountNames<typeof stakingIdl>
    const pool: Names = "StakePool"
    expect(pool).toBe("StakePool")
  })

  test("error names are literal string types", () => {
    type Names = TypedIdlErrorNames<typeof stakingIdl>
    const zero: Names = "ZeroAmount"
    const unauth: Names = "Unauthorized"
    expect(zero).toBe("ZeroAmount")
    expect(unauth).toBe("Unauthorized")
  })

  test("stake instruction params require profit_mint and amount", () => {
    type Params = TypedIdlParams<typeof stakingIdl, "stake">
    const valid: Params = { profit_mint: "SomeAddress...", amount: 100n }
    expect(valid.amount).toBe(100n)
  })

  test("claim instruction params require no user input (signer auto-filled, pda auto-filled)", () => {
    type Params = TypedIdlParams<typeof stakingIdl, "claim">
    type Keys = keyof Params
    const keys: Keys[] = []
    expect(keys).toEqual([])
  })

  test("program definition has typed instruction keys", () => {
    const prog = fromIdl(stakingIdl)
    expect(Object.keys(prog.instructions)).toEqual(["claim", "stake"])
    expect(prog.instructions.claim).toBeDefined()
    expect(prog.instructions.stake).toBeDefined()
  })

  test("program definition has typed account keys", () => {
    const prog = fromIdl(stakingIdl)
    expect(Object.keys(prog.accounts)).toEqual(["StakePool"])
    expect(prog.accounts.StakePool).toBeDefined()
  })

  test("program definition has typed error names", () => {
    const prog = fromIdl(stakingIdl)
    expect(prog.errors).toEqual({
      ZeroAmount: "Amount must be greater than zero",
      Unauthorized: "Unauthorized",
    })
  })

  test("account constraints are correct for claim instruction", () => {
    const prog = fromIdl(stakingIdl)
    const claim = prog.instructions.claim
    const user = claim.accounts["user"]
    expect(user instanceof AccountConstraint).toBe(true)
    if (user instanceof AccountConstraint) {
      expect(user.constraintKind).toBe("signer")
      expect(user.mutable).toBe(true)
    }
  })
})
