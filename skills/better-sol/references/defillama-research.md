# DefiLlama Research

Use this reference when the task involves DeFi opportunity research, TVL analysis, protocol health, chain trends, or deciding whether to integrate a DeFi protocol.

## Research goals

DefiLlama-style data is useful for three product decisions:

- Whether a protocol is trusted enough to integrate.
- Whether a chain/category is growing enough to build for.
- Whether a gap exists between user demand and available tooling.

## Metrics to collect

For each protocol or category, collect:

- Current TVL.
- TVL change over 1 day, 7 days, 30 days, and 90 days.
- Chain distribution.
- Category: DEX, lending, liquid staking, yield, derivatives, RWA, payments, bridge, stablecoin, etc.
- Fees and revenue if available.
- Volume if relevant.
- Token incentives if relevant.
- Audit/security posture.
- SDK/API maturity.
- Recent incidents or exploit history.
- Integration docs quality.

## Interpretation rules

- TVL is a trust signal, not proof of product quality.
- Fast TVL growth can mean real demand or temporary incentives.
- High fees/revenue with stable TVL is often stronger than TVL alone.
- Multi-chain TVL can hide weak Solana-specific adoption.
- A protocol with great TVL but stale SDKs may be bad for a hackathon integration.
- New protocols with low TVL can still be good opportunities if user pain is obvious and risk is isolated.

## Integration decision

Prefer integrating a protocol when:

- The protocol already owns the hard financial primitive.
- The app’s differentiation is UX, routing, automation, analytics, or distribution.
- The product does not need custom custody or settlement logic.
- Protocol security risk is acceptable for the use case.

Prefer a Better Sol program when:

- The product needs custom claims, rewards, escrow, attestations, permissions, or state.
- Existing protocols are only one step in a larger workflow.
- The user experience depends on app-specific on-chain records.

## Opportunity patterns

### Protocol wrapper

A better UI, safer flow, or specialized workflow around a trusted protocol.

Examples:

- one-click position migration
- risk-aware vault deposit flow
- treasury rebalancing dashboard
- yield onboarding for non-DeFi users

### Protocol adapter

A Better Sol program stores product-specific state while CPIs or clients call the underlying protocol.

Examples:

- rewards layer for LP participation
- allowlisted vault access
- user-specific automation config
- campaign claim records

### Data product

A dashboard, alerting system, or API derived from protocol data.

Examples:

- whale position monitor
- lending rate alerts
- TVL/category trend reports
- risk exposure dashboard

## Research workflow

1. Define category and chain scope.
2. Shortlist 5–10 protocols.
3. Rank by TVL, growth, revenue/fees, volume, docs, security, and integration fit.
4. Identify where Better Sol adds value: state, typed client, claims, rewards, attestations, or fast custom program logic.
5. Recommend integrate/build/avoid for each protocol.

## Red flags

- Recent unaudited upgrade after TVL growth.
- TVL dominated by incentives that are ending soon.
- No maintained SDK or integration examples.
- Poor incident disclosure.
- Admin keys or upgrade authority unclear.
- Protocol requires unsupported wallet or token behavior.

## Deliverable guidance

For DeFi research, produce a concise ranked table plus a recommendation. Include uncertainty and sources that must be verified before implementation.

## Related

- `defi-deep-dive.md` for DeFi primitive mechanics and risk frameworks.
- `strategy.md` for competitive landscape mapping.
