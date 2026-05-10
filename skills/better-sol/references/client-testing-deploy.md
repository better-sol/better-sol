# Client, Testing, and Deployment

## Node/script client

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } })
const address = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.initialize({ counter: address, initialValue: 0n })
await sol.counter.increment({ counter: address, amount: 1n })
const data = await sol.counter.accounts.Counter.fetch(address)
```

## Browser wallet pattern

```ts
const readOnly = await betterSol({ cluster: "devnet", programs: { counter } })
const signed = await readOnly.withSigner(walletSigner)
await signed.counter.increment({ counter: address, amount: 1n })
```

Keep `keypairFile()` and `secretKey()` out of browser bundles.

## Multi-instruction flows

```ts
const a = await sol.counter.initialize.instruction({ counter, initialValue: 0n })
const b = await sol.counter.increment.instruction({ counter, amount: 1n })
await sol.batch([a, b])
```

Use `sol.steps()` when step N needs the result from step N-1.

## Testing with LiteSVM

```ts
import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { counter } from "../programs/counter"

describe("counter", () => {
  test("authority increments", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const counterAddress = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
    await ctx.counter.increment({ counter: counterAddress, amount: 2n })

    const data = await ctx.counter.accounts.Counter.fetch(counterAddress)
    expect(data?.count).toBe(2n)
  })
})
```

Useful helpers:

- `ctx.newSigner(fundSol?)`
- `ctx.as(signer)`
- `ctx.warp(relativeSeconds)`
- `ctx.setClock(unixTimestamp)`
- `ctx.setBalance(address, sol)`
- `ctx.createMint(decimals)`
- `ctx.mintTokens({ mint, to, amount, decimals? })`
- `ctx.profile(async () => ...)`

## Failure tests to add

- unauthorized signer
- wrong PDA
- duplicate initialize
- zero or max amount
- token account/mint mismatch
- close by non-authority
- reallocation beyond max size

## Deployment flow

```bash
bun run check
bun run test
bunx @better-sol/cli@alpha deploy --dry-run
bunx @better-sol/cli@alpha deploy --cluster devnet
```

After devnet deploy, run a smoke test that derives a PDA, sends one state-changing instruction, fetches the account, and confirms expected data.

## Mainnet gates

- tests pass
- devnet smoke test passes
- program ID and payer are confirmed
- upgrade authority policy is explicit
- key custody is documented
- monitoring exists for failures and critical events
- mainnet dry run completed

## Related

- `sdk-reference.md` for client API details used in tests and deployment.
- `test-plan.md` for security-focused test patterns.
- `architecture-playbook.md` for project skeleton and milestone planning.
