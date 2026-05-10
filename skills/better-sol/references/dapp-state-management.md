# dApp State Management

Use this reference when designing how a crypto frontend manages wallet state, on-chain data, caching, optimistic updates, and real-time subscriptions.

## State domains

```text
┌─────────────────────────────────────────────┐
│  UI state                                   │
│  Form inputs, modals, selection, navigation │
├─────────────────────────────────────────────┤
│  Wallet state                               │
│  Connection, address, chain, balance        │
├─────────────────────────────────────────────┤
│  On-chain state                             │
│  Account data, token balances, program data │
├─────────────────────────────────────────────┤
│  Transaction state                          │
│  Pending, signing, confirming, finalized    │
├─────────────────────────────────────────────┤
│  Cached / indexed state                     │
│  History, analytics, search, aggregations   │
└─────────────────────────────────────────────┘
```

Each domain has different freshness requirements, update mechanisms, and failure modes. Do not merge them into a single global store.

## Wallet state

Track:

- connection status: disconnected, connecting, connected, error
- active address
- chain/network
- supported chains
- balance (native token)

Wallet state changes are event-driven. Subscribe to wallet events:

- connect: new wallet connected
- disconnect: wallet removed
- accountChange: active account changed
- chainChange: network switched

Reset all dependent state when the wallet disconnects or changes account. Stale wallet state is a common source of bugs.

## On-chain state

### Fetching

- Use the Better Sol typed client for program account fetches.
- Batch multiple fetches where possible.
- Handle null/missing accounts gracefully.
- Cache with TTL appropriate to the data volatility.

### Subscriptions

- Subscribe to accounts that change frequently.
- Handle subscription errors and reconnects.
- Debounce rapid updates.
- Fall back to polling if WebSocket is unavailable.

### Staleness indicators

- Show when data was last fetched.
- Disable actions that depend on stale state for financial operations.
- Auto-refresh before critical operations.

## Transaction state machine

```text
idle → preparing → awaiting-signature → submitted → confirming → confirmed
                  ↘ rejected          ↘ timeout   ↘ failed
```

Each state should have distinct UI:

- idle: action button enabled
- preparing: loading indicator, button disabled
- awaiting-signature: wallet prompt notice, button disabled
- submitted: spinner, transaction hash if available
- confirming: progress indicator
- confirmed: success state, explorer link
- rejected: clear rejection message, re-enable action
- failed: error details, retry option
- timeout: ambiguous state notice with explorer link

## Optimistic updates

Update UI state before on-chain confirmation for responsiveness. Roll back on failure.

Rules:

- Only optimistic-update when the expected outcome is predictable.
- Show a visual indicator that the update is pending confirmation.
- Roll back immediately on failure.
- Resolve to confirmed state when on-chain data matches.
- Do not optimistic-update irreversible financial operations that could double-spend.

## Caching strategy

### Account data

- Cache per address with TTL.
- Invalidate on confirmed transactions that mutate the account.
- Use `getTokenAccountBalance` for token balances with short TTL.

### Transaction history

- Fetch from indexer or RPC, not from on-chain scanning.
- Paginate and cache pages.
- Invalidate on new confirmed transactions.

### Metadata

- Token metadata, NFT metadata, and program definitions change rarely.
- Cache aggressively with long TTL.
- Refresh on explicit user action or version mismatch.

## Error handling

### RPC errors

- Rate limit: exponential backoff with jitter.
- Node error: retry with different RPC endpoint.
- Timeout: show timeout UI with retry option.

### Transaction errors

- Simulation failure: parse logs, show specific error.
- Wallet rejection: clear rejection message.
- Program error: map error code to user-readable message.

### State errors

- Account not found: show empty state, offer initialization.
- Deserialization failure: show error with option to refresh.
- Network mismatch: show cluster mismatch warning.

## Cross-chain state

If the dApp operates on multiple chains:

- Separate state stores per chain.
- Cross-chain operations track state on both chains.
- Bridge operations show progress on source and destination.
- Reconcile cross-chain state through linked identifiers.

## Related

- `transaction-ux.md` for transaction states and error handling that apply to all dApps.
- `multi-chain-ui.md` for multi-chain wallet, address, and state display patterns.
- `web3-dapp-architecture.md` for broader dApp architecture context.
