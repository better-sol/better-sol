# Mobile Patterns

Use this reference when building Solana dApps for iOS, Android, or cross-platform mobile environments.

## Tools

- **Cross-platform**: React Native + Expo. Connect wallets via `@solana-mobile/mobile-wallet-adapter-protocol` (Solana Mobile Stack), Reown AppKit (`@reown/appkit-react-native`, `@reown/appkit-solana-react-native`), Privy (`@privy-io/expo`), or Dynamic (`@dynamic-labs/react-hooks`).
- **Native iOS**: Solana Swift SDK with the mobile wallet adapter protocol.
- **Native Android**: Solana Kotlin SDK with the mobile wallet adapter protocol.
- **Wallet adapters**: `@solana-mobile/mobile-wallet-adapter-protocol` for Solana-native mobile wallets (Solflare, Phantom, Backpack). Reown AppKit for WalletConnect-based multi-chain mobile connections. Privy and Dynamic for embedded wallets and email/social login on mobile.
- **Transaction construction**: the Better Sol typed client works in React Native. Import program definitions and call `betterSol()` with a mobile signer.

## Architecture

### Shared program definitions

Keep Better Sol program definitions in a shared package imported by mobile, web, backend scripts, and tests. Mobile code should use read-only clients for public screens and signer-scoped clients for wallet actions.

```
packages/
  programs/          ← shared Better Sol definitions
  client/            ← shared typed client utilities
apps/
  web/               ← Next.js or TanStack Start
  mobile/            ← React Native + Expo
  backend/           ← server-side scripts
```

### Mobile-specific layers

- **Presentation**: React Native components for screens, navigation, and platform-specific UI
- **State**: same state management as web (TanStack Query, Zustand) adapted for mobile lifecycle
- **Wallet**: mobile wallet adapter protocol or WalletConnect for signing
- **Network**: same RPC calls via the Better Sol typed client

## Mobile wallet UX

### Signing flow

Every signing flow shows:

1. **Active wallet**: name and truncated address of the connected wallet
2. **Cluster badge**: "devnet" or "mainnet" clearly visible
3. **Action summary**: what the transaction does, in plain language
4. **Token mint and amount**: full token symbol, not just an icon
5. **Recipient or counterparty**: who receives the tokens or interaction
6. **Fee or slippage**: estimated network fee and slippage if applicable
7. **Irreversible effects**: label any action that cannot be undone
8. **Status states**: preparing → signing → submitted → confirming → confirmed or failed

### Deep linking

Handle inbound deep links from wallet apps:

- Parse the callback URL for transaction signature or error
- Update the app state based on the callback result
- Handle the case where the user returns without completing (timeout after 5 minutes)
- Handle the case where the user switches apps during signing (background/foreground lifecycle)

### Biometric authentication

For apps that cache wallet authorization:

- Use the device biometric prompt (Face ID, fingerprint) before showing private data or initiating transactions
- Never store the actual private key; store an auth token or session reference
- Clear the session on biometric failure or device lock

## Failure cases

Handle every mobile-specific failure mode:

| Failure | Detection | Recovery |
|---|---|---|
| Wallet disconnected | Wallet adapter event listener | Show reconnect prompt |
| Wallet changes during flow | Address comparison before submit | Cancel and restart |
| App backgrounded during signing | App lifecycle listener | Check transaction status on foreground |
| Deep link returns late | Timestamp comparison | Check if transaction already confirmed |
| Network failure after submission | RPC timeout | Poll for confirmation with signature |
| Duplicate tap on submit | Debounce or disable button | Prevent duplicate submission |
| Slow confirmation | Timeout after 60s | Show "pending" with manual refresh |
| Wrong cluster | Cluster comparison | Prompt to switch |

## Testing matrix

Test on this combination at minimum:

- iOS (latest) with at least one Solana wallet installed
- Android (latest) with at least one Solana wallet installed
- Devnet smoke test: connect, sign, confirm
- Poor network simulation (Airplane mode toggle during flow)
- App restart during a pending transaction
- Background and foreground during signing

### Testing tools

- **Expo Go**: quick iteration on device without building
- **EAS Build**: cloud builds for TestFlight and Play Store internal testing
- **Detox**: end-to-end testing for React Native
- **Maestro**: mobile UI testing with YAML flows

## Platform-specific patterns

### iOS

- Respect safe area insets for all wallet and transaction UI
- Use SF Symbols for icons where possible (consistent with system look)
- Handle Face ID permission prompts gracefully
- Support dynamic type for accessibility
- Test on both notched and non-notched devices

### Android

- Handle system back button in all flows
- Support material design bottom sheets for transaction review
- Handle split-screen and multi-window modes
- Test on both gesture navigation and three-button navigation

## Security

Never embed in mobile code:

- Keypair JSON files
- Seed phrases
- Private keys
- Backend admin credentials
- API keys with write access

Use the mobile wallet adapter protocol for all signing. The private key never leaves the wallet app.

### Secure storage

For any tokens or session data that must be persisted:

- iOS: Keychain via `expo-secure-store` or `react-native-keychain`
- Android: EncryptedSharedPreferences via `expo-secure-store` or `react-native-encrypted-storage`
- Never use `AsyncStorage` for sensitive data

## Performance

### RPC optimization

- Batch account fetches with `getMultipleAccounts` when possible
- Cache read-only data (token metadata, program addresses) aggressively
- Use WebSocket subscriptions for real-time data instead of polling
- Implement request deduplication for parallel component mounts

### Bundle size

- Tree-shake the Better Sol client (only import used programs)
- Use dynamic imports for heavy screens
- Lazy-load wallet adapter libraries
- Monitor bundle size with `expo-bundle-analyzer`

## Decision framework

### Choose the mobile wallet model

| User type | Wallet model | Why |
|---|---|---|
| Crypto-native trader | External wallet via mobile wallet adapter | User already trusts Phantom, Solflare, Backpack, or hardware-backed wallet flows |
| Consumer app user | Embedded wallet via Privy or Dynamic | Lowest onboarding friction, email/social login, no extension install |
| Multi-chain power user | Reown AppKit | One mobile connection layer for Solana, EVM, and Bitcoin |
| High-value finance user | External wallet plus hardware support | Keeps custody outside the app and reduces app compromise blast radius |

Decision rule: optimize for custody clarity before convenience. If the app can lose user funds through a compromised mobile session, prefer external wallet signing and explicit transaction review.

### Mobile threat model

Mobile dApps have different attacker assumptions than desktop dApps:

- The app can be backgrounded during signing and resumed later with stale state.
- Deep links can be spoofed or replayed if callback state is not bound to a nonce.
- Screenshots and app switcher previews can expose balances, addresses, or pending trades.
- Clipboard-based address entry can be poisoned by malware or keyboard extensions.
- Push notifications can trick users into opening a signing flow out of context.

For every signing request, bind the preview to a local transaction intent ID:

| Field | Purpose |
|---|---|
| `intentId` | Correlates preview, wallet handoff, callback, and confirmation |
| `walletAddress` | Cancels flow if wallet changes during signing |
| `cluster` | Prevents devnet/mainnet confusion |
| `createdAt` | Expires stale signing requests |
| `expectedAccounts` | Detects mutation between preview and submit |

### Critical thinking checklist

Before shipping mobile signing, answer these questions:

- What happens if the user backgrounds the app after signing but before confirmation?
- Can a deep link callback from an old request change the current screen state?
- Does the user see the same amount, mint, recipient, and authority in-app that the wallet asks them to sign?
- Can a push notification open directly into a signing action without context?
- Does biometric unlock protect sensitive data only, or does it incorrectly imply transaction authorization?
- Is every pending transaction recoverable after app restart?

## Related

- `dapp-state-management.md` for state patterns applicable to mobile.
- `transaction-ux.md` for signing flow states and error handling.
- `wallet-connection.md` for Reown, Privy, Dynamic, and Solana Wallet Adapter setup.
- `multi-chain-ui.md` for multi-wallet connection patterns.
- `web3-dapp-architecture.md` for overall dApp architecture decisions.
