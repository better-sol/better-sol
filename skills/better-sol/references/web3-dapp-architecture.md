# Web3 and dApp Architecture

Use this reference when designing how frontend, backend, RPC, wallet, indexer, and on-chain programs connect in a Solana or multi-chain dApp.

## Core principle

A dApp is a distributed system with money at the boundary. Architecture decisions should be made by asking:

```text
What must be trust-minimized, what can be cached, and what can fail safely?
```

Do not put everything on-chain. Do not trust the backend for financial truth. Put each responsibility where it belongs.

## Architecture layers

```text
┌──────────────────────────────────────┐
│ Browser / Mobile                     │
│ UI, wallet, transaction preview      │
├──────────────────────────────────────┤
│ Client                               │
│ Better Sol typed client, SDKs        │
├──────────────────────────────────────┤
│ Backend (optional)                   │
│ APIs, auth, webhooks, cron, relayers │
├──────────────────────────────────────┤
│ Data layer                           │
│ RPC, WebSocket, indexer, database    │
├──────────────────────────────────────┤
│ Solana runtime                       │
│ Programs, accounts, token programs   │
└──────────────────────────────────────┘
```

Each layer has a different trust boundary. The frontend can lie. The backend can be down. RPC can be stale. Wallets can reject. Programs must enforce the invariant regardless of what every other layer says.

## Responsibility split

| Responsibility | Best layer | Why |
|---|---|---|
| Asset custody | Program or external protocol | Must be enforceable without trusting backend |
| Transaction signing | Wallet | Private keys stay outside app code |
| Transaction preview | Frontend | User must understand before signing |
| Risk checks | Frontend + program | UI warns, program enforces critical conditions |
| Historical analytics | Indexer/database | Too expensive to compute on-chain |
| Notifications | Backend | Off-chain side effect |
| Search and filtering | Backend/database | Not a chain responsibility |
| Rewards, claims, escrow | Program | Needs public verifiability |
| Eligibility scoring | Backend + on-chain proof | Raw data off-chain, result or claim on-chain |

## Client patterns across chains

| Concept | Ethereum (EVM) | Solana (SVM) |
|---|---|---|
| State location | Contract storage | Separate accounts |
| Transaction model | Contract calls | Multi-instruction transactions |
| Fee model | Gas market | Compute budget + priority fee |
| Wallet standard | EIP-1193 / EIP-6963 | wallet-standard |
| Client library | viem, wagmi, ethers | `@solana/kit`, Better Sol |
| Interface source | ABI | Better Sol definition, Anchor IDL |
| Indexing | The Graph, Ponder, Dune | Helius, Triton, geyser, custom indexer |
| Address format | 0x hex | Base58 |

Solana requires explicit accounts. That makes transaction construction more complex but enables parallel execution. Design state so users write their own accounts instead of a single global bottleneck.

## Wallet architecture

Wallet choice determines onboarding and custody assumptions:

- Solana-only: Solana Wallet Adapter.
- Multi-chain web/mobile: Reown AppKit.
- Consumer login and embedded wallets: Privy or Dynamic.
- EVM-heavy app: wagmi + viem, with a separate Solana provider if needed.

Never assume a connected wallet on one namespace implies connection on another. Track Solana, EVM, and Bitcoin accounts separately unless the wallet SDK returns explicit namespace state.

See `wallet-connection.md` for setup examples.

## RPC and data strategy

### RPC reads

Use RPC for fresh account state and transaction submission. Avoid using RPC as your analytics database.

Best practices:

- Batch account reads.
- Deduplicate identical queries.
- Use fallback providers for critical reads.
- Show stale-state indicators.
- Simulate transactions before signing.

### WebSocket subscriptions

Use subscriptions for account changes, program logs, and confirmation updates. Always handle reconnects and missed messages. A WebSocket stream is a convenience, not a source of final truth.

### Indexer/database

Use an indexer for:

- Transaction history
- Portfolio views
- Leaderboards
- Analytics
- Search
- Aggregations
- Notifications

Indexers can lag or be wrong. If a user is about to sign a transaction, refresh critical on-chain state from RPC.

## Transaction architecture

### Single instruction

Use for simple state changes. Easier to preview and debug.

### Atomic multi-instruction transaction

Use when all steps must succeed together: create account, initialize, transfer, record claim.

### Sequential plan

Use when later transactions depend on earlier signatures or confirmations. Provide recovery if the sequence stops halfway.

### Versioned transaction with ALTs

Use when too many accounts exceed transaction size. Adds setup and lifecycle management.

### Relayed transaction

Backend builds or sponsors part of the transaction. User still signs the authority-bearing part. Be explicit about what the relayer can and cannot do.

## State synchronization model

Use a state machine, not booleans:

```text
idle → preparing → previewing → signing → submitted → confirming → confirmed
                              ↘ rejected  ↘ failed    ↘ timeout
```

Rules:

- Never show confirmed state before confirmation.
- If confirmation times out, show "status unknown" with explorer link.
- On app reload, recover pending transactions from local storage or backend.
- After confirmation, invalidate affected account queries.

## Backend decision framework

Add a backend when:

- You need webhooks, notifications, or email.
- You need private API keys.
- You need indexing or historical analytics.
- You need server-side eligibility checks.
- You need relayers, crons, or automation.

Do not add a backend to decide whether funds can move. The program must enforce that.

## Failure-mode checklist

Before launch, answer:

- What happens if the frontend is compromised?
- What happens if the backend is down?
- What happens if RPC returns stale data?
- What happens if the wallet changes account mid-flow?
- What happens if a transaction confirms after the UI times out?
- What happens if the indexer misses a slot?
- What happens if a protocol dependency pauses?
- What happens if the admin key is compromised?

If the answer is "users lose funds," move the control into the program or remove the feature.

## Architecture review checklist

- [ ] Program enforces all critical invariants.
- [ ] Frontend never asks for blind signatures.
- [ ] Backend cannot forge user intent.
- [ ] RPC state is refreshed before signing.
- [ ] Indexer state is labeled with freshness.
- [ ] Wallet connection handles disconnect and account switch.
- [ ] Transaction failures have clear recovery paths.
- [ ] Cross-chain or external protocol dependencies are explicit.
- [ ] Sensitive keys never ship to browser or mobile.

## Related

- `wallet-connection.md` for Solana Wallet Adapter, Reown, Privy, and Dynamic setup patterns.
- `dapp-state-management.md` for frontend state domains and error handling patterns.
- `multi-chain-ui.md` for chain-specific error display.
- `data-pipelines.md` for indexer and webhook architecture.
- `transaction-ux.md` for transaction preview and signing states.
