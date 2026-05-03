# better-sol

**One TypeScript definition → on-chain Anchor Rust + typed client SDK + DB schema.**

Stop maintaining separate Anchor Rust programs and hand-written TypeScript clients. Write your Solana program once in TypeScript. Derive everything else from it.

```bash
# Install the runtime library
npm install better-sol

# Scaffold a program (CLI runs via npx, no install needed)
npx @better-sol/cli create counter
# → programs/counter.ts + .better-sol/counter.json (keypair)

# Edit programs/counter.ts with your logic

# Generate Rust + compile + deploy
npx @better-sol/cli deploy --cluster devnet --keypair ./keypair.json
```

---

## Table of Contents

- [Why](#why)
- [The CLI Flow](#the-cli-flow)
- [Installation](#installation)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Program SDK (`better-sol/program`)](#program-sdk-better-solprogram)
- [Client SDK](#client-sdk)
- [Token Operations](#token-operations)
- [Browser & Wallet Support](#browser--wallet-support)
- [fromIdl — Use Any Anchor Program](#fromidl--use-any-anchor-program)
- [Package Exports](#package-exports)
- [Default Values](#default-values)
- [Current Limitations](#current-limitations)

---

## Why

Building on Solana today means maintaining separate codebases that drift out of sync:

| Layer | Problem |
|---|---|
| On-chain logic | Rust (Anchor) — must match client types manually |
| Client SDK | TypeScript — hand-written, types out of sync with program |
| DB schema | SQL — manually mapped from Rust structs |

**better-sol** solves this by using a single TypeScript definition as the source of truth for all outputs:

```
programs/counter.ts  (TypeScript)
    │
    ├── ▶ better-sol (runtime)  → typed client SDK (instructions, accounts, PDAs)
    │
    ├── ▶ @better-sol/cli       → Anchor Rust + IDL (lib.rs, Cargo.toml, idl.json)
    │                            compiles via cloud API, deploys to chain
    │
    └── ▶ @better-sol/cli generate db → Drizzle ORM schema
```

---

## The CLI Flow

### Create a program

```bash
bunx @better-sol/cli create <name>
```

This scaffolds a TypeScript program file and generates a program keypair:

```
programs/<name>.ts         ← your program definition
.better-sol/<name>.json    ← keypair (private, git-ignored)
```

The generated keypair's public key is embedded as your program address. You can replace it later.

### Edit the definition

Edit the generated file to define accounts, instructions, errors, events, and constraints. See [Program SDK](#program-sdk-better-solprogram) below.

### Generate Rust + deploy

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet --keypair ./keypair.json
```

The CLI:
1. Parses your TypeScript AST
2. Generates Anchor Rust (`lib.rs`, `Cargo.toml`, `idl.json`)
3. Compiles via a cloud compiler API
4. Prepares deployment artifacts

For local review without compiling:

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --dry-run
```

### Use the client SDK

```ts
import { betterSol, keypairFile } from "better-sol";
import { counter } from "./programs/counter";

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });
await sol.counter.increment({ counter: addr, amount: 5n });
const data = await sol.counter.accounts.Counter.fetch(addr);
```

---

## Installation

```bash
# Runtime library (required for both program definition and client SDK)
npm install better-sol
# or
bun add better-sol

# CLI (optional — run via npx/bunx without installing)
npx @better-sol/cli create counter
npx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet

# Or install as dev dependency for local use:
npm install -D @better-sol/cli
```

---

## CLI Commands

### `create <name>` — Scaffold a program

```bash
bunx @better-sol/cli create counter
# or with options:
bunx @better-sol/cli create counter --dir src/programs --force
```

| Option | Default | Description |
|---|---|---|
| `--dir <dir>` | `programs` | Output directory |
| `--force` | `false` | Overwrite existing files |

Creates `programs/<name>.ts` with a working counter example and generates a keypair at `.better-sol/<name>.json`.

### `deploy` — Generate Rust, compile, deploy

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet --keypair ./keypair.json
```

| Option | Default | Description |
|---|---|---|
| `--src <glob>` | `programs/**/*.ts` (or from config) | Glob pattern for program sources |
| `--program <name>` | all programs | Target a specific program by name |
| `--cluster <cluster>` | `devnet` (or from config) | `devnet`, `testnet`, `mainnet-beta`, or `localnet` |
| `--keypair <path>` | (from config) | Path to payer keypair file |
| `--output <dir>` | `generated` (or from config) | Directory for generated Rust files |
| `--dry-run` | `false` | Generate Rust only — no compile or deploy |
| `--verify` | `false` | Write generated Rust files for verified builds |
| `--compiler-url <url>` | `http://localhost:8080` or `BETTER_SOL_COMPILER_URL` | Cloud compiler API URL |
| `--api-key <key>` | `BETTER_SOL_COMPILER_API_KEY` | Compiler API key |

The `--dry-run` flag generates Rust to the output directory without compiling or deploying, useful for inspecting generated code before committing.

### `generate db` — Generate database schema

```bash
bunx @better-sol/cli generate db --out src/db/schema.ts
```

Generates a Drizzle ORM schema from your account definitions.

| Option | Default | Description |
|---|---|---|
| `--orm <orm>` | `drizzle` | ORM target (currently only Drizzle) |
| `--dialect <dialect>` | `postgres` | `postgres`, `mysql`, or `sqlite` |
| `--out <path>` | `src/db/better-sol.ts` | Output file path |
| `--src <glob>` | (from config) | Glob pattern for program sources |
| `--merge` | `false` | Merge into existing schema (reserved for future use) |

Extracts account field types and generates Drizzle table definitions with proper column types, nullability, and index hints.

### `verify` — Verified builds

```bash
bunx @better-sol/cli verify <name> --program-id <address>
```

| Option | Default | Description |
|---|---|---|
| `--program-id <id>` | — | On-chain program ID to verify |
| `--lib-name <name>` | program name | Rust library name |
| `--mount-path <path>` | `generated/<name>` | Subdirectory containing `Cargo.toml` |

Submits a deployed program for OtterSec verified-builds integration. Use `deploy --verify` first to write the generated Rust files, then deploy manually, then run `verify` against the on-chain program ID.

---

## Configuration

Create `better-sol.config.ts` in your project root to set default CLI options:

```ts
import { defineConfig } from "@better-sol/cli";

export default defineConfig({
  programs: "programs/**/*.ts",
  cluster: "devnet",
  keypair: "./keypair.json",
  out: "generated",
});
```

| Field | Default | Description |
|---|---|---|
| `programs` | `programs/**/*.ts` | Glob pattern for finding program source files |
| `cluster` | `devnet` | Default cluster: `devnet`, `testnet`, `mainnet-beta`, `localnet` |
| `keypair` | `null` | Default keypair path |
| `out` | `generated` | Default output directory for generated Rust |

The config file is optional — all fields can be overridden via CLI flags.

---

## Program SDK (`better-sol/program`)

Import from `better-sol/program` to define your Solana program:

```ts
import {
  program, account, struct,   // definitions
  u8, u16, u32, u64,          // number types (number → u8/u16/u32, bigint → u64)
  i64, i128,                  // signed types (bigint)
  bool, pubkey, string, bytes,// primitive types
  f32, f64,                   // float types (rarely used on-chain)
  option, vec, array,          // compound types
  p,                          // account constraints
  token, sol,                 // CPI stubs and sysvars
  type InstructionAccounts,
  type InstructionArgs,
  type ProgramInstructions,
  type ProgramErrors,
  type ProgramEvents,
  type ProgramAccounts,
} from "better-sol/program";
```

### Defining accounts

```ts
// Standard Borsh account
const Counter = account({
  count: u64,           // bigint
  authority: pubkey,    // Address (string)
  label: option(string),// string | null
  tags: vec(pubkey),    // Address[], max 32 entries by default
  bump: u8,             // number
}).derive((seed) => ["counter", seed.authority]);

// Zero-copy account (Pod-safe types only)
const Market = account({
  baseMint: pubkey,
  quoteMint: pubkey,
  feeBps: u64,
  paused: u8,           // bool is NOT allowed — use u8 flag
  bids: array(Order, 64), // fixed-size array of zero-copy sub-structs
}).derive((seed) => ["market", seed.baseMint, seed.quoteMint])
 .zeroCopy();
```

| Method | Description |
|---|---|
| `account({ field: type, ... })` | Define an account with field types |
| `.derive((seed) => [...])` | Attach PDA seeds. Seeds are literals (`"prefix"`) or field references (`seed.fieldName`) |
| `.zeroCopy()` | Mark account as zero-copy (Pod layout, `AccountLoader` in Rust) |

**Seed rules:**
- Literal strings become byte prefixes: `"counter"` → `b"counter"`
- `seed.fieldName` references an account field — only pubkey and integer fields are seedable
- The transpiler validates that each seed field is provided by an instruction arg or account with the same name during `p.create()`
- Raw `"{argName}"` string templates are **not supported** — store dynamic values as account fields

### Defining zero-copy sub-structs

```ts
const Order = struct({
  trader: pubkey,
  price: u64,
  quantity: u64,
  side: u8,
});
```

`struct()` fields must be Pod-safe (no `bool`, `string`, `bytes`, `option`, `vec`).

### Defining instructions

```ts
const program_definition = program(
  {
    name: "counter",
    address: "CoUnTeR11111111111111111111111111111111111",
    accounts: { Counter },    // optional — registers account definitions for the typed client
    errors: {
      Unauthorized: "Not the authority",
      NotActive: "Counter is not active",
    },
    events: {
      Incremented: { newCount: u64, authority: pubkey },
    },
  },
  ix => ({
    initialize: ix({
      accounts: { counter: p.create(Counter), authority: p.signer() },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue;
        counter.authority = authority;
      },
    }),
    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
      },
    }),
    close: ix({
      accounts: { counter: p.close(Counter, "authority"), authority: p.signer() },
      run: () => {},
    }),
  }),
);
```

#### Instruction `run()` signatures

The callback receives only what the definition specifies:

| Pattern | Callback signature |
|---|---|
| No accounts, no args | `(ctx) => void` |
| Accounts only | `(accounts, ctx) => void` |
| Args only | `(args, ctx) => void` |
| Accounts + args | `(accounts, args, ctx) => void` |

```ts
ping: ix({ run: (ctx) => ctx.log("ping") })
setValue: ix({ args: { value: u64 }, run: ({ value }, ctx) => {} })
close: ix({ accounts: { vault: p.mut(Vault) }, run: ({ vault }, ctx) => {} })
increment: ix({ accounts: { counter: p.mut(Counter) }, args: { amount: u64 }, run: ({ counter }, { amount }) => {} })
```

### Account constraints (`p.*`)

| Expression | Anchor Rust equivalent | Description |
|---|---|---|
| `p.create(Account)` | `init, payer, space, seeds` | Create a new PDA account |
| `p.mut(Account)` | `mut` | Read/write existing account |
| `p.close(Account, "refund")` | `close = refund` | Close account, refund rent |
| `p.signer()` | `Signer` | Transaction signer (auto-fills from active payer) |
| `p.mint()` | `Account<Mint>` | SPL Mint account |
| `p.tokenAccount()` | `Account<TokenAccount>` | SPL Token account |
| `p.mint().mut()` | `mut` on Mint | Writable mint |
| `p.tokenAccount().mut()` | `mut` on TokenAccount | Writable token account |
| `p.tokenProgram()` | `Program<Token>` | Token program address |
| `p.token2022Program()` | `Interface<TokenInterface>` | Token-2022 program address |
| `p.systemProgram()` | `Program<System>` | System program |
| `p.clock()` | `Sysvar<Clock>` | Clock sysvar |
| `p.remaining(item)` | `ctx.remaining_accounts` | Typed remaining accounts |

### ctx API

Inside `run()` callbacks:

```ts
ctx.require(condition, "ErrorName");   // → Anchor error with #[msg()]
ctx.emit("EventName", payload);         // → Anchor #[event]
ctx.log("message", value1, value2);     // → msg!() with format
```

Errors and events are validated at transpile time — referencing undefined names produces clear diagnostics.

### CPI stubs

For cross-program invocations, use the built-in stubs:

```ts
token.transfer({ from, to, authority, amount });
token.transferChecked({ from, to, authority, mint, amount, decimals });
token.mintTo({ mint, to, authority, amount });
token.burn({ from, mint, authority, amount });
```

These are type-checked at definition time and transpiled to Anchor CPI calls.

### Sysvar stubs

```ts
const now = sol.timestamp(); // → Clock::get()?.unix_timestamp
```

---

## Client SDK

```ts
import { betterSol, keypairFile, secretKey } from "better-sol";
```

### Creating a client

```ts
// Server-side with keypair file
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

// Server-side with raw secret key bytes
const sol = await betterSol({
  cluster: "devnet",
  payer: secretKey(new Uint8Array(64)),
  programs: { counter },
});

// Read-only — balances, PDA derivation, account fetches
const sol = await betterSol({ cluster: "devnet" });

// Browser — payer passed later via withSigner
const sol = await betterSol({ cluster: "devnet" });
const userSol = await sol.withSigner(walletAdapter(wallet));
```

| Config field | Default | Description |
|---|---|---|
| `cluster` | `devnet` | Predefined RPC URL for devnet/testnet/mainnet-beta/localnet |
| `rpcUrl` | derived from `cluster` | Custom RPC URL (requires explicit `rpcSubscriptionsUrl`) |
| `rpcSubscriptionsUrl` | derived from `cluster` | WebSocket URL for RPC subscriptions |
| `payer` | (none) | Signer configuration — `keypairFile()`, `secretKey()`, or Kit `TransactionSigner` |
| `programs` | `{}` | Program definitions to register |
| `commitment` | `"confirmed"` | `"processed"`, `"confirmed"`, or `"finalized"` |
| `confirmationRetries` | `30` | Transaction confirmation poll retries |
| `confirmationInterval` | `1000` ms | Poll interval between retries |
| `rpcRetries` | `3` | RPC call retries on failure |
| `simulate` | `false` | Pre-flight simulation before sending |

### Client properties

```ts
sol.payer            // Address | null — the active signer's address (null in read-only mode)
sol.rpc              // Kit RPC instance — for direct Solana RPC calls
sol.rpcSubscriptions // Kit RPC subscriptions instance
sol.token            // Token client (Tokenkeg...)
sol.token2022        // Token-2022 client (TokenzQd...)
sol.<programName>    // Typed program client for each registered program
```

### Instruction calls

Instruction methods match what the definition needs:

```ts
await sol.app.ping();                                   // no accounts, no params
await sol.app.setValue({ value: 1n });                  // params only
await sol.app.closeVault({ vault: vaultAddr });         // accounts only
await sol.counter.increment({ counter: addr, amount: 5n }); // accounts + params
```

Three forms per instruction:

```ts
// 1. Sign, send, confirm — returns signature string
const sig: string = await sol.counter.increment({ counter: addr, amount: 5n });

// 2. Build instruction — returns Kit Instruction for manual composition
const ix: Instruction = await sol.counter.increment.instruction({ counter: addr, amount: 5n });

// 3. Build signed transaction — returns signed sendable transaction
const tx: SignedTransaction = await sol.counter.increment.transaction({ counter: addr, amount: 5n });
```

### Signer auto-fill

Accounts declared with `p.signer()` are optional at the call site. When omitted, the active signer's address is used:

```ts
// Authority auto-fills from sol.payer
await sol.counter.increment({ counter: addr, amount: 5n });

// Explicit override
await sol.counter.increment({ counter: addr, authority: otherAddr, amount: 5n });
```

### Account operations

```ts
// PDA derivation — only requires the seed field values
const addr: Address = await sol.counter.accounts.Counter.derive({ authority: sol.payer });

// Account fetching — returns typed data or null
const data: { count: bigint; authority: Address } | null
  = await sol.counter.accounts.Counter.fetch(addr);

// Data is auto-decoded — Borsh for standard accounts, zero-copy layout for zero-copy accounts
```

### Multi-instruction batching

```ts
const sig = await sol.send([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  sol.counter.increment.instruction({ counter: addr2, amount: 2n }),
]);
// Single transaction, instructions execute sequentially
```

### Sequential steps with dependencies

```ts
const [mintResult, mintSig] = await sol.steps([
  () => sol.token.createMint({ decimals: 9 }),
  ({ mint }) => sol.token.mintTo({ mint, destination: sol.payer, amount: 1000n }),
]);
// Each step receives all previous steps' return values
```

### SOL operations

```ts
const balance: bigint = await sol.getBalance("address...");

const sig: string = await sol.transfer({
  to: "recipient...",
  amount: 10_000_000n, // lamports
  // from: defaults to sol.payer; use sol.withSigner() for different source
});
```

### Scoped signers

```ts
const userSol: BetterSolClient<..., true> = await sol.withSigner(walletAdapter(connectedWallet));
// userSol.payer is now Address (not null)
// All signer accounts auto-fill from this wallet
```

`withSigner()` returns a new client with the given signer. The original `sol` is unchanged. This means you can create a shared base client and scope wallet sessions per request or per component.

---

## Token Operations

`sol.token` and `sol.token2022` provide identical APIs for Token and Token-2022 programs.

```ts
// Create a mint
const { mint, mintSigner, signature } = await sol.token.createMint({
  decimals: 9,
  authority: sol.payer,             // optional — defaults to payer
  freezeAuthority: null,            // optional — defaults to null
});

// Get associated token account address
const ata: Address = await sol.token.getATA({ owner: sol.payer, mint });

// Mint tokens
await sol.token.mintTo({
  mint,
  destination: sol.payer,
  amount: 1_000_000_000n,
  decimals: 9,                      // optional — fetched from mint if omitted
});

// Check balance
const balance: bigint = await sol.token.getBalance({ owner: sol.payer, mint });

// Transfer
await sol.token.transfer({
  mint,
  to: "recipient...",
  amount: 100n,
  from: sol.payer,                  // optional — defaults to active signer
  decimals: 9,                      // optional — fetched from mint if omitted
});

// Token-2022 (same API, different program address)
await sol.token2022.createMint({ decimals: 6 });
```

---

## Browser & Wallet Support

better-sol is wallet-agnostic. A shared client stores RPC connections and program definitions. Wallet sessions are scoped per request.

```ts
import { walletAdapter } from "better-sol/wallets/wallet-adapter";
import { useWallet } from "@solana/wallet-adapter-react";

const sol = await betterSol({ cluster: "mainnet-beta" });

function App() {
  const wallet = useWallet();
  const handleClick = async () => {
    const userSol = await sol.withSigner(walletAdapter(wallet));
    await userSol.counter.increment({ counter: addr, amount: 1n });
  };
}
```

### Available adapters

| Import | Peer library | Adapter function |
|---|---|---|
| `better-sol/wallets/wallet-adapter` | `@solana/wallet-adapter-react` | `walletAdapter(wallet)` |
| `better-sol/wallets/reown` | Reown AppKit | `reownAppKit(appKitProvider)` |
| `better-sol/wallets/privy` | `@privy-io/react-auth` Solana | `privyWallet(privySolana)` |
| `better-sol/wallets/dynamic` | `@dynamic-labs/sdk-react-core` Solana | `dynamicWallet(dynamicSolana)` |

Each adapter converts the wallet library's signer into a Kit-compatible `TransactionSigner`.

You can also pass a Kit `TransactionSigner` directly:

```ts
const userSol = await sol.withSigner(myKitSigner);
```

---

## fromIdl — Use Any Anchor Program

Consume any external Anchor IDL as a typed program — no TypeScript definition needed:

```ts
import { betterSol, fromIdl, keypairFile } from "better-sol";
import mangoIdl from "./mango.json";

const mango = fromIdl(mangoIdl);
const sol = await betterSol({
  cluster: "mainnet-beta",
  payer: keypairFile("./keypair.json"),
  programs: { mango },
});
await sol.mango.someInstruction({ ... });
```

`fromIdl()` produces a `ProgramDefinition`-compatible object with typed instruction methods, account constraints, and error messages. Zero code generation — all types are derived at runtime from the IDL JSON.

---

## Package Exports

| Import path | Exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `version` |
| `better-sol/program` | `program`, `account`, `struct`, `p`, `token`, `sol`, all type tokens (`u8`, `u64`, `pubkey`, `bool`, ...), compound type helpers (`option`, `vec`, `array`), type helpers (`InstructionAccounts`, `InstructionArgs`, ...) |
| `better-sol/wallets` | `walletAdapter`, `reownWallet`, `privyWallet`, `dynamicWallet` |
| `better-sol/wallets/wallet-adapter` | `walletAdapter` |
| `better-sol/wallets/reown` | `reownWallet` |
| `better-sol/wallets/privy` | `privyWallet` |
| `better-sol/wallets/dynamic` | `dynamicWallet` |

### Version

```ts
import { version } from "better-sol";
console.log(version); // "0.1.0"
```

---

## Default Values

### CLI defaults

| Setting | Default | Source |
|---|---|---|
| `programs` glob | `programs/**/*.ts` | `config.ts` |
| `cluster` | `devnet` | `config.ts` |
| `out` directory | `generated` | `config.ts` |
| `compilerUrl` | `http://localhost:8080` | `deploy.ts` |

### Client SDK defaults

| Setting | Default | Source |
|---|---|---|
| `cluster` | `devnet` | `client.ts` |
| `commitment` | `"confirmed"` | `client.ts` |
| `confirmationRetries` | `30` | `client.ts` |
| `confirmationInterval` | `1000` ms | `client.ts` |
| `rpcRetries` | `3` | `client.ts` |

### RPC URLs

| Cluster | HTTP | WebSocket |
|---|---|---|
| `devnet` | `https://api.devnet.solana.com` | `wss://api.devnet.solana.com` |
| `testnet` | `https://api.testnet.solana.com` | `wss://api.testnet.solana.com` |
| `mainnet-beta` | `https://api.mainnet-beta.solana.com` | `wss://api.mainnet-beta.solana.com` |
| `localnet` | `http://127.0.0.1:8899` | `ws://127.0.0.1:8900` |

---

## Generated Rust Output

When you run `better-sol deploy --dry-run`, each program generates:

```
generated/<program-name>/
├── Cargo.toml          # Dependencies pinned to Anchor 1.0.1
├── src/
│   └── lib.rs          # Anchor program with:
│                        #   - declare_id!()
│                        #   - #[program] module with all instructions
│                        #   - #[derive(Accounts)] structs per instruction
│                        #   - #[account] / #[account(zero_copy)] structs
│                        #   - #[error_code] enum with #[msg()]
│                        #   - #[event] structs
│                        #   - anchor-spl imports for Token/Token-2022
└── idl.json            # Anchor-compatible IDL
```

The generated Rust passes `cargo check` with zero warnings and no `#[allow()]` attributes.

---

## Current Limitations

- **`for` loop type mixing**: Loop variables and `u32` bounds can create type mismatches in generated Rust
- **`struct_zc` outside zero-copy**: Only valid inside `account().zeroCopy()` accounts
- **PDA-signed token CPI**: Token transfer with `authority: tokenAccount` generates invalid signer seeds — authority must be a PDA from the program or a signer
- **`bool` in zero-copy**: `bool` is not Pod-safe — use `u8` with explicit `=== 1` checks
- **DB schema**: Supports Drizzle ORM only (Postgres, MySQL, SQLite)
- **Deployment adapter**: Compilation and IDL persistence are end-to-end; on-chain deployment adapter is still being wired
- **`vec()` default max**: `vec(type)` defaults to 32 entries — use `.max(N)` for custom limits

---

## License

MIT
