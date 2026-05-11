# Architecture Playbook

Use this reference when deciding how to structure a Solana dApp: what goes on-chain, what stays off-chain, which protocols to integrate, and how the layers connect.

## Architecture layers

Every Solana dApp has up to five layers. Not every product needs all five.

```
┌─────────────────────────────────────┐
│  Frontend                           │  React, Next.js, TanStack Start, etc.
│  - Wallet connection                │
│  - Transaction review and signing   │
│  - Read-only data display           │
├─────────────────────────────────────┤
│  Typed Client                       │  Better Sol runtime client
│  - Instruction builders             │
│  - Account fetchers                 │
│  - PDA derivation                   │
│  - Token operations                 │
├─────────────────────────────────────┤
│  Backend (optional)                 │  Server, API, cron jobs
│  - Indexer/data pipeline            │
│  - Webhook processing               │
│  - Off-chain storage                │
│  - Authentication and session mgmt  │
├─────────────────────────────────────┤
│  External Programs (optional)       │  Existing Solana protocols
│  - DEX, lending, staking protocols  │
│  - Oracle programs                  │
│  - Token programs                   │
├─────────────────────────────────────┤
│  Custom Program (optional)          │  Your Better Sol program
│  - Custom state and invariants      │
│  - Custom authorization logic       │
│  - Atomic composition of protocols  │
└─────────────────────────────────────┘
```

## Decision: do you need a custom program?

### You need a custom program when

- The product requires custom on-chain state (records, attestations, claims, configurations)
- The product needs custom authorization (roles, permissions, time locks, multisig)
- The product atomically composes multiple protocol interactions that must succeed or fail together
- The product creates verifiable, tamper-proof records (receipts, audit trails, votes)
- The product distributes tokens based on custom logic (rewards, vesting, airdrop criteria)

### You do NOT need a custom program when

- The product only reads and displays on-chain data (dashboards, explorers, portfolio trackers)
- The product wraps existing protocol interactions with a better UI (swap UI, staking dashboard)
- The product only transfers tokens between wallets (use `sol.token.transfer`)
- The product aggregates data from multiple sources without on-chain verification

### Hybrid approach

Most non-trivial products use a hybrid: a custom Better Sol program for app-specific state, combined with CPI calls to existing protocols for standard operations.

Example: a staking vault that tracks user deposits in its own program, but delegates the actual SOL staking through Marinade or Jito via CPI.

## Decision: do you need a backend?

### You need a backend when

- Processing webhooks or indexing on-chain events
- Serving aggregated or historical data that cannot be fetched efficiently from RPC
- Managing user sessions, authentication, or off-chain configuration
- Running scheduled jobs (rebalancing, notifications, cleanup)
- Proxying RPC requests with caching, rate limiting, or authentication

### You do NOT need a backend when

- The frontend can fetch all needed data directly from RPC via the typed client
- All state lives on-chain and can be read in real-time
- The product has no off-chain logic (pure wallet-to-program interaction)

## Project structure

### Full-stack dApp

```
packages/
  programs/              ← Better Sol program definitions
    counter.ts
  shared/                ← Shared utilities and types
    constants.ts
apps/
  web/                   ← Frontend (Next.js, TanStack Start, etc.)
  backend/               ← Backend API and indexer
better-sol.config.ts     ← CLI configuration
keypair.json             ← Devnet payer
```

### Frontend-only dApp

```
programs/                ← Better Sol program definitions
  counter.ts
src/                     ← Frontend code
  lib/
    sol.ts               ← Client initialization
  components/
better-sol.config.ts
keypair.json
```

### Program-only project

```
programs/                ← Better Sol program definitions
  counter.ts
tests/                   ← LiteSVM tests
  counter.test.ts
better-sol.config.ts
keypair.json
```

## Client initialization patterns

### Server-side (scripts, backend)

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

export const sol = await betterSol({
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

export async function createClient(wallet: WalletAdapter) {
  const baseSol = await betterSol({
    cluster: "devnet",
    programs: { counter },
  })
  return baseSol.withSigner(walletAdapter(wallet))
}
```

### Read-only (no signing)

```ts
export const sol = await betterSol({
  cluster: "mainnet",
  programs: { counter },
})
```

## RPC strategy

### Provider selection

| Provider | Free tier | Best for |
|---|---|---|
| Solana public RPC | Yes (rate limited) | Development, testing |
| Helius | Yes (generous) | Webhooks, enhanced APIs |
| Triton/Yellowstone | No | High-throughput indexing |
| Quicknode | No | Enterprise, dedicated nodes |
| Alchemy | Yes (limited) | Multi-chain apps |

### Connection pooling

For backend applications, create the client once and reuse it. The underlying RPC connection handles HTTP keep-alive and request multiplexing.

```ts
let _sol: BetterSolInstance | null = null

export async function getClient() {
  if (!_sol) {
    _sol = await betterSol({
      cluster: "mainnet",
      payer: keypairFile("./keypair.json"),
      programs: { counter },
    })
  }
  return _sol
}
```

### Request optimization

- Batch account fetches with `getMultipleAccounts` (the typed client does this automatically when possible)
- Cache read-only data (token metadata, program addresses) with TanStack Query on the frontend
- Use WebSocket subscriptions for real-time updates instead of polling
- Implement request deduplication for parallel component mounts

## Transaction patterns

### Single instruction

```ts
await sol.counter.increment({ counter: addr, amount: 5n })
```

### Multi-instruction (atomic)

```ts
await sol.send([
  sol.counter.increment({ counter: addr, amount: 5n }),
  sol.token.transfer({ from: ata, to: dest, amount: 1000n }),
])
```

### Sequential with dependency passing

```ts
await sol.steps([
  (ctx) => sol.counter.initialize({ counter: addr, authority: ctx.signer }),
  (ctx) => sol.counter.increment({ counter: addr, amount: 5n }),
])
```

### Non-divisible sequential plan

```ts
await sol.batch([
  sol.counter.increment({ counter: addr, amount: 5n }),
  sol.token.transfer({ from: ata, to: dest, amount: 1000n }),
])
```

## Common mistakes

- Putting all logic on-chain when only the state and invariants need to be on-chain. Move computation off-chain and only verify on-chain.
- Using a single RPC endpoint without fallback. If the provider goes down, the app stops working.
- Fetching the same data from multiple components. Use a caching layer (TanStack Query, SWR) to deduplicate requests.
- Not handling wallet disconnection gracefully. The user will disconnect; handle it without crashing.
- Hardcoding program addresses in multiple places. Define once and export from the program definition.
- Embedding private keys in frontend code. Use wallet adapters for signing; never import `keypairFile` in browser bundles.

## Related

- `program-patterns.md` for program definition patterns.
- `client-testing-deploy.md` for client usage and deployment.
- `web3-dapp-architecture.md` for broader web3 architecture patterns.
- `dapp-state-management.md` for frontend state patterns.
