# Multi-Chain Frontend Patterns

Use this reference when building dApps that operate across Solana and other chains, or when adapting UI patterns from other ecosystems.

## Tools

- **Solana wallets**: `@solana/wallet-adapter-react` (React) or `@solana/react-hooks` (framework-kit). Connect via wallet-standard protocol.
- **EVM wallets**: `wagmi` + `viem` for EVM chain connections. `@rainbow-me/rainbowkit` or `connectkit` for pre-built wallet UI.
- **Reown AppKit**: `@reown/appkit` with `@reown/appkit-adapter-solana` for web and `@reown/appkit-react-native` with `@reown/appkit-solana-react-native` for mobile. Good for one wallet modal across Solana, EVM, and Bitcoin.
- **Privy**: `@privy-io/react-auth` and `@privy-io/react-auth/solana` for email/social login plus embedded Solana wallets.
- **Dynamic**: `@dynamic-labs/sdk-react-core`, `@dynamic-labs/solana`, and `@dynamic-labs/ethereum` for multi-chain auth, embedded wallets, and user profiles.
- **Account abstraction**: `@biconomy/smart-account` for EVM smart wallets, `@squid/router` for cross-chain swaps and bridging UI.
- **Chain config**: `@wagmi/core/chains` for EVM chain definitions. `@solana/kit` for Solana clusters.

## Architecture

### Provider structure

Wrap the app with separate providers per chain. Each provider handles its own wallet state, connection lifecycle, and account management:

```tsx
function App({ children }) {
  return (
    <SolanaProvider>
      <EVMProvider>
        <ChainSelectorProvider>
          {children}
        </ChainSelectorProvider>
      </EVMProvider>
    </SolanaProvider>
  )
}
```

### Active chain context

Maintain a global "active chain" state that determines which provider's hooks to use:

```ts
type ChainType = "solana" | "ethereum" | "polygon" | "arbitrum" | "base"

interface ChainState {
  activeChain: ChainType
  setActiveChain: (chain: ChainType) => void
  isConnected: boolean
  address: string | null
  balance: bigint | null
}
```

## Wallet connection across chains

### Solana

Wallet-standard is the connection protocol. Adapters translate between wallet-standard events and application state:

```ts
import { useWallet } from "@solana/wallet-adapter-react"

const { connected, publicKey, connect, disconnect, select, wallets } = useWallet()
```

Key properties:
- `publicKey`: the connected wallet address (32 bytes, base58)
- `connected`: boolean connection state
- `wallets`: available wallet adapters
- `signTransaction`: sign a Solana transaction

### EVM

EIP-1193 defines the provider interface. EIP-6963 adds multi-provider discovery. wagmi provides React hooks:

```ts
import { useAccount, useConnect, useDisconnect } from "wagmi"

const { address, isConnected, chain } = useAccount()
const { connectors, connect } = useConnect()
const { disconnect } = useDisconnect()
```

Key properties:
- `address`: the connected wallet address (20 bytes, hex with 0x prefix)
- `chain`: the active EVM chain (id, name, network)
- `isConnected`: boolean connection state

### Cross-chain dApp

A connected Solana wallet does not imply an EVM wallet is available. Maintain separate connection states per chain unless using a unified wallet SDK such as Reown AppKit, Privy, or Dynamic. The chain selector should:

1. Show which chains are connected (green dot or checkmark)
2. Allow switching the active chain
3. Show correct balance and state for the active chain
4. Handle chain-specific wallet connection flows (different modal for Solana vs EVM)
5. Persist chain preference in localStorage

## Address handling

### Format comparison

| Chain | Format | Length | Example |
|---|---|---|---|
| Solana | Base58 | 32 bytes | `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU` |
| Ethereum | Hex with 0x prefix | 20 bytes | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` |
| Bitcoin | Bech32/Base58 | 20-32 bytes | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` |
| Cosmos | Bech32 with prefix | 20 bytes | `cosmos1t5u0jfg3l...` |

### Display rules

Always display addresses with chain context. Truncate with enough characters to distinguish within the same chain:

```ts
function formatAddress(address: string, chain: ChainType): string {
  switch (chain) {
    case "solana":
      return `${address.slice(0, 4)}...${address.slice(-4)}`
    case "ethereum":
    case "polygon":
    case "arbitrum":
    case "base":
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    default:
      return `${address.slice(0, 6)}...${address.slice(-4)}`
  }
}
```

### Address validation

```ts
function isValidAddress(address: string, chain: ChainType): boolean {
  switch (chain) {
    case "solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    case "ethereum":
    case "polygon":
    case "arbitrum":
    case "base":
      return /^0x[0-9a-fA-F]{40}$/.test(address)
    default:
      return false
  }
}
```

## Transaction UI patterns

### Solana transaction flow

1. Build instructions (typed via Better Sol client)
2. Simulate transaction (estimate compute and preview account changes)
3. Send to wallet for signing
4. Confirm on-chain (processed, confirmed, finalized)
5. Show result

Multi-instruction transactions are common on Solana. Show all instructions in the preview:

```tsx
<TransactionPreview>
  <Instruction name="Create Token Account" />
  <Instruction name="Transfer SOL" amount="0.5 SOL" />
  <Instruction name="Initialize Staking" />
</TransactionPreview>
```

### EVM transaction flow

1. Build contract call (typed via viem)
2. Estimate gas
3. Send to wallet for signing
4. Wait for transaction receipt
5. Show result

Single contract call per transaction. Complex operations use multicall:

```tsx
<TransactionPreview>
  <ContractCall name="approve" args={[spender, amount]} />
  <ContractCall name="deposit" args={[amount]} />
</TransactionPreview>
```

### Shared transaction states

Both ecosystems share these states:

```ts
type TransactionStatus =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "confirmed"
  | "failed"
  | "rejected"
```

UI for each state:
- **idle**: show the action button
- **preparing**: spinner with "Preparing transaction..."
- **signing**: wallet prompt indicator with "Check your wallet..."
- **confirming**: spinner with "Confirming..." and block explorer link
- **confirmed**: checkmark with transaction hash link
- **failed**: error icon with retry button and error message
- **rejected**: info icon with "Transaction rejected"

## State display across chains

### Token balances

Show native token balance (SOL, ETH) and token balances with correct decimals:

```ts
interface TokenBalance {
  symbol: string
  name: string
  balance: bigint
  decimals: number
  chain: ChainType
  mint?: string
  contractAddress?: string
  usdValue?: number
}
```

### Transaction history

Parse on-chain transactions per chain. Cross-chain operations need linked transactions on both chains:

```ts
interface CrossChainTransaction {
  sourceTxHash: string
  sourceChain: ChainType
  destinationTxHash: string | null
  destinationChain: ChainType
  status: "pending" | "completed" | "failed"
  amount: bigint
  token: string
  timestamp: number
}
```

### NFT displays

Handle different metadata standards:
- **Solana**: Metaplex Token Metadata (URI to off-chain JSON)
- **EVM**: ERC-721 (tokenURI), ERC-1155 (uri)
- Display collection, creator, and royalty information per chain's standard

## Chain selection UX

### Chain selector component

```tsx
<ChainSelector>
  <ChainOption chain="solana" icon={SolanaIcon} connected={solanaConnected} />
  <ChainOption chain="ethereum" icon={EthereumIcon} connected={ethConnected} />
  <ChainOption chain="polygon" icon={PolygonIcon} connected={polygonConnected} />
  <ChainOption chain="base" icon={BaseIcon} connected={baseConnected} />
</ChainSelector>
```

Design rules:
- Default to the chain that makes most sense for the product
- Show connected chains with a green indicator
- Show the active chain highlighted
- Group chains by ecosystem (Solana, EVM L1s, EVM L2s)
- Include testnet/mainnet toggle with clear warning labels

### Chain-specific warnings

- Wrong network: "Please switch to Solana to continue"
- Unsupported token: "This token is not available on the selected chain"
- Different fee structure: "Ethereum gas fees are typically higher than Solana"
- Confirmation time: "Ethereum transactions take 12-60 seconds to finalize"

## Design consistency across chains

- Use consistent component patterns for different chains rather than completely different layouts
- Chain indicators (icons, colors, labels) should be immediately recognizable
- Token amounts should use the same formatting rules regardless of chain
- Transaction states follow the same pattern across all chains
- Color-code chains consistently: Solana = purple, Ethereum = blue, Polygon = purple-blue, Base = blue

## Related

- `cross-chain.md` for bridge architectures and cross-chain design patterns.
- `dapp-state-management.md` for multi-chain state management and caching.
- `wallet-connection.md` for Solana Wallet Adapter, Reown, Privy, and Dynamic setup patterns.
- `web3-dapp-architecture.md` for wallet standards across chains.
- `brand-preview-workflow.md` for palette and visual system.
- `accessibility-evaluation.md` for contrast and accessibility checks.
- `transaction-ux.md` for transaction flow UX patterns.
