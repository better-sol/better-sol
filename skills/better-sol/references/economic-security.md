# Economic Security and Game Theory

Use this reference when reviewing protocol economics, incentive design, game-theoretic security, or tokenomics.

## Core principles

Economic security is about ensuring that the cost of attacking a protocol always exceeds the profit. If an attacker can profit $1M by spending $100K in gas or capital, the protocol is economically insecure.

### Incentive alignment

Every participant in a protocol should be rewarded for behavior that benefits the protocol and penalized for behavior that harms it.

Aligned incentives:
- Liquidity providers earn fees when their liquidity is used
- Stakers earn rewards proportional to their stake duration
- Validators earn rewards for honest block production

Misaligned incentives:
- Governance tokens that give voting power without economic exposure to the protocol's success
- Yield farming rewards that incentivize temporary liquidity rather than long-term commitment
- Referral bonuses that reward user acquisition without retention mechanisms

### Game theory fundamentals

| Concept | Definition | Protocol example |
|---|---|---|
| Nash equilibrium | No participant can improve their outcome by changing strategy alone | Stable liquidity provision in AMMs |
| Prisoner's dilemma | Individual rationality leads to worse collective outcomes | MEV extraction reducing overall user experience |
| Tragedy of the commons | Shared resource is depleted by individual self-interest | Governance voting apathy leading to whale dominance |
| Mechanism design | Design rules so that rational behavior produces desired outcomes | Fee structures that align LP and trader interests |
| Schelling point | Participants converge on the same choice without coordination | Oracle price feeds converging on true market price |

## Attack vectors

### Flash loan attacks

Flash loans allow borrowing and repaying in a single atomic transaction. This eliminates the capital requirement for many attacks.

Attack pattern:
1. Borrow $10M via flash loan
2. Manipulate price on a low-liquidity DEX
3. Exploit the manipulated price (liquidate positions, extract arbitrage, claim rewards)
4. Repay the flash loan
5. Keep the profit

Mitigations:
- Use time-weighted average prices (TWAP) from high-liquidity pools
- Require multi-block delays between deposit and withdrawal
- Use oracle price feeds with confidence intervals (Pyth)
- Set circuit breakers that pause operations during extreme price movements

### Sandwich attacks

An attacker sees a pending swap transaction, places a buy order before it (raising the price), lets the victim trade at the worse price, then sells for a profit.

Mitigations:
- Set slippage tolerance on every swap
- Use private mempools or encrypted transactions (Jito bundles)
- Submit transactions with priority fees for faster inclusion
- Use limit orders instead of market orders for large trades

### Oracle manipulation

If a protocol relies on a single price source, an attacker can manipulate that source to exploit the protocol.

Mitigations:
- Use multiple independent oracle sources
- Use TWAP over multiple blocks, not a single-point price
- Set maximum price deviation thresholds
- Use Pyth confidence intervals and reject prices with wide confidence

### Governance attacks

An attacker accumulates governance tokens (or borrows them via flash loan) to pass a malicious proposal.

Mitigations:
- Require tokens to be locked for a minimum period before voting
- Use time-locks on proposal execution (48-72 hour delay)
- Set quorum requirements proportional to total supply
- Use conviction voting where votes gain weight over time

### Rug pulls

The protocol team retains privileged access (admin keys, upgrade authority, mint authority) and uses it to drain funds.

Mitigations:
- Renounce or transfer upgrade authority to multisig or governance
- Renounce mint authority after initial distribution
- Publish audited source code with verified deployments
- Use timelocks on all admin operations

## Protocol review checklist

### Token economics

- [ ] Is the token supply capped or inflationary? If inflationary, what controls the rate?
- [ ] Are there vesting schedules for team and investor tokens?
- [ ] Is there a burn mechanism? What triggers it?
- [ ] What is the token velocity? How often does it change hands?

### Fee structure

- [ ] Who pays fees? (traders, LPs, borrowers, lenders)
- [ ] Where do fees go? (treasury, stakers, burn, team)
- [ ] Are fees denominated in the protocol token or a stablecoin?
- [ ] Can fees be changed by governance? How quickly?

### Liquidity

- [ ] Is there minimum liquidity required for operations?
- [ ] What happens when liquidity drops below the threshold?
- [ ] Are there withdrawal delays or queue mechanisms?
- [ ] Can a single large withdrawal drain the pool?

### Access control

- [ ] Who can upgrade the program? (single key, multisig, governance, none)
- [ ] Who can pause operations? Under what conditions?
- [ ] Are there admin-only functions that could be abused?
- [ ] Is there a timelock on privileged operations?

## Measuring economic security

### Cost of attack calculation

For each attack vector, calculate:

```
Attack profit = value extractable from the exploit
Attack cost = capital required + gas fees + opportunity cost
Net profit = Attack profit - Attack cost
```

If net profit is positive for any attack, the protocol is economically insecure.

### Example: oracle manipulation

```
Attack profit: $500K (liquidation bonus + arbitrage)
Flash loan cost: $0 (repaid in same tx)
Gas cost: $5
Slippage loss on manipulation trades: $50K
Net profit: $450K

Mitigation: Use TWAP + Pyth oracle with confidence interval check
New attack cost: >$10M (requires sustained manipulation across many blocks)
New net profit: -$9.5M (not profitable)
```

### Example: governance attack

```
Attack profit: $2M (treasury drain via malicious proposal)
Token acquisition cost: $1.5M (buy 5% of supply)
Time cost: 7 days (lock-up period)
Net profit: $500K

Mitigation: Require 10% supply locked for 30 days to vote
New attack cost: $3M locked for 30 days
New net profit: -$1M (not profitable)
```

## Related

- `attack-catalog.md` for technical vulnerability patterns.
- `tokenomics.md` for token design and economic model patterns.
- `security-checklist.md` for program-level security review.
- `defi-deep-dive.md` for DeFi-specific risk frameworks.
