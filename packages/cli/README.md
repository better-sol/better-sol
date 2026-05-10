# @better-sol/cli

> **Alpha**
>
> Better Sol is in early development. APIs may change, rough edges exist, and things can break. Your feedback shapes what comes next. Thank you for being an early adopter.

The Better Sol command-line tool. Scaffold programs, compile and deploy to Solana, generate database schemas, and import external programs.

No installation needed. Run with `npx` or `bunx`.

## Commands

### `init`

Set up a new project.

```bash
npx @better-sol/cli@alpha init
```

Creates a payer keypair at `keypair.json`, a `programs/` directory, and a `.gitignore`. Detects your existing Solana CLI keypair at `~/.config/solana/id.json` if you have one. Offers to install `better-sol` if a `package.json` exists.

| Flag | Description |
|---|---|
| `--force` | Overwrite existing files |
| `--skip-install` | Skip installing better-sol |

### `create`

Scaffold a new program.

```bash
npx @better-sol/cli@alpha create counter
```

Generates `programs/counter.ts` with a working counter template and `.better-sol/counter.json` with the program keypair.

| Flag | Default | Description |
|---|---|---|
| `--dir <dir>` | `programs` | Output directory |
| `--force` | `false` | Overwrite existing files |

### `deploy`

Compile and deploy to Solana.

```bash
npx @better-sol/cli@alpha deploy
```

Parses your TypeScript, compiles it via the cloud API, and deploys the binary. On devnet and testnet, automatically funds your payer if the balance is low. Compiled binaries are cached locally in `.better-sol/cache/` for testing.

| Flag | Default | Description |
|---|---|---|
| `--src <glob>` | `programs/**/*.ts` | Program source glob |
| `--program <name>` | all programs | Target a specific program |
| `--payer <path>` | `keypair.json` | Payer keypair path |
| `--cluster <cluster>` | `devnet` | `devnet`, `testnet`, `mainnet`, `localnet` |
| `--dry-run` | `false` | Validate without compiling or deploying |
| `--verify` | `false` | Write Rust for OtterSec verified builds |
| `--output <dir>` | `generated` | Rust output directory (only used with `--verify`) |

### `generate idl`

Import an external program from an on-chain address or a local IDL file.

```bash
# From an on-chain program
npx @better-sol/cli@alpha generate idl 12b3t1cNiAUoYLiWFEnFa4w6qYxVAiqCWU7KZuzLPYtH

# From a local IDL JSON file
npx @better-sol/cli@alpha generate idl ./staking-idl.json
```

Produces a typed `.ts` file in `generated/`. Detects whether the argument is an address or a file path automatically.

| Flag | Default | Description |
|---|---|---|
| `--out <path>` | `generated/<name>.ts` | Output file path |
| `--name <name>` | from IDL metadata | Override the program name |
| `--cluster <cluster>` | `mainnet` | Cluster for on-chain IDL fetch |

### `generate db`

Generate a Drizzle ORM schema from your account definitions.

```bash
npx @better-sol/cli@alpha generate db
```

| Flag | Default | Description |
|---|---|---|
| `--dialect <dialect>` | `postgres` | `postgres`, `mysql`, or `sqlite` |
| `--out <path>` | `src/db/better-sol.ts` | Output file path |
| `--src <glob>` | from config | Program source glob |

### `login`

Save your compiler API key.

```bash
npx @better-sol/cli@alpha login <api-key>
```

Get an API key at https://better-sol.fun/dash. Saves your key to `.better-sol/auth.json`. Because Better Sol is still experimental, compiler usage is rate limited: without a key you get 20 compiles per hour, and with a key you get 100 per hour.

### `verify`

Submit a deployed program for OtterSec verified-builds.

```bash
npx @better-sol/cli@alpha verify counter --program-id <address>
```

| Flag | Description |
|---|---|
| `--program-id <id>` | On-chain program ID to verify |
| `--lib-name <name>` | Rust library name (defaults to program name) |
| `--mount-path <path>` | Subdirectory with `Cargo.toml` (defaults to `generated/<name>`) |

## Configuration

Create an optional `better-sol.config.ts` in your project root:

```ts
import { defineConfig } from "@better-sol/cli"

export default defineConfig({
  programs: "programs/**/*.ts",
  cluster: "devnet",
  out: "generated",
  payer: "./keypair.json",
})
```

All fields are optional. CLI flags override config values. The `payer` field is only needed when you use a keypair outside the project directory.

## The flow

```
init ──→ keypair.json + programs/ + .gitignore
  │
  └──→ create counter ──→ programs/counter.ts + .better-sol/counter.json
         │
         └──→ deploy ──→ on-chain program
                │
                └──→ betterSol({ programs: { counter } }) ──→ typed client
```

## License

MIT
