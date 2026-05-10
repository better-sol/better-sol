# Web3 Fundamentals

Use this reference when teaching blockchain fundamentals, explaining consensus mechanisms, comparing chain architectures, or answering questions about how blockchains work beneath the application layer.

## Blockchain primitives

### Hash functions

Cryptographic hash functions (SHA-256, Keccak-256) produce fixed-size output from arbitrary input. Properties: deterministic, one-way, collision-resistant, avalanche effect.

Used for: block hashing, transaction IDs, Merkle trees, address derivation, proof of work.

### Public-key cryptography

Asymmetric key pairs: private key signs, public key verifies. Solana uses Ed25519. Ethereum uses secp256k1.

Used for: transaction signing, authentication, address derivation, encrypted communication.

### Merkle trees

Binary tree where leaf nodes are data hashes and parent nodes are hashes of their children. The root hash proves inclusion of any leaf without revealing the full dataset.

Used for: block transaction proofs, state compression, light client verification, SPV proofs.

## Consensus mechanisms

### Proof of Work (PoW)

Miners compete to find a nonce that produces a hash below a target. First to find it proposes the next block. High energy cost, proven security model.

Used by: Bitcoin, Ethereum (historically).

### Proof of Stake (PoS)

Validators stake tokens as collateral. Selected validators propose and attest to blocks. Misbehavior results in slashing. Energy-efficient but introduces stake-based governance.

Used by: Ethereum (post-Merge), Cosmos, Polkadot, Cardano.

### Proof of History (PoH) + Proof of Stake

Solana's approach. PoH provides a cryptographic clock that establishes event ordering before consensus. Combined with PoS for validator selection.

Result: high throughput (~400ms slots), low finality time, but higher hardware requirements for validators.

### Delegated Proof of Stake (DPoS)

Token holders vote for a limited set of validators. More centralized but faster block production.

Used by: EOS, Tron, BitShares.

### Byzantine Fault Tolerance (BFT)

Class of consensus algorithms that tolerate up to one-third malicious participants. Many PoS systems use BFT variants for finality.

### Comparison

| Mechanism | Throughput | Finality | Decentralization | Energy |
|---|---|---|---|---|
| PoW | Low | Slow | High | Very High |
| PoS | Medium-High | Medium | Medium-High | Low |
| PoH+PoS | High | Fast | Medium | Low |
| DPoS | High | Fast | Lower | Low |

## Execution environments

### Ethereum Virtual Machine (EVM)

Stack-based virtual machine. Smart contracts written in Solidity or Vyper compile to EVM bytecode. Gas metering for every operation. Single-threaded execution.

Chains: Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche C-chain.

### Solana Virtual Machine (SVM)

Berkeley Packet Filter (BPF) based execution. Programs compiled to LLVM BPF bytecode. Sealevel enables parallel transaction execution across non-overlapping accounts.

Chains: Solana, Eclipse, Sonic, Soon.

### Move VM

Resource-oriented programming model. Assets are first-class types that cannot be duplicated or accidentally destroyed.

Chains: Aptos, Sui.

### CosmWasm

WebAssembly-based smart contracts for the Cosmos ecosystem. Interoperable across IBC-connected chains.

Chains: Cosmos hub, Osmosis, Neutron, Injective.

### WebAssembly (Wasm)

General-purpose smart contract execution. Polkadot uses Substrate Wasm, NEAR uses Wasm-based contracts.

## State models

### Account-based (Ethereum, Solana)

Each account has a balance and optional code. State changes happen by modifying account data.

- Ethereum: state lives in the contract at a single address.
- Solana: state lives in separate accounts owned by programs.

### UTXO-based (Bitcoin, Cardano)

Transactions consume unspent outputs and produce new unspent outputs. Each UTXO can only be spent once.

- Bitcoin: simple UTXO model with script locking.
- Cardano: extended UTXO (eUTXO) with more expressive scripts.

## Finality

### Probabilistic finality (Bitcoin, Ethereum PoW)

Blocks are considered increasingly final as more blocks are built on top. No guaranteed finality point.

### Deterministic finality (Solana, Tendermint chains, Ethereum PoS with finality)

A specific mechanism confirms that a block will never be reverted. Solana achieves optimistic confirmation in ~400ms and full finality in seconds.

### Economic finality

Reverting a finalized block costs more than the value protected. Common in PoS systems where slashing makes reversion expensive.

## Interoperability

### Atomic swaps

Cross-chain exchanges without trusted intermediaries. Limited by scripting capabilities on each chain.

### Bridges

Lock assets or messages on one chain, release on another. Trust depends on bridge architecture.

### Inter-Blockchain Communication (IBC)

Standardized protocol for cross-chain communication in the Cosmos ecosystem. Trust-minimized through light client verification.

### Layer 2 and rollups

Execute transactions off the main chain, post proof or data on-chain for security. Arbitrum and Optimism use optimistic rollups. zkSync and Starknet use zero-knowledge rollups.

Solana does not use rollups but some projects build execution environments that settle on Solana (Eclipse).

## Cryptographic primitives used in dApps

### Zero-knowledge proofs

Prove a statement is true without revealing the underlying data. Used for privacy, scaling (ZK-rollups), and identity verification.

### Multi-party computation (MPC)

Multiple parties jointly compute a function without revealing their individual inputs. Used for threshold signatures and bridge security.

### Homomorphic encryption

Computation on encrypted data without decryption. Used for confidential DeFi and privacy-preserving analytics.

### Threshold signatures

A subset of key holders must cooperate to produce a valid signature. Used for multisig wallets, bridge validators, and distributed key generation.

## Related

- `solana-knowledge-base.md` for Solana-specific mappings of these general concepts.
- `advanced-solana.md` for how consensus and finality affect Solana program design.
