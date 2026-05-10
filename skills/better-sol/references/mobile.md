# Mobile Patterns

## Architecture

Keep Better Sol program definitions in a shared package imported by mobile, web, backend scripts, and tests. Mobile code should use read-only clients for public screens and signer-scoped clients for wallet actions.

## Mobile wallet UX

Every signing flow shows:

- active wallet
- cluster
- action summary
- token mint and amount
- recipient/counterparty
- fee/slippage if relevant
- irreversible effects
- status: preparing, signing, submitted, confirming, confirmed, failed

## Failure cases

- wallet disconnected
- wallet changes during flow
- app backgrounded during signing
- deep link returns late
- network failure after submission
- duplicate tap on submit
- slow confirmation
- wrong cluster

## Testing matrix

- iOS and Android if both are supported
- at least one real wallet
- devnet smoke test
- poor network simulation
- app restart during pending transaction

## Security

Never embed keypair JSON, seed phrases, private keys, or backend admin credentials in mobile code.

## Related

- `dapp-state-management.md` for state domains, caching, and transaction state machines applicable to mobile.
- `transaction-ux.md` for signing flow states and error handling.
