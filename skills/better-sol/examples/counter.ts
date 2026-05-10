import { bs } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive(seed => ["counter", seed.authority])

export const counter = bs.program({
  name: "counter",
  address: "PROGRAM_ID",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can update this counter",
    Underflow: "Counter cannot go below zero",
  },
  events: {
    CounterChanged: { counter: bs.pubkey(), authority: bs.pubkey(), count: bs.u64() },
  },
}, ix => ({
  initialize: ix({
    accounts: { counter: bs.init(Counter), authority: bs.signer() },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
    },
  }),
  increment: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
      counter.count += amount
      ctx.emit("CounterChanged", { counter: counter.key, authority, count: counter.count })
    },
  }),
  decrement: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
      ctx.require(counter.count >= amount, "Underflow")
      counter.count -= amount
      ctx.emit("CounterChanged", { counter: counter.key, authority, count: counter.count })
    },
  }),
}))
