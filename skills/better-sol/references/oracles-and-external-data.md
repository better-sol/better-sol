# Oracle and External Data Patterns

Use this reference when a dApp needs external data on-chain: price feeds, random numbers, weather, sports results, API responses, or cross-chain state.

## Tools

- **Pyth Network** (`@pythnetwork/pyth-solana-receiver`): aggregated on-chain prices with confidence intervals. Pull-based: programs read price accounts during execution. Supports 100+ price feeds across crypto, equities, FX, and commodities.
- **Switchboard** (`@switchboard-xyz/on-demand`): on-demand oracle with custom data feeds and verifiable randomness. Supports arbitrary API-to-on-chain aggregation.
- **Switchboard randomness**: on-demand verifiable randomness using `@switchboard-xyz/on-demand`. Programs read randomness accounts that are resolved by the Switchboard network.
- **Better Sol integration**: import Anchor-compatible oracle IDLs with `fromIdl(idl)` from `better-sol` when an external program exposes an IDL. For raw oracle accounts, validate and decode with the oracle SDK or store an app-owned snapshot account.

## Why oracles matter

Blockchains are deterministic and sandboxed. Programs cannot natively access external APIs, internet resources, or off-chain databases. Oracles bridge this gap by posting verified external data on-chain.

Every oracle introduces a trust assumption. Design with the assumption that oracle data can be stale, manipulated, or unavailable.

## Oracle types on Solana

### Price feeds (Pyth)

Pyth aggregates price data from multiple publishers (exchanges, market makers) and posts the aggregate on-chain. Each price feed is an account containing:

- **Price**: the aggregated price as an integer
- **Confidence**: the confidence interval around the price
- **Exponent**: the power-of-ten exponent for scaling
- **Timestamp**: when the price was last updated

The actual price is `price * 10^exponent`. For example, SOL/USD might have price=15000, exponent=-2, giving $150.00.

When integrating Pyth in an on-chain Solana program, use the Pyth receiver account type for the selected feed and validate both age and feed ID. In Better Sol examples, represent your validated oracle result as an app-owned account if the current DSL does not directly decode the external oracle account type.

### Price feeds (Switchboard)

Switchboard uses push-based aggregation. Oracle operators push data to on-chain feeds at configured intervals. Each feed has:

- A queue of oracle operators
- An aggregation method (median, mean)
- A update frequency
- A feed address that can be read by programs

### Verifiable randomness (Switchboard On-Demand)

Switchboard On-Demand provides randomness through on-chain accounts. Your program reads a randomness account that the Switchboard network resolves.

Flow:

1. Create a randomness account on-chain via the Switchboard program
2. User submits a transaction that commits to using the randomness
3. Switchboard network resolves the randomness off-chain and posts the result
4. User submits a settle transaction that reads the resolved randomness

On-chain (Rust, via Anchor or Pinocchio):

```text
use switchboard_on_demand::accounts::RandomnessAccountData;

let clock = Clock::get()?;
let randomness_data = RandomnessAccountData::parse(data)?;
let random_bytes = randomness_data
    .get_value(clock.slot)
    .map_err(|_| ErrorCode::RandomnessNotResolved)?;
```

Better Sol integration: store the randomness account address in your program state, read it in a settle instruction:

```ts
settleFlip: ix({
  accounts: {
    game: bs.mut(GameState),
    randomnessAccount: bs.pubkey(),
    clock: bs.clock(),
  },
  run: ({ game, randomnessAccount, clock }, ctx) => {
    ctx.require(game.randomnessAccount === randomnessAccount, "InvalidRandomness")
    ctx.require(clock.slot > game.commitSlot, "RandomnessNotResolved")
  },
})
```

### Custom data feeds (Switchboard)

Switchboard allows defining custom data feeds that aggregate any HTTP API into on-chain data. Define a job with:

- HTTP request URL and method
- JSON path to extract the value
- Aggregation method across multiple oracle responses

Example: weather data feed. Switchboard On-Demand feeds are configured through the Switchboard UI or CLI, specifying the HTTP endpoint and JSON path. The feed address is then passed to your program as an account:

```text
Feed configuration (off-chain via Switchboard UI or CLI):
- HTTP request: https://api.weather.gov/stations/KNYC/observations
- JSON path: $.properties.temperature.value
- Aggregation: median across oracle responses
```

Your program reads the resolved feed account on-chain.

### Attestation services

Off-chain verification results posted on-chain as attestations. Examples: Proof of Humanity, World ID, custom KYC providers. These are not real-time data feeds but rather one-time verification records stored as on-chain accounts.

## Integration patterns

### Pull pattern (most common)

Program reads oracle account data during instruction execution. Used for price-dependent logic: liquidations, swaps, interest rate calculations.

The program trusts the oracle account owner. Verify:
1. The oracle account is owned by the expected oracle program
2. The timestamp is recent (staleness check)
3. The confidence interval is acceptable

### Push pattern

Oracle updates on-chain accounts at regular intervals. Programs read current state. Freshness depends on update frequency.

### Callback pattern

Program requests data, oracle responds with a callback instruction. Used for VRF and async operations. The callback must verify the requesting program and request ID.

### Off-chain oracle (custom)

Backend fetches external data, signs it, and submits on-chain. Program verifies the signature. Centralized but flexible. Suitable for:
- Private API data that cannot be posted publicly
- Data that requires computation too expensive for on-chain
- Situations where no suitable oracle exists

## Oracle risk framework

### Manipulation cost analysis

For each oracle-dependent action, estimate whether manipulation is profitable:

```text
profit_from_bad_price = value_extractable_from_protocol
manipulation_cost = liquidity_needed + oracle_update_cost + time_risk + detection_risk
safe_if manipulation_cost > profit_from_bad_price
```

A lending protocol with thin collateral liquidity and instant liquidations is dangerous because the manipulation window is short and profit is immediate. A protocol using a high-quality oracle with confidence checks, caps, and time delays makes manipulation less profitable.

### Trust boundaries

| Boundary | Question |
|---|---|
| Publisher set | Who can submit data? |
| Aggregation | Median, mean, weighted source, or single signer? |
| Freshness | How old can data be before the action fails? |
| Confidence | What uncertainty is acceptable? |
| Fallback | Does the protocol pause, reduce limits, or switch feeds? |
| Governance | Who can change feed addresses or thresholds? |

### Failure policy by action

| Action | Oracle failure policy |
|---|---|
| Deposit | Usually allow if no immediate leverage is created |
| Borrow | Reject if stale or uncertain |
| Liquidation | Require strict freshness and confidence |
| Withdrawal | Allow with reduced limits if protocol solvency is not harmed |
| Settlement | Use finalized oracle value and dispute window for high stakes |

## Security considerations

### Stale data

Define maximum age for oracle data. Reject data older than threshold.

```ts
ctx.require(currentSlot - oracle.lastUpdatedSlot < maxStalenessSlots, "StaleOracle")
```

For Pyth, check `lastUpdatedSlot` against the current slot. For Switchboard, check the feed's `latestConfirmedTimestamp`.

### Price manipulation

Use confidence intervals. Reject or bound actions when confidence is low.

```ts
const price = oracle.price
const confidence = oracle.confidence
const maxAcceptableConfidence = price / 10n

ctx.require(confidence < maxAcceptableConfidence, "OracleUncertain")
```

### Oracle downtime

Define fallback behavior:
- Pause operations until oracle recovers
- Use last-known-good value with reduced limits (e.g., 50% max withdrawal)
- Switch to an alternative oracle feed

### Single oracle dependency

Aggregate from multiple sources when possible. Use Pyth as primary, Switchboard as secondary. If both disagree by more than a threshold, pause.

### Feed address validation

Hardcode or verify expected feed addresses. Never accept user-supplied oracle accounts without validation.

```ts
ctx.require(oracle.key === EXPECTED_PYTH_FEED, "InvalidOracleFeed")
```

## Common uses in DeFi

| Protocol type | Oracle use | Criticality |
|---|---|---|
| Lending | Collateral valuation, liquidation thresholds | Critical (incorrect price = bad liquidation) |
| Perpetuals | Mark price, funding rate, index price | Critical (price manipulation = trader loss) |
| Options | Settlement price, implied volatility | Critical (settlement depends on final price) |
| Insurance | Trigger conditions, payout calculations | High (false trigger = incorrect payout) |
| Yield vault | Strategy performance measurement | Medium (price affects reported APY) |
| DEX | Price impact estimation | Low (spot price from pool state) |

## Better Sol integration

For custom external data, define an app-owned oracle snapshot account that is updated by an authorized updater. Downstream instructions read the snapshot and enforce freshness and confidence.

```ts
const OracleSnapshot = bs.account({
  authority: bs.pubkey(),
  feed: bs.pubkey(),
  price: bs.i64(),
  confidence: bs.u64(),
  exponent: bs.i32(),
  updatedSlot: bs.u64(),
}).derive((seed) => ["oracle", seed.feed])

priceCheck: ix({
  accounts: {
    position: bs.mut(Position),
    oracle: bs.mut(OracleSnapshot),
    clock: bs.clock(),
  },
  run: ({ position, oracle, clock }, ctx) => {
    ctx.require(clock.slot - oracle.updatedSlot < 25n, "StaleOracle")
    ctx.require(oracle.confidence < position.value / 10n, "OracleUncertain")
  },
})
```

For Pyth or Switchboard direct account reads, validate the external account type using that oracle SDK or imported IDL, then apply the same freshness, feed ID, and confidence checks.

## Related

- `defi-deep-dive.md` for DeFi primitives that depend on oracle data.
- `advanced-solana.md` for compute budget implications of on-chain verification.
- `security-checklist.md` for oracle-specific security checks.
