# better-sol — Project Overview

## What We're Building

A TypeScript-first Solana development toolchain. Write one TypeScript program definition → get an on-chain program, a typed client SDK, and a database schema. No Rust toolchain required.

## Architecture

```
better-sol              Runtime library: type tokens, program builder, client SDK, wallet adapters
@better-sol/cli         CLI: parse, transpile, compile, deploy, verify
apps/compiler-api       Rust cloud compiler: receives generated Rust → returns sBPF bytecode
```

## Current State (May 2026)

Everything in the transpiler pipeline and client SDK is implemented and tested.

### Completed

- **Program definition API** — `program(config, ix => ({ ... }))` with inline errors/events, `account()`, `.derive()`, `ix()`, `p.*` constraints, all type tokens
- **TypeScript AST parser** — `ts-morph` based, extracts full DSL from `better-sol/program` syntax
- **Body transpiler** — Converts `run()` bodies to Rust: assignments, arithmetic, control flow, CPI, sysvars, `null`→`None`
- **Anchor Rust generator** — `lib.rs`, `Cargo.toml`, IDL — warning-free under Anchor 1.0.1
- **Unsupported-pattern diagnostics** — 18 failure fixtures with actionable messages
- **CLI commands** — `create`, `login`, `deploy`, `generate db`, `verify`
- **Cloud compiler API** — Axum server that runs `cargo build-sbf`
- **Client SDK** — `betterSol()` factory with typed instruction methods, PDA derivation, account fetching (Borsh + zero-copy), token operations (Token + Token-2022)
- **Wallet adapters** — Subpath exports for Wallet Adapter, Reown, Privy, Dynamic
- **Read-only clients** — `betterSol({ cluster })` without payer
- **`fromIdl()`** — Import existing Anchor IDLs as typed programs
- **Database schema gen** — `generate db` → Drizzle ORM from account definitions
- **Node.js compatibility** — CLI runs under both `npx` and `bunx`

### Not Yet Built

- On-chain deploy adapter (compiler produces `.so` but deploy tx not wired)
- `apps/web` frontend dashboard
- Watch mode / hot reload for CLI
- VS Code extension or LSP

## Commands Reference (Internal)

```bash
npx @better-sol/cli create <name>          # Scaffold program + keypair
npx @better-sol/cli login                  # Save API key to ~/.better-sol/auth.json
npx @better-sol/cli deploy                 # Parse → generate Rust → compile
npx @better-sol/cli deploy --dry-run       # Generate Rust only, no compile
npx @better-sol/cli generate db            # Drizzle schema from accounts
npx @better-sol/cli verify <name>          # Submit to OtterSec verified builds
```

`BETTER_SOL_COMPILER_URL` env var overrides the compiler URL (for local development). Not documented in user-facing docs.

## Test Count

**104 tests** — 54 SDK + 50 CLI. Zero lint/type/build errors.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single `program()` path | `program(config, ix => ({ ... }))` | One shape to learn, one path to parse |
| Cloud compilation | TS → Anchor Rust → `cargo build-sbf` → `.so` | No local Rust toolchain needed |
| API key via `login` | Stored in `~/.better-sol/auth.json` | One command, no flags to remember |
| Program keys via `create` | Stored in `.better-sol/<name>.json` | Per-program, not global |
| Same file = client SDK | Definition doubles as runtime client | Zero code generation for SDK |
| `@solana/kit` for client | Modern typed RPC | Not legacy web3.js |
| Anchor 1.0.1 pinned | Exact versions in generated Cargo.toml | Reproducible builds |
| No `any` / `@ts-ignore` | Strict type safety throughout | Caught bugs at design time |
| Node.js + Bun | CLI targets Node.js for `npx` compat | Build with `--target node` |
