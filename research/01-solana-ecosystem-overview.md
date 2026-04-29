# Solana Ecosystem Overview

## What is Solana?
Solana is a high-performance blockchain designed for mass adoption, capable of processing thousands of transactions per second with sub-second finality.

## Key Architecture Concepts
- **Accounts**: All data stored in accounts (max 10MiB each). Accounts have lamports, data, owner, executable flag, rent_epoch
- **Programs**: Stateless smart contracts (written in Rust). Code and data are separate accounts
- **Transactions**: Atomic operations, max 1232 bytes, contain instructions + signatures + recent blockhash
- **PDAs**: Program Derived Addresses - deterministic addresses without private keys, used for program-controlled accounts
- **CPIs**: Cross-Program Invocations - programs calling other programs (max depth 5)
- **Fees**: Base fee (5000 lamports/signature) + optional prioritization fee (CU limit × CU price)

## Core SDKs
| SDK | Language | Description |
|-----|----------|-------------|
| `@solana/kit` (formerly web3.js v2) | TypeScript | Official JS SDK, tree-shakable, modular, composable |
| `anza-xyz/solana-sdk` | Rust | Official Rust SDK for on-chain programs and validator |
| Anchor | Rust | High-level framework for Solana programs (most popular) |
| Codama | IDL Tool | Generate clients in TS/Rust/Go/Dart/Python from program IDLs |

## Hackathon Tracks (Breakout 2025)
- Consumer Apps ($25k 1st place)
- DeFi ($25k 1st place)
- Gaming ($25k 1st place)
- **Crypto Infrastructure** ($25k 1st place)
- DePIN ($25k 1st place)
- AI ($25k 1st place)
- Stablecoins ($25k 1st place)
- Grand Champion: $50k USDC
- Public Goods Award: $5k USDC

## Notable Breakout 2025 Winners
- **Grand Prize**: TAPEDRIVE
- **Infrastructure**: FluxRPC (1st), Vertigo (2nd), Unruggable (3rd), One-time Action Codes (4th), CONYR (5th)
- **Public Goods**: IDL Space
- **DeFi**: Vanish (1st)
- **AI**: Latinum (1st)
- **Consumer**: Trepa (1st)
- **Stablecoins**: CargoBill (1st)
- **DePIN**: Decen Space (1st)

## Frontend Stack
- `@solana/client`: Headless client runtime
- `@solana/react-hooks`: React hooks and provider
- `@solana/web3-compat`: Compatibility layer for legacy web3.js
- Wallet Standard: Phantom, Solflare, Backpack, etc.

## Payment Infrastructure
- Solana Pay: Transfer URLs, QR codes, transaction requests
- Commerce Kit (`@solana-commerce/kit`): Drop-in payment buttons
- x402: HTTP 402 payment flow protocol

## IDL & Code Generation (Codama)
- Converts Anchor IDL → Codama IDL → Generated clients
- Renderers: JS (Kit-compatible), Rust, Go, Dart, Python, Umi
- Generated clients include instruction builders, account fetchers, error types
- Still maturing: IDL parsing breaks for complex programs
