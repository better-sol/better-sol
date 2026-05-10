import { bs, cpi } from "better-sol/program"

const RewardState = bs.account({
  authority: bs.pubkey(),
  mint: bs.pubkey(),
  totalMinted: bs.u64(),
}).derive(seed => ["reward-state", seed.authority])

export const rewards = bs.program({
  name: "rewards",
  address: "PROGRAM_ID",
  accounts: { RewardState },
  errors: {
    Unauthorized: "Only reward authority may mint rewards",
    InvalidAmount: "Reward amount must be greater than zero",
    WrongMint: "Reward mint does not match state",
  },
  events: {
    RewardMinted: { destination: bs.pubkey(), amount: bs.u64() },
  },
}, ix => ({
  mintReward: ix({
    accounts: {
      state: bs.mut(RewardState),
      mint: bs.mint().writable(),
      destination: bs.tokenAccount().writable(),
      authority: bs.signer(),
      tokenProgram: bs.tokenProgram(),
    },
    args: { amount: bs.u64() },
    run: ({ state, mint, destination, authority }, { amount }, ctx) => {
      ctx.require(state.authority === authority, "Unauthorized")
      ctx.require(state.mint === mint.key, "WrongMint")
      ctx.require(amount > 0n, "InvalidAmount")
      cpi.token.mintTo({ mint, to: destination, authority, amount })
      state.totalMinted += amount
      ctx.emit("RewardMinted", { destination: destination.key, amount })
    },
  }),
}))
