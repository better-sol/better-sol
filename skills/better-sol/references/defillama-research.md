# DefiLlama Research

Use this reference when the task involves DeFi opportunity research, TVL analysis, protocol health, chain trends, or deciding whether to integrate a DeFi protocol.

## Tools

Use the DefiLlama API (`https://api.llama.fi`) for TVL, volume, and fees data. The API is free, unauthenticated, and returns JSON. No SDK needed; use `fetch` directly.

For live price data, use CoinGecko API (`https://api.coingecko.com/api/v3`). For on-chain data, use the Better Sol typed client or direct RPC calls.

## API endpoints

### Protocol listing

```ts
const protocols = await fetch("https://api.llama.fi/protocols").then(r => r.json())
```

Returns an array of all tracked protocols. Each entry includes:

| Field | Type | Description |
|---|---|---|
| `name` | string | Protocol display name |
| `slug` | string | URL slug for detail endpoint |
| `symbol` | string | Protocol token symbol |
| `tvl` | number | Current total value locked (USD) |
| `chainTvls` | object | TVL broken down by chain |
| `chains` | string[] | Chains where the protocol operates |
| `category` | string | Protocol category (DEX, Lending, etc.) |
| `change_1h` | number | TVL change in last hour (%) |
| `change_1d` | number | TVL change in last day (%) |
| `change_7d` | number | TVL change in last 7 days (%) |
| `mcap` | number | Market cap of protocol token |
| `fdv` | number | Fully diluted valuation |
| `url` | string | Protocol website |
| `gecko_id` | string | CoinGecko ID for price data |
| `audit_links` | string[] | Links to audit reports |

### Single protocol detail

```ts
const detail = await fetch(`https://api.llama.fi/protocol/${slug}`).then(r => r.json())
```

Returns historical TVL, current metrics, and methodology.

### Chain listing

```ts
const chains = await fetch("https://api.llama.fi/chains").then(r => r.json())
```

Returns TVL per chain. Useful for identifying which chains are growing.

### DEX overview

```ts
const dexs = await fetch("https://api.llama.fi/overview/dexs").then(r => r.json())
```

Returns aggregated DEX volume data across all protocols.

### Stablecoin overview

```ts
const stables = await fetch("https://api.llama.fi/overview/stables").then(r => r.json())
```

Returns stablecoin market share, supply, and chain distribution.

### Fees and revenue

```ts
const fees = await fetch("https://api.llama.fi/overview/fees").then(r => r.json())
```

Returns protocol fees and revenue rankings.

## Research workflow

### Step 1: Define scope

Identify the category and chain scope:

- Category: DEX, lending, liquid staking, yield, derivatives, RWA, bridge, stablecoin
- Chain: Solana-only, multi-chain, or cross-chain comparison
- Time range: current snapshot, 30-day trend, 90-day trend

### Step 2: Shortlist protocols

```ts
const protocols = await fetch("https://api.llama.fi/protocols").then(r => r.json())

const solanaDefi = protocols
  .filter(p => p.chains.includes("Solana"))
  .filter(p => p.tvl > 1_000_000)
  .sort((a, b) => b.tvl - a.tvl)
  .slice(0, 10)

console.table(solanaDefi.map(p => ({
  name: p.name,
  tvl: `$${(p.tvl / 1e6).toFixed(1)}M`,
  change_7d: `${p.change_7d?.toFixed(1)}%`,
  category: p.category,
})))
```

### Step 3: Rank by metrics

Score each protocol across:

| Metric | Weight | Source |
|---|---|---|
| TVL | 25% | DefiLlama `/protocols` |
| TVL growth (7d) | 15% | DefiLlama `/protocols` |
| Fees/revenue | 15% | DefiLlama `/overview/fees` |
| Volume (if DEX) | 10% | DefiLlama `/overview/dexs` |
| Security posture | 15% | Audit links + incident history |
| SDK/API quality | 10% | GitHub + docs review |
| Integration fit | 10% | Manual assessment |

### Step 4: Analyze top 3

For each top protocol, pull the detail endpoint and analyze:

```ts
const detail = await fetch(`https://api.llama.fi/protocol/${slug}`).then(r => r.json())

const tvlHistory = detail.tvl.slice(-30)
const avgTvl = tvlHistory.reduce((sum, d) => sum + d.totalLiquidityUSD, 0) / 30
const minTvl = Math.min(...tvlHistory.map(d => d.totalLiquidityUSD))
const maxTvl = Math.max(...tvlHistory.map(d => d.totalLiquidityUSD))

const volatility = (maxTvl - minTvl) / avgTvl
```

### Step 5: Recommend

For each protocol, output one of:
- **Integrate**: use the protocol as a dependency (CPIs, client calls)
- **Build**: create a Better Sol program alongside or on top
- **Avoid**: risk too high or fit too low

## Opportunity patterns

### Protocol wrapper

A better UI, safer flow, or specialized workflow around a trusted protocol. The protocol handles financial primitives; the wrapper handles user experience.

Examples:
- One-click position migration between lending protocols
- Risk-aware vault deposit flow with health factor display
- Treasury rebalancing dashboard with automated DCA
- Yield onboarding for non-DeFi users (explain, preview, execute)

### Protocol adapter

A Better Sol program stores product-specific state while calling the underlying protocol via CPI or client.

Examples:
- Rewards layer that tracks LP participation and distributes points
- Allowlisted vault access with per-user deposit caps
- User-specific automation config (stop-loss, take-profit)
- Campaign claim records for airdrop or incentive programs

### Data product

A dashboard, alerting system, or API derived from protocol data.

Examples:
- Whale position monitor (large liquidations, significant transfers)
- Lending rate alerts (notify when borrow rate drops below threshold)
- TVL/category trend reports (weekly summary of ecosystem changes)
- Risk exposure dashboard (aggregate user positions across protocols)

## Interpretation rules

- TVL is a trust signal, not proof of product quality. A protocol with $1B TVL can still have bad UX or poor docs.
- Fast TVL growth can mean real demand or temporary incentives. Check if growth comes from organic usage or incentive programs.
- High fees/revenue with stable TVL is often a stronger signal than TVL alone. Revenue means users are paying for the service.
- Multi-chain TVL can hide weak Solana-specific adoption. Always check `chainTvls["Solana"]` separately.
- A protocol with great TVL but stale SDKs may be a poor integration target for a hackathon or rapid development.
- New protocols with low TVL can still be good opportunities if user pain is obvious and risk is isolated.

## Red flags

- Recent unaudited upgrade after TVL growth (increased risk surface)
- TVL dominated by incentives that are ending soon (incoming TVL drop)
- No maintained SDK or integration examples (integration friction)
- Poor incident disclosure (transparency risk)
- Admin keys or upgrade authority unclear (centralization risk)
- Protocol requires unsupported wallet or token behavior (compatibility risk)

## Related

- `defi-deep-dive.md` for DeFi primitive mechanics and risk frameworks.
- `strategy.md` for competitive landscape mapping and positioning.
- `idea-bank.md` for product ideas derived from DeFi research.
