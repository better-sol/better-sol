# DeFi Patterns

## Build vs integrate

Integrate existing protocols when the app is a route, dashboard, wrapper UI, or automation layer. Build a custom Better Sol program only for custom custody, accounting, permissioning, settlement, vault shares, rewards, attestations, or invariants.

## Invariant-first design

Define before code:

- assets are conserved across deposits/withdrawals
- shares and assets stay synchronized
- only authority can update config
- users cannot withdraw more than their position
- fees are bounded and routed correctly
- slippage limits are enforced
- oracle price is fresh and confidence-bounded
- rewards cannot be double-claimed
- pause/admin powers are explicit and tested

## Common accounts

```text
Config: admin, paused, fee_bps, accepted_mints
Vault: authority, asset_mint, share_mint, total_assets, total_shares
Position: owner, collateral_amount, debt_amount, last_update
Pool: mint_a, mint_b, reserve_a, reserve_b, fee_bps
RewardState: authority, reward_mint, emission_rate, last_timestamp, total_distributed
ClaimRecord: owner, claimed_amount, last_claim
```

## Transaction flows

### Vault deposit

1. User signs deposit.
2. Validate vault config, mint, token accounts, amount, paused flag.
3. Transfer assets into vault token account.
4. Mint or account shares.
5. Emit deposit event.

### Vault withdraw

1. User signs withdraw.
2. Validate position/share ownership.
3. Burn or decrement shares.
4. Transfer assets out.
5. Emit withdraw event.

## Math rules

- Use integer math and explicit rounding direction.
- Round in favor of protocol safety, then document user impact.
- Test first depositor, last withdrawer, tiny deposits, max deposits, and multi-user interleavings.

## Tests

- unauthorized config change
- paused protocol blocks risky actions
- wrong mint/token account
- duplicate mutable accounts
- zero amount
- max amount
- slippage failure
- share conservation after multiple users
- reward double claim
- stale oracle

## Mainnet blocker triggers

Require deeper audit when custody, leverage, liquidation, or multi-protocol CPI chains are involved.

## Related

- `defi-deep-dive.md` for AMM models, lending mechanics, liquid staking, perps, and yield strategies.
- `security-checklist.md` for program-level safety checks.
- `test-plan.md` for exploit regression test design.
