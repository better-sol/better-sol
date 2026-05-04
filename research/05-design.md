# Complete Design — better-sol

> Internal design document. Reflects the actual implementation as of May 2026.

---

## Design Principles

1. **Library, not framework** — `npm install` + import
2. **Same definition = client SDK** — one file, zero code generation for client
3. **No Rust toolchain** — cloud compilation via `npx @better-sol/cli deploy`
4. **Type-safe to the bone** — errors, events, accounts, token fields all compile-time checked
5. **Honest boundaries** — what we don't cover and exactly why

---

## Type System

### Primitive Types

| better-sol | TypeScript | Rust (Borsh) | Rust (Pod/zero-copy) | Notes |
|---|---|---|---|---|
| `u8` | `number` | `u8` | `u8` | |
| `u16` | `number` | `u16` | `u16` | |
| `u32` | `number` | `u32` | `u32` | |
| `u64` | `bigint` | `u64` | `u64` | |
| `u128` | `bigint` | `u128` | `u128` | |
| `i8` | `number` | `i8` | `i8` | |
| `i16` | `number` | `i16` | `i16` | |
| `i32` | `number` | `i32` | `i32` | |
| `i64` | `bigint` | `i64` | `i64` | |
| `i128` | `bigint` | `i128` | `i128` | |
| `f32` | `number` | `f32` | `f32` | Rarely used on-chain |
| `f64` | `number` | `f64` | `f64` | Rarely used on-chain |
| `bool` | `boolean` | `bool` | **rejected** | Pod has no bool — use `u8` flag |
| `pubkey` | `string` (Address) | `Pubkey` | `Pubkey` | `[u8; 32]` via ZeroCopyAccessor |
| `bytes` | `Uint8Array` | `Vec<u8>` | N/A | Not Pod-compatible |
| `string` | `string` | `String` | N/A | Not Pod-compatible |
| `option(T)` | `T | null` | `Option<T>` | N/A | Borsh-serialized |
| `vec(T)` | `T[]` | `Vec<T>` | N/A | Default `.max(32)` |
| `array(T, N)` | `FixedArray<T, N>` | `[T; N]` | `[T; N]` | Fixed-size |

### Zero-Copy Constraints

Zero-copy accounts (`account().zeroCopy()`) can only contain Pod types:
- `u8`, `u16`, `u32`, `u64`, `u128`, `i8`, `i16`, `i32`, `i64`, `i128`, `f32`, `f64`
- `pubkey` (stored as `[u8; 32]`, accessed via `ZeroCopyAccessor`)
- `u8` as boolean flag (`=== 0` / `=== 1`)
- Fixed arrays: `array(u64, 100)` → `[u64; 100]`
- Nested zero-copy structs: `struct_zc({ ... })`

**`bool` is rejected in zero-copy accounts** — not all bit patterns are valid `bool` in Rust.

---

## Program Definition API

### Single Entry Point

```typescript
export const counter = program(
  {
    name: "counter",
    address: "CoUnTeR11111111111111111111111111111111111",
    accounts: { Counter },
    errors: { Unauthorized: "Not the authority" },
    events: { Incremented: { newCount: u64 } },
  },
  ix => ({
    initialize: ix({ ... }),
    increment: ix({ ... }),
  }),
)
```

No `defineErrors()`, `defineEvents()`, `createProgramBuilder()`, or `ProgramBuilder` class.

### Account Constraints

```typescript
p.create(Account)           // Create account with PDA seeds
p.mut(Account)              // Writable account
p.close(Account, refund)    // Close account, reclaim rent
p.signer()                  // Transaction signer
p.mint()                    // SPL token mint (.mut() for writable)
p.tokenAccount()            // SPL token account (.mut() for writable)
p.tokenProgram()            // SPL Token program ID
p.token2022Program()        // Token-2022 program ID
p.systemProgram()           // System program ID
p.clock()                   // Clock sysvar
p.remaining(Account)        // Dynamic remaining accounts
```

### Body Language (`run()` callback)

| Feature | TypeScript | Rust output |
|---|---|---|
| Field assignment | `pool.count = 5n` | `pool.count = 5;` |
| Arithmetic | `pool.count += amount` | `pool.count += amount;` |
| Require | `ctx.require(cond, 'Error')` | `require!(cond, Error::Error);` |
| Emit event | `ctx.emit('Name', { ... })` | `emit!(Name { ... });` |
| Log | `ctx.log("msg", val)` | `msg!("msg {}", val);` |
| Token CPI | `token.transfer({ ... })` | `anchor_spl::token::transfer(...)` |
| If/else | `if (cond) { ... }` | `if cond { ... }` |
| Bounded for | `for (let i = 0; i < n; i++)` | `for i in 0..n` |
| Array index | `orders[i]` | `orders[i as usize]` |
| Pubkey coercion | `account.field` | `account.field.key()` |
| Null → None | `pool.auth = null` | `pool.auth = None;` |
| Non-null assertion | `items[i]!` | `items[i as usize]` (stripped) |

### Unsupported Patterns (18 diagnostics)

All rejected at parse time with actionable messages:

`while`, `do-while`, `switch`, `try/catch`, `return`, `await`, `Math.*`, template strings, object spread, destructuring, external constants, mutable conditional aliases, `for...of`, `for...in`, nested functions, unknown error/event/field names.

---

## PDA Seed Semantics

Single path: `.derive((seed) => ["literal", seed.fieldName])`.

Rules enforced at parse time:
- Dynamic seeds must be stored as account fields (pubkey/integer)
- `p.create(Account)` seeds must be supplied by matching instruction args/accounts
- Raw `'{argName}'` string templates rejected
- Account/arg name collisions rejected

---

## Client SDK

### Factory

```typescript
import { betterSol, keypairFile } from "better-sol"

// Full client (server-side)
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

// Read-only client (no payer)
const sol = await betterSol({ cluster: "devnet" })
```

### Core Methods

```typescript
sol.payer                          // Address (string) — null for read-only
sol.getBalance(address)            // bigint
sol.transfer({ to, amount })       // signature
sol.send([...instructions])        // signature
sol.steps([...])                   // StepChain for sequential txs
sol.withSigner(signer)             // Scoped client with different signer
```

### Program Methods

```typescript
sol.counter.initialize({ ... })                  // sign + send in one call
sol.counter.initialize.instruction({ ... })       // just build instruction
sol.counter.initialize.transaction({ ... })       // just build transaction

sol.counter.accounts.Counter.derive({ ... })      // PDA derivation
sol.counter.accounts.Counter.fetch(address)        // Fetch + decode account
```

### Token Operations

```typescript
sol.token.createMint({ decimals, authority })
sol.token.mintTo({ mint, to, amount })
sol.token.transfer({ mint, from, to, amount })
sol.token.getBalance(mint, owner)
sol.token2022.* // same API, Token-2022 program
```

### Wallet Adapters

```typescript
import { walletAdapter } from "better-sol/wallets/wallet-adapter"
import { reownWallet } from "better-sol/wallets/reown"
import { privyWallet } from "better-sol/wallets/privy"
import { dynamicWallet } from "better-sol/wallets/dynamic"
```

All return a `TransactionSigner` compatible with `sol.withSigner()`.

### Public SDK Exports

```typescript
// better-sol
export { betterSol, secretKey, keypairFile }
export type { BetterSolClient, BetterSolConfig, BoundAccount }
export { fromIdl }
export type { AnchorIdl, IdlProgram }
export { version }

// better-sol/program
export { program, account, struct_zc, p, token, sol,
         u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, f32, f64,
         bool, pubkey, string, bytes, option, vec, array }
export type { Address, ... }
```

### Removed from Public API

These were removed during design iterations — do not re-add:
- `generateSigner()` — server uses `keypairFile()`/`secretKey()`, client uses wallet adapters
- `SolSigner` type — `TransactionSigner` accepted directly
- `sol.destroy()` — WebSocket closes on page unload
- `IxInstruction`, `IxTransaction`, `TokenClient`, `Cluster` type exports
- `walletSigner()` no-op wrapper
- `BoundAccount.size`, `borshSize()`
- 4-overload `sol.steps()` → single generic `StepChain<T>`

---

## Package Structure

```
packages/better-sol/
├── src/
│   ├── program.ts          Type tokens, account(), program(), ix(), p.*, constraints
│   ├── client.ts           betterSol(), BetterSolClient, token ops, StepChain
│   ├── coder.ts            Borsh encode/decode, zero-copy layout, Anchor discriminators
│   ├── idl.ts              fromIdl() — Anchor IDL → ProgramDefinition
│   ├── version.ts          Version string
│   ├── wallets/
│   │   ├── sign-utils.ts   Shared wallet signing logic
│   │   ├── wallet-adapter.ts
│   │   ├── reown.ts
│   │   ├── privy.ts
│   │   └── dynamic.ts
│   └── index.ts            Public exports
├── test/
│   ├── program.test.ts     DSL tests (9)
│   ├── coder.test.ts       Borsh/zero-copy codec (15)
│   ├── idl.test.ts         fromIdl tests (12)
│   ├── client.test.ts      Client SDK tests (10)
│   └── wallets.test.ts     Wallet adapter round-trips (6)
└── dist/
    ├── index.js            Bundled runtime
    ├── program.js          Program definition subpath
    └── wallets/
        ├── wallet-adapter.js, reown.js, privy.js, dynamic.js

packages/cli/
├── src/
│   ├── index.ts            Commander CLI, shebang #!/usr/bin/env node
│   ├── config.ts           loadConfig(), defineConfig()
│   ├── auth.ts             getStoredApiKey(), storeApiKey() → ~/.better-sol/auth.json
│   ├── keypair.ts          createProgramKeypair() → .better-sol/<name>.json
│   ├── path.ts             fileExists, ensureDirectory, cwdPath
│   ├── types.ts            Cluster, CliConfig, DeployOptions, etc.
│   ├── api/client.ts       compileProgram() — POST to cloud compiler
│   ├── parser/
│   │   ├── ast.ts          ts-morph AST parser
│   │   └── discover.ts     File discovery (glob pattern → IrProgram[])
│   ├── generator/
│   │   ├── rust.ts         Anchor Rust + Cargo.toml + IDL generator
│   │   ├── body.ts         run() body → Rust transpiler
│   │   ├── code-writer.ts  Indentation helper
│   │   ├── db.ts           Drizzle schema generator
│   │   └── naming.ts       Snake/Pascal case conversion
│   └── commands/
│       ├── create.ts       Scaffold program
│       ├── login.ts        Save API key
│       ├── deploy.ts       Parse → generate → compile → deploy
│       ├── generate.ts     generate db
│       └── verify.ts       OtterSec verified builds
├── test/
│   ├── transpiler.test.ts  Parser + generator + diagnostic tests
│   ├── program-fixtures.test.ts  End-to-end fixture tests
│   ├── index.test.ts       Smoke test
│   └── fixtures/programs/
│       ├── success/        3 large program fixtures
│       └── fail/           18 unsupported-pattern fixtures
└── dist/
    └── index.js            Single bundled CLI (target: node)

apps/compiler-api/
├── src/
│   ├── main.rs             Axum server setup
│   ├── api.rs              Compile endpoint
│   ├── auth.rs             API key validation
│   ├── compiler.rs         cargo build-sbf runner
│   ├── config.rs           Server configuration
│   ├── error.rs            Error types
│   ├── idl.rs              IDL handling
│   └── storage.rs          Artifact storage
└── Cargo.toml
```
