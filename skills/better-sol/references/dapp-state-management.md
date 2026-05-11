# dApp State Management

Use this reference when designing how a crypto frontend manages wallet state, on-chain data, caching, optimistic updates, and real-time subscriptions.

## Tools

- **Server state**: TanStack Query (`@tanstack/react-query`) for caching on-chain data, polling account state, and managing RPC request deduplication
- **Client state**: Zustand for global UI state (wallet, theme, cluster) or React Context for small apps
- **Wallet state**: Solana Wallet Adapter (`@solana/wallet-adapter-react`), Reown AppKit (`@reown/appkit/react`), Privy (`@privy-io/react-auth`), or Dynamic (`@dynamic-labs/sdk-react-core`) depending on onboarding needs
- **Form state**: React Hook Form (`react-hook-form`) with Zod validation for transaction forms
- **Real-time subscriptions**: `@solana/kit` WebSocket subscriptions (`onLogs`, `onAccountChange`) via TanStack Query's subscription integration
- **Optimistic updates**: TanStack Query `useMutation` with `onMutate` for cache roll-forward and `onError` for rollback

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

### What to track

```ts
interface WalletState {
  status: "disconnected" | "connecting" | "connected" | "error"
  address: string | null
  chain: ChainType
  supportedChains: ChainType[]
  balance: bigint | null
  connectorName: string | null
}
```

### Event-driven updates

Wallet state changes are event-driven. Solana Wallet Adapter exposes `connected`, `publicKey`, `wallet`, `connect`, and `disconnect`. Reown exposes `useAppKitAccount()`. Privy exposes `usePrivy()` and Solana `useWallets()`. Dynamic exposes `useDynamicContext()` with `primaryWallet` and `user`.

Subscribe to wallet events:

- **connect**: new wallet connected. Update address, chain, and fetch balance.
- **disconnect**: wallet removed. Reset all wallet state and all dependent on-chain state.
- **accountChange**: active account changed. Update address and re-fetch account-specific data.
- **chainChange**: network switched. Update chain and re-fetch chain-specific data.

Critical rule: reset all dependent state when the wallet disconnects or changes account. Stale wallet state is one of the most common dApp bugs. A user who disconnects and reconnects with a different wallet should see the new wallet's data, not the old wallet's cached data.

### Implementation with Zustand

```ts
import { create } from "zustand"

const useWalletStore = create<WalletState>((set) => ({
  status: "disconnected",
  address: null,
  chain: "solana",
  supportedChains: ["solana"],
  balance: null,
  connectorName: null,
  connect: async (adapter) => {
    set({ status: "connecting" })
    try {
      await adapter.connect()
      set({
        status: "connected",
        address: adapter.publicKey?.toString() ?? null,
        connectorName: adapter.name,
      })
    } catch {
      set({ status: "error" })
    }
  },
  disconnect: () => {
    set({
      status: "disconnected",
      address: null,
      balance: null,
      connectorName: null,
    })
  },
}))
```

## On-chain state

### Fetching with TanStack Query

```ts
function useCounterAccount(address: string) {
  return useQuery({
    queryKey: ["counter", address],
    queryFn: () => sol.counter.accounts.Counter.fetch(address),
    enabled: !!address,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}
```

Best practices:
- Use the Better Sol typed client for program account fetches
- Batch multiple fetches with `Promise.all` where possible
- Handle null/missing accounts gracefully (show empty state)
- Set `staleTime` based on how often the data changes
- Use `refetchInterval` for accounts that change frequently

### WebSocket subscriptions

```ts
function useCounterSubscription(address: string) {
  return useQuery({
    queryKey: ["counter", address, "live"],
    queryFn: ({ signal }) => {
      return new Promise((resolve) => {
        const abortController = new AbortController()
        rpcSubscriptions
          .accountNotifications(address, { commitment: "confirmed" })
          .subscribe({ abortSignal: abortController.signal })
          .then(async (stream) => {
            for await (const notification of stream) {
              queryClient.setQueryData(
                ["counter", address],
                decodeCounter(notification.value.data)
              )
            }
          })
        signal.addEventListener("abort", () => abortController.abort())
      })
    },
    enabled: !!address,
  })
}
```

### Handling subscriptions at scale

- Subscribe to accounts that change frequently (balances, positions)
- Handle subscription errors and reconnects with exponential backoff
- Debounce rapid updates (batch UI re-renders)
- Fall back to polling if WebSocket is unavailable
- Unsubscribe when the component unmounts or the account changes

### Staleness indicators

Show users when data might be outdated:
- Timestamp of last fetch (e.g., "Updated 5 seconds ago")
- Disable actions that depend on stale state for financial operations
- Auto-refresh before critical operations (e.g., fetch latest balance before a swap)

## Transaction state machine

```text
idle → preparing → awaiting-signature → submitted → confirming → confirmed
                  ↘ rejected          ↘ timeout   ↘ failed
```

### Implementation

```ts
type TransactionStatus =
  | { state: "idle" }
  | { state: "preparing" }
  | { state: "awaiting-signature" }
  | { state: "submitted"; signature: string }
  | { state: "confirming"; signature: string }
  | { state: "confirmed"; signature: string; slot: bigint }
  | { state: "failed"; signature: string; error: string }
  | { state: "rejected" }
  | { state: "timeout"; signature: string }
```

### UI for each state

| State | UI |
|---|---|
| idle | Action button enabled |
| preparing | Loading spinner, "Preparing transaction...", button disabled |
| awaiting-signature | Wallet prompt indicator, "Check your wallet...", button disabled |
| submitted | Spinner, "Transaction sent...", show hash if available |
| confirming | Progress indicator, "Confirming...", explorer link |
| confirmed | Checkmark, "Confirmed!", explorer link |
| failed | Error icon, specific error message, retry button |
| rejected | Info icon, "Transaction rejected in wallet", re-enable button |
| timeout | Warning icon, "Transaction may have succeeded", explorer link |

### Mutation with TanStack Query

```ts
function useTransferTokens() {
  return useMutation({
    mutationFn: async (params: { mint: Address; to: Address; amount: bigint }) => {
      return sol.token.transfer(params)
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["balance"] })
      const previousBalance = queryClient.getQueryData(["balance"])
      queryClient.setQueryData(["balance"], (old: bigint) => old - params.amount)
      return { previousBalance }
    },
    onError: (error, params, context) => {
      queryClient.setQueryData(["balance"], context?.previousBalance)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] })
    },
  })
}
```

## Optimistic updates

Update UI state before on-chain confirmation for perceived responsiveness. Roll back on failure.

Rules:
- Only optimistic-update when the expected outcome is predictable (e.g., balance after transfer)
- Show a visual indicator that the update is pending confirmation (pulsing dot, italic text)
- Roll back immediately on failure
- Resolve to confirmed state when on-chain data matches the optimistic update
- Do not optimistic-update irreversible financial operations that could double-spend

## Caching strategy

### Account data

- Cache per address with TTL (5-30 seconds for active data, minutes for stable data)
- Invalidate on confirmed transactions that mutate the account
- Use `getTokenAccountBalance` for token balances with short TTL
- Deduplicate concurrent requests for the same account

### Transaction history

- Fetch from an indexer (Helius, Triton, Quicknode) or dedicated API, not from on-chain scanning
- Paginate and cache pages
- Invalidate on new confirmed transactions
- Store recent transactions in memory for instant access

### Metadata (long TTL)

- Token metadata, NFT metadata, and program definitions change rarely
- Cache aggressively with long TTL (hours or days)
- Refresh on explicit user action or version mismatch
- Store in service worker cache for offline access

## Error handling

### RPC errors

| Error | Strategy |
|---|---|
| Rate limit (429) | Exponential backoff with jitter, rotate RPC endpoints |
| Node error (500) | Retry with different RPC endpoint, show degraded state |
| Timeout | Show timeout UI with retry option, do not assume failure |
| Invalid params | Log and surface to user, do not retry automatically |

### Transaction errors

| Error | Strategy |
|---|---|
| Simulation failure | Parse simulation logs, show specific error to user |
| Wallet rejection | Clear "rejected" message, re-enable the action button |
| Program error (custom) | Map program error code to user-readable message using the error definitions |
| Insufficient funds | Show balance and required amount, suggest acquiring more |

### State errors

| Error | Strategy |
|---|---|
| Account not found | Show empty state with initialization option |
| Deserialization failure | Show error with refresh option, log the raw data for debugging |
| Network mismatch | Show cluster mismatch warning with switch option |
| Stale data | Show staleness indicator, fetch latest before critical actions |

## Cross-chain state

If the dApp operates on multiple chains:

- Separate state stores per chain (do not mix Solana and EVM state)
- Cross-chain operations track state on both chains independently
- Bridge operations show progress on source and destination separately
- Reconcile cross-chain state through linked identifiers (bridge transaction ID)
- Use a shared transaction history view that merges chains sorted by timestamp

## Related

- `wallet-connection.md` for wallet provider choices and hook APIs.
- `transaction-ux.md` for transaction states and error handling.
- `multi-chain-ui.md` for multi-chain wallet, address, and state display patterns.
- `web3-dapp-architecture.md` for broader dApp architecture context.
- `brand-preview-workflow.md` for visual system that applies to all state display.
