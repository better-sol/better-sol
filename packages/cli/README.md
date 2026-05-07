# @better-sol/cli

The Better Sol command-line tool. Scaffold programs, compile and deploy to Solana, generate database schemas, and import external programs.

No installation needed. Run with `npx` or `bunx`.

## Commands

### `init` - Set up a new project

```bash
npx @better-sol/cli init
```

Creates a `keypair.json` for paying transaction fees, a `programs/` directory, and a `.gitignore`. Detects your existing Solana CLI keypair at `~/.config/solana/id.json` if you have one.

### `create` - Scaffold a program

```bash
npx @better-sol/cli create counter
```

Generates `programs/counter.ts` with a working counter template and `.better-sol/counter.json` with the program keypair.

| Flag | Default | Description |
|---|---|---|
| `--dir <dir>` | `programs` | Output directory |
| `--force` | `false` | Overwrite existing files |

### `deploy` - Compile and deploy

```bash
npx @better-sol/cli deploy
```

Parses your TypeScript, generates Anchor Rust, compiles it via the cloud API, and deploys the binary to Solana. On devnet and testnet, automatically funds your payer if the balance is low.

| Flag | Default | Description |
|---|---|---|
| `--src <glob>` | `programs/**/*.ts` | Program source glob |
| `--program <name>` | all programs | Target a specific program |
| `--payer <path>` | from config or `keypair.json` | Payer keypair path |
| `--cluster <cluster>` | `devnet` | `devnet`, `testnet`, `mainnet`, `localnet` |
| `--dry-run` | `false` | Generate Rust without compiling or deploying |
| `--verify` | `false` | Write Rust files for verified builds |
| `--output <dir>` | `generated` | Output directory for Rust files |

### `generate idl` - Import an external program

```bash
# From an on-chain program address
npx @better-sol/cli generate idl 12b3t1cNiAUoYLiWFEnFa4w6qYxVAiqCWU7KZuzLPYtH

# From a local IDL JSON file
npx @better-sol/cli generate idl ./staking-idl.json
```

Produces a typed `.ts` file in `generated/` that you can import and use with `betterSol()`. Detects whether the argument is an address or a file path automatically.

| Flag | Default | Description |
|---|---|---|
| `--out <path>` | `generated/<name>.ts` | Output file path |
| `--name <name>` | from IDL metadata | Override the program name |
| `--cluster <cluster>` | `mainnet` | Cluster for on-chain IDL fetch |

### `generate db` - Generate a database schema

```bash
npx @better-sol/cli generate db
```

Generates a Drizzle ORM schema from your account definitions.

| Flag | Default | Description |
|---|---|---|
| `--dialect <dialect>` | `postgres` | `postgres`, `mysql`, or `sqlite` |
| `--out <path>` | `src/db/better-sol.ts` | Output file |
| `--src <glob>` | from config | Program source glob |

### `login` - Save your API key

```bash
npx @better-sol/cli login
```

Saves your compiler API key to `.better-sol/auth.json`. Without a key you get 5 compiles per hour. With a key, 100 per hour.

### `verify` - Verified builds

```bash
npx @better-sol/cli verify counter --program-id <address>
```

Submits a deployed program for OtterSec verified-builds.

## Configuration

Create `better-sol.config.ts` in your project root (optional):

```ts
import { defineConfig } from "@better-sol/cli"

export default defineConfig({
  programs: "programs/**/*.ts",
  cluster: "devnet",
  out: "generated",
  payer: "./keypair.json",
})
```

All fields are optional. CLI flags override config values.

## The flow

```
init ──→ keypair.json + programs/ + .gitignore
  │
  └──→ create counter ──→ programs/counter.ts + .better-sol/counter.json
         │
         └──→ deploy ──→ on-chain program (parses TS, generates Rust, compiles, deploys)
                │
                └──→ betterSol({ programs: { counter } }) ──→ typed client
```

## License

MIT
