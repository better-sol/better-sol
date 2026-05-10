# Web3 and dApp Architecture

Use this reference when designing how frontend, backend, RPC, wallet, and on-chain programs connect in a Solana dApp, or when comparing approaches across blockchains.

## dApp architecture layers

```text
┌──────────────────────────────┐
│  Browser / Mobile            │
│  UI → wallet adapter → client│
├──────────────────────────────┤
│  Backend (optional)          │
│  API → indexer → cron jobs   │
├──────────────────────────────┤
│  RPC Provider                │
│  JSON-RPC / WebSocket / gRPC │
├──────────────────────────────┤
│  Solana Runtime (SVM)        │
│  Programs → Accounts         │
└──────────────────────────────┘
```

Each layer has different trust boundaries, latency, and failure modes. The UI must never assume backend data matches on-chain state for financial decisions.

## Client patterns across chains

| Concept | Ethereum (EVM) | Solana (SVM) |
|---|---|---|
| State location | contract storage | separate accounts |
| Transaction model | single contract call | multi-instruction bundles |
| Gas | variable, auction-based | fixed compute budget |
| Account model | single contract address | many accounts per program |
| Client library | ethers.js / viem | @solana/kit / better-sol |
| Wallet standard | EIP-1193 / EIP-6963 | wallet-standard |
| IDL/ABI | Solidity ABI | Anchor IDL / Better Sol program def |
| Indexing | Dune / The Graph / Ponder | Helius / Triton / custom indexers |
| Address format | 0x hex (20 bytes) | Base58 (32 bytes) |

## Wallet connection

EVM uses `window.ethereum` (EIP-1193) or multi-provider discovery (EIP-6963). Solana uses wallet-standard, which decouples wallet detection from specific adapters. Both ecosystems prefer connection → network check → active account subscription.

Cross-chain dApps need separate wallet contexts per chain. Never assume a connected Solana wallet implies an EVM wallet or vice versa.

## RPC strategies

- JSON-RPC over HTTP: request/response, suitable for reads and transaction submission.
- WebSocket subscriptions: account changes, program logs, slot updates. Reconnect with backoff.
- geyser plugins: high-throughput streaming to external databases. Used by indexers and analytics.
- GraphQL: some providers expose filtered queries. Not a Solana native feature.

Rate limiting, caching, and failover are necessary for production. Avoid single-provider dependencies for critical paths.

## State synchronization patterns

### Optimistic UI

Show expected result immediately after wallet signature. Roll back if the transaction fails. Requires reliable confirmation tracking.

### Polling

Periodically fetch account state. Simple but wasteful. Suitable for dashboards and non-critical reads.

### WebSocket subscriptions

Subscribe to account or program changes. Lower latency than polling. Handle disconnects and missed updates.

### Event-sourced indexing

Parse transaction logs and program events into a queryable database. Required for history, analytics, and complex queries that on-chain state alone cannot serve.

## Transaction construction patterns

### Single instruction

Simplest case. One program call per transaction.

### Multi-instruction atomic bundle

Multiple instructions in one transaction. All succeed or all fail. Used for approve+transfer, create+initialize, or multi-step DeFi operations.

### Versioned transactions with lookup tables

Address Lookup Tables (ALTs) compress account references, allowing more accounts per transaction. Essential for complex DeFi operations.

### Compute budget management

Set compute unit limit and price. Under-budget transactions fail. Over-paying wastes SOL. Simulate first to estimate.

### Priority fees

Pay higher compute unit prices for faster inclusion during congestion. Monitor recent priority fee averages.

### Jito bundles and MEV

Submit transaction bundles with tips to Jito validators for priority execution. Relevant for time-sensitive DeFi operations. Front-running and sandwich attacks are MEV risks to consider when designing user-facing transaction flows.

## Cross-chain patterns

### Bridges

Lock-and-mint, burn-and-release, or liquidity pool bridges connect assets across chains. Wormhole, LayerZero, and deBridge are common Solana bridge protocols.

Bridge risks: custodian compromise, validator set attacks, message relay delays, and liquidity drain. Never assume bridge state equals native chain state without confirmation.

### Cross-chain messaging

General message passing protocols allow smart contract calls across chains. Useful for governance, state synchronization, and multi-chain DeFi.

### Multi-chain dApp design

Separate chain-specific logic from shared business logic. Use chain adapters that implement a common interface for wallet, transaction, and state operations.

## Backend patterns for dApps

### Transaction relaying

Backend constructs and partially signs transactions. User completes signing. Useful when backend knows required accounts or must sequence operations.

### Off-chain computation

Compute proofs, eligibility checks, API aggregations, and data transformations off-chain. Only put the result or commitment on-chain.

### Oracle integration

Pyth Network and Switchboard provide on-chain price feeds. Oracles are essential for DeFi but introduce trust assumptions about data freshness and manipulation resistance.

### Keeper and automation

Cron-triggered transactions for liquidations, rebalancing, reward distributions, and expiry processing. Can use Clockwork (deprecated), custom cron services, or self-hosted schedulers.

## Error handling across the stack

- RPC errors: rate limits, node sync issues, unsupported methods.
- Transaction errors: program runtime errors, insufficient compute, insufficient balance, timeout.
- Wallet errors: user rejection, wallet disconnected, wrong network.
- Simulation errors: catch before submission using `simulateTransaction`.
- Client errors: stale account data, race conditions, cached state.
- Network errors: WebSocket disconnects, provider outages, DNS failures.

Every layer should have typed error handling. Never surface raw RPC error messages to end users.

## Related

- `dapp-state-management.md` for frontend state domains and error handling patterns.
- `multi-chain-ui.md` for chain-specific error display.
