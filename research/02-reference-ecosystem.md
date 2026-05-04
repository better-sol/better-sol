# Solana Ecosystem Reference

Reference material: @solana/kit package structure, Rust SDK crates, toolchain details. No better-sol-specific content.

---

## Solana Architecture

Solana is a high-performance blockchain designed for throughput. Key concepts:

- **Accounts** — All state lives in accounts (key-value stores with owner, lamports, data)
- **Programs** — On-chain code (stateless functions) that process instructions
- **Instructions** — Atomic operations: program ID + accounts + data
- **Transactions** — One or more instructions, signed by keypairs
- **PDAs** — Program Derived Addresses: deterministic addresses from seeds
- **SPL Tokens** — The standard token interface (fungible + NFTs)
- **Rent** — Accounts pay rent (lamports) based on data size. Rent-exempt threshold = minimum balance

### The Compilation Reality

Solana programs must be deployed as **sBPF bytecode** (ELF binaries). The Solana runtime only executes sBPF. Today, the standard path is Rust → LLVM → sBPF. There is no WASM runtime, no interpreter. Our approach: TypeScript → Anchor Rust → cloud `cargo build-sbf` → sBPF.

---

## @solana/kit (57+ Packages)
Kit (formerly `@solana/web3.js` v2) is the official JavaScript SDK for building Solana apps for Node, web, and React Native. It was renamed from web3.js to signal a ground-up rewrite.

## Architecture: 57+ Modular Packages

### Core Primitives
| Package | Description |
|---------|-------------|
| `@solana/addresses` | Generating account addresses |
| `@solana/keys` | Generating and transforming key material |
| `@solana/codecs` | Encoding/decoding byte arrays (composable codecs) |
| `@solana/codecs-core` | Core codec types and helpers |
| `@solana/codecs-numbers` | Number codecs (u8, u16, u32, u64, etc.) |
| `@solana/codecs-strings` | String codecs |
| `@solana/codecs-data-structures` | Data structure codecs (structs, tuples, etc.) |
| `@solana/instructions` | Creating transaction instructions |
| `@solana/transactions` | Creating and serializing transactions |
| `@solana/transaction-messages` | Building and transforming transaction messages |
| `@solana/accounts` | Fetching and decoding accounts |
| `@solana/signers` | Signing messages and transactions |
| `@solana/errors` | Identifying and decoding errors |
| `@solana/programs` | Defining programs and resolving errors |
| `@solana/sysvars` | Fetching and decoding sysvar accounts |

### RPC Layer
| Package | Description |
|---------|-------------|
| `@solana/rpc-spec` | Generic JSON RPC implementation using proxies |
| `@solana/rpc-api` | Solana-specific RPC method types |
| `@solana/rpc-transport-http` | HTTP transport for RPC |
| `@solana/rpc` | Full RPC client |
| `@solana/rpc-types` | Type definitions for RPC values |
| `@solana/rpc-parsed-types` | Types for parsed RPC responses |
| `@solana/rpc-transformers` | Reusable RPC input/output transformers |
| `@solana/rpc-subscriptions` | Subscribing to RPC notifications |
| `@solana/rpc-subscriptions-api` | Subscription method types |
| `@solana/rpc-subscriptions-spec` | Generic JSON RPC subscriptions via proxies |
| `@solana/rpc-subscriptions-channel-websocket` | WebSocket transport |

### Higher-Level Abstractions
| Package | Description |
|---------|-------------|
| `@solana/instruction-plans` | Plan and execute multi-instruction, multi-transaction operations |
| `@solana/plugin-core` | Plugin system for composable clients |
| `@solana/plugin-interfaces` | TypeScript interfaces for plugin capabilities |
| `@solana/react` | React hooks for wallet integration |
| `@solana/wallet-account-signer` | Wallet Standard → Kit signer conversion |
| `@solana/program-client-core` | Core utilities for building program clients (used by Codama) |

## Key Design Decisions

### 1. Tree-Shakability
- Fully tree-shakable, enforced by build-time checks
- No classes like the old `Connection` that force-bundle everything
- Functional API design: `createSolanaRpc()`, `createTransactionMessage()`

### 2. Composable Internals
- Every module can be composed/extended
- RPC transport can be customized (retry logic, failover, batching)
- Generic types allow extension via composition

### 3. Plugin System (`@solana/plugin-core`)
```typescript
const sol = await betterSol()
    .use(rpcPlugin('https://api.mainnet.solana.com'))
    .use(rpcSubscriptionsPlugin('wss://api.mainnet.solana.com'))
    .use(generatedPayerPlugin())
    .use(generatedAuthorityPlugin());
```

Plugin interfaces:
- `ClientWithRpc` - RPC access
- `ClientWithRpcSubscriptions` - Real-time subscriptions
- `ClientWithPayer` - Default fee payer
- `ClientWithIdentity` - Default identity signer
- `ClientWithAirdrop` - Airdrop capability
- `ClientWithGetMinimumBalance` - Rent exemption calculation
- `ClientWithTransactionPlanning` - Transaction planning
- `ClientWithTransactionSending` - Transaction sending
- `ClientWithSubscribeToPayer` - Reactive payer changes
- `ClientWithSubscribeToIdentity` - Reactive identity changes

### 4. Instruction Plans (`@solana/instruction-plans`)
- Describe operations as recursive trees (sequential, parallel, single, messagePacker)
- Transaction Planner converts plans → transaction messages
- Transaction Plan Executor compiles, signs, sends
- Handles multi-transaction operations automatically

```typescript
const instructionPlan = sequentialInstructionPlan([
    parallelInstructionPlan([depositFromAlice, depositFromBob]),
    activateVault,
    parallelInstructionPlan([withdrawToAlice, withdrawToBob]),
]);
```

## Sample: Transfer SOL (251 tokens)
```typescript
import { address, createSolanaRpc, generateKeyPairSigner, lamports, 
         createTransactionMessage, setTransactionMessageFeePayerSigner,
         setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
         pipe, signTransactionMessageWithSigners } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';

const rpc = createSolanaRpc("http://localhost:8899");
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const sender = await generateKeyPairSigner();
const recipient = await generateKeyPairSigner();

const transferInstruction = getTransferSolInstruction({
  source: sender, destination: recipient.address, amount: lamports(1_000_000_000n / 100n)
});

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(sender, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions([transferInstruction], tx)
);

const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
```

## Comparison: Token Counts for Same Task
| Library | Tokens | vs Kite |
|---------|--------|---------|
| Kite | 79 | baseline |
| Framework Kit | 99 | +25% |
| web3.js v1 + helpers | 122 | +54% |
| web3.js v1 | 145 | +84% |
| Gill | 157 | +99% |
| Umi | 182 | +130% |
| Helius SDK | 247 | +213% |
| **@solana/kit** | **251** | **+218%** |

## Known Pain Points

### 1. Type-Level Programming Complexity (Issue #1156)
- Ghost of Departed Proofs encoded in type system
- Transaction building as state machine in types
- Error types like `ExcludeTransactionMessageLifetime<ExcludeTransactionMessageFeePayer<EmptyTransactionMessage<0>>>` 
- High barrier to entry for developers without type-level programming experience
- Hard to understand compiler errors

### 2. Over-Engineering (Community Feedback)
- "Hundreds of interfaces, types, helpers, and proxies — really hard to figure out where an error occurred"
- Slow TypeScript type checking (>15s per keystroke for IntelliSense)
- Too much abstraction for simple use cases

### 3. Verbose for Common Tasks
- Simple SOL transfer requires 15+ lines of boilerplate
- Need to manually manage blockhashes, fee payers, transaction lifetime
- Too many imports and concepts for beginners

### 4. Codama/IDL Integration Issues
- Codama IDL parsing breaks for complex Anchor programs
- Generated clients create dependency hell
- IDL extraction still maturing
- Converting Anchor/Shank IDLs breaks half the functionality

### 5. Error Handling
- Errors thrown inside error handlers
- Complex error chain that's hard to debug
- Type-safe errors are powerful but opaque

---

## Solana Rust SDK (110+ Crates)
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
