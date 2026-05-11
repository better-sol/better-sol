# Tokenomics and Protocol Design

Use this reference when designing token economies, reviewing token mechanics, planning token launches, or evaluating protocol sustainability.

This is not legal, tax, or investment advice. Token design can create regulatory and financial risk. Consult qualified counsel before any public sale, revenue share, or regulated asset launch.

## First principle

A token is justified only if it coordinates behavior that the product cannot coordinate as well without a token.

Bad reason:

```text
We need a token because crypto products have tokens.
```

Better reason:

```text
The protocol needs a scarce coordination asset for staking, slashing, governance, rewards, or access that must be enforced on-chain.
```

## Token necessity test

Before designing supply, answer:

| Question | If no |
|---|---|
| Does the token have a job inside the protocol? | Do not launch it yet |
| Would users buy or hold it without speculation? | Utility is weak |
| Does it improve security, coordination, or access? | It may be a marketing token |
| Can the product work with SOL, USDC, or existing tokens? | Use existing tokens |
| Is the legal risk worth the product benefit? | Delay launch |

Most early products should launch without a token until usage patterns are proven.

## Utility types

| Utility | Strong version | Weak version |
|---|---|---|
| Governance | Controls meaningful parameters with safeguards | Votes on cosmetic decisions |
| Staking | Secures a service with slashing or real opportunity cost | Locks token only to reduce circulating supply |
| Fee payment | Required for protocol usage and creates recurring demand | Optional discount token |
| Access | Unlocks scarce capacity or rights | Token-gated Discord |
| Collateral | Backs credit, insurance, or risk | Thinly traded self-collateral |
| Rewards | Bootstraps useful behavior | Pays mercenary users to farm and dump |
| Revenue claim | Contractual, legal, and transparent | Vague promise of future value |

A token can combine utilities, but each utility increases complexity. Do not add utility that the protocol cannot explain or enforce.

## Value capture models

### Fee sink

Users pay protocol fees in the token, or fees are used to buy back the token.

Pros: direct link between usage and demand.
Cons: buybacks can create securities questions and treasury timing risk.

### Staking and slashing

Operators stake tokens and can be slashed for bad behavior.

Pros: token secures service quality.
Cons: requires objective fault detection and credible slashing.

### Governance control

Token holders govern parameters, treasury, or upgrades.

Pros: decentralizes control over time.
Cons: voter apathy and whale capture are common.

### Access rights

Token grants access to scarce capacity: API calls, vault allocation, launchpad slots, or membership.

Pros: understandable utility.
Cons: access demand must be real and recurring.

## Supply mechanics

### Fixed supply

Total supply is set at launch. No new tokens are minted.

Best for: simple governance, membership, or fixed-cap rewards.
Risk: poor initial distribution is permanent unless governance redistributes treasury.

### Inflationary supply

New tokens are minted on a schedule.

Best for: validator rewards, liquidity incentives, ongoing contributor rewards.
Risk: inflation becomes sell pressure unless matched by real demand.

### Deflationary mechanics

Tokens are burned or removed from supply.

Best for: fee burn tied to real usage.
Risk: burns do not matter if demand is weak or liquidity is poor.

### Hybrid supply

Most mature systems combine emissions and sinks:

```text
net_supply_change = emissions + unlocks - burns - permanent locks
```

Analyze net supply, not just max supply.

## Distribution design

### Allocation table

| Group | Purpose | Common risk |
|---|---|---|
| Community | Users, contributors, ecosystem growth | Sybil farming and immediate sell pressure |
| Team | Long-term development | Misaligned if vesting is too short |
| Investors | Capital and network | Unlock cliffs can dominate market structure |
| Treasury | Future grants, liquidity, partnerships | Poor governance or opaque spending |
| Liquidity | Market depth | Can be drained if incentives end |

### Vesting principles

- Team: 2-4 years, 6-12 month cliff.
- Investors: 1-2 years, clear unlock calendar.
- Advisors: smaller allocation, milestone-based vesting.
- Treasury: governed release schedule with reporting.
- Community rewards: anti-sybil rules and claim records.

Unlocks are market events. Publish them clearly. Hidden unlocks destroy trust.

## Emission design

Emission must buy behavior the protocol actually needs.

| Desired behavior | Better emission design |
|---|---|
| Deep liquidity | Rewards weighted by useful liquidity and duration |
| Long-term staking | Rewards increase with lock duration but cap whale advantage |
| Governance participation | Reward useful participation carefully, not blind voting |
| Developer ecosystem | Milestone grants, not one-time vanity bounties |
| User acquisition | Rewards tied to retained usage, not first transaction only |

Avoid paying users for actions that are easy to fake. If the emission can be farmed by 1,000 wallets in a script, it will be.

## Token velocity

Token value capture weakens when tokens are immediately sold after use.

High velocity pattern:

```text
User buys token → pays fee → recipient sells token
```

Lower velocity pattern:

```text
User needs token → stakes/locks for access or security → earns/loses based on useful behavior
```

Do not artificially lock tokens only to create scarcity. Locks should map to a real commitment: security, access, governance, or service quality.

## Liquidity and market structure

A token launch is also a market design problem.

Checklist:

- [ ] Initial liquidity is deep enough for expected demand.
- [ ] Market makers or LPs are disclosed if used.
- [ ] Treasury does not rely on selling illiquid tokens for runway.
- [ ] Major unlocks do not coincide with low liquidity.
- [ ] Users can see circulating supply, total supply, FDV, and unlock schedule.
- [ ] Token mint and authorities are public.

## Governance risk

Governance tokens can make protocols less safe if control is too easy to buy.

Protect high-risk actions:

| Action | Controls |
|---|---|
| Parameter change | Quorum, timelock, simulation |
| Treasury spend | Budget cap, milestone release |
| Program upgrade | Supermajority, multisig review, long timelock |
| Emergency pause | Narrow multisig, postmortem, expiration |

Governance should decentralize credible control, not create a theatrical vote over decisions already made by insiders.

## Launch sequence

1. Prove product usage without a token if possible.
2. Define token job and why existing assets are insufficient.
3. Model supply, emissions, unlocks, and fee sinks.
4. Run sybil analysis for distribution.
5. Get legal review.
6. Deploy mint and authority controls.
7. Publish token address, supply, authorities, and unlock schedule.
8. Seed liquidity responsibly.
9. Monitor abnormal trading and claim patterns.

## Failure modes

| Failure | Cause | Prevention |
|---|---|---|
| Farm and dump | Rewards not tied to retained value | Duration weighting, caps, quality metrics |
| Governance capture | Low quorum or concentrated supply | Delegation, quorum, timelocks, caps |
| Liquidity death spiral | Incentives end and LPs leave | Real fee demand, staged emissions |
| Regulatory shock | Token resembles unregistered security | Legal review, avoid vague profit promises |
| Treasury insolvency | Runway held mostly in own token | Diversify treasury into stable assets |
| User distrust | Hidden unlocks or admin powers | Publish authorities, unlocks, and controls |

## Evaluation questions

1. What behavior does the token coordinate?
2. Who must hold it and why?
3. What creates recurring demand beyond speculation?
4. What creates sell pressure and when?
5. Who controls mint, freeze, upgrade, and treasury authority?
6. What happens if token price falls 80%?
7. Can the protocol still function if rewards stop?
8. Can whales or sybils dominate distribution or governance?
9. Is the token necessary now, or later?

## Related

- `economic-security.md` for game theory and attack-cost analysis.
- `tokens.md` for SPL Token and Token-2022 implementation patterns.
- `dao-governance.md` for governance controls.
- `humanity.md` for sybil-resistant distribution.
- `strategy.md` for product positioning before token launch.
