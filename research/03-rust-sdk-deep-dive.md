# Solana Rust SDK (anza-xyz/solana-sdk) Deep Dive

## Overview
The Rust SDK is the foundation for building Solana on-chain programs and the Agave validator. It's currently undergoing a major v2→v3 upgrade that modularizes the monolithic SDK into focused component crates.

## Architecture: 110+ Component Crates

### Core Types
| Crate | Description |
|-------|-------------|
| `sdk` | Main SDK crate (signers, transactions, hashes) |
| `pubkey` / `address` | Public key and address types |
| `signature` | Cryptographic signatures |
| `keypair` | Keypair generation and management |
| `hash` / `hash-512` | Hash functions |
| `account` | Account data structures |
| `transaction` | Transaction types |
| `message` | Transaction message types |
| `instruction` | Instruction types |
| `instruction-error` | Instruction error types |

### Program Development
| Crate | Description |
|-------|-------------|
| `program` | Core program development types |
| `program-entrypoint` | Program entry point macros |
| `program-error` | Program error types |
| `program-log` / `program-log-macro` | Logging from programs |
| `program-memory` | Memory management in programs |
| `program-pack` | Account serialization |
| `program-option` | Rust Option types for programs |
| `account-info` | Account info access in programs |
| `cpi` | Cross-Program Invocation helpers |
| `define-syscall` | Syscall definitions |

### Cryptographic Primitives
| Crate | Description |
|-------|-------------|
| `ed25519-program` | Ed25519 signature verification |
| `secp256k1-program` | Secp256k1 signature verification |
| `secp256k1-recover` | Secp256k1 recovery |
| `secp256r1-program` | Secp256r1 (WebAuthn) support |
| `bn254` | BN254 elliptic curve operations |
| `bls-signatures` | BLS signature support |
| `curve25519` | Curve25519 operations |
| `poseidon` | Poseidon hash function |
| `sha256-hasher` / `sha512-hasher` / `keccak-hasher` | Hash implementations |

### System Programs
| Crate | Description |
|-------|-------------|
| `system-interface` | System program instructions and errors |
| `system-transaction` | System program transaction helpers |
| `compute-budget-interface` | Compute budget instructions |
| `loader-v2-interface` | BPF Loader v2 interface |
| `loader-v3-interface` | BPF Loader v3 (upgradeable) interface |
| `feature-gate-interface` | Feature gate program |
| `vote-interface` | Vote program |
| `address-lookup-table-interface` | Address lookup tables |

### WASM Support
- `sdk-wasm-js` - WASM bindings for JavaScript
- `sdk-wasm-js-tests` - WASM binding tests
- `system-wasm-js` - System program WASM bindings

## v2 → v3 Migration Highlights

### Key Changes
1. **Address type**: New `Address` type replaces `Pubkey` (which is now a type alias)
2. **AccountInfo**: Removed `rent_epoch` field (now `_unused`)
3. **Hash**: Inner bytes made private (use `Hash::as_bytes()`)
4. **Modularization**: 30+ modules extracted into standalone crates

### Module Extraction Pattern
Before (v2):
```rust
use solana_sdk::system_instruction;
use solana_sdk::compute_budget;
```

After (v3):
```rust
use solana_system_interface::instruction;
use solana_compute_budget_interface;
```

## Implications for TypeScript DX
The Rust SDK's modularization pattern could inform how we design a TypeScript-first experience:
1. Each component crate → potential TypeScript module
2. The WASM bindings already provide a bridge
3. The v3 migration shows the ecosystem is actively refactoring for better composability
