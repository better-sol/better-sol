# Oracle and External Data Patterns

Use this reference when a dApp needs external data on-chain: price feeds, random numbers, weather, sports results, API responses, or cross-chain state.

## Why oracles matter

Blockchains are deterministic and sandboxed. Programs cannot natively access external APIs, internet resources, or off-chain databases. Oracles bridge this gap by posting verified external data on-chain.

Every oracle introduces a trust assumption. Design with the assumption that oracle data can be stale, manipulated, or unavailable.

## Oracle types on Solana

### Price feeds

Pyth Network: pulls price data from publishers, aggregates on-chain. Supports price, confidence interval, and timestamp.

Switchboard: push-based oracle with customizable data feeds. Supports aggregation, VRF, and custom queue definitions.

### Random numbers

Switchboard VRF: verifiable random function. Produces on-chain randomness with cryptographic proof. Requires callback pattern.

Built-in: recent blockhash provides weak randomness. Not suitable for value-bearing operations.

### Custom data feeds

Any oracle can post arbitrary data on-chain if a configured feed exists. Switchboard allows custom job definitions.

### Attestation services

Off-chain verification results posted on-chain as attestations. Examples: Proof of Humanity, World ID, custom KYC providers.

## Integration patterns

### Pull pattern

Program reads oracle account data during instruction execution. Used for price-dependent logic: liquidations, swaps, interest rate calculations.

The program trusts the oracle account owner. Verify the oracle account is owned by the expected oracle program and that the timestamp is recent.

### Push pattern

Oracle updates on-chain accounts at regular intervals. Programs read current state. Freshness depends on update frequency.

### Callback pattern

Program requests data, oracle responds with a callback instruction. Used for VRF and async operations. The callback must verify the requesting program and request ID.

### Off-chain oracle

Backend fetches external data, signs it, and submits on-chain. Program verifies the signature. Centralized but flexible.

## Security considerations

- Stale data: define maximum age. Reject data older than threshold.
- Price manipulation: use confidence intervals. Reject or bound actions when confidence is low.
- Oracle downtime: define fallback behavior. Pause operations or use last-known-good with reduced limits.
- Single oracle dependency: aggregate from multiple sources when possible.
- Feed address validation: hardcode or verify expected feed addresses. Never accept user-supplied oracle accounts without validation.

## Common uses in DeFi

- Lending: collateral valuation, liquidation thresholds, interest rate calculation.
- Perpetuals: mark price, funding rate, index price.
- Options: settlement price, implied volatility.
- Insurance: trigger conditions, payout calculations.

## Better Sol integration

Use `bs.mint()` or `bs.pubkey()` constraints to bind oracle accounts in instruction definitions. Add staleness checks in `ctx.require`:

```ts
ctx.require(currentSlot - oracle.lastUpdatedSlot < maxStaleness, "StaleOracle")
ctx.require(oracle.confidence < maxConfidence, "OracleUncertain")
```

For custom oracle data, define an OracleState account owned by your program that is updated by an authorized off-chain process.

## Related

- `defi-deep-dive.md` for DeFi primitives that depend on oracle data: lending, perps, insurance.
- `advanced-solana.md` for compute budget implications of on-chain verification.
