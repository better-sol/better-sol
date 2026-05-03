# better-sol

**One TypeScript definition → on-chain Anchor Rust + typed client SDK + DB schema.**

Stop maintaining separate Anchor Rust programs and hand-written TypeScript clients. Write your program once in TypeScript. Derive everything else from it.

```ts
// ── Define your program in TypeScript ──
const Counter = account({ count: u64, authority: pubkey })
  .derive((seed) => ["counter", seed.authority]);

// ── Use the same definition as a fully typed client ──
const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } });
await sol.counter.increment({ counter: addr, amount: 10n });
const data = await sol.counter.accounts.Counter.fetch(addr);

// ── Generate on-chain Rust from the same file ──
// $ bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet
```

---

## The Problem

Building on Solana today means juggling separate codebases:

| Layer | Language | Output |
|---|---|---|
| On-chain logic | Rust (Anchor) | `.so` binary |
| Client SDK | TypeScript | Manual types that drift from the program |
| DB schema | SQL (Drizzle) | Manual mapping from Rust structs |

Every change requires updates in every layer. Types get out of sync. Bugs appear at boundaries.

## The Solution

Write **one TypeScript program definition**:

```
   your-program.ts
         │
         ├── ▶ better-sol (runtime) — fully typed client SDK
         │                    derives types, builds instructions,
         │                    fetches accounts, signs & sends
         │
         ├── ▶ @better-sol/cli — generates Anchor Rust + Cargo.toml + IDL
         │                    compiles via cloud API, deploys to Solana
         │
         └── ▶ @better-sol/cli generate db — generates Drizzle ORM schema
```

The TypeScript definition **is** the source of truth. All outputs derive from it.

---

## Quick Start

### 1. Install

```bash
# Runtime library (typed client SDK, program DSL)
bun add better-sol

# CLI (transpile to Rust + deploy — dev dependency)
bun add -D @better-sol/cli
```

### 2. Scaffold a program

```bash
bunx @better-sol/cli create counter
```

This creates `programs/counter.ts` with a working counter program and a program keypair in `.better-sol/counter.json`.

### 3. Use the program client-side

```ts
// client.ts
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

### 4. Generate Rust + deploy

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet
```

The CLI parses your TypeScript, generates clean Anchor Rust, compiles it, and deploys to Solana.

---

## How It Works

### 1. Define a program in TypeScript

`better-sol/program` provides a DSL for defining Solana programs:

```ts
import { account, p, program, pubkey, u64 } from "better-sol/program";

// ── Account schema with PDA seeds ──
const Counter = account({ count: u64, authority: pubkey })
  .derive((seed) => ["counter", seed.authority]);

// ── Program with instructions, errors, events ──
export const counter = program(
  {
    name: "counter",
    address: "CoUnTeR11111111111111111111111111111111111",
    accounts: { Counter },
    errors: { Unauthorized: "Not the authority" },
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

Key points:
- `program(config, ix => ({...}))` — one entry point, no builders
- `account()`, `.derive()`, `.zeroCopy()`, `struct()` — define accounts with PDA seeds
- `p.create()`, `p.mut()`, `p.close()`, `p.signer()` — Anchor constraints in TypeScript
- `ctx.require()`, `ctx.emit()` — typed errors and events, validated at transpile time
- Instructions only require the arguments they actually use

### 2. Use the same definition as a client SDK

Register the program definition with `betterSol()`:

```ts
import { betterSol, keypairFile } from "better-sol";

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});
```

Every instruction, account, error, and event from your definition is available as a typed method:

```ts
// Typed instruction calls
await sol.counter.initialize({ counter: addr, initialValue: 0n });

// Signer accounts auto-fill from the active payer
await sol.counter.increment({ counter: addr, amount: 5n });
// equivalent (explicit authority override):
await sol.counter.increment({ counter: addr, authority: sol.payer, amount: 5n });

// PDA derivation
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });

// Account fetching
const data = await sol.counter.accounts.Counter.fetch(addr);

// Three call forms per instruction:
sol.counter.increment({ counter: addr, amount: 5n });       // signs + sends + confirms → signature
await sol.counter.increment.instruction({ ... });             // → raw Instruction for batching
await sol.counter.increment.transaction({ ... });             // → signed Transaction
```

### 3. Generate on-chain Rust

```bash
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet
```

The CLI extracts your program structure via TypeScript AST parsing, generates:

- `lib.rs` — Anchor program with `#[program]`, `#[derive(Accounts)]`, error/event enums
- `Cargo.toml` — dependency manifest targeting Anchor 1.0.1
- `idl.json` — Anchor-compatible IDL

The generated Rust is warning-free and passes `cargo check` out of the box.

---

## Runtime Client SDK Reference

### Creating a client

```ts
// Server-side with keypair
const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json") });

// Read-only (balances, PDA derivation, account fetch — no payer needed)
const sol = await betterSol({ cluster: "devnet" });

// Browser (payer passed later via withSigner)
const sol = await betterSol({ cluster: "devnet" });
const userSol = await sol.withSigner(walletAdapter(wallet));
```

### Core operations

```ts
// SOL transfer
const sig = await sol.transfer({ to: "recipient...", amount: 10_000_000n });

// Get balance
const balance = await sol.getBalance("address...");

// Batch multiple instructions in one transaction
await sol.send([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  sol.counter.increment.instruction({ counter: addr2, amount: 2n }),
]);

// Sequential steps with chained dependencies
const [mintResult] = await sol.steps([
  () => sol.token.createMint({ decimals: 9 }),
  ({ mint }) => sol.token.mintTo({ mint, destination: sol.payer, amount: 1000n }),
]);
```

### Token operations

```ts
// Token Program (Tokenkeg...)
const { mint } = await sol.token.createMint({ decimals: 9 });
await sol.token.mintTo({ mint, destination: sol.payer, amount: 1_000_000_000n });
const balance = await sol.token.getBalance({ owner: sol.payer, mint });
await sol.token.transfer({ mint, to: "recipient...", amount: 100n });

// Token-2022 (TokenzQd...)
await sol.token2022.createMint({ decimals: 6 });
```

### Signer accounts are optional at call sites

Accounts declared with `p.signer()` don't need to be passed — they auto-fill:

```ts
// Definition:
increment: ix({
  accounts: { counter: p.mut(Counter), authority: p.signer() },
  args: { amount: u64 },
})

// Usage — authority auto-fills:
await sol.counter.increment({ counter: addr, amount: 5n });

// Explicit override:
await sol.counter.increment({ counter: addr, authority: otherAddr, amount: 5n });
```

### Instructions match what you define

```ts
// No accounts, no params → call with no arguments
await sol.app.ping();

// Params only → pass params object
await sol.app.setConfig({ value: 1n });

// Accounts only → pass accounts object
await sol.app.closeVault({ vault: addr });

// Both → single combined object
await sol.counter.increment({ counter: addr, amount: 5n });
```

---

## Browser & Wallet Support

better-sol is wallet-agnostic. A shared `sol` client stores RPC connections and program definitions. Wallet sessions are scoped via `sol.withSigner()`:

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

| Import | Peer library |
|---|---|
| `better-sol/wallets/wallet-adapter` | `@solana/wallet-adapter-react` |
| `better-sol/wallets/reown` | Reown AppKit |
| `better-sol/wallets/privy` | Privy |
| `better-sol/wallets/dynamic` | Dynamic |

---

## fromIdl — Use Any Anchor Program

Import an existing Anchor IDL — no TypeScript definition needed:

```ts
import { betterSol, fromIdl, keypairFile } from "better-sol";
import mangoIdl from "./mango.json";

const mango = fromIdl(mangoIdl);
const sol = await betterSol({ cluster: "mainnet-beta", payer: keypairFile("./keypair.json"), programs: { mango } });
await sol.mango.someInstruction({ ... });
```

---

## Package Exports

| Import path | Exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `version` |
| `better-sol/program` | `program`, `account`, `struct`, `p`, `token`, `sol`, type tokens, type helpers |
| `better-sol/wallets` | `walletAdapter`, `reownWallet`, `privyWallet`, `dynamicWallet` |
| `better-sol/wallets/wallet-adapter` | `walletAdapter` |
| `better-sol/wallets/reown` | `reownWallet` |
| `better-sol/wallets/privy` | `privyWallet` |
| `better-sol/wallets/dynamic` | `dynamicWallet` |

---

## Type Safety

- The program definition **is** the source of truth — instructions, accounts, args, errors, and events
- The client SDK derives types from the same definition — no code generation step needed in the runtime path
- PDA seeds are typed: `.derive((seed) => ["literal", seed.fieldName])` only exposes seedable fields
- Instruction calls require exactly the accounts and args you defined
- Signer accounts are optional at call sites but validated at runtime
- `fromIdl()` converts Anchor IDL JSON into the same typed definition — no manual type mapping

---

## Runtime Dependencies

- `@solana/kit` — RPC, addresses, signers, transactions
- `@solana-program/system` — SOL transfers
- `@solana-program/token` — SPL Token operations

No legacy `@solana/web3.js` in the runtime client.

---

## Current Limitations

- `for` loop variables and `u32` bounds can create type mismatches in generated Rust
- `struct_zc` inside Borsh accounts is only valid inside `.zeroCopy()` accounts
- PDA-signed token CPI requires the authority to be a PDA from the program or a signer
- Database schema generation supports Drizzle ORM with Postgres, MySQL, or SQLite

---

## Development

```bash
bun --filter better-sol check       # Type-check
bun --filter better-sol build       # Build dist
bun --filter better-sol test        # Run tests (54 tests)
bun --filter better-sol lint        # Lint
```

## License

MIT
