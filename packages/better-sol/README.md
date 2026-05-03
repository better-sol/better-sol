# better-sol

**TypeScript-first Solana SDK.** Define programs in TypeScript, generate on-chain Anchor/Rust, and get a fully typed client from the same program definition.

```ts
import { betterSol, keypairFile } from "better-sol";
import { counter } from "./programs/counter";

const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } });
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });
await sol.counter.increment({ counter: addr, amount: 10n });
```

---

## Why

Solana development today requires maintaining separate codebases: an Anchor Rust program, a TypeScript client SDK, and often a database schema. Each drifts out of sync. Types are lost at the boundary.

**better-sol lets you write one TypeScript definition** and derive the rest:

- TypeScript program definition (runtime + client SDK)
- Anchor Rust program (via `@better-sol/cli`)
- Drizzle ORM database schema (via `@better-sol/cli generate db`)
- Strongly typed instruction calls, PDA derivation, and account fetching

---

## Installation

```bash
bun add better-sol
```

For Rust code generation and deployment, add the CLI:

```bash
bun add -D @better-sol/cli
```

---

## Quick Start

### 1. Define a program

```ts
// programs/counter.ts
import { account, p, program, pubkey, u64 } from "better-sol/program";

const Counter = account({ count: u64, authority: pubkey })
  .derive((seed) => ["counter", seed.authority]);

export const counter = program(
  {
    name: "counter",
    address: "CoUnTeR11111111111111111111111111111111111",
    errors: { Unauthorized: "Not the authority" },
    accounts: { Counter },
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
  }),
);
```

### 2. Use it on-chain

```ts
// app.ts
import { betterSol, keypairFile } from "better-sol";
import { counter } from "./programs/counter";

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });

await sol.counter.initialize({ counter: addr, initialValue: 0n });
await sol.counter.increment({ counter: addr, amount: 5n });

const data = await sol.counter.accounts.Counter.fetch(addr);
console.log(data.count); // 5n
```

### 3. Generate Rust (optional — for deployment)

```bash
npx @better-sol/cli deploy --src "programs/*.ts" --dry-run
```

---

## Program Definition API

Import from `better-sol/program`:

| Export | Purpose |
|---|---|
| `program(config, ix => instructions)` | Define a program with name, address, errors, events, and instructions |
| `account({ field: type })` | Define an account schema |
| `.derive((seed) => [...])` | Attach PDA seeds to an account |
| `.zeroCopy()` | Mark account as zero-copy (Pod-safe types only) |
| `struct({ field: type })` | Define a zero-copy sub-struct |
| `p.create(Account)` | Account constraint: init a new PDA |
| `p.mut(Account)` | Account constraint: read/write |
| `p.close(Account, refundTo)` | Account constraint: close and refund |
| `p.signer()` | Signer constraint (auto-fills from active signer) |
| `p.mint()` / `p.tokenAccount()` | SPL token account constraints |
| `p.tokenProgram()` / `p.token2022Program()` | Token program references |
| `p.systemProgram()` / `p.clock()` | Built-in program references |
| `p.remaining(item)` | Remaining accounts (passed through) |
| `ctx.require(condition, "ErrorName")` | Runtime error guard |
| `ctx.emit("EventName", payload)` | Emit Anchor event |

**Type tokens:**

| Token | TS type | Rust type |
|---|---|---|
| `u8`, `u16`, `u32`, `u64`, `u128` | `number`, `number`, `number`, `bigint`, `bigint` | `u8`, `u16`, `u32`, `u64`, `u128` |
| `i8`, `i16`, `i32`, `i64`, `i128` | `number`, `number`, `number`, `bigint`, `bigint` | `i8`, `i16`, `i32`, `i64`, `i128` |
| `f32`, `f64` | `number` | `f32`, `f64` |
| `bool` | `boolean` | `bool` |
| `pubkey` | `Address` (string) | `Pubkey` |
| `string` | `string` | `String` |
| `bytes` | `Uint8Array` | `Vec<u8>` |
| `option(type)` | `TValue \| null` | `Option<T>` |
| `vec(type)` | `TValue[]` | `Vec<T>` |
| `array(type, N)` | fixed-length `TValue[]` | `[T; N]` |

### Instruction run signatures

Instructions don't require arguments you don't have:

```ts
ping: ix({ run: (ctx) => ctx.log("ping") })                            // no accounts, no args
setConfig: ix({ args: { value: u64 }, run: ({ value }) => {} })        // args only
close: ix({ accounts: { vault: p.mut(Vault) }, run: ({ vault }) => {} }) // accounts only
increment: ix({ accounts: { counter: p.mut(Counter) }, args: { amount: u64 }, run: ({ counter }, { amount }) => {} })
```

The run callback receives `(accounts, args, ctx)` where each parameter is omitted when not needed.

---

## Client SDK

```ts
import { betterSol, keypairFile, secretKey } from "better-sol";
```

### Creating a client

```ts
// Server-side with keypair
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

// Read-only (balances, PDA derivation, account fetch)
const sol = await betterSol({ cluster: "devnet" });

// Browser — pass payer later via withSigner()
const sol = await betterSol({ cluster: "devnet" });
const userSol = await sol.withSigner(adapter);
```

### Natural call signatures

Instruction methods only require the parameters the instruction needs:

```ts
await sol.app.ping();                                         // no params
await sol.app.setValue({ value: 1n });                        // params only
await sol.app.closeVault({ vault: vaultAddr });               // accounts only
await sol.counter.increment({ counter: addr, amount: 10n });  // accounts + params
```

Signer accounts (`p.signer()`) are optional at the call site and auto-fill from the active payer:

```ts
await sol.counter.increment({ counter: addr, amount: 1n });
// authority auto-fills from sol.payer

await sol.counter.increment({ counter: addr, authority: otherAddr, amount: 1n });
// explicit override
```

### Read & write accounts

```ts
// Derive PDA
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });

// Fetch account data
const account = await sol.counter.accounts.Counter.fetch(addr);
console.log(account.count, account.authority);

// Execute instruction (sign, send, confirm — returns signature)
const sig = await sol.counter.increment({ counter: addr, amount: 5n });
```

### Transaction building

Each instruction method exposes three forms:

```ts
sol.counter.increment({ counter: addr, amount: 5n });
// → signs, sends, confirms — returns signature

const ix = await sol.counter.increment.instruction({ counter: addr, amount: 5n });
// → returns a Kit Instruction for manual composition

const tx = await sol.counter.increment.transaction({ counter: addr, amount: 5n });
// → returns a fully signed sendable transaction
```

### Multi-instruction batching

```ts
await sol.send([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  sol.counter.increment.instruction({ counter: addr2, amount: 2n }),
]);
```

### Sequential steps with dependencies

```ts
const [mintResult] = await sol.steps([
  () => sol.token.createMint({ decimals: 9 }),
  ({ mint }) => sol.token.mintTo({ mint, destination: sol.payer, amount: 1000n }),
]);
```

Each step receives the return values of all previous steps.

---

## Token Operations

`sol.token` and `sol.token2022` are built-in:

```ts
// Create a mint
const { mint, mintSigner, signature } = await sol.token.createMint({ decimals: 9 });

// Mint tokens to an associated token account
await sol.token.mintTo({ mint, destination: sol.payer, amount: 1_000_000_000n });

// Get ATA address
const ata = await sol.token.getATA({ owner: sol.payer, mint });

// Check balance
const balance = await sol.token.getBalance({ owner: sol.payer, mint });

// Transfer
await sol.token.transfer({ mint, to: "recipient...", amount: 100n });

// Token-2022 (same API, different program)
await sol.token2022.createMint({ decimals: 6 });
```

---

## Browser & Wallet Support

better-sol is **wallet-agnostic**. A shared `sol` client stores the RPC connection and program definitions. Wallet sessions are scoped via `sol.withSigner()` — no global mutable state, no React context coupling.

```ts
import { walletAdapter } from "better-sol/wallets/wallet-adapter";
import { useWallet } from "@solana/wallet-adapter-react";

function App() {
  const wallet = useWallet();
  const handleClick = async () => {
    const userSol = await sol.withSigner(walletAdapter(wallet));
    await userSol.counter.increment({ counter: addr, amount: 1n });
  };
}
```

Available wallet adapters (each ~20 lines, opt-in via subpath import):

| Import | Peer library |
|---|---|
| `better-sol/wallets/wallet-adapter` | `@solana/wallet-adapter-react` |
| `better-sol/wallets/reown` | Reown AppKit |
| `better-sol/wallets/privy` | Privy |
| `better-sol/wallets/dynamic` | Dynamic |

---

## fromIdl — Use Any Anchor Program

Import an existing Anchor IDL as a typed program:

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

---

## Package Exports

```
better-sol                     → betterSol, keypairFile, secretKey, fromIdl, version
better-sol/program             → program, account, struct, p, token, sol, type tokens, helpers
better-sol/wallets             → walletAdapter, reownWallet, privyWallet, dynamicWallet
better-sol/wallets/wallet-adapter  → walletAdapter
better-sol/wallets/reown           → reownWallet
better-sol/wallets/privy           → privyWallet
better-sol/wallets/dynamic         → dynamicWallet
```

---

## Type Safety Philosophy

- The program definition **is the source of truth** for instruction accounts, args, errors, and events
- The client SDK derives its types from the same definition — no code generation in the runtime path
- PDA seeds are typed: `.derive((seed) => ["literal", seed.fieldName])` only exposes seedable fields
- Instruction calls require exactly the accounts and args the definition specifies
- Signer accounts are optional at the call site (they auto-fill) but validated at runtime
- `fromIdl()` converts Anchor IDL JSON into the same typed definition — no manual type mapping

---

## Runtime Dependencies

- `@solana/kit` — RPC, addresses, signers, transactions
- `@solana-program/system` — SOL transfers
- `@solana-program/token` — SPL Token operations

No legacy `@solana/web3.js` in the runtime client.

---

## Development

```bash
bun --filter better-sol check       # Type-check
bun --filter better-sol build       # Build dist
bun --filter better-sol test        # Run tests
bun --filter better-sol lint        # Lint
```

## Current Limitations

- `for` loop variables and `u32` bounds can create type mismatches in generated Rust
- `struct_zc` inside Borsh accounts is only valid inside `.zeroCopy()` accounts
- PDA-signed token CPI requires the authority to be a PDA from the program or a signer
- Database schema generation supports Drizzle ORM with Postgres, MySQL, or SQLite

---

## License

MIT
