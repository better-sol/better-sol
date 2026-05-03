# better-sol — What We're Building

**A TypeScript library that transpiles Solana programs to Anchor/Rust.**

Write one TypeScript definition. Get an on-chain program, a typed client SDK, and a database schema. No Rust toolchain needed.

---

## The Two Packages

```
better-sol              →  Define programs (runtime library, type tokens, stubs)
@better-sol/cli         →  Parse + transpile + compile + deploy (dev dependency)
```

The CLI parses TypeScript AST, generates Anchor Rust, optionally compiles it via a cloud service, and deploys to Solana. The runtime library provides the type-safe program definition API that doubles as a client SDK.

---

## Quick Start

### 1. Install

```bash
npm install better-sol
npm install -D @better-sol/cli
```

### 2. Define a Program

```typescript
import {
  program, account,
  u64, bool, pubkey, p,
} from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).derive((seed) => ["counter", seed.authority])

export const counter = program(
  {
    name: 'counter',
    address: 'CoUnTeR11111111111111111111111111111111111',
    errors: {
      Unauthorized: 'Not the authority',
      NotActive: 'Counter is not active',
    },
    events: {
      Incremented: { newCount: u64 },
    },
  },
  ix => ({
    initialize: ix({
      accounts: { counter: p.create(Counter), authority: p.signer() },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue
        counter.authority = authority
        counter.isActive = true
      },
    }),

    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
        ctx.emit('Incremented', { newCount: counter.count })
      },
    }),

    close: ix({
      accounts: { counter: p.close(Counter, 'authority'), authority: p.signer() },
      run: () => {},
    }),
  })
);
```

That's the entire program. One file. The same file is the typed client SDK — no code generation, no IDL step.

### 3. Compile and Deploy

```bash
npx @better-sol/cli deploy programs/counter.ts
```

This parses the TypeScript, generates Anchor Rust, compiles via cloud service, and deploys to devnet.

### 4. Use the Client (planned)

The same `counter` export provides typed instruction methods, PDA derivation, and account fetching. This runtime layer is the next milestone — the program definition API and transpiler are complete and validated.

---

## What Actually Exists

| Layer | Status | Details |
|---|---|---|
| Program definition API | ✅ Complete | `account()`, `ix()`, `program()`, `p.*`, type tokens |
| Program definition API | ✅ Complete | `program()` with inline errors/events, `account()`, `ix()`, `p.*`, type tokens |
| Type-safe errors + events | ✅ Complete | Errors and events validated by transpiler at build time |
| TypeScript AST parser | ✅ Complete | Parses `better-sol/program` syntax via `ts-morph` |
| Body transpiler | ✅ Complete | Converts `run()` bodies to Rust — assignments, arithmetic, control flow, CPI |
| Anchor Rust generator | ✅ Complete | Generates `lib.rs`, `Cargo.toml`, IDL |
| Unsupported-pattern diagnostics | ✅ Complete | Clear errors for unsupported TS patterns |
| Cloud compiler API | ✅ Complete | Rust API server that runs `cargo build-sbf` |
| CLI commands | ✅ Complete | `create`, `generate`, `deploy`, `verify` |
| Runtime client SDK | 🔄 In progress | `program.accounts.*.derive`, `fetch`, typed instruction clients |
| Wallet adapter | 📋 Planned | Subpath exports for wallet libraries |

| Database schema gen | 📋 Planned | Drizzle schema from account definitions |

---

## Key Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| **Scope** | Library, not framework | Import a function, call it. No folder structure, no config files. |
| **Packages** | Runtime: `better-sol` · CLI: `@better-sol/cli` | Library has no compiler code. CLI has no runtime code. |
| **Compilation** | Cloud (TS AST → Anchor Rust → cargo build-sbf → .so) | Developer never installs Rust. Like `drizzle-kit push`. |
| **Type safety** | Inline definitions + transpiler validation | `program({ errors: { ... }, events: { ... } })` provides clean definition; `ctx.require()` and `ctx.emit()` validated by transpiler |
| **Validation** | Parse-time AST walking | Unsupported TS patterns fail with actionable diagnostics before Rust compilation |
| **Same definition** | Program definition = future client SDK | Zero code generation. IDL auto-generated for ecosystem compatibility |
| **Anchor version** | Pinned to 1.0.1 | Exact versions in generated Cargo.toml for reproducible builds |

---

## The Program Definition API

Everything flows from three building blocks: **accounts**, **instructions**, and the **program**.

### Type Tokens

```typescript
import { u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, f32, f64, bool, pubkey, string, bytes } from 'better-sol/program'
```

Each token is both runtime metadata (for the transpiler) and a compile-time type carrier (for IDE autocomplete).

### Accounts

```typescript
const Pool = account({
  tokenAMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  isActive: bool,
}).derive((seed) => ["pool", seed.tokenAMint])     // seeds validated at compile time

const OrderBook = account({
  bids: array(Order, 256),
  askCount: u32,
}).derive((seed) => ["book", seed.market]).zeroCopy()  // Pod-safe types only
```

### Instructions

Two paths, one API:

```typescript
// Errors and events are defined inline in program()
const transfer = ix({
  accounts: { pool: p.mut(Pool), authority: p.signer() },
  args: { amount: u64 },
  run: ({ pool }, { amount }, ctx) => {
    ctx.require(pool.isActive, 'PoolInactive')
    ctx.emit('PoolUpdated', { newSupply: pool.lpSupply })
    pool.lpSupply += amount
  },
})

// The transpiler validates error/event names at build time
```

### Account Constraints

```typescript
p.create(Account)           // Create account with PDA seeds
p.mut(Account)            // Writable account
p.close(Account, refund)  // Close account, reclaim rent
p.signer()                // Transaction signer
p.mint()                  // SPL token mint (.mut() for writable)
p.tokenAccount()          // SPL token account (.mut() for writable)
p.tokenProgram()          // SPL Token program ID
p.token2022Program()      // Token-2022 program ID
p.systemProgram()         // System program ID
p.clock()                 // Clock sysvar
p.remaining(Account)      // Dynamic remaining accounts
```

### Body Language

The `run()` callback supports a safe subset of TypeScript:

| Feature | Syntax | Rust output |
|---|---|---|
| Field assignment | `pool.count = 5n` | `pool.count = 5;` |
| Arithmetic | `pool.count += amount` | `pool.count += amount;` |
| Require | `ctx.require(cond, 'Error')` | `require!(cond, Error::Error);` |
| Emit event | `ctx.emit('Name', { ... })` | `emit!(Name { ... });` (Rust output) |
| Log | `ctx.log("msg", val)` | `msg!("msg {}", val);` |
| Timestamp | `sol.timestamp()` | `Clock::get()?.unix_timestamp` |
| Token CPI | `token.transfer({ ... })` | `anchor_spl::token::transfer(...)` |
| If/else | `if (cond) { ... } else { ... }` | `if cond { ... } else { ... }` |
| Bounded for | `for (let i = 0; i < n; i++)` | `for i in 0..n` |
| Array index | `orders[i]` | `orders[i as usize]` |
| Pubkey coercion | `account.field` | `account.field.key()` |
| Non-null assertion | `items[i]!` | `items[i as usize]` (stripped) |
| Negation | `.abs()` | `.abs()` |

### Unsupported Patterns (with diagnostics)

The transpiler rejects these with clear guidance:

| Pattern | Message |
|---|---|
| `while` / `do while` | Use bounded `for` loop |
| `switch` | Use `if/else` |
| `try/catch` | Use `ctx.require()` |
| `return` | Handlers must complete normally |
| `await` | Not available on-chain |
| `Math.max(...)` | Not supported |
| Template strings | Use string literals |
| Object spread | Write fields explicitly |
| Destructuring | Declare each variable |
| External constants | Pass as instruction args |
| Mutable conditional aliases | Use explicit `if/else` branches |
| `for...of` / `for...in` | Use bounded index loop |
| Nested functions | Inline the logic |
| Unknown error name | Add to `program.errors` |
| Unknown event name | Add to `program.events` |
| Unknown account field | Use a declared field |

---

## What Makes This Different

Nobody else does **TypeScript → Rust transpilation** for Solana programs.

| Feature | Anchor (Rust) | Codama | Kite | **better-sol** |
|---|---|---|---|---|
| Write programs in TypeScript | ❌ | ❌ | ❌ | ✅ |
| TS → Rust transpilation | ❌ | ❌ | ❌ | ✅ |
| Cloud compilation | ❌ | ❌ | ❌ | ✅ |
| Same file = client SDK | ❌ | ❌ | ❌ | ✅ (planned) |
| Type-safe errors + events | ❌ | ❌ | ❌ | ✅ |
| Zero-copy accounts | Manual | ❌ | ❌ | ✅ `account().zeroCopy()` |
| Remaining accounts | Manual | ❌ | ❌ | ✅ `p.remaining()` |
| Token-2022 CPI | Manual | ❌ | ❌ | ✅ `p.token2022Program()` |
| Unsupported-pattern diagnostics | ❌ | ❌ | ❌ | ✅ |

---

## Research Files

### Core Documents

| # | File | Content |
|---|---|---|
| 00 | This file | Vision, architecture, API overview, feature matrix |
| 01 | `01-how-solana-works.md` | Solana fundamentals (accounts, programs, PDAs, tokens) |
| 02 | `02-reference-ecosystem.md` | @solana/kit packages, Rust SDK crates, pain points |
| 03 | `03-reference-dx.md` | Better Auth, ElysiaJS, Paykit DX case studies |
| 04 | `04-reference-competition.md` | Kite/Gill/Codama comparison, hackathon strategy |
| 05 | `05-design.md` | Complete design — type system, accounts, CPI, transpilation |
| 06 | `06-compiler.md` | Cloud compiler pipeline, deploy workflow |
| 07 | `07-sdk.md` | Client SDK design, wallet integration |
| 08 | `08-dx-principles.md` | DX principles, self-audit, "wow" checklist |
| 20 | `20-audit.md` | Implementation audit — current state vs research |

### Deep-Dive References

| File | Content |
|---|---|
| `appendix-token2022.md` | Token-2022 CPI exhaustive reference (anchor-spl source verified) |
| `appendix-zero-copy.md` | Zero-copy transpilation rules (Pod types, space, borrows) |
| `appendix-remaining-accounts.md` | `p.remaining()` design (real examples, security patterns) |
| `appendix-simulation.md` | Transaction simulation API reference (@solana/kit v1 + v2) |

### Examples

| File | Content |
|---|---|
| `counter-program.ts` | Hello world — seeds, errors, close, init |
| `amm-program.ts` | AMM — SPL token CPI, events, complex arithmetic |
| `t22-amm-program.ts` | Token-2022 — `transferChecked`, `p.token2022Program()` |
| `orderbook-program.ts` | Zero-copy + remaining accounts + `struct_zc` |
| `clmm-program.ts` | Concentrated liquidity — all features combined |
| `escrow-program.ts` | Errors + events + token CPI — `program()` with inline errors/events |
| `nft-staking-program.ts` | `vec()` type — dynamic arrays, bool flags, bounded loops |
| `showcase-program.ts` | All constraints — every `p.*`, all token CPI, `p.remaining()` |
| `amm-client-usage.ts` | Future client SDK usage patterns |
| `type-safety-complete.ts` | Type system POC — verified with `tsc --strict` |
| `amm-generated-rust.rs` | Transpiler output for AMM |
| `orderbook-generated-rust.rs` | Transpiler output for orderbook |

### Large Fixtures

| File | Content |
|---|---|
| `programs/success/lending-market-program.ts` | DeFi lending — 11 instructions, SPL token CPI |
| `programs/success/perpetuals-clearing-program.ts` | Zero-copy perps — 9 instructions, remaining accounts |
| `programs/success/dao-governance-program.ts` | Governance — 9 instructions, close, remaining accounts |
| `programs/fail/*.ts` | 18 unsupported-pattern fixtures with expected diagnostics |

---

## Validated Results

- **5 example programs** generate warning-free Anchor Rust via `cargo check --quiet`
- **3 large success fixtures** generate warning-free Anchor Rust
- **18 failure fixtures** produce specific, actionable diagnostics
- **54 tests passing** (7 in `better-sol`, 47 in `@better-sol/cli`)
- **All generated Rust** uses pinned Anchor 1.0.1, exact deps, no warnings
