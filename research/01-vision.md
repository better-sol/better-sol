# 01 — Vision, Architecture & Principles

## What better-sol Is

A TypeScript-first Solana development toolchain. One TypeScript program definition produces:

1. **On-chain program** — transpiled to Anchor Rust, compiled to sBPF bytecode via cloud compiler
2. **Typed client SDK** — generated at runtime from the same definition, zero code generation step
3. **Database schema** — Drizzle ORM from account definitions

No Rust toolchain required on the developer's machine. The value proposition is eliminating the drift between separate Rust and TypeScript codebases by making TypeScript the single source of truth.

## What better-sol Is Not

- **Not "Anchor in TypeScript."** While the transpiler targets Anchor Rust (the most widely used Solana program framework), the public API is designed around TypeScript idioms — namespaced factories, chained builders, inferred types. Rust conventions like `u64`, `pubkey`, `#[account(mut)]` are implementation details, not user-facing concepts.
- **Not a replacement for `@solana/kit`.** The official Solana TypeScript SDK is used internally for RPC, transactions, subscriptions, and codecs. better-sol adds the program definition layer and typed client generation on top.

## Architecture

```
programs/counter.ts                ← single TypeScript source of truth
        │
        ├── ▶ better-sol (runtime library, ships to browsers)
        │      typed client SDK: instruction calls, PDA derivation,
        │      account fetching (Borsh + zero-copy), token operations,
        │      wallet adapters (Wallet Adapter, Reown, Privy, Dynamic)
        │
        ├── ▶ @better-sol/cli transpiler (dev dependency only)
        │      ts-morph AST parser → IR → Anchor Rust generator
        │      → lib.rs + Cargo.toml + idl.json
        │
        ├── ▶ apps/compiler-api (Rust + Axum cloud compiler)
        │      Receives generated Rust → runs cargo build-sbf
        │      → returns .so binary
        │
        └── ▶ @better-sol/cli generate db
               Account definitions → Drizzle ORM schema
               (Postgres, MySQL, SQLite)
```

### Package Layout

```
packages/better-sol/          Runtime library (ships to browsers)
  src/program.ts              Program definition DSL (bs namespace)
  src/client.ts               Client factory + program client
  src/coder.ts                Borsh + zero-copy encode/decode
  src/idl.ts                  fromIdl() Anchor IDL import
  src/wallets/                Wallet adapter subpaths

packages/cli/                 CLI tool (never shipped to browsers)
  src/parser/ast.ts           ts-morph AST parser (565 LOC)
  src/parser/discover.ts      Glob-based file discovery
  src/generator/rust.ts       Anchor Rust + Cargo.toml + IDL (574 LOC)
  src/generator/body.ts       run() body → Rust transpiler (1154 LOC)
  src/generator/db.ts         Drizzle schema generator
  src/ir/types.ts             Intermediate representation (103 LOC)
  src/commands/               create, deploy, login, verify, generate

apps/compiler-api/            Rust cloud compiler (optional, self-hostable)
  src/main.rs                 Axum server
  src/compiler.rs             cargo build-sbf runner
```

## Design Principles

### 1. Import, Define, Use
No config files. No code generation step for the client. No boilerplate. One import, one definition, immediate use. Every beloved TypeScript library (Zod, Drizzle, tRPC) follows this pattern.

```typescript
import { bs } from "better-sol/program"  // ← one import
const Counter = bs.account({ ... })      // ← define
// Counter is immediately usable as a type and runtime value
```

### 2. The Definition Is the Client SDK
The `bs.program()` call returns a runtime object that doubles as the typed client. No IDL processing step. This is Drizzle's insight applied to Solana: the schema definition IS the query builder.

```typescript
const counter = bs.program({ ... }, ix => ({ ... }))
// counter.instructions.increment — typed instruction definition
// counter.accounts.Counter — typed account definition
// Used both by the transpiler AND by betterSol({ programs: { counter } })
```

### 3. Types Are Inferred, Never Written
Account fields, instruction parameters, PDA seed inputs, error names, event payloads — all inferred from the definition via TypeScript's type-level programming. The developer never writes a type annotation for Solana data structures.

```typescript
// These types are INFERRED, never written by hand:
type CounterData = bs.InferFields<typeof Counter.fields>
// → { count: bigint; authority: Address; isActive: boolean }
type IncrementAccounts = bs.InferAccounts<typeof counter, "increment">
// → { counter: { count: bigint; ... }; authority: Address }
```

### 4. One Namespace
All program definition primitives live under `bs`. No flat export soup of 18 cryptic names. Autocomplete shows everything by typing `bs.`. This follows Zod's `z.string()` pattern.

### 5. Transpiler Surface Separation
The program definition serves two roles: runtime schema (for the client SDK) and transpiler source (for Rust generation). These roles are separated by making the transpilation-only surface explicit:

- `bs.*` — runtime-valid schema constructors (available in browser and Node.js)
- `cpi.*` — transpilation-only CPI stubs (imported separately, tree-shaken from browser builds)
- `run()` bodies — transpilation-only; never executed as JavaScript

### 6. Honest Boundaries
The transpiler rejects 18 categories of unsupported TypeScript patterns with specific diagnostic messages naming the exact line and suggesting a fix. It does not silently generate broken Rust. This follows Zod's philosophy of naming the exact field and expected type in error messages.

### 7. Conservative Target
The transpiler targets Anchor Rust 1.0.x specifically, not raw `solana-program`. This is the right choice: Anchor is the most widely used Solana program framework, its IDL format is the ecosystem standard, and its account constraint model covers the vast majority of use cases.

## The 5-Step Flow

```
1. npm install better-sol                              (10 sec)
2. npx @better-sol/cli create counter                  (5 sec)
3. Edit programs/counter.ts                            (TypeScript)
4. npx @better-sol/cli login && deploy                 (10 sec)
5. Use the typed client — same file, zero extra code
```

Zero Rust. Zero config files. Zero code generation for the client. Zero dependency conflicts.

## Ecosystem Positioning

| | better-sol | Anchor | @solana/kit |
|---|---|---|---|
| **Program language** | TypeScript (transpiled to Anchor Rust) | Rust | Rust (separate) |
| **Client generation** | Automatic from definition | IDL + @coral-xyz/anchor | Manual or Codama |
| **Local Rust toolchain** | Not required | Required | N/A |
| **Single source of truth** | One .ts file | Rust + IDL + separate TS | Separate Rust + TS codebases |
| **TypeScript idioms** | First-class (`bs.u64()`, chained builders) | Wrapped Rust concepts | N/A (no program layer) |
| **Learning curve for TS devs** | Low (one namespace, inference) | High (Rust, macros, IDL) | Medium (tx lifecycle) |
| **Production maturity** | Pre-1.0 | Battle-tested (v1.0+) | Production-grade |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single `bs` namespace | All primitives + constraints + definitions under `bs` | Discoverability, consistency, Zod/Drizzle pattern |
| Cloud compilation | TS → Anchor Rust → `cargo build-sbf` → `.so` | No local Rust toolchain needed |
| Target Anchor Rust | Not raw solana-program, not Pinocchio | Widest ecosystem compatibility, IDL standard |
| `cpi` separate import | Transpiler stubs never shipped to browser | Tree-shaking, clear boundary |
| `@solana/kit` as foundation | Not legacy web3.js | Modern typed RPC, instruction plans, codecs |
| No `any`, no `@ts-ignore` | Strict type safety throughout | Caught design bugs at type-check time |
| Node.js + Bun for CLI | `npx` compat via Node.js target | Users don't need Bun installed |
| Runtime schema = transpiler source | Same `bs.program()` object used by both | Single source of truth, no sync drift |
