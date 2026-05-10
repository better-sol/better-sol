# Tokenomics and Protocol Design

Use this reference when designing token economies, reviewing token mechanics, planning token launches, or evaluating protocol sustainability.

## Token utility types

### Governance tokens

Holders vote on protocol decisions. Value derives from future protocol revenue or decision-making power.

Design considerations:

- Vote delegation for passive holders.
- Quorum requirements for meaningful decisions.
- Timelocks to prevent emergency governance capture.
- Separation of governance and operational keys.

### Utility tokens

Required to access protocol features: fees, staking, premium features, or rate limits.

Design considerations:

- Fee burn vs fee distribution to stakers.
- Whether utility creates sustainable demand beyond speculation.
- Velocity problem: high-velocity tokens face selling pressure.

### Staking tokens

Bonded for network security or protocol participation. Rewards come from inflation or protocol revenue.

Design considerations:

- Lock-up periods and unbonding time.
- Slashing conditions and severity.
- Reward rate sustainability.
- Relationship between staked supply and circulating supply.

### Revenue-sharing tokens

Holders receive a share of protocol revenue. May qualify as securities in some jurisdictions.

Design considerations:

- Distribution mechanism: direct transfer, buyback-and-burn, or compound.
- Legal classification in target jurisdictions.
- Sustainability of revenue relative to token valuation.

## Token launch strategies

### Fair launch

No pre-mine, no investor allocation. Tokens are earned through participation. Maximum decentralization but no guaranteed initial liquidity.

### Liquidity bootstrapping

Initial token distribution through a liquidity pool. Price discovery is market-driven. Common in DeFi.

### Airdrop

Distribute tokens to eligible wallets. Builds community but creates sell pressure. Eligibility criteria affect fairness and sybil resistance.

### Token sale

Fixed or dutch auction for early token distribution. Provides capital but requires regulatory compliance.

### Bonding curve

Price increases with supply. Common in social tokens and pump.fun-style launches. Creates built-in liquidity but can be speculative.

## Supply mechanics

### Fixed supply

Maximum supply is constant. Deflationary if tokens are burned. Value appreciation through scarcity.

### Inflationary supply

New tokens minted on a schedule. Inflation must be offset by demand growth or utility. Common in staking rewards.

### Deflationary mechanics

Tokens burned through fees, buyback, or mechanism design. Must balance deflation with economic growth needs.

### Emission schedule

Plan token releases over time:

- Team and investor vesting.
- Ecosystem incentives.
- Staking rewards.
- Treasury allocation.
- Community grants.

Front-loaded emissions create sell pressure. Back-loaded emissions risk insufficient early incentive.

## Fee model design

### Protocol fees

Charged on protocol operations. Revenue can flow to:

- Token holders (direct distribution or buyback)
- Treasury (for development and operations)
- Insurance fund (for risk coverage)
- Liquidity incentives (for bootstrapping)

### Fee optimization

- Flat fees: simple but may not reflect cost.
- Percentage fees: scales with value but may be regressive.
- Tiered fees: rewards high-volume users.
- Dynamic fees: adjusts based on demand or risk.

## Tokenomics audit checklist

- [ ] Total supply and emission schedule are explicit.
- [ ] Vesting schedules prevent cliff-driven sell pressure.
- [ ] Token utility creates sustainable demand.
- [ ] Fee model covers operational costs.
- [ ] Governance structure prevents capture.
- [ ] Inflation rate is sustainable relative to demand.
- [ ] Distribution is fair and disclosed.
- [ ] Regulatory classification has been considered.
- [ ] Stress-tested under multiple price scenarios.
- [ ] Emergency mechanisms exist for market stress.

## Common tokenomics mistakes

- Designing tokenomics to justify a token rather than solving a real problem.
- Relying on perpetual token emissions to incentivize usage.
- No sustainable revenue model beyond emissions.
- Governance theater where decisions are already made off-chain.
- Ignoring regulatory implications of revenue-sharing tokens.
- Overcomplicating utility to inflate perceived value.
- Launching a token before product-market fit.
- Concentrated supply that discourages community participation.

## Related

- `economic-security.md` for game-theoretic security, incentive stress testing, and slashing patterns.
- `dao-governance.md` for governance token design and voting mechanics.
- `tokens.md` for SPL Token and Token-2022 launch mechanics.
