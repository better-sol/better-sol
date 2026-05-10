# Stablecoins and Real-World Assets (RWAs)

Use this reference when building stablecoin integrations, tokenized real-world assets, compliance-aware token flows, or fiat-bridge dApps.

## Stablecoin types

### Fiat-backed

Reserves of fiat currency back the token supply. USDC and USDT on Solana are the most common. Issuer controls mint and freeze authority.

Characteristics:

- Price stability depends on issuer solvency and redemption access.
- Freeze authority allows issuer to freeze specific token accounts.
- Compliance-friendly but centralized.
- Settlement speed is blockchain-speed; redemption speed depends on issuer.

### Crypto-backed

Overcollateralized crypto assets back the token. Dai (on Ethereum) is the canonical example.

Characteristics:

- Decentralized but requires overcollateralization.
- Subject to liquidation risk if collateral value drops.
- Oracle-dependent for collateral valuation.

### Algorithmic

Supply adjusts algorithmically to maintain peg. History includes failures (UST). Rarely used after 2022.

Characteristics:

- No reserve backing.
- Death spiral risk under extreme market conditions.
- Complex mechanism design requirements.

## Solana stablecoin ecosystem

- USDC (Circle): fiat-backed, native SPL Token, widely supported.
- USDT (Tether): fiat-backed, native SPL Token, widely supported.
- USDG (Glider): GSR-backed stablecoin on Solana.
- Bridged stablecoins: various wrapped stablecoins from other chains.

## Integration patterns

### Payment flow

Accept stablecoin as payment by verifying mint address, checking token account balance, and transferring to treasury. Always verify the exact mint address to prevent fake token attacks.

### Lending collateral

Accept stablecoin as collateral with predictable valuation. Lower volatility means lower liquidation risk and higher LTV ratios.

### Settlement

Use stablecoins for atomic settlement. No oracle needed for price if denominated in the stablecoin itself.

## Real-world asset tokenization

### Asset types

- Treasury bills and bonds.
- Real estate.
- Commodities (gold, oil).
- Invoice factoring.
- Carbon credits.
- Private credit and loans.

### On-chain representation

Each RWA token represents a claim on an off-chain asset. The tokenization process involves:

1. Legal structure establishment (SPV, trust, or fund).
2. Asset acquisition and custodial arrangement.
3. Token minting proportional to asset value.
4. Compliance checks for transfers (KYC/AML).
5. Redemption process for token holders.

### Compliance-aware tokens

Use Token-2022 extensions for compliance:

- Transfer hook: enforce KYC/AML checks on every transfer.
- Default account state: freeze accounts until verified.
- Permanent delegate: allow issuer to recover tokens in regulatory scenarios.
- CPI guard: prevent unauthorized program interactions.

### Oracle requirements

RWA tokens need regular price updates reflecting underlying asset value. Oracle architecture:

- NAV calculation performed off-chain by authorized parties.
- Oracle updates posted on-chain at defined intervals.
- Programs enforce freshness requirements.
- Audits verify NAV calculation methodology.

## Regulatory considerations

- Jurisdiction-specific securities regulations.
- KYC/AML requirements for token holders.
- Transfer restrictions for non-accredited investors.
- Tax reporting obligations.
- Custody and bankruptcy remoteness.
- Cross-border compliance.

This reference does not provide legal advice. Consult qualified legal counsel for any RWA tokenization project.

## Better Sol integration

Use Better Sol programs when RWA flows need custom compliance logic: transfer restrictions, investment caps, accreditation verification, distribution waterfalls, or issuer-controlled operations that go beyond Token-2022 extensions.

## Related

- `tokens.md` for SPL Token and Token-2022 mechanics used in stablecoin and RWA implementations.
- `advanced-solana.md` for Token-2022 extension details including transfer hooks and default account state.
