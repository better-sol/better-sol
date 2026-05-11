# DeFi Patterns

Use this reference when building or integrating DeFi applications on Solana: DEX routes, lending flows, staking, vaults, perps, escrow, rewards, and yield automation.

## Tools

Use existing audited protocols when the primitive is already solved:

- **DEX/AMM**: Raydium SDK (`@raydium-io/raydium-sdk-v2`), Orca Whirlpools (`@orca-so/whirlpools-sdk`), Phoenix (`@ellipsis-labs/phoenix-sdk`)
- **Lending**: MarginFi (`@mrgnlabs/marginfi-client-v2`), Kamino (`@hubbleprotocol/kamino-lending-sdk`)
- **Liquid staking**: Marinade, Jito Stake Pool (`@jito/stake-pool-sdk`), Sanctum
- **Perpetuals**: Drift (`@drift-labs/sdk`), OpenBook/Phoenix-style orderbook integrations
- **Market data**: Pyth, Switchboard, DefiLlama, custom indexers
- **Better Sol interop**: import Anchor-compatible IDLs with `fromIdl(idl)` from `better-sol`, not `bs.import.*`

Treat external SDK examples as integration boundaries. Verify exact SDK methods against current protocol docs before coding.

## Build vs integrate

### Integrate when

- The product is a route, dashboard, portfolio view, automation layer, or safer UI around an existing protocol.
- The product does not need custom custody, settlement, or state transitions.
- The primitive is already audited and liquid: swap, lend, borrow, stake, LP, or perp trade.
- Your value is UX, routing, analytics, compliance, automation, or distribution.

### Build a custom Better Sol program when

- You need app-specific state: rewards, claims, attestations, permissions, escrow records, or vault accounting.
- Existing protocols cannot enforce your invariant.
- You need atomic custom settlement across several instructions.
- You need verifiable program-owned records users can inspect without trusting your backend.

### Use a hybrid when

Most serious DeFi products are hybrid:

```text
User → Frontend → Better Sol app program → existing DeFi protocol
                         ↓
                  app-specific state
```

The external protocol handles the hard financial primitive. Your Better Sol program stores the product-specific state that makes the experience unique.

## Invariant-first design

Before choosing accounts or instructions, write the invariant. Good DeFi code is accounting discipline made executable.

| Pattern | Core invariant |
|---|---|
| Rewards | Total rewards minted cannot exceed authorized budget |
| Vault | Total shares map consistently to total underlying assets |
| Escrow | Funds can only move to buyer, seller, or refund path |
| Allowlisted vault | User deposits never exceed their cap |
| Liquidation helper | Liquidation cannot worsen protocol solvency |
| Rebalancer | Strategy changes cannot bypass user withdrawal rights |

If you cannot state the invariant in one sentence, the design is not ready.

## Protocol wrapper pattern

A wrapper improves the experience around an existing protocol without taking custody.

Examples:

- Safer deposit screen that shows health factor, liquidation price, and withdrawal delay.
- One-click staking flow that creates accounts, stakes, and records the position.
- Portfolio dashboard that aggregates lending, LP, and staking positions.
- Treasury tool that proposes rebalances but requires multisig approval.

Action checklist:

- [ ] Identify which protocol owns custody.
- [ ] Identify what your app stores, if anything.
- [ ] Simulate the protocol transaction before wallet signing.
- [ ] Show every account, token mint, slippage, fee, and authority change in the preview.
- [ ] Handle protocol failure without corrupting app state.

## Protocol adapter pattern

An adapter stores product-specific state while external protocols perform the financial operation.

### Rewards layer

```ts
import { bs } from "better-sol/program"

const RewardPosition = bs.account({
  user: bs.pubkey(),
  protocolPosition: bs.pubkey(),
  depositedAmount: bs.u64(),
  rewardRate: bs.u64(),
  lastClaimTimestamp: bs.u64(),
  totalClaimed: bs.u64(),
}).derive((seed) => ["reward", seed.user, seed.protocolPosition])
```

Use when the underlying DeFi position exists elsewhere, but your app needs to track incentives.

Risk questions:

- Can users spoof `protocolPosition`?
- Does `depositedAmount` come from trusted on-chain state or user input?
- Can rewards be claimed after the external position is withdrawn?
- Is reward emission capped by a budget account?

### Allowlisted vault access

```ts
const VaultAccess = bs.account({
  vault: bs.pubkey(),
  user: bs.pubkey(),
  maxDeposit: bs.u64(),
  deposited: bs.u64(),
}).derive((seed) => ["access", seed.vault, seed.user])
```

Use when a vault exists but deposit eligibility is product-specific.

Risk questions:

- Who can create or update access records?
- Can `deposited` be reduced incorrectly?
- Does the cap apply per wallet, per identity, or per organization?
- What happens if the vault strategy changes risk level?

## Data product pattern

A data product reads DeFi state without controlling funds.

Examples:

- Whale liquidation monitor
- Lending rate comparison dashboard
- LP impermanent loss analytics
- Treasury risk dashboard
- Perps funding-rate alert system

This pattern has lower custody risk but high correctness risk. A wrong dashboard can still cause user losses.

Data quality checklist:

- [ ] Source protocols are listed.
- [ ] Data freshness is visible.
- [ ] Stale data disables action buttons.
- [ ] USD values show oracle source and timestamp.
- [ ] Historical calculations define methodology.
- [ ] Alerts include confidence and false-positive expectations.

## DeFi threat model

### Price manipulation

Do not use a single thin DEX spot price for critical decisions. Prefer oracle feeds with confidence intervals or TWAPs over sufficient liquidity.

Questions:

- How much liquidity is required to move the price by 10%?
- Can the attacker reverse the manipulation in the same transaction?
- Does the protocol rely on the manipulated price for borrowing, liquidation, or reward calculation?

### Flash loans

Any same-transaction balance or price check can be gamed. If eligibility matters, require time-weighted balance, locked deposits, or delayed activation.

### Slippage and MEV

Every swap route must include slippage limits. Large trades need route splitting, limit orders, or TWAP execution. Priority fees reduce latency but do not remove MEV risk.

### Oracle failure

Define behavior when prices are stale, uncertain, or unavailable:

| Action | Failure policy |
|---|---|
| Deposit | Allow if no leverage is created |
| Borrow | Reject |
| Liquidate | Reject unless oracle is fresh and confidence is tight |
| Withdraw | Allow with reduced limits if solvency remains safe |
| Rebalance | Pause |

### Liquidity failure

A protocol can be solvent but illiquid. Test withdrawals under low liquidity, not only normal conditions.

## Integration decision checklist

Before integrating a protocol:

- [ ] Maintained SDK or stable IDL exists.
- [ ] Docs include working examples.
- [ ] Program IDs are verified for the target cluster.
- [ ] Upgrade authority is known.
- [ ] Audits and incident history are reviewed.
- [ ] TVL and liquidity are sufficient for the intended user size.
- [ ] Token standards are compatible (SPL Token vs Token-2022).
- [ ] Failure paths are understood: paused protocol, oracle outage, insufficient liquidity.
- [ ] User preview explains protocol risk, not only transaction mechanics.

## When to say no

Avoid an integration if:

- The SDK is stale and protocol docs are incomplete.
- Admin controls are unclear.
- TVL is mostly temporary incentives.
- The protocol requires blind signing or opaque transactions.
- Your app would inherit insolvency risk without users understanding it.
- The core user problem can be solved off-chain with less risk.

## Related

- `defi-deep-dive.md` for primitive mechanics, invariants, and stress testing.
- `tokens.md` for SPL Token and Token-2022 operations.
- `oracles-and-external-data.md` for price feed integration patterns.
- `data-pipelines.md` for indexing DeFi protocol data.
- `economic-security.md` for incentive and attack-cost analysis.
