# Cross-Chain Patterns

Use this reference when building cross-chain applications, integrating bridges, handling wrapped assets, or designing multi-chain dApps.

## Bridge architectures

### Lock-and-mint

Lock assets on source chain. Mint wrapped version on destination chain. Burning on destination unlocks on source.

Trust: custodian or bridge validator set controls locked assets. If compromised, wrapped assets lose backing.

### Liquidity pool

Liquidity providers deposit assets on both chains. Transfers move between pools.

Trust: liquidity depth limits transfer size. Pool depletion can halt operations.

### Native burn-and-mint

Burn on source, mint natively on destination. Requires protocol-level integration between chains.

Trust: minimal if both chains natively support the same asset standard.

### Message passing

Send arbitrary messages between chains. Smart contracts on each end interpret and act on messages.

Trust: message delivery depends on the relayer network and verification mechanism.

## Major Solana bridge protocols

- Wormhole: message passing between 30+ chains. Powers many Solana cross-chain operations.
- LayerZero: configurable security model with different verification layers.
- deBridge: message passing with on-chain incentive-aligned verification.
- Allbridge: asset bridge between multiple chains and Solana.
- Axelar: general message passing with CosmWasm integration.

## Wrapped asset handling

Wrapped tokens (e.g., Wrapped ETH on Solana, Wrapped SOL as WORM) are not native tokens. They:

- Have their own mint address and metadata.
- May not support all Token-2022 extensions.
- Depend on bridge health for redemption value.
- May have different liquidity than native tokens.

Always display the token origin and bridge status when showing wrapped asset balances.

## Cross-chain transaction patterns

### Atomic swap

Two transactions on two chains, coordinated by hash-lock and timelock. If one side fails, the other can reclaim after timeout. Limited by chain finality speed.

### Witness-based

Trusted attesters or validators confirm events on source chain. Destination chain executes after sufficient confirmations. Speed depends on attester network and finality requirements.

### Proof-based

Merkle proofs or ZK proofs verify source chain state on destination chain. More trustless but computationally expensive.

## Multi-chain dApp design

### Shared state

Some state lives on each chain. Cross-chain messages synchronize critical state changes. Design for eventual consistency.

### Hub-and-spoke

One chain is the primary state hub. Other chains hold user-facing operations and sync back to the hub.

### Chain-specific adapters

Abstract chain differences behind a common interface:

```ts
interface ChainAdapter {
  connect(): Promise<WalletConnection>
  getBalance(address: string): Promise<bigint>
  sendTransaction(tx: TransactionRequest): Promise<string>
  subscribeToEvents(callback: EventHandler): () => void
}
```

## Bridge risk assessment

When integrating a bridge:

- Total value locked and historical TVL stability.
- Validator set size and distribution.
- History of incidents and disclosure quality.
- Audit coverage.
- Time to finality on both chains.
- Recovery mechanisms if bridge halts.
- Smart contract upgrade control.
- Governance transparency.

## UI considerations

- Show which chain the user is operating on at all times.
- Display estimated time for cross-chain operations.
- Show fees on both source and destination.
- Warn about wrapped assets vs native assets.
- Handle chain-specific wallet connections separately.
- Show transaction confirmations on both chains when applicable.

## Related

- `cross-chain-security.md` for cross-chain attack patterns and defense-in-depth.
- `multi-chain-ui.md` for multi-chain wallet, address, and transaction UI patterns.
