# DeFi Deep Dive

Use this reference when designing, building, or reviewing DeFi protocols. Covers mechanics, invariants, risks, and patterns across major DeFi primitives.

## Automated Market Makers (AMMs)

### Constant product (x*y=k)

The foundational AMM model. Reserve balance changes maintain the invariant `reserve_a * reserve_b = k`. Price impact increases with trade size relative to pool depth.

Fees: added to reserves, increasing `k`. LP shares represent proportional claim on growing reserves.

### Concentated liquidity

LPs choose price ranges for their positions. Higher capital efficiency but requires active management. Uniswap v3 pioneered this on EVM. Meteora offers similar patterns on Solana.

### Stableswap

Designed for assets that should trade near 1:1. Uses a flattened curve near the peg and falls back to constant product at extremes. Curve Finance pioneered this. Saber implemented it on Solana.

### AMM invariants

- `reserve_a * reserve_b >= initial_k` at all times (before fees).
- LP token supply matches proportional ownership.
- No withdrawal exceeds user's proportional share.
- Fee collection does not violate conservation.
- First depositor cannot steal subsequent deposits (test with donate-before-liquidity).

## Lending protocols

### Model

Users deposit collateral and borrow against it. Health factor = collateral value * LTV / debt value. Liquidation triggers when health factor drops below threshold.

### Rate models

- Utilization-based: interest rate = f(borrowed / total_deposited). Increases with utilization to incentivize repayments and new deposits.
- Jump rate: stable rate at low utilization, steep increase above a kink point.
- Fixed rate: predetermined rate per market. Simpler but less responsive.

### Liquidation

- Liquidators repay debt and seize collateral at a discount (liquidation bonus).
- Partial liquidation preferred to prevent cascading liquidations.
- Close factor limits how much of a position can be liquidated in one action.
- Oracle price at liquidation time determines whether position is eligible.

### Lending invariants

- Total borrowed cannot exceed total deposited (per asset).
- Collateral values are always fresh enough for liquidation decisions.
- Interest accrual is continuous or per-block and never skipped.
- Liquidation bonus does not exceed what collateral can cover.
- Flash loan attacks cannot manipulate collateral values within a single transaction.

## Liquid staking

### Model

Users stake SOL and receive a liquid staking token (LST) representing their staked position. LST appreciates against SOL as staking rewards accrue. LSTs can be used in DeFi without unstaking.

### Major Solana LSTs

- JitoSOL (Jito)
- mSOL (Marinade)
- bSOL (BlazeStake)
- stSOL (Lido)
- jupSOL (Jupiter)

### Risks

- Validator slash risk transfers to LST holders.
- LST/SOL depeg during market stress.
- Liquidity constraints for large exits.
- Smart contract risk in the liquid staking program.

### Invariants

- LST value >= staked SOL + accrued rewards.
- Total LST supply corresponds to total staked amount.
- Withdrawal queue processes in stake epoch order.

## Perpetual futures (perps)

### Model

Perpetual futures have no expiry. Funding rate keeps the perp price anchored to the index price. Positive funding: longs pay shorts (perp above index). Negative: shorts pay longs.

### Key parameters

- Leverage: borrowed exposure. Higher leverage = lower liquidation price distance.
- Margin: collateral backing the position.
- Maintenance margin: minimum collateral before liquidation.
- Funding rate: periodic payment between longs and shorts.
- Insurance fund: covers losses from socialized liquidations.

### Perp invariants

- Total long open interest = total short open interest.
- Funding payments are balanced between longs and shorts.
- Liquidation engine can close positions before margin goes negative (assuming oracle is fresh).
- Insurance fund covers bankruptcy cases.
- Funding rate converges toward zero as perp price approaches index price.

## Yield strategies

### Single-protocol yield

Deposit into one protocol for lending interest, trading fees, or staking rewards. Simple but single-protocol risk.

### Leveraged yield

Borrow against deposits to lever up. Higher returns but liquidation risk.

### Yield vaults

Automated strategy execution. Users deposit, vault manages allocation and compounding. Strategy risk varies by vault design.

### Real yield

Revenue from actual protocol usage (trading fees, interest) rather than token emissions. More sustainable but often lower APY.

## Risk frameworks

### Smart contract risk

Bugs in program code. Mitigate with audits, formal verification, bug bounties, and time locks.

### Economic risk

Incentive misalignment, economic attacks, or unsustainable tokenomics. Mitigate with mechanism design, stress testing, and economic audits.

### Oracle risk

Stale or manipulated price feeds. Mitigate with multiple oracle sources, confidence bounds, and freshness requirements.

### Liquidity risk

Insufficient liquidity for exits. Mitigate with liquidity depth monitoring, withdrawal queues, and circuit breakers.

### Composability risk

CPI chains create transitive trust. Each protocol in a CPI chain adds its own risk. Mitigate by auditing the full chain and limiting CPI depth.

### Systemic risk

Protocol failures cascade through interconnected DeFi. Impossible to eliminate. Mitigate with position limits, insurance, and monitoring.

## DeFi analysis framework

### Invariant-first design

Every DeFi primitive should be described by invariants before code is written.

| Primitive | Example invariant |
|---|---|
| AMM | `x * y` never decreases except through fees and rounding |
| Lending market | Total debt plus reserves never exceeds collateral-adjusted assets |
| Vault | Sum of user shares always maps to claimable assets |
| Perps | Funding payments are zero-sum between longs and shorts |
| Staking | Rewards emitted never exceed authorized reward budget |

Write tests around invariant preservation under deposits, withdrawals, swaps, liquidations, and failed transactions. If the invariant cannot be stated clearly, the protocol design is not ready.

### Risk decomposition

Analyze each DeFi product through four risk layers:

1. **Smart contract risk**: bugs in accounting, authority checks, CPIs, or math.
2. **Oracle risk**: stale, manipulated, or unavailable external prices.
3. **Liquidity risk**: inability to exit, liquidate, or rebalance without large slippage.
4. **Incentive risk**: rational users can extract value by gaming rewards, fees, or governance.

A design is only as safe as the weakest layer. A perfectly audited lending program can still fail if its oracle or liquidation market fails.

### Economic stress testing

Before mainnet, simulate:

- 50% collateral price crash in one hour
- Oracle downtime during volatile markets
- Liquidity withdrawal by the largest LP
- Reward farming with 100 sybil wallets
- Liquidation congestion during high priority fees
- Admin key compromise followed by delayed multisig response

The output should be a table of losses, blocked actions, and manual recovery steps.

## Related

- `defi.md` for build-vs-integrate decisions, common accounts, and transaction flows.
- `economic-security.md` for incentive design and game-theoretic security.
- `oracles-and-external-data.md` for oracle integration and price feed security.
