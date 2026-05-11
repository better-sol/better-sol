# Client, Testing, and Deployment

Use this reference for creating the Better Sol typed client, connecting wallets, fetching accounts, building transactions, writing tests with LiteSVM, and deploying programs.

## Client setup

### Server-side (Node.js, Bun)

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})
```

### Browser (wallet-connected)

```ts
import { betterSol } from "better-sol"
import { walletAdapter } from "better-sol/wallets"
import { counter } from "./programs/counter"

const baseSol = await betterSol({
  cluster: "devnet",
  programs: { counter },
})

const sol = await baseSol.withSigner(walletAdapter(wallet))
```

### Read-only (no signing)

```ts
const sol = await betterSol({
  cluster: "mainnet",
  programs: { counter },
})
```

## Signer input types

| Type | Use case |
|---|---|
| `keypairFile("./keypair.json")` | Server-side scripts, CLI tools |
| `secretKey(new Uint8Array([...64 bytes]))` | Environment variables, secret managers |
| `walletAdapter(wallet)` | Browser apps with wallet extension |

## Account operations

### Derive PDA

```ts
const addr = await sol.counter.accounts.Counter.derive({
  authority: sol.payer,
})
```

### Fetch single account

```ts
const account = await sol.counter.accounts.Counter.fetch(addr)
console.log(account.count)     // bigint
console.log(account.authority) // base58 string
```

### Fetch multiple accounts

```ts
const accounts = await sol.counter.accounts.Counter.fetchMultiple([addr1, addr2, addr3])
```

Returns an array where unfound accounts are `null`.

## Instruction operations

### Single instruction

```ts
const signature = await sol.counter.increment({ counter: addr, amount: 5n })
```

Returns the transaction signature after confirmation.

### Multi-instruction (atomic)

```ts
const signature = await sol.send([
  sol.counter.increment({ counter: addr, amount: 5n }),
  sol.token.transfer({ mint: mintAddress, to: destAddress, amount: 1000n }),
])
```

All instructions succeed or all fail in a single transaction.

### Non-divisible batch

```ts
const signature = await sol.batch([
  sol.counter.increment({ counter: addr, amount: 5n }),
  sol.token.transfer({ mint: mintAddress, to: destAddress, amount: 1000n }),
])
```

Like `send`, but the batch is scheduled as an atomic unit with shared compute budget.

### Sequential with dependencies

```ts
const result = await sol.steps([
  () => sol.counter.initialize({ counter: addr, initialValue: 0n }),
  () => sol.counter.increment({ counter: addr, amount: 5n }),
])
```

Each step receives context from the previous step. Useful when later instructions depend on earlier state changes.

### Scoped signer

```ts
const adminSol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./admin-keypair.json"),
  programs: { counter },
})

const userSol = await adminSol.withSigner(keypairFile("./user-keypair.json"))
await userSol.counter.increment({ counter: addr, amount: 5n })
```

`withSigner` returns a new client with the same programs and RPC, but a different signer.

## Token operations

```ts
// Create mint
const { mint } = await sol.token.createMint({ decimals: 9, freezeAuthority: null })

// Mint tokens
await sol.token.mintTo({ mint: mint, to: recipientAddress, amount: 1_000_000n })

// Transfer
await sol.token.transfer({ mint: mintAddress, to: recipientAddress, amount: 1000n })

// Get balance
const balance = await sol.token.getBalance({ owner: walletAddress, mint: mintAddress })

// Derive ATA
const ata = await sol.token.getATA({ owner: walletAddress, mint: mintAddress })
```

Same API for `sol.token2022` with Token-2022.

## Error parsing

```ts
try {
  await sol.counter.decrement({ counter: addr, amount: 5n })
} catch (error) {
  if (error instanceof ProgramError) {
    console.log(error.name)    // "InsufficientCount"
    console.log(error.code)    // 6001
    console.log(error.message) // human-readable description
  }
}
```

## Event parsing

```ts
const signature = await sol.counter.increment({ counter: addr, amount: 5n })
const events = await sol.counter.parseEvents(signature)
for (const event of events) {
  console.log(event.name, event.data)
}
```

## General-purpose methods

```ts
await sol.transfer({ to: recipientAddress, amount: 100_000_000n }) // transfer SOL (lamports)
const balance = await sol.getBalance(address)                       // SOL balance in lamports
sol.onTransaction((signature, status) => { /* listen for confirmed transactions */ })
```

## Testing with LiteSVM

### Setup

Install the latest alpha versions of `better-sol` and `@better-sol/test`. Both must be from the same alpha release:

```bash
bun add better-sol@alpha
bun add -d @better-sol/test@alpha
```

Then create a test context:

```ts
import { createTestContext } from "@better-sol/test"
import { counter } from "../programs/counter"

const ctx = await createTestContext({ programs: { counter } })
```

`createTestContext` starts a LiteSVM instance in-process, loads compiled program binaries from `.better-sol/cache/`, and returns a typed test context with the same API as the production client.

### Writing tests

```ts
test("initialize and increment", async () => {
  const addr = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })

  await ctx.counter.initialize({ counter: addr, initialValue: 0n })
  await ctx.counter.increment({ counter: addr, amount: 5n })

  const account = await ctx.counter.accounts.Counter.fetch(addr)
  expect(account.count).toBe(5n)
  expect(account.authority).toBe(ctx.payer)
})

test("rejects unauthorized increment", async () => {
  const addr = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })
  await ctx.counter.initialize({ counter: addr, initialValue: 0n })

  const attacker = await ctx.newSigner()
  const attackerCtx = await ctx.as(attacker)

  await expect(
    attackerCtx.counter.increment({ counter: addr, amount: 1n }),
  ).rejects.toThrow()
})
```

### Test context API

| Method | Description |
|---|---|
| `ctx.payer` | The test payer's public key |
| `ctx.newSigner(fundSol?)` | Generate a funded keypair (default: 100 SOL) |
| `ctx.as(signer)` | Scoped client with different signer |
| `ctx.warp(seconds)` | Advance clock by relative seconds |
| `ctx.setClock(timestamp)` | Set exact clock unix timestamp |
| `ctx.createMint(decimals)` | Create a token mint |
| `ctx.mintTokens(params)` | Mint tokens to an address |
| `ctx.counter.*` | Full typed client for the counter program |
| `ctx.send([...])` | Send multiple instructions atomically |
| `ctx.token.*` | Token operations (same as production client) |

### Test runner

```bash
bun test
```

Tests run in milliseconds because LiteSVM is in-process with no network or validator startup.

## Deployment

### Deploy to devnet

```bash
npx @better-sol/cli@alpha deploy
```

This compiles the TypeScript program definition, sends the compiled binary to the Better Sol cloud compiler, and deploys the resulting `.so` to devnet. The binary is cached at `.better-sol/cache/<program>.so`.

### Dry run

```bash
npx @better-sol/cli@alpha deploy --dry-run
```

Compiles without deploying. Useful for checking that the program compiles successfully in CI.

### Airdrop devnet SOL

```bash
npx @better-sol/cli@alpha airdrop
```

Funds the payer wallet with devnet SOL for transaction fees.

### Program keypair management

Program keypairs are stored in `.better-sol/<program>.json`. These are generated by `create` and used by `deploy`. Never commit them to version control.

## Release quality gates

Before deploying beyond devnet, require evidence for each gate:

| Gate | Evidence |
|---|---|
| Program tests | LiteSVM tests pass for happy path, failure path, and authority checks |
| Invariants | Property or scenario tests cover accounting invariants |
| Client tests | Typed client calls compile and execute against local or devnet program |
| Simulation | Main user transactions simulate successfully with expected logs |
| Upgrade control | Program upgrade authority is documented and controlled by multisig or governance |
| Key handling | No keypair files, seed phrases, or raw secret keys are committed |
| Observability | Error logs, transaction signatures, and account changes can be traced |
| Rollback | Team knows whether rollback means redeploy, pause, upgrade, or migration |

### Deployment decision tree

- If users can lose funds, do not deploy without a security review and regression tests.
- If the program is upgradeable, publish the upgrade authority and policy.
- If the program stores long-lived state, test migration before mainnet.
- If the product depends on an external protocol, test that protocol failure path.
- If the frontend signs transactions, test wallet rejection, timeout, and stale account state.

## Related

- `sdk-reference.md` for the complete API reference.
- `program-patterns.md` for program definition patterns.
- `troubleshooting.md` for debugging compilation, deployment, and transaction failures.
- `test-plan.md` for security-focused regression testing.
