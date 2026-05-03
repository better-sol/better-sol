# @better-sol/cli

**CLI for better-sol.** Parses TypeScript program definitions, generates Anchor/Rust on-chain code, and deploys to Solana.

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet --keypair ./keypair.json
```

---

## Why

The `better-sol` runtime library lets you define Solana programs in TypeScript. This CLI takes those definitions and:

1. Parses the TypeScript AST to extract program structure
2. Generates idiomatic Anchor Rust code (`lib.rs`, `Cargo.toml`, IDL)
3. Compiles via a cloud compiler API (or locally with Rust installed)
4. Deploys the compiled program to Solana

The generated Rust is warning-free, follows Anchor conventions, and passes `cargo check` out of the box.

---

## Installation

```bash
bun add -D @better-sol/cli
```

Or use directly without installing:

```bash
bunx @better-sol/cli --help
```

**Prerequisites:** [bun](https://bun.sh) runtime.

---

## Commands

### `deploy` — Generate, compile, and deploy

```bash
better-sol deploy --src "programs/*.ts" --cluster devnet --keypair ./keypair.json
```

Options:

| Flag | Default | Description |
|---|---|---|
| `--src` | (from config) | Glob pattern for program source files |
| `--program` | all programs | Target a specific program by name |
| `--cluster` | devnet | `devnet`, `testnet`, `mainnet-beta`, or `localnet` |
| `--keypair` | (from config) | Path to payer keypair file |
| `--output` | `generated/` | Directory for generated Rust |
| `--dry-run` | `false` | Generate and validate without compiling or deploying |
| `--verify` | `false` | Write generated Rust for verified builds |
| `--compiler-url` | — | Compiler API base URL (for cloud compilation) |
| `--api-key` | — | Compiler API key |

### `create` — Scaffold a new program

```bash
better-sol create my-program --dir programs
```

Options:

| Flag | Default | Description |
|---|---|---|
| `--dir` | `programs` | Directory to create the program in |
| `--force` | `false` | Overwrite existing files |

### `generate db` — Generate database schema

```bash
better-sol generate db --out src/db/schema.ts
```

Generates a Drizzle ORM schema from account definitions:

| Flag | Default | Description |
|---|---|---|
| `--orm` | `drizzle` | ORM target (currently only Drizzle) |
| `--dialect` | `postgres` | `postgres`, `mysql`, or `sqlite` |
| `--out` | `src/db/better-sol.ts` | Output file path |
| `--src` | (from config) | Glob pattern for program source files |
| `--merge` | `false` | Merge into existing schema (reserved) |

### `verify` — Verified builds

```bash
better-sol verify my-program --program-id <address>
```

Submits a deployed program for OtterSec verified-builds:

| Flag | Default | Description |
|---|---|---|
| `--program-id` | — | Program ID to verify |
| `--lib-name` | program name | Rust library name |
| `--mount-path` | `generated/<name>` | Subdirectory with Cargo.toml |

---

## Configuration

Create a `better-sol.config.ts` file in your project root:

```ts
import { defineConfig } from "@better-sol/cli";

export default defineConfig({
  programs: "programs/**/*.ts",
  output: "generated",
  keypair: "./keypair.json",
  compilerUrl: "https://compiler.better-sol.dev",
});
```

---

## How It Works

The CLI uses `ts-morph` to parse the TypeScript AST of your program definitions. It does not execute the TypeScript — it analyzes the syntax tree directly. This means:

- No runtime TypeScript execution needed
- Works with TypeScript 6
- Extracts exact type, seed, account, and constraint information
- Provides precise diagnostics for unsupported patterns

The parser understands the full `better-sol/program` DSL: `account()`, `.derive()`, `.zeroCopy()`, `struct()`, `ix()` configs, the `p.*` constraint API, inline errors/events, CPI calls, and sysvar access.

---

## Generated Rust

The generated Anchor Rust includes:

- `declare_id!()` with the program address
- Account structs with `#[account]` or `#[account(zero_copy)]`
- Zero-copy structs with padding, alignment, and field ordering
- Error enums with `#[msg()]` attributes
- Event structs with `#[event]`
- A `#[program]` module with all instructions
- `#[derive(Accounts)]` structs for each instruction with seeds, bump, and constraints
- `Cargo.toml` with correct Anchor and anchor-spl dependencies
- Complete IDL JSON

All generated code is warning-free under `cargo check` with no `#[allow()]` attributes needed.

---

## Current Limitations

- `for` loop variable and `u32` bound type mismatches in generated Rust
- `struct_zc` inside Borsh accounts only valid inside `.zeroCopy()`
- PDA-signed token CPI requires authority PDA from the program
- Database generation supports Drizzle ORM only (Postgres, MySQL, SQLite)

---

## Development

```bash
bun --filter @better-sol/cli check
bun --filter @better-sol/cli build
bun --filter @better-sol/cli test
bun --filter @better-sol/cli lint
```

---

## License

MIT
