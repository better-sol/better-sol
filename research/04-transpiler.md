# 04 — Transpiler & Compiler

The transpiler converts TypeScript program definitions into Anchor Rust programs. It runs inside the `@better-sol/cli` package and is never shipped to browsers.

---

## 1. Pipeline

```
programs/counter.ts (TypeScript)
        │
        ▼
┌───────────────────┐
│  ts-morph AST     │  parser/ast.ts
│  parser           │  Walks TypeScript AST, extracts program structure
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Intermediate     │  ir/types.ts
│  Representation   │  Language-agnostic program description
└───────┬───────────┘
        │
        ├──────────────┐
        ▼              ▼
┌──────────────┐ ┌──────────────┐
│  Rust code   │ │  IDL JSON    │
│  generator   │ │  generator   │
│  rust.ts     │ │  (inline)    │
└──────┬───────┘ └──────┬───────┘
       │                │
       ▼                ▼
  lib.rs +           idl.json
  Cargo.toml
       │
       ▼
┌───────────────────┐
│  Cloud compiler   │  apps/compiler-api (Bun)
│  cargo build-sbf  │  Receives generated Rust → compiles → returns .so
└───────────────────┘
```

Additional output targets:
- **Database schema** — `generator/db.ts` → Drizzle ORM (Postgres, MySQL, SQLite)

---

## 2. AST Parser (`parser/ast.ts`)

Uses `ts-morph` (TypeScript compiler API wrapper) to parse TypeScript source into IR.

### What It Extracts

- **Program declarations** — `bs.program()` calls, config (name, address, errors, events)
- **Account definitions** — `bs.account()` calls, fields, zeroCopy flag, PDA seeds
- **Struct definitions** — `bs.struct()` calls for zero-copy sub-structs
- **Instructions** — `ix()` callback, accounts, args, returns type, `run()` body
- **Account constraints** — `bs.init()`, `bs.mut()`, `bs.signer()`, `bs.realloc()`, `bs.hasOne()`, etc.
- **Type references** — `bs.u64()`, `bs.pubkey()`, `bs.optional(...)`, `bs.vector(...)`, `bs.array(...)`
- **CPI calls** — `cpi.token.transfer()`, `cpi.sol.timestamp()` in `run()` bodies

### Constraint Resolution

Recognizes `PropertyAccessExpression` callees:

```
bs.init(Counter)     → PropertyAccess[bs, init]
bs.signer()          → PropertyAccess[bs, signer]
bs.mint().writable() → PropertyAccess[CallExpression{bs.mint()}, writable]
bs.realloc(Vault, 512) → PropertyAccess[bs, realloc]
```

---

## 3. Intermediate Representation (`ir/types.ts`)

Language-agnostic program description. All generators consume IR, not TypeScript AST directly.

### Why an IR Layer?

1. **Multiple output targets** — IR enables Anchor Rust, Pinocchio, raw solana-program, or other targets
2. **Separation of concerns** — parsing and code generation are independent
3. **Testability** — IR can be inspected and validated without running codegen
4. **Space computation** — account space computed at IR time from field types

---

## 4. Rust Code Generator (`generator/rust.ts`)

Generates a complete Anchor project: `lib.rs`, `Cargo.toml`, and `idl.json`.

### Generated Structure

```rust
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("<program_address>");

#[error_code]
pub enum ProgramError { ... }

#[event]
pub struct EventName { ... }

#[derive(Default)]
#[zero_copy]
pub struct StructName { ... }

#[account]
pub struct AccountName { ... }

#[program]
pub mod program_name {
    pub fn instruction_name(ctx: Context<InstructionName>, ...) -> Result<()> { ... }
}

#[derive(Accounts)]
pub struct InstructionName<'info> { ... }
```

### Layout Computation

- **Borsh accounts**: 8 (discriminator) + sum of field sizes
- **Zero-copy accounts**: 8 (discriminator) + padded struct layout with alignment
- Zero-copy structs: explicit `_padding_N` fields for `bytemuck` `Pod` requirements

---

## 5. Body Transpiler (`generator/body.ts`)

The most complex component. Converts `run()` callback body from TypeScript to Rust.

### Capabilities

- **Symbol collection** — accounts, args, local variables with inferred types
- **Mutability analysis** — tracks mutations for `let mut` bindings
- **Statement-by-statement transpilation** — each TS statement to equivalent Rust
- **Type inference** — tracks Solana type of every expression
- **CPI detection** — `cpi.token.transfer()` → full Anchor CPI code with signer seeds
- **Return value handling** — `return <expr>` → `return Ok(expr);` when `returns:` type declared

---

## 6. Cloud Compiler (`apps/compiler-api`)

Bun HTTP server that compiles generated Anchor Rust to sBPF bytecode.

### Endpoints

- `POST /compile` — accepts generated Rust source files, runs `cargo build-sbf`, returns `.so` binary
- Authentication via API key (stored in `~/.better-sol/auth.json`)

### Why Cloud Compilation

- **No local Rust toolchain** — developers don't need Rust, Cargo, or Solana CLI
- **Reproducible builds** — controlled environment with pinned toolchain versions
- **Faster onboarding** — 5 steps from zero to deployed program

Self-hostable: set `BETTER_SOL_COMPILER_URL` environment variable.

---

## 7. Database Schema Generator (`generator/db.ts`)

Generates Drizzle ORM schemas from account definitions. Supports Postgres, MySQL, and SQLite dialects.

---

## 8. Current Limitations

1. **`for` loop type mixing** — loop variables typed as `u64` but end bounds may be `u32`
2. **`struct_zc` only in zero-copy** — `bs.struct()` only valid inside `bs.account().zeroCopy()`
3. **PDA-signed token CPI** — authority must be a PDA or signer
4. **`bool` in zero-copy rejected** — use `bs.u8()` with `=== 1` checks
5. **`vector()` default max** — `bs.vector(type)` defaults to 32 entries

---

## 9. Future Output Targets

| Target | Priority | Rationale |
|---|---|---|
| Anchor Rust (current) | Done | Widest ecosystem compatibility |
| Codama IDL bridge | P3 | Compatibility with newer Solana IDL format |
| Pinocchio | P4 | Zero-dependency, smaller `.so` |
| Raw solana-program | P5 | Maximum control |
| Source maps | P4 | Map generated Rust back to TS source |
