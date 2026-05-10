import { describe, expect, test } from "bun:test";
import type { Idl } from "@coral-xyz/anchor";
import { generateIdlProgram } from "../src/generator/idl";

const idl = {
  address: "11111111111111111111111111111111",
  metadata: {
    name: "staking_pool",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "claim_rewards",
      discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "stake_pool", writable: true },
        { name: "user_stake", writable: true },
      ],
      args: [{ name: "reward_amount", type: "u64" }],
    },
  ],
  accounts: [
    { name: "StakePool", discriminator: [1, 1, 1, 1, 1, 1, 1, 1] },
    { name: "UserStake", discriminator: [2, 2, 2, 2, 2, 2, 2, 2] },
  ],
  types: [
    {
      name: "StakePool",
      type: {
        kind: "struct",
        fields: [
          { name: "total_staked", type: "u64" },
          { name: "rewards_per_token_stored", type: "u128" },
        ],
      },
    },
    {
      name: "UserStake",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "pubkey" },
          { name: "staked_balance", type: "u64" },
        ],
      },
    },
  ],
  errors: [
    { name: "zero_amount", code: 6000, msg: "Amount must be greater than zero" },
  ],
} satisfies Idl;

describe("IDL generator", () => {
  test("generates camelCase program, instruction, account, arg, and field names", () => {
    const code = generateIdlProgram(idl, "test");

    expect(code).toContain("export const stakingPool = bs.program");
    expect(code).toContain("totalStaked: bs.u64()");
    expect(code).toContain("rewardsPerTokenStored: bs.u128()");
    expect(code).toContain("stakedBalance: bs.u64()");
    expect(code).toContain("claimRewards: ix");
    expect(code).toContain("stakePool: bs.mut(StakePool)");
    expect(code).toContain("userStake: bs.mut(UserStake)");
    expect(code).toContain("rewardAmount: bs.u64()");
    expect(code).toContain("run: ({ user, stakePool, userStake }, { rewardAmount }, ctx)");
    expect(code).toContain("ZeroAmount: \"Amount must be greater than zero\"");
  });
});
