# Wallet Connection

Use this reference when setting up wallet connection, authentication, embedded wallets, or multi-chain wallet UI in a dApp.

## Wallet options comparison

| Library | Chains | Platforms | Key feature |
|---|---|---|---|
| `@solana/wallet-adapter-react` | Solana only | Web | Lightweight, wallet-standard based |
| `@reown/appkit` (Reown) | Solana + EVM + Bitcoin | Web, React Native, Flutter | One modal for all chains, WalletConnect |
| `@privy-io/react-auth` (Privy) | Solana + EVM | Web, React Native | Email/social login with embedded wallets |
| `@dynamic-labs/sdk-react-core` (Dynamic) | Solana + EVM + others | Web, React Native | Multi-chain auth with embedded wallets |

## Solana Wallet Adapter

The standard lightweight option for Solana-only dApps. Connects via wallet-standard protocol (Phantom, Solflare, Backpack, etc.).

### Setup

```tsx
import type { ReactNode } from "react"
import { WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import "@solana/wallet-adapter-react-ui/styles.css"

const wallets = []

function App({ children }: { children: ReactNode }) {
  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </WalletProvider>
  )
}
```

### Hooks

```tsx
import { useWallet } from "@solana/wallet-adapter-react"

function WalletButton() {
  const {
    wallets,
    wallet,
    publicKey,
    connected,
    connecting,
    disconnecting,
    select,
    connect,
    disconnect,
    signTransaction,
    signMessage,
  } = useWallet()

  if (!connected) {
    return (
      <div>
        {wallets.map((w) => (
          <button key={w.adapter.name} onClick={() => select(w.adapter.name)}>
            {w.adapter.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div>
      <p>{publicKey?.toBase58()}</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  )
}
```

### When to use

- Solana-only dApps that do not need EVM or other chains
- Maximum simplicity with no external dependencies
- Works with any wallet that implements wallet-standard

## Reown AppKit

One modal for all chains. Supports Solana, EVM, and Bitcoin in a single connection flow. Works on web and React Native. Built on WalletConnect v2.

Packages:
- `@reown/appkit` (core)
- `@reown/appkit/react` (React bindings)
- `@reown/appkit-adapter-solana` (Solana adapter)
- `@reown/appkit-react-native` (React Native)
- `@reown/appkit-solana-react-native` (Solana on React Native)

### Web setup (React)

```tsx
import type { ReactNode } from "react"
import { createAppKit } from "@reown/appkit/react"
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react"
import { solana, solanaDevnet, solanaTestnet } from "@reown/appkit/networks"

const solanaAdapter = new SolanaAdapter()

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana, solanaDevnet, solanaTestnet],
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My dApp",
    description: "A multi-chain dApp",
    url: "https://example.com",
    icons: ["https://example.com/icon.png"],
  },
})

export function App({ children }: { children: ReactNode }) {
  return <>{children}</>
}
```

### React Native setup

```ts
import "@walletconnect/react-native-compat"

import {
  createAppKit,
  solana,
} from "@reown/appkit-react-native"
import { SolanaAdapter } from "@reown/appkit-solana-react-native"

const solanaAdapter = new SolanaAdapter()

export const appKit = createAppKit({
  projectId: "YOUR_PROJECT_ID",
  networks: [solana],
  adapters: [solanaAdapter],
  metadata: {
    name: "My Mobile dApp",
    description: "A mobile multi-chain dApp",
    url: "https://example.com",
    icons: ["https://example.com/icon.png"],
    redirect: {
      native: "myapp://",
      universal: "https://example.com",
    },
  },
})
```

### Hooks

```tsx
import { useAppKitAccount, useAppKit } from "@reown/appkit/react"

function WalletButton() {
  const { address, isConnected } = useAppKitAccount()
  const { open } = useAppKit()

  if (!isConnected) {
    return <button onClick={() => open()}>Connect Wallet</button>
  }

  return (
    <div>
      <p>{address}</p>
      <button onClick={() => open()}>Manage</button>
    </div>
  )
}
```

Multi-chain account access:

```tsx
import { useAppKitAccount } from "@reown/appkit/react"

const solanaAccount = useAppKitAccount({ namespace: "solana" })
const evmAccount = useAppKitAccount({ namespace: "eip155" })
```

### When to use

- dApps that need Solana and EVM in one connection modal
- React Native apps that want a single wallet SDK for mobile
- Teams that want WalletConnect-based connections with a pre-built UI

## Privy

Email, social login, and embedded wallets for crypto onboarding. Supports Solana and EVM. Embedded wallets are created automatically for users who do not have a wallet.

Packages:
- `@privy-io/react-auth` (core React SDK)
- `@privy-io/react-auth/solana` (Solana hooks)
- `@privy-io/expo` (React Native)

### Web setup (React)

```tsx
import type { ReactNode } from "react"
import { PrivyProvider } from "@privy-io/react-auth"

function App({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId="your-privy-app-id"
      clientId="your-app-client-id"
      config={{
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
```

### Hooks

```tsx
import { usePrivy } from "@privy-io/react-auth"
import { useWallets } from "@privy-io/react-auth/solana"

function WalletStatus() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()

  if (!ready) return <div>Loading...</div>

  if (!authenticated) {
    return <button onClick={login}>Log in</button>
  }

  const wallet = wallets[0]

  return (
    <div>
      <p>{wallet?.address ?? "No Solana wallet connected"}</p>
      <button onClick={logout}>Log out</button>
    </div>
  )
}
```

### Sending transactions

```tsx
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana"
import {
  createSolanaRpc,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  getTransactionEncoder,
  pipe,
  address,
  createNoopSigner,
} from "@solana/kit"
import { getTransferSolInstruction } from "@solana-program/system"

function SendButton() {
  const { signAndSendTransaction } = useSignAndSendTransaction()
  const { wallets } = useWallets()

  async function send() {
    const wallet = wallets[0]
    if (!wallet) return

    const { getLatestBlockhash } = createSolanaRpc("https://api.devnet.solana.com")
    const { value: blockhash } = await getLatestBlockhash().send()

    const source = createNoopSigner(address(wallet.address))
    const instruction = getTransferSolInstruction({
      amount: 1_000_000_000n,
      destination: address("11111111111111111111111111111111"),
      source,
    })

    const transaction = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(address(wallet.address), tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
      (tx) => compileTransaction(tx),
      (tx) => new Uint8Array(getTransactionEncoder().encode(tx)),
    )

    const result = await signAndSendTransaction({ transaction, wallet })
    console.log("Signature:", result.signature)
  }

  return <button onClick={send}>Send SOL</button>
}
```

### When to use

- dApps that need email or social login (Google, Twitter, Discord)
- Products targeting non-crypto-native users who do not have a wallet
- Teams that want embedded wallets created automatically on first login
- Onboarding flows where the user should never see a wallet extension

## Dynamic

Multi-chain authentication with embedded wallets, social login, and flexible connector system. Supports Solana, EVM, and other chains. Works on web and React Native.

Packages:
- `@dynamic-labs/sdk-react-core` (core React SDK)
- `@dynamic-labs/solana` (Solana connectors)
- `@dynamic-labs/ethereum` (EVM connectors)

### Web setup (React)

```tsx
import type { ReactNode } from "react"
import { DynamicContextProvider, DynamicWidget } from "@dynamic-labs/sdk-react-core"
import { SolanaWalletConnectors } from "@dynamic-labs/solana"

export default function App({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID!,
        walletConnectors: [SolanaWalletConnectors],
      }}
    >
      {children}
      <DynamicWidget />
    </DynamicContextProvider>
  )
}
```

Multi-chain setup:

```tsx
import type { ReactNode } from "react"
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core"
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum"
import { SolanaWalletConnectors } from "@dynamic-labs/solana"

export default function App({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID!,
        walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  )
}
```

### React Native setup

```tsx
import { Text, TouchableOpacity, View } from "react-native"
import { useReactiveClient } from "@dynamic-labs/react-hooks"
import { dynamicClient } from "./dynamic-client"

const useDynamicClient = () => useReactiveClient(dynamicClient)

function WalletSelector() {
  const client = useDynamicClient()
  const walletOptions = client.wallets.walletOptions.filter(
    (option) => option.chain !== null
  )

  const handleConnect = async (walletKey: string) => {
    const wallet = await client.wallets.connectWallet(walletKey)
    console.log("Connected:", wallet.address)
  }

  return (
    <View>
      {walletOptions.map((option) => (
        <TouchableOpacity
          key={`${option.key}-${option.chain}`}
          onPress={() => handleConnect(option.key)}
        >
          <Text>{option.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
```

### Hooks

```tsx
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

function WalletStatus() {
  const { user, primaryWallet, handleLogOut } = useDynamicContext()

  if (!user) {
    return null
  }

  return (
    <div>
      <p>{primaryWallet?.address}</p>
      <button onClick={handleLogOut}>Log out</button>
    </div>
  )
}
```

### Sending transactions

```tsx
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import type { VersionedTransaction } from "@solana/web3.js"

function SendButton({ transaction }: { transaction: VersionedTransaction }) {
  const { primaryWallet } = useDynamicContext()

  async function send() {
    if (!primaryWallet) return

    const signer = await primaryWallet.getSigner()
    const result = await signer.signAndSendTransaction(transaction)
    console.log("Signature:", result.signature)
  }

  return <button onClick={send}>Send Transaction</button>
}
```

### When to use

- dApps that need multi-chain auth with a pre-built widget
- Teams that want flexible connector composition (mix and match chains)
- Products that need user profile data alongside wallet connection
- React Native apps that want a single SDK for mobile wallet flows

## Better Sol wallet helpers

Better Sol exposes wallet signer adapters from `better-sol/wallets` so browser and mobile wallet providers can be passed to `betterSol().withSigner(...)`.

| Wallet SDK | Helper | Example |
|---|---|---|
| Solana Wallet Adapter | `walletAdapter(wallet)` | `examples/wallet-adapter-counter.tsx` |
| Reown AppKit | `reownWallet(wallet)` | `examples/reown-counter.tsx` |
| Privy | `privyWallet(wallet)` | `examples/privy-counter.tsx` |
| Dynamic | `dynamicWallet(wallet)` | `examples/dynamic-counter.tsx` |

```ts
import { betterSol } from "better-sol"
import { walletAdapter } from "better-sol/wallets"
import { counter } from "./counter"

const baseClient = await betterSol({ cluster: "devnet", programs: { counter } })
const client = await baseClient.withSigner(walletAdapter(wallet))
```

Do not use `keypairFile()` or `secretKey()` in browser or mobile code. Those helpers are for backend scripts, tests, and local development.

## Wallet decision theory

### Optimize for the trust boundary

Wallet choice is a product and security decision, not only a UI decision.

| Custody model | User trust assumption | Best fit |
|---|---|---|
| External wallet | User trusts their wallet provider, app never touches keys | DeFi, trading, high-value actions |
| Embedded wallet | User trusts the app and wallet infrastructure provider | Consumer onboarding, games, social apps |
| MPC or passkey wallet | User trusts provider key shares and recovery policy | Apps needing low-friction custody with recovery |
| Hardware wallet | User trusts hardware confirmation screen | Treasuries, institutions, high-value governance |

If the app handles high-value transactions, prefer external or hardware-backed signing. If the app targets mainstream users and values onboarding above self-custody purity, embedded wallets can be the right tradeoff.

### Privacy and account linking

Unified wallet SDKs make onboarding easier but can also centralize identity data. Decide what the app genuinely needs:

- Wallet address only: use Solana Wallet Adapter or Reown.
- Wallet plus social login: use Privy or Dynamic.
- User profile, email, and CRM-style segmentation: Dynamic or Privy.
- Cross-chain account linking: Reown, Privy, or Dynamic.

Minimize stored identity data. If the product only needs a Solana signature, do not collect email, phone, or social accounts.

### Recovery and lockout analysis

Embedded wallets improve recovery but introduce provider dependency. Ask:

- What happens if the user loses email access?
- Can a compromised social account recover the wallet?
- Can the provider freeze or deny wallet access?
- Is export supported if the user wants to leave?
- Does the product need account abstraction or sponsored transactions?

### Wallet UX review checklist

- [ ] The connect button says what kind of login is being used: wallet, email, social, or embedded wallet.
- [ ] The active address is visible before every transaction.
- [ ] The chain and cluster are visible before signing.
- [ ] Embedded wallet creation is disclosed before it happens.
- [ ] User can disconnect and switch wallets without stale cached state.
- [ ] Transaction signing cannot be triggered from a push notification or deep link without an in-app preview.
- [ ] The app explains what happens if the wallet provider is unavailable.

## Choosing a wallet library

### Solana-only, web only

Use `@solana/wallet-adapter-react`. Minimal dependencies, connects to Phantom, Solflare, Backpack, and any wallet-standard wallet. No external service required.

### Multi-chain, web and mobile

Use `@reown/appkit`. One modal for Solana, EVM, and Bitcoin. Works on React Native. Requires a Reown project ID (free). Best when your users have existing wallets they want to connect.

### Non-crypto-native users

Use `@privy-io/react-auth`. Email and social login with automatic embedded wallet creation. Users never need to install a wallet extension. Requires a Privy app ID (free tier available). Best for consumer apps where the target user is not a crypto native.

### Complex multi-chain with user profiles

Use `@dynamic-labs/sdk-react-core`. Combines wallet connection with user profiles, social login, and embedded wallets. Flexible connector system for mixing chains. Requires a Dynamic environment ID (free tier available). Best for products that need rich user data alongside wallet state.

## Related

- `multi-chain-ui.md` for multi-chain address handling and chain selection UX.
- `web3-dapp-architecture.md` for wallet standards and connection protocols.
- `mobile.md` for mobile-specific wallet adapter patterns and deep links.
- `dapp-state-management.md` for wallet state management patterns.
- `transaction-ux.md` for transaction signing and confirmation flows.
