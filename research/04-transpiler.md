# 04 — Transpiler & Compiler

The transpiler converts TypeScript program definitions into Anchor Rust programs. It runs inside the `@better-sol/cli` package and is never shipped to browsers.

---

## 1. Pipeline

```
programs/counter.ts (TypeScript)
        │
        ▼
┌───────────────────┐
│  ts-morph AST     │  parser/ast.ts — 565 LOC
│  parser           │  Walks TypeScript AST, extracts program structure
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Intermediate     │  ir/types.ts — 103 LOC
│  Representation   │  Language-agnostic program description
└───────┬───────────┘
        │
        ├──────────────┐
        ▼              ▼
┌──────────────┐ ┌──────────────┐
│  Rust code   │ │  IDL JSON    │
│  generator   │ │  generator   │
│  rust.ts     │ │  rust.ts     │
│  574 LOC     │ │  (idlType()) │
└──────┬───────┘ └──────┬───────┘
       │                │
       ▼                ▼
  lib.rs +           idl.json
  Cargo.toml
       │
       ▼
┌───────────────────┐
│  Cloud compiler   │  apps/compiler-api (Rust + Axum)
│  cargo build-sbf  │  Receives generated Rust → compiles → returns .so
└───────────────────┘
```

Additional output targets:
- **Database schema** — `generator/db.ts` (173 LOC) → Drizzle ORM (Postgres, MySQL, SQLite)

---

## 2. AST Parser (`parser/ast.ts`)

Uses `ts-morph` (TypeScript compiler API wrapper) to parse TypeScript source into IR.

### What It Extracts

- **Program declarations** — finds `bs.program()` calls, extracts config (name, address, errors, events)
- **Account definitions** — finds `bs.account()` calls, extracts fields, zeroCopy flag, PDA seeds
- **Struct definitions** — finds `bs.struct()` calls for zero-copy sub-structs
- **Instructions** — walks the `ix => ({...})` callback, extracts accounts, args, and `run()` body
- **Account constraints** — resolves `bs.init()`, `bs.mut()`, `bs.signer()`, `bs.mint()`, etc.
- **Type references** — resolves `bs.u64()`, `bs.pubkey()`, `bs.optional(...)`, `bs.vector(...)`, `bs.array(...)`
- **CPI calls** — detects `cpi.token.transfer()`, `cpi.sol.timestamp()` in `run()` bodies

### Constraint Resolution

The parser handles the new `bs.*` namespace by recognizing `PropertyAccessExpression` callees:

```
bs.init(Counter)     → CallExpression { callee: PropertyAccess[bs, init], args: [Identifier(Counter)] }
bs.signer()          → CallExpression { callee: PropertyAccess[bs, signer], args: [] }
bs.mint().writable() → CallExpression { callee: PropertyAccess[CallExpression{callee: PropertyAccess[bs, mint]}, writable] }
```

This is a ~10-line addition to `resolveType()` that checks for `bs.*` method calls alongside the existing `option()`/`vec()`/`array()` detection.

### File Discovery (`parser/discover.ts`)

Glob-based file discovery. Resolves the pattern from config (default: `programs/**/*.ts`), walks directories, filters out `node_modules` and `dist`, reads each file, and parses all programs found.

---

## 3. Intermediate Representation (`ir/types.ts`)

Language-agnostic program description. All generators consume IR, not TypeScript AST directly.

```typescript
type IrProgram = {
  name: string
  address: string
  accounts: IrAccount[]
  instructions: IrInstruction[]
  errors: IrError[]
  events: IrEvent[]
  structsZC: IrStructZC[]
}

type IrAccount = {
  name: string
  fields: IrAccountField[]
  zeroCopy: boolean
  seeds: IrSeed[]
  space: number           // computed: 8 (discriminator) + field layout
}

type IrInstruction = {
  name: string
  accounts: IrInstructionAccount[]
  args: IrInstructionArg[]
  body: string             // raw TypeScript body text for the body transpiler
}
```

### Why an IR Layer?

1. **Multiple output targets** — IR enables generating Anchor Rust, Pinocchio, raw solana-program, or other targets from the same source
2. **Separation of concerns** — parsing and code generation are independent
3. **Testability** — IR can be inspected and validated without running the full codegen
4. **Space computation** — account space is computed at IR time from field types, avoiding duplication

---

## 4. Rust Code Generator (`generator/rust.ts`)

Generates a complete Anchor project: `lib.rs`, `Cargo.toml`, and `idl.json`.

### Generated `lib.rs` Structure

```rust
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
// + anchor_spl imports if token CPI is used

declare_id!("<program_address>");

// Errors
#[error_code]
pub enum ProgramError { ... }

// Events
#[event]
pub struct EventName { ... }

// Zero-copy sub-structs
#[derive(Default)]
#[zero_copy]
pub struct StructName { ... }

// Accounts
#[account]  // or #[account(zero_copy)]
pub struct AccountName { ... }

// Program module
#[program]
pub mod program_name {
    use super::*;

    pub fn instruction_name(ctx: Context<InstructionName>, ...) -> Result<()> {
        // transpiled body
        Ok(())
    }
}

// Account validation structs
#[derive(Accounts)]
pub struct InstructionName<'info> { ... }
```

### Cargo.toml Generation

- Pins Anchor to `1.0.2`
- Includes `anchor-spl` only if token CPI is detected (with `token`, `associated_token`, `token_2022` features as needed)
- Includes `bytemuck` only if zero-copy accounts or structs are used
- `crate-type = ["cdylib", "lib"]`
- Standard Anchor feature flags

### IDL Generation

Generates an Anchor-compatible IDL with:
- Instructions: name, accounts (with isMut/isSigner), args (with types)
- Accounts: name, struct type with fields
- Errors: 6000+ codes with messages
- Events: name, fields with types
- Address: from program config

### Layout Computation

Account space is computed at IR time:
- **Borsh accounts**: 8 (discriminator) + sum of field sizes
- **Zero-copy accounts**: 8 (discriminator) + padded struct layout with alignment
- **Zero-copy structs**: padded layout with `_padding_N` fields for alignment

The zero-copy layout generator produces explicit Rust padding fields to match `bytemuck`'s `Pod` requirements. This is critical for correctness — misaligned zero-copy accounts cause runtime errors.

---

## 5. Body Transpiler (`generator/body.ts`)

The most complex component (1154 LOC). Converts the `run()` callback body from TypeScript to Rust.

### How It Works

1. **Symbol collection** — walks the AST to collect accounts, args, and local variables with their inferred types
2. **Mutability analysis** — tracks which locals and accounts are mutated to emit `let mut` bindings
3. **Statement-by-statement transpilation** — each TS statement is transpiled to equivalent Rust
4. **Type inference** — tracks the Solana type of every expression for correct casts and method calls
5. **CPI detection** — recognizes `cpi.token.transfer()` patterns and generates Anchor CPI code with signer seeds

### Type System

The body transpiler maintains a type inference system for `run()` bodies:

- Each symbol (account, arg, local) has an inferred `IrType`
- Property access on accounts is type-checked against the account's field definitions
- Token account properties (`mint`, `owner`, `amount`) and mint properties (`decimals`) are known
- Numeric binary operations cast both sides to a common type
- `sol.timestamp()` is inferred as `i64`
- `null` literal is inferred as `None` when assigned to optional fields

### CPI Code Generation

Token CPI calls generate full Anchor CPI contexts:

```rust
// cpi.token.transfer({ from, to, authority, amount })
anchor_spl::token::transfer(
    CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: from_account.to_account_info(),
            to: to_account.to_account_info(),
            authority: authority_account.to_account_info(),
        },
    ),
    amount,
)?;
```

When the authority is a PDA (has seeds), the transpiler generates `CpiContext::new_with_signer()` with computed signer seeds.

---

## 6. Unsupported Pattern Diagnostics

18 categories of unsupported TypeScript patterns are rejected at parse time. Each diagnostic:
- Names the exact unsupported pattern
- Points to the specific line in the source file
- Suggests the correct alternative

### Design Philosophy

The transpiler is **conservative by design**. It rejects patterns it cannot reliably translate rather than generating broken Rust that fails at compile time or (worse) at runtime. The 18 rejection categories are based on real patterns that developers attempt but that don't have a safe Solana equivalent.

### Complete Diagnostic List

| # | Pattern | Diagnostic message |
|---|---|---|
| 1 | `while` / `do-while` | "Use a bounded for loop: `for (let i = 0; i < limit; i++)`. On-chain programs need explicit bounds." |
| 2 | `for...of` / `for...in` | "Use a bounded index loop: `for (let i = 0; i < limit; i++)`." |
| 3 | `switch` | "Use explicit if/else branches." |
| 4 | `try/catch/finally` | "Use ctx.require(...) and Result-returning supported operations." |
| 5 | `throw` | "Use ctx.require(condition, 'ErrorName') with inline program errors." |
| 6 | `return` statements | "Instruction handlers must complete normally; remove return statements." |
| 7 | `await` | "On-chain instruction logic cannot await. Move async work to the client." |
| 8 | `Math.max()` / `Math.min()` | "Not available on-chain. Compare directly: `a > b ? a : b`." |
| 9 | Template strings | "Use string literals only in supported log/message contexts." |
| 10 | Object spread `{...obj}` | "Write every object field explicitly." |
| 11 | Destructuring | "Declare each local explicitly instead of using destructuring." |
| 12 | Nested functions / arrow functions | "Inline the logic or move it into a supported DSL primitive." |
| 13 | External constants | "Only instruction accounts, args, and locals are available in on-chain logic." |
| 14 | Mutable conditional aliases | "Rewrite as explicit branches so generated Rust preserves account mutations." |
| 15 | Unknown error in `ctx.require()` | "Add 'ErrorName' to program errors." |
| 16 | Unknown event in `ctx.emit()` | "Add 'EventName' to program events." |
| 17 | Unknown account field | "Field does not exist on this account type." |
| 18 | Extra/missing event payload fields | "Event payload fields must match the event definition." |

---

## 7. Cloud Compiler (`apps/compiler-api`)

Rust + Axum HTTP server that compiles generated Anchor Rust to sBPF bytecode.

### Endpoints

- `POST /compile` — accepts generated Rust source files, runs `cargo build-sbf`, returns `.so` binary
- Authentication via API key (stored in `~/.better-sol/auth.json` after `better-sol login`)

### Why Cloud Compilation

- **No local Rust toolchain** — developers don't need Rust, Cargo, Solana CLI, or BPF target installed
- **Reproducible builds** — compiler runs in a controlled environment with pinned toolchain versions
- **Faster onboarding** — 5 steps from zero to deployed program instead of wrestling with toolchain conflicts

### Self-Hosting

The compiler API is open-source. Teams can self-host for:
- Air-gapped environments
- Custom build configurations
- Offline development
- Lower latency

Set `BETTER_SOL_COMPILER_URL` environment variable to point to a self-hosted instance.

---

## 8. Database Schema Generator (`generator/db.ts`)

Generates Drizzle ORM schemas from account definitions:

```typescript
// From account definition:
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey(), bump: bs.u8() })

// Generated Drizzle schema:
export const counter = pgTable("counter", {
  count: bigint("count", { mode: "bigint" }).notNull(),
  authority: text("authority").notNull(),
  bump: integer("bump").notNull(),
})
```

Supports Postgres, MySQL, and SQLite dialects. Field types map: `u64/u128/i64/i128` → `bigint`, `u8/u16/u32/i8/i16/i32` → `integer`, `pubkey` → `text`, `bool` → `boolean`, `string` → `text`, `bytes` → `bytea`/`blob`.

---

## 9. Current Limitations

1. **`for` loop type mixing** — loop variables typed as `u64` but end bounds may be `u32`, causing type mismatches in generated Rust
2. **`struct_zc` only in zero-copy** — `bs.struct()` is only valid inside `bs.account().zeroCopy()`
3. **PDA-signed token CPI** — authority must be a PDA from the program or a signer; token account as authority generates invalid signer seeds
4. **`bool` in zero-copy rejected** — `bool` is not Pod-safe; use `bs.u8()` with explicit `=== 1` checks
5. **`vector()` default max** — `bs.vector(type)` defaults to 32 entries; use `.max(N)` for custom limits
6. **No instruction return values** — Anchor supports `-> Result<ReturnType>` but the DSL doesn't expose this
7. **Deploy tx not wired** — compiler produces `.so` but on-chain deployment transaction is not yet connected

---

## 10. Future Output Targets

| Target | Priority | Rationale |
|---|---|---|
| Anchor Rust (current) | Done | Widest ecosystem compatibility |
| Pinocchio | P3 | Zero-dependency, smaller `.so` |
| Raw solana-program | P4 | Maximum control, no framework |
| Rust interface crate | P3 | Follow official `spl-*-interface` pattern |
| Source maps | P3 | Map generated Rust back to TS source for debugging |
