# Cookbook Recipes

Use this reference for runnable code examples that teach specific Better Sol patterns. Each recipe is self-contained with a problem statement, solution code, and explanation.

## Counter program

The most basic stateful program. Demonstrates accounts, instructions, PDAs, errors, events, and typed client usage.

### Program definition

```ts
import { bs } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority])

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
}, (ix) => ({
  initialize: ix({
    accounts: { counter: bs.init(Counter), authority: bs.signer() },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }, ctx) => {
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

  reset: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    run: ({ counter, authority }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
      counter.count = 0n
    },
  }),
}))
```

### Client usage

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })

await sol.counter.initialize({ counter: addr, initialValue: 0n })
await sol.counter.increment({ counter: addr, amount: 5n })

const account = await sol.counter.accounts.Counter.fetch(addr)
console.log(account.count) // 5n
```

### Test

```ts
import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { counter } from "../programs/counter"

describe("counter", () => {
  test("authority can increment", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const addr = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: addr, initialValue: 0n })
    await ctx.counter.increment({ counter: addr, amount: 5n })

    const data = await ctx.counter.accounts.Counter.fetch(addr)
    expect(data?.count).toBe(5n)
    expect(data?.authority).toBe(ctx.payer)
  })

  test("different signer cannot increment", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const attacker = await ctx.newSigner()
    const addr = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: addr, initialValue: 0n })
    const attackerClient = await ctx.as(attacker)

    await expect(
      attackerClient.counter.increment({ counter: addr, amount: 1n }),
    ).rejects.toThrow()
  })

  test("rejects decrement below zero", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const addr = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: addr, initialValue: 3n })

    await expect(
      ctx.counter.decrement({ counter: addr, amount: 5n }),
    ).rejects.toThrow()
  })
})
```

## Token rewards program

Distributes SPL tokens as rewards. Demonstrates token CPI operations within a Better Sol program.

### Program definition

```ts
import { bs, cpi } from "better-sol/program"

const RewardState = bs.account({
  authority: bs.pubkey(),
  mint: bs.pubkey(),
  totalMinted: bs.u64(),
}).derive((seed) => ["reward-state", seed.authority])

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
}, (ix) => ({
  initialize: ix({
    accounts: { state: bs.init(RewardState), authority: bs.signer() },
    args: { mint: bs.pubkey() },
    run: ({ state, authority }, { mint }, ctx) => {
      state.authority = authority
      state.mint = mint
      state.totalMinted = 0n
    },
  }),

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
```

### Client usage

```ts
import { betterSol, keypairFile } from "better-sol"
import { rewards } from "./programs/rewards"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { rewards },
})

const stateAddr = await sol.rewards.accounts.RewardState.derive({
  authority: sol.payer,
})

await sol.rewards.initialize({ state: stateAddr, mint: mintAddress })

await sol.rewards.mintReward({
  state: stateAddr,
  mint: mintAddress,
  destination: recipientTokenAccount,
  amount: 1000n,
})
```

## Multi-instruction transaction

Sends multiple instructions in a single atomic transaction:

```ts
const signature = await sol.send([
  sol.counter.increment({ counter: addr1, amount: 5n }),
  sol.counter.increment({ counter: addr2, amount: 3n }),
])
```

All instructions succeed or all fail. No partial state.

## Scoped signer

Act as a different identity within the same client:

```ts
const adminSol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./admin-keypair.json"),
  programs: { counter },
})

const sellerSol = await adminSol.withSigner(
  keypairFile("./seller-keypair.json"),
)

await sellerSol.counter.increment({ counter: addr, amount: 5n })
```

## Read-only client

Create a client without a payer for read operations:

```ts
const sol = await betterSol({
  cluster: "mainnet",
  programs: { counter },
})

const account = await sol.counter.accounts.Counter.fetch(addr)
```

Any method that sends a transaction will throw with a clear error.

## Error handling pattern

```ts
try {
  await sol.counter.decrement({ counter: addr, amount: 5n })
} catch (error) {
  if (error instanceof ProgramError) {
    switch (error.name) {
      case "Underflow":
        console.log("Insufficient count")
        break
      case "Unauthorized":
        console.log("Not the authority")
        break
      default:
        console.log("Unknown error:", error.name)
    }
  } else {
    console.log("RPC or network error:", error)
  }
}
```

## Token operations

```ts
const { mint, signature } = await sol.token.createMint({
  decimals: 9,
  freezeAuthority: null,
})

await sol.token.mintTo({
  mint: mint,
  to: recipientAddress,
  amount: 1_000_000n,
})

await sol.token.transfer({
  mint: mintAddress,
  to: recipientAddress,
  amount: 1000n,
})

const balance = await sol.token.getBalance({
  owner: walletAddress,
  mint: mintAddress,
})
```

## Exercises

### Exercise 1: Escrow program

Build a program that locks tokens until both parties confirm. Define `Escrow` (state + amounts + parties) and `EscrowConfirmation` (per-party confirmation record). Instructions: `create`, `confirm`, `release` (requires both confirmations). Use `cpi.token.transfer()` for the release.

### Exercise 2: Token vault

Build a program that accepts deposits, tracks balances per user, and allows withdrawals with a time lock. Define `Vault` (total deposits, authority) and `UserBalance` (per-user balance with deposit timestamp). Instructions: `deposit` (CPI transfer in), `withdraw` (CPI transfer out, fails if within lock period).

### Exercise 3: Governance voting

Build a program that creates proposals and accepts votes. Define `Proposal` (description, yes/no counts, deadline) and `Vote` (per-voter record). Instructions: `createProposal`, `vote` (one vote per voter per proposal, fails after deadline). Use `ctx.require()` for all checks.

## Related

- `program-patterns.md` for account, instruction, and constraint patterns.
- `client-testing-deploy.md` for testing and deployment workflows.
- `sdk-reference.md` for the complete API reference.
- `tracks.md` for structured learning paths.
