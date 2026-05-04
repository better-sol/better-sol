import { bs, cpi } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
}).derive((seed) => ["counter", seed.authority])

export const counter = bs.program({
  name: "counter",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the creator can perform this action",
    NotActive: "Counter is not active",
    BelowZero: "Counter would go below zero",
  },
  events: {
    Incremented: { newCount: bs.u64(), authority: bs.pubkey() },
  },
}, (ix) => ({

  initialize: ix({
    accounts: {
      counter: bs.init(Counter),
      authority: bs.signer(),
    },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),

  increment: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
    },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      ctx.require(counter.isActive, "NotActive")
      counter.count += amount
      ctx.emit("Incremented", { newCount: counter.count, authority })
      ctx.log("Incremented counter by {}", amount)
    },
  }),

  decrement: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
    },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      ctx.require(counter.isActive, "NotActive")
      ctx.require(counter.count >= amount, "BelowZero")
      counter.count -= amount
    },
  }),

  toggle: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
    },
    run: ({ counter, authority }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      counter.isActive = !counter.isActive
    },
  }),

  close: ix({
    accounts: {
      counter: bs.close(Counter, "authority"),
      authority: bs.signer(),
    },
    run: () => {},
  }),

  // Token CPI example (requires token program in accounts)
  reward: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
      rewardMint: bs.mint().writable(),
      rewardTokenAccount: bs.tokenAccount().writable(),
      tokenProgram: bs.tokenProgram(),
    },
    args: { rewardAmount: bs.u64() },
    run: ({ authority, rewardMint, rewardTokenAccount }, { rewardAmount }) => {
      cpi.token.mintTo({
        mint: rewardMint,
        to: rewardTokenAccount,
        authority,
        amount: rewardAmount,
      })
    },
  }),
}))
