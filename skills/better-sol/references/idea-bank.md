# Crypto Idea Bank

Use this reference when the user asks what to build, wants idea generation, or needs a better hackathon/startup direction.

Treat these as starting points, not guaranteed opportunities. Always validate user access, market timing, and Solana necessity.

## Better Sol-native ideas

### TypeScript-first program examples marketplace

A gallery of audited, tested Better Sol program templates: escrow, rewards, claims, token gates, attestations, vault records, and payment links.

Why Better Sol fits: the product demonstrates the SDK and gives developers copyable typed clients.

### Program-to-client drift detector

A tool that compares Anchor IDLs, generated clients, and frontend usage to detect broken account or instruction assumptions.

Why Better Sol fits: positions Better Sol’s single-source-of-truth model against IDL/client drift.

### LiteSVM test harness generator

A tool that reads a Better Sol program definition and proposes authority, PDA, token, and edge-case tests.

Why Better Sol fits: tests can be generated from the same TypeScript schema.

## DeFi ideas

### Risk-aware deposit flow

A safer frontend layer for vault/lending deposits that explains mint, protocol, slippage, lockups, authority, and failure states before signing.

Architecture: integration-only or hybrid with Better Sol records for user preferences and attestations.

### Treasury policy vault

DAO/team treasury rules encoded in a thin Better Sol program: allowed mints, per-epoch limits, approvers, and event logs.

Architecture: Better Sol program plus existing token protocols.

### Yield change alerts

Indexer that watches lending/yield protocols and alerts users when APY, utilization, or risk changes beyond a threshold.

Architecture: data pipeline, no custom program unless users store alert preferences on-chain.

## Consumer and creator ideas

### On-chain membership claims

Creators issue membership or reward claims gated by wallet, payment, human verification, or event attendance.

Architecture: Better Sol claim records + token/NFT integration.

### Proof-of-contribution rewards

Projects reward contributors with claims tied to GitHub, Discord, or product actions.

Architecture: backend verification + Better Sol claim/reward program.

### Refundable access pass

Users deposit for access; unused or satisfied conditions refund automatically.

Architecture: escrow-like Better Sol program.

## Data and infrastructure ideas

### Program health monitor

Monitor events, failed transactions, account changes, and admin actions for a Better Sol or Anchor program.

Architecture: indexer + alerting.

### Human-readable transaction simulator

A tool that simulates a transaction and translates account changes, token movement, and errors into user-readable output.

Architecture: client/infrastructure product.

### Devnet demo seeder

Creates predictable devnet state for demos: mints, funded wallets, initialized accounts, and scripted transactions.

Architecture: CLI/script product using Better Sol typed clients.

## Validation filters

Reject or pivot ideas that fail most of these:

- A specific user can be named.
- The user has a repeated pain or urgent deadline.
- Solana adds something beyond buzzwords.
- A demo can be built in days, not months.
- The first proof does not require mainnet funds.
- The project can explain why it is different in one sentence.

## Scoring shortcut

Strong hackathon idea:

- demo quality: 4–5
- buildability: 4–5
- technical depth: 3–5
- user clarity: 3–5

Strong startup idea:

- pain: 4–5
- distribution: 4–5
- willingness to pay or switch: 3–5
- defensibility: 3–5

## Related

- `strategy.md` for turning an idea into a validation sprint.
- `evaluation-frameworks.md` for scoring ideas and reducing bias.
- `defillama-research.md` for DeFi opportunity research.
