# @better-sol/cli

**TypeScript → Anchor Rust transpiler + cloud compiler + deploy tool.**

Parse your `better-sol/program` TypeScript definitions and generate clean, warning-free Anchor Rust that compiles and deploys to Solana.

```bash
# Create a new program
npx @better-sol/cli create counter

# Generate Rust locally (dry run)
npx @better-sol/cli deploy --dry-run

# Save your API key (one time)
npx @better-sol/cli login

# Compile and deploy
npx @better-sol/cli deploy
```

---

## Why

You've defined a Solana program in TypeScript with `better-sol/program`. Now you need to run it on-chain. This CLI:

1. **Parses** your TypeScript — extracts account schemas, instruction definitions, constraints, seeds, errors, events, and body logic
2. **Generates** idiomatic Anchor Rust — `lib.rs`, `Cargo.toml`, `idl.json` — all warning-free under `cargo check`
3. **Compiles** via a cloud API — no local Rust toolchain needed
4. **Deploys** the compiled binary to Solana

The CLI uses `ts-morph` for AST parsing. It analyzes the syntax tree directly — no runtime TypeScript execution.

---

## Installation

No installation needed. Run directly with your preferred package runner:

```bash
# npm
npx @better-sol/cli create counter
npx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet

# Bun
bunx @better-sol/cli create counter
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet
```

For local development, install as a dev dependency:

```bash
npm install -D @better-sol/cli
# or
bun add -D @better-sol/cli
```

---

## Commands

### `create` — Scaffold a new program

```bash
npx @better-sol/cli create <name>
```

Creates `programs/<name>.ts` with a working counter program and generates a `.better-sol/<name>.json` keypair.

```bash
# Custom directory
npx @better-sol/cli create counter --dir src/programs

# Overwrite existing file
npx @better-sol/cli create counter --force
```

| Flag | Default | Description |
|---|---|---|
| `--dir` | `programs` | Output directory |
| `--force` | `false` | Overwrite existing files |

### `login` — Save your API key

```bash
npx @better-sol/cli login
```

Prompts for your compiler API key and saves it to `~/.better-sol/auth.json`. After logging in, `deploy` works without any flags:

```bash
npx @better-sol/cli login   # one-time setup
npx @better-sol/cli deploy  # just works
```

You can also set the `BETTER_SOL_COMPILER_API_KEY` environment variable or pass `--api-key` to `deploy`.

### `deploy` — Generate Rust, compile, and deploy

```bash
# Dry run — generate Rust for local review (no compile)
npx @better-sol/cli deploy --dry-run

# Compile + deploy (requires `login` first)
npx @better-sol/cli deploy

# Target a specific program
npx @better-sol/cli deploy --program counter

# Custom source glob and cluster
npx @better-sol/cli deploy --src "src/programs/*.ts" --cluster mainnet-beta
```

The deploy command:
1. Discovers all `program()` definitions in the source glob
2. Generates Anchor Rust (`lib.rs` + `Cargo.toml` + IDL)
3. Sends generated code to the cloud compiler
4. Records compilation artifacts and prepares deployment

| Flag | Default | Description |
|---|---|---|
| `--src` | (from config) | Glob pattern for program sources |
| `--program` | all | Target a specific program by name |
| `--cluster` | devnet | `devnet`, `testnet`, `mainnet-beta`, `localnet` |
| `--output` | `generated/` | Directory for generated Rust files |
| `--dry-run` | `false` | Generate Rust only — no compile or deploy |
| `--verify` | `false` | Write Rust files for verified builds |

### `generate db` — Generate database schema

```bash
npx @better-sol/cli generate db
```

Generates a Drizzle ORM schema from your account definitions:

| Flag | Default | Description |
|---|---|---|
| `--dialect` | `postgres` | `postgres`, `mysql`, or `sqlite` |
| `--out` | `src/db/better-sol.ts` | Output file |
| `--src` | (from config) | Glob pattern for program sources |

### `verify` — Verified builds

```bash
bunx @better-sol/cli verify my-program --program-id <address>
```

Submits a deployed program for OtterSec verified-builds:

| Flag | Default | Description |
|---|---|---|
| `--program-id` | — | On-chain program ID |
| `--lib-name` | program name | Rust library name |
| `--mount-path` | `generated/<name>` | Subdirectory with `Cargo.toml` |

---

## Configuration

Create `better-sol.config.ts` in your project root:

```ts
import { defineConfig } from "@better-sol/cli";

export default defineConfig({
  programs: "programs/**/*.ts",
  output: "generated",
});
```

The config file is optional — defaults are used when it doesn't exist.

---

## Workflow

```
1. npx @better-sol/cli create <name>
   └── scaffolds <name>.ts + keypair in .better-sol/

2. Edit programs/<name>.ts
   └── define accounts, instructions, constraints, errors, events

3. npx @better-sol/cli login
   └── saves API key to ~/.better-sol/auth.json (one-time)

4. npx @better-sol/cli deploy
   └── parses AST → generates Rust → compiles → deploys

5. Use better-sol SDK client-side
   └── import the definition, call typed methods
```

---

## How the Transpiler Works

The CLI uses `ts-morph` to parse TypeScript AST directly — it never executes the source code.

The parser understands:

- `program()`, `account()`, `.derive()`, `.zeroCopy()`, `struct()` declarations
- `ix()` configs with `accounts`, `args`, and `run` callbacks
- The `p.create()`, `p.mut()`, `p.close()`, `p.signer()` constraint API
- Inline errors/events in `program()` config
- CPI calls (`token.transfer()`, `token.mintTo()`)
- Sysvar access (`sol.timestamp()`)
- `ctx.require()`, `ctx.emit()`, `ctx.log()`
- All type tokens (`u8`, `u64`, `pubkey`, `bool`, `string`, etc.)
- Account field assignments, arithmetic, control flow

Unsupported patterns get clear diagnostics — 18 failure fixtures covering while loops, destructuring, await, function calls, etc.

The generator produces Anchor 1.0.1 compatible Rust with:
- `#[program]` module with all instructions
- `#[derive(Accounts)]` structs with seeds, bump, payer, space constraints
- `#[account]` / `#[account(zero_copy)]` structs
- `#[error_code]` enum with `#[msg()]` attributes
- `#[event]` structs
- Proper `anchor-spl` imports for Token / Token-2022
- Cargo.toml with pinned dependencies
- Complete IDL JSON

All generated Rust passes `cargo check` with zero warnings and no `#[allow()]` attributes.

---

## Current Limitations

- `for` loop variables and `u32` bounds can create type mismatches in generated Rust
- `struct_zc` inside Borsh accounts is only valid inside `.zeroCopy()` accounts
- PDA-signed token CPI requires the authority to be a PDA from the program or a signer
- Database generation supports Drizzle ORM only (Postgres, MySQL, SQLite)
- On-chain deployment adapter is not yet wired — compilation and IDL persistence are end-to-end

---

## Development

```bash
bun --filter @better-sol/cli check       # Type-check
bun --filter @better-sol/cli build       # Build CLI bundle
bun --filter @better-sol/cli test        # Run tests (50 tests)
bun --filter @better-sol/cli lint        # Lint
```

## License

MIT
