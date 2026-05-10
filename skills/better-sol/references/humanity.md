# Humanity and Sybil Resistance

## Decide enforcement point

- Frontend gate: low security, UX only.
- Backend gate: rate limits, off-chain allowlists, API protection.
- On-chain allowlist/claim record: strongest for airdrops and mints.
- Manual review: high-value ambiguous cases.

## Threat model

- scripted claims
- wallet farming
- duplicate identities
- proof replay
- stolen proof
- collusion
- denial of service against verification API

## Better Sol account model

```text
GateConfig: authority, verifier, root_or_provider, paused, expires_at
ClaimRecord: wallet, claimed, amount, proof_hash, claimed_at
```

## Flow

1. User verifies off-chain.
2. Backend validates provider response and binds it to wallet.
3. Backend writes allowlist/proof or returns signed claim payload.
4. Better Sol program verifies eligibility and marks claim record.
5. Duplicate claims fail.

## Tests

- verified wallet succeeds
- unverified wallet fails
- proof for another wallet fails
- expired proof fails
- duplicate claim fails
- paused gate blocks claims
- provider outage has safe UX fallback

## Privacy

Store the minimum data needed. Avoid persisting raw identity provider payloads unless required. Document retention and appeal paths.

## Related

- `oracles-and-external-data.md` for attestation services and off-chain verification patterns.
- `tokens.md` for airdrop and claim distribution mechanics.
