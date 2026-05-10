# Threat Model Guide

## Assets

Identify protected assets:

- user funds
- treasury funds
- mint authority
- upgrade authority
- private keys and keypair files
- API keys and RPC credentials
- allowlists or human-verification decisions
- indexed data integrity

## Trust boundaries

Map each boundary:

- browser wallet to app frontend
- frontend to backend API
- backend to RPC provider
- backend to database
- deploy machine to mainnet
- Better Sol compiler/deploy flow
- third-party protocol CPI or SDK
- webhook/indexer provider

## STRIDE prompts

- Spoofing: Can an attacker impersonate an authority, wallet, webhook, or token account?
- Tampering: Can they change account state, instruction args, IDL data, env config, or deployment artifacts?
- Repudiation: Are important actions logged with transaction signatures and events?
- Information disclosure: Are secrets, user data, or private wallet details exposed in logs or bundles?
- Denial of service: Can large inputs, remaining accounts, realloc, RPC failures, or retries break the flow?
- Elevation of privilege: Can a user become admin, mint authority, upgrade authority, or claim authority?

## Operational checks

- Secrets are not committed in `.env`, keypair JSON, logs, screenshots, build artifacts, or docs.
- CI does not expose deployment keys to pull requests from forks.
- Dependencies are pinned and lockfiles are reviewed.
- Mainnet deployment requires explicit cluster, payer, program ID, and authority confirmation.
- Upgrade authority policy is written down: retained, multisig, timelock, or revoked.
- Monitoring covers transaction failures, unexpected events, balance changes, and RPC errors.

## Related

- `cross-chain-security.md` for attack patterns that span multiple chains.
- `economic-security.md` for incentive-based threats not visible in code.
