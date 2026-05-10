# Economic Security and Game Theory

Use this reference when reviewing protocol economics, incentive design, game-theoretic security, or tokenomics.

## Why economics matter for security

Many exploits are not code bugs but economic design flaws. A program can be technically correct but economically exploitable when incentives are misaligned.

## Incentive design principles

- Align participant incentives with protocol health.
- Make attacks more expensive than the potential gain.
- Ensure sustainability beyond incentive periods.
- Design for adversarial behavior from all participants.
- Test with rational, irrational, and colluding actors.

## Tokenomics review checklist

### Supply and distribution

- Total supply and inflation schedule.
- Allocation across team, investors, community, treasury, ecosystem.
- Vesting schedules and cliff periods.
- Unlock events that could create sell pressure.

### Utility and demand

- What the token enables: governance, staking, fees, access, rewards.
- Whether demand is sustainable without incentives.
- Relationship between token utility and price.

### Mechanism design

- Minting and burning mechanics.
- Fee distribution and accrual.
- Staking rewards and yield sources.
- Slashing conditions if applicable.

### Attack vectors

- Whale accumulation for governance attacks.
- Flash loan-enabled governance voting.
- Token dump after unlock.
- Liquidity drain during market stress.
- Sybil attacks on token distributions.

## Game theory concepts for protocol design

### Nash equilibrium

A state where no participant can improve their outcome by changing strategy alone. Protocols should be designed so the equilibrium is honest behavior.

### Byzantine fault tolerance

The protocol should function correctly even when some participants act maliciously, within known bounds.

### Mechanism design

Design the rules of the system so that rational participants produce desired outcomes. Key mechanisms:

- Slashing: penalize misbehavior.
- Bonding: require economic commitment to participate.
- Rewards: compensate honest participation.
- Fees: prevent spam and value extraction.

### Principal-agent problems

Protocol operators (agents) may not act in the best interest of users (principals). Mitigate with transparency, governance controls, and verifiable behavior.

## Fee model patterns

### Fixed fees

Predictable but may not reflect actual cost or demand.

### Dynamic fees

Adjust based on demand, congestion, or volatility. Better for resource allocation but harder to predict.

### Fee distribution

- Protocol treasury.
- Token buyback and burn.
- Staker rewards.
- Liquidity provider incentives.

Each distribution creates different incentive structures.

## Slashing and bonding

### Staking with slashing

Validators or participants bond tokens. Misbehavior results in partial or full forfeiture. Common in proof-of-stake systems.

### Insurance pools

Participants deposit tokens into a shared insurance pool. Claims are paid from the pool. Incentivize honest participation through reward distribution.

### Escrow and commitment

Require economic commitment before participation. Forfeit commitment if conditions are violated. Useful for high-value operations and dispute resolution.

## Stress testing economics

### Scenarios to model

- Token price drops 50%, 80%, 95%.
- TVL drops 50% in 24 hours.
- Key validator or provider goes offline.
- Governance proposal passes that benefits a small group.
- Competitor offers 2x rewards.
- Regulatory action targets the protocol or token.

### Metrics to track

- Collateralization ratios under stress.
- Fee revenue sustainability.
- Token velocity and holding patterns.
- Liquidity depth at different price levels.
- Governance participation rates.

## Better Sol integration

When reviewing Better Sol programs that handle economics:

- Verify fee calculations match intended policy.
- Check rounding direction favors protocol safety.
- Test edge cases: zero balance, max values, first depositor, last withdrawer.
- Ensure reward calculations cannot be gamed by timing or manipulation.
- Validate that economic invariants hold across all instruction paths.

## Related

- `tokenomics.md` for detailed token design, supply mechanics, and fee models.
- `defi-deep-dive.md` for DeFi-specific risk frameworks and stress testing.
- `dao-governance.md` for governance attack vectors.
