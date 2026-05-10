# Multi-Chain Frontend Patterns

Use this reference when building dApps that operate across Solana and other chains, or when adapting UI patterns from other blockchain ecosystems.

## Wallet connection across chains

### Solana

Wallet-standard is the connection protocol. Adapters translate between wallet-standard events and application state. ConnectorKit and similar libraries provide React hooks for connection management.

### EVM

EIP-1193 defines the provider interface. EIP-6963 adds multi-provider discovery. Wallets inject providers at `window.ethereum` or via registered callbacks.

### Cross-chain dApp

Maintain separate wallet contexts per chain. A connected Solana wallet does not imply an EVM wallet is available. Use a chain selector that:

- Shows which chains are connected.
- Allows switching active chain.
- Shows correct balance and state for the active chain.
- Handles chain-specific wallet connection flows.

## Address handling

| Chain | Format | Length | Example |
|---|---|---|---|
| Solana | Base58 | 32 bytes | `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU` |
| Ethereum | Hex with 0x prefix | 20 bytes | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` |
| Bitcoin | Bech32/Base58 | 20-32 bytes | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` |
| Cosmos | Bech32 with prefix | 20 bytes | `cosmos1t5u0jfg3l...` |

Always display addresses with chain context. Truncate with enough characters to distinguish within the same chain: Solana shows first 4 + last 4, EVM shows first 6 + last 4.

## Transaction UI patterns

### Solana

- Multi-instruction transactions are common. Show all instructions in the preview.
- Transaction simulation provides pre-flight estimates.
- Compute units and priority fees affect cost.
- Confirmation targets: processed, confirmed, finalized.

### EVM

- Single contract call per transaction. Complex operations use multicall.
- Gas estimation with gas limit and gas price or EIP-1559 base fee + priority fee.
- Transaction nonce prevents replays.
- Confirmation blocks for finality.

### Shared patterns

Both ecosystems share these transaction UI requirements:

- Show what will happen before signing.
- Show cost including gas/fees.
- Show confirmation status.
- Handle rejection, timeout, and failure with clear copy.
- Prevent double submission.

## State display

### Token balances

- Show native token balance (SOL, ETH).
- Show token balances with correct decimals.
- Show fiat equivalent when available.
- Handle tokens from multiple chains in portfolio views.

### Transaction history

- Parse on-chain transactions per chain.
- Cross-chain operations need linked transactions on both chains.
- Show bridge operations with source and destination status.

### NFT displays

- Load metadata from URI.
- Handle different metadata standards (Metaplex, ERC-721, ERC-1155).
- Show collection, creator, and royalty information.

## Real-time updates

### Solana

- WebSocket subscriptions for account changes and program logs.
- Polling for RPCs without WebSocket support.
- geyser plugins for high-throughput indexing.

### EVM

- WebSocket or polling for new blocks and events.
- The Graph or Ponder for indexed queries.
- Dune for historical analytics.

### Cross-chain

Track state on each chain independently. Cross-chain operations require monitoring both chains and linking related events.

## Chain selection UX

- Default to the chain that makes most sense for the product.
- Allow switching chains with a clear indicator.
- Show chain-specific warnings: wrong network, unsupported token, different fee structure.
- Handle testnet/mainnet distinctly with clear labels.
- Show estimated confirmation time per chain.

## Design consistency across chains

- Use consistent component patterns for different chains rather than completely different layouts.
- Chain indicators (icons, colors, labels) should be immediately recognizable.
- Token amounts should use the same formatting rules regardless of chain.
- Transaction states follow the same pattern: preparing, signing, confirming, confirmed, failed.

## Related

- `cross-chain.md` for bridge architectures and cross-chain design patterns.
- `dapp-state-management.md` for multi-chain state management and caching.
- `web3-dapp-architecture.md` for wallet standards across chains.
- `brand.md` and `brand-preview-workflow.md` for palette and visual system.
- `accessibility-evaluation.md` for contrast and accessibility checks.
