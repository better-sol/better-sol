# Token Patterns

## Token type decision

Use SPL Token by default for compatibility. Use Token-2022 only when extensions are required and downstream wallet/protocol compatibility has been checked.

## Launch checklist

- name, symbol, decimals
- supply cap and initial supply
- mint authority policy
- freeze authority policy
- metadata authority policy
- treasury and distribution wallets
- vesting or lockups
- airdrop/claim criteria
- sybil/bot controls
- liquidity plan
- legal/compliance constraints
- monitoring and revocation/incident plan

## Client mint/distribute flow

```ts
const { mint } = await sol.token.createMint({ decimals: 6 })
await sol.token.mintTo({ mint, to: treasury, amount: 1_000_000_000_000n })
await sol.token.transfer({ mint, to: recipient, amount: 10_000_000n })
```

## Program reward flow

Use a Better Sol program when rewards depend on custom state, eligibility, claims, or anti-bot checks.

State:

```text
RewardConfig: authority, reward_mint, allocation, paused
ClaimRecord: claimant, amount_claimed, claimed_at
```

Tests:

- eligible claim succeeds
- ineligible claim fails
- duplicate claim fails
- wrong mint fails
- wrong claimant/proof binding fails
- allocation cap cannot be exceeded

## Authority policy

- Retained single-key authority is fastest and riskiest.
- Multisig authority is preferred for production treasuries.
- Revoked mint authority maximizes supply trust but removes flexibility.
- Freeze authority should be retained only with a clearly stated reason.

## Token-2022 review

Check extension behavior for transfer fees, confidential transfers, CPI guard, close conditions, default account state, and wallet support.

## Related

- `advanced-solana.md` for Token-2022 extension details and implications.
- `stablecoins-and-rwas.md` for stablecoin and RWA token patterns.
- `nfts-and-metaplex.md` for NFT token mechanics.
