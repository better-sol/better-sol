# Stablecoins and Real-World Assets (RWAs)

Use this reference when building stablecoin integrations, tokenized real-world assets, compliance-aware token flows, or fiat-bridge dApps.

## Tools

- **Circle USDC**: native USDC on Solana. Interact via SPL Token (`@solana/spl-token`) or Better Sol's `sol.token.*` methods. Mint address: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- **Circle CCTP** (`@circle-fin/cctp`): burn-and-mint USDC transfers between chains without wrapping. Burn USDC on source, mint native USDC on destination.
- **Bridge** (now Stripe): fiat on/off ramps. `@bridge-sdk` for programmatic integration.
- **PayPal USD (PYUSD)**: SPL Token on Solana. Interact via `@solana/spl-token`.
- **USDT (Tether)**: SPL Token on Solana. Mint address: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`.
- **Saber Stableswap** (`@saberhq/stableswap-sdk`): AMM optimized for stablecoin-to-stablecoin swaps with minimal slippage.
- **Token-2022** (`@solana/spl-token`): extensions for confidential transfers, transfer fees, transfer hooks, and permanent delegate. Used for compliance-aware RWA tokens.

## Stablecoin types

### Fiat-backed

Reserves of fiat currency back the token supply. USDC and USDT on Solana are the most common.

Characteristics:
- Price stability depends on issuer solvency and redemption access
- Freeze authority allows issuer to freeze specific token accounts
- Compliance-friendly but centralized
- Settlement speed is blockchain-speed; redemption speed depends on issuer
- Regular attestation reports prove reserves

Integration pattern:

```ts
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address

const balance = await sol.token.getBalance({
  owner: walletAddress,
  mint: USDC_MINT,
})

await sol.token.transfer({
  mint: USDC_MINT,
  to: recipientAddress,
  amount: 100_000_000n,
})
```

### Crypto-backed

Overcollateralized crypto assets back the token. Dai (on Ethereum) is the canonical example. On Solana, crypto-backed stablecoins are less common but the pattern applies.

Characteristics:
- Decentralized but requires overcollateralization (typically 120-150%)
- Subject to liquidation risk if collateral value drops
- Oracle-dependent for collateral valuation
- Liquidation mechanisms must be robust under volatility

### Algorithmic

Supply adjusts algorithmically to maintain peg. History includes failures (UST/Luna collapse in 2022). Rarely used after 2022.

Characteristics:
- No reserve backing
- Death spiral risk under extreme market conditions
- Complex mechanism design requirements
- Generally avoided by builders after 2022

## Solana stablecoin ecosystem

| Stablecoin | Type | Mint address | Freeze authority |
|---|---|---|---|
| USDC (Circle) | Fiat-backed | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Yes (Circle) |
| USDT (Tether) | Fiat-backed | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | Yes (Tether) |
| PYUSD (PayPal) | Fiat-backed | `2b1kV6DkPAnxd5ainfnZYE2u149DHqkz5LxzLs7Lah7B` | Yes (PayPal) |
| USDG (Glider) | Fiat-backed | varies | Yes |

Always verify the exact mint address before accepting stablecoin payments. Attackers create fake tokens with similar names.

## Integration patterns

### Payment acceptance

```ts
const MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const

async function acceptPayment(mint: Address, expectedAmount: bigint, buyer: Address) {
  if (mint !== MINTS.USDC && mint !== MINTS.USDT) {
    throw new Error("Unsupported stablecoin")
  }

  const balance = await sol.token.getBalance({ owner: buyer, mint })
  if (balance < expectedAmount) {
    throw new Error("Insufficient balance")
  }

  await sol.token.transfer({ mint, to: treasuryAddress, amount: expectedAmount })
}
```

### Lending collateral

Accept stablecoin as collateral with predictable valuation. Lower volatility means:
- Higher loan-to-value ratios (80-90% vs 50-70% for volatile assets)
- Lower liquidation risk
- Simpler risk management

### Settlement

Use stablecoins for atomic settlement. No oracle needed for price if denominated in the stablecoin itself. The value is always 1:1 with the fiat unit.

## Real-world asset tokenization

### Asset types suitable for tokenization

| Asset | Tokenization complexity | Regulatory burden | Market size |
|---|---|---|---|
| Treasury bills | Medium | High | $25T+ |
| Real estate | High | High | $300T+ |
| Commodities (gold) | Medium | Medium | $15T+ |
| Invoice factoring | Low | Medium | $3T+ |
| Carbon credits | Low | Medium | $2B+ |
| Private credit | High | High | $1.5T+ |
| Art and collectibles | Medium | Low | $500B+ |

### On-chain representation

Each RWA token represents a claim on an off-chain asset. The tokenization process:

1. **Legal structure**: establish an SPV, trust, or fund that holds the underlying asset
2. **Asset acquisition**: purchase the asset and place it in custodial arrangement
3. **Token minting**: mint tokens proportional to asset value or fractional shares
4. **Compliance checks**: enforce KYC/AML on every transfer
5. **Redemption process**: allow token holders to redeem for the underlying asset
6. **NAV updates**: regular price updates reflecting asset valuation

### Token-2022 extensions for RWAs

Token-2022 provides extensions that are particularly useful for RWA tokens:

**Transfer hook**: execute custom logic on every transfer. Use for KYC/AML verification:

```ts
// The transfer hook program checks if both sender and receiver are verified
// before allowing the transfer to proceed
```

**Default account state**: new token accounts start frozen. Holder must complete verification before the account is thawed:

```ts
// Accounts are frozen by default
// Issuer thaws after KYC/AML check passes
```

**Permanent delegate**: issuer can move tokens from any account. Use for regulatory compliance (forced redemption, court orders):

```ts
// Issuer retains ability to recover tokens in regulatory scenarios
```

**CPI guard**: prevent unauthorized programs from interacting with token accounts. Reduces attack surface for compliance-critical tokens.

**Transfer fee**: embed a fee on every transfer. Use for management fees on tokenized funds.

### Oracle requirements for RWAs

RWA tokens need regular price updates reflecting underlying asset value:

- NAV calculation performed off-chain by authorized parties (auditors, fund administrators)
- Oracle updates posted on-chain at defined intervals (daily for T-bills, monthly for real estate)
- Programs enforce freshness requirements
- Audits verify NAV calculation methodology

```ts
ctx.require(currentSlot - navOracle.lastUpdatedSlot < maxStaleness, "StaleNAV")
ctx.require(navOracle.confidence < maxVariance, "NAVUncertain")
```

## Regulatory considerations

This reference does not provide legal advice. Key areas to consult qualified legal counsel:

- **Securities classification**: many RWA tokens may be classified as securities under local law (Howey test in the US, MiCA in the EU)
- **KYC/AML**: most jurisdictions require identity verification for RWA token holders
- **Transfer restrictions**: some assets can only be held by accredited or qualified investors
- **Tax reporting**: token holders may have tax obligations from holding or trading RWA tokens
- **Custody**: asset custody must be bankruptcy-remote from the token issuer
- **Cross-border compliance**: different rules apply when token holders are in different jurisdictions
- **Anti-money laundering**: transaction monitoring and suspicious activity reporting may be required

## Better Sol integration

Use Better Sol programs when RWA flows need custom compliance logic that goes beyond Token-2022 extensions:

- Investment caps per investor category
- Accreditation verification with on-chain attestations
- Distribution waterfalls (proceeds split according to waterfall tiers)
- Issuer-controlled operations (redemptions, force-majeure actions)
- Multi-asset portfolio tracking with rebalancing rules

## Related

- `tokens.md` for SPL Token and Token-2022 mechanics.
- `advanced-solana.md` for Token-2022 extension details.
- `cross-chain.md` for CCTP cross-chain stablecoin transfers.
- `oracles-and-external-data.md` for price feed integration.
