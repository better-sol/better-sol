# Client SDK Design — better-sol

The client SDK. Programs as plugins, like Better Auth. Zero code generation.

---


## The Split

```
better-sol           →  Runtime library: client SDK + program builder
@better-sol/cli      →  CLI: transpiler + cloud compiler + deploy (dev dependency)
```

The CLI is a separate package so the library stays lean.
No transpiler code ships to the browser. Projects using only the client never pull in the compiler.

---


**`npm install better-sol` and go.**

---

## 1. Hello World — 4 Lines

```typescript
import { betterSol } from 'better-sol'

const sol = betterSol({ cluster: 'devnet' })

const balance = await sol.getBalance('GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV')
// → 2500000000n
```

No config file. No CLI. No folder structure.
Just import and call a function.

---

## 2. Send SOL

```typescript
import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
})
const sender = sol.payer

const signature = await sol.transfer({
  from: sender,
  to: 'GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV',
  amount: 10_000_000n,
})
```

No blockhash. No fee payer setup. No `pipe()`.

---

## 3. Token Operations

```typescript
import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
})
const payer = sol.payer

// Create a token
const { mint } = await sol.token.createMint({ decimals: 9, authority: payer })

// Mint tokens
await sol.token.mintTo({ mint, destination: payer, amount: 1_000_000_000n })

// Check balance
const balance = await sol.token.getBalance({ owner: payer, mint })
// → 1_000_000_000n

// Transfer
await sol.token.transfer({
  mint,
  from: payer,
  to: 'GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV',
  amount: 100n,
})
```

`sol.token` is built-in. No extra install. No plugin.

---

## 4. Use an On-Chain Program (via IDL)

```typescript
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'  // Same file as the program definition

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter },
})

// address is in the program definition

const counterAddr = counter.accounts.Counter.derive({ authority: sol.payer })

// Execute an instruction — method appears automatically
await sol.counter.increment({
  counter: counterAddr,
  authority: sol.payer,
  amount: 10n,
})

// Read account — auto-decoded, fully typed
const account = await counter.accounts.Counter.fetch(counterAddr)
console.log(account.count) // → 52n
```

---

## 5. Multi-Step Operations

```typescript
// Array of instructions → one transaction
await sol.send([
  counter.initialize({ counter: addr1, authority: payer, initialValue: 0n }),
  counter.initialize({ counter: addr2, authority: payer, initialValue: 0n }),
])

// Sequential steps with dependencies
const result = await sol.steps([
  sol.token.createMint({ decimals: 9, authority: payer }),

  (s1) => sol.token.getATA({ owner: payer, mint: s1.mint }),

  (s1, s2) => sol.token.mintTo({ mint: s1.mint, destination: s2.address, amount: 1000n }),
])

result[0].mint       // Address of the mint
result[2].signature  // Final tx signature
```

---

## 6. Browser — Wallet Connection

```typescript
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'

const sol = betterSol({ cluster: 'mainnet-beta', programs: { counter } })

const wallet = await sol.connectWallet()  // auto-detects Phantom, Solflare, etc.

await sol.counter.increment({
  counter: counterAddr,
  authority: wallet,  // prompts user to approve
  amount: 1n,
})
```

Same API. The library detects the environment and adapts.

---

## 7. Testing

Use any test runner. No special setup.

```typescript
import { test, equal } from 'node:test'
import { createTestSol } from 'better-sol/testing'

test('transfer SOL', async () => {
  // createTestSol spins up LiteSVM — milliseconds, no validator
  const sol = createTestSol()
  const sender = sol.payer
  const receiver = await sol.createAccount()

  await sol.transfer({ from: sender, to: receiver.address, amount: 5000n })

  const balance = await sol.getBalance(receiver.address)
  equal(balance, 5000n)
})
```

```bash
node --test tests/transfer.ts
```

Your test runner. Your files. Your structure.

---

## What `better-sol` Ships

```
better-sol                    # betterSol(), createTestSol(), sol.transfer(), sol.token.*
better-sol/program            # program(), account(), ix(), p, token (CPI), sol (sysvars)
better-sol/testing            # createTestSol() with LiteSVM
```

---

# Part 2: better-sol/program (The Program Builder)

**`npm install better-sol/program` and define programs in TypeScript.**

This is a SEPARATE concern.
You only install this if you're writing on-chain programs.
Most developers will only use `better-sol`.

---


---

## 8. Define a Program

```typescript
import {
  program, account, ix, defineErrors,
  u64, bool, pubkey,
  p, log, emit,
} from 'better-sol/program'

// Define accounts (standalone, like Zod schemas)
const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).seeds('counter', '{authority}')

// Define errors (type-safe registry)
const errors = defineErrors({
  Unauthorized: 'Not the authority',
  NotActive: 'Counter is not active',
  BelowZero: 'Count would go below zero',
})

// Define the program — flat instruction map
export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, {

  initialize: ix({
    accounts: {
      counter: p.init(Counter),
      authority: p.signer(),
    },
    args: { initialValue: u64 },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),

  increment: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }) => {
      ctx.require(authority === counter.authority, 'Unauthorized')
      ctx.require(counter.isActive, 'NotActive')
      counter.count += amount
    },
  }),

  close: ix({
    accounts: {
      counter: p.close(Counter, 'authority'),
      authority: p.signer(),
    },
    run: ({}) => {
      // Account closed automatically by p.close()
    },
  }),
})
```

`program()` returns a typed namespace. At runtime, this object gives you:
- PDA derivation: `counter.accounts.Counter.derive({ authority })`
- Account size: automatic from field definitions
- Account decoder: used by `betterSol` to deserialize on-chain data
- Instruction builders: used by `betterSol` to serialize instruction data
- IDL export: `counter.idl` — auto-generated Anchor IDL for Codama/Anchor/IDL Space compatibility
- Type-safe require: `ctx.require(cond, 'Error')` — autocomplete, compile-time checked

**All of this works without any build step.**

---

## 9. Compile to On-Chain (The Hard Part)

### The Honest Reality

Solana programs must be deployed as **sBPF bytecode** (ELF binaries).
There is no way around this. The Solana runtime only executes sBPF.

The pipeline is always:

```
Your code → [something] → sBPF bytecode (.so file) → deploy to chain
```

Today, that `[something]` is LLVM compiling Rust (or C) to sBPF.

### Our approach: Cloud compilation

```
TypeScript program → parse AST → generate Anchor Rust → cloud cargo build-sbf → .so file
```

The developer never installs Rust. `npx @better-sol/cli deploy` handles everything:

```bash
npx @better-sol/cli deploy --cluster devnet
# → Parsing TypeScript AST...
# → Generating Anchor Rust...  (633 lines)
# → Compiling via cloud service...
# → Deploying to devnet...
```

The cloud service receives generated Anchor Rust, runs `cargo build-sbf`, returns the `.so` bytecode.
Like `drizzle-kit push` — you push your schema, the database updates.

The `program()` definition works as a client regardless — even without compilation, you get typed clients, account decoders, and PDA derivation.

---

## 10. Using the Program Builder with the SDK

The two packages compose naturally:

```typescript
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'  // Same file as the program definition

// Programs are plugins — like Better Auth
const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter },
})

const counterAddr = counter.accounts.Counter.derive({ authority: sol.payer })

// Execute — methods appear on client automatically
await sol.counter.initialize({
  counter: counterAddr,
  authority: sol.payer,
  initialValue: 0n,
})

await sol.counter.increment({
  counter: counterAddr,
  authority: sol.payer,
  amount: 10n,
})

// Fetch — auto-decoded, fully typed
const account = await counter.accounts.Counter.fetch(counterAddr)
console.log(account.count) // → 10n
```

---

## 11. Full Example: Token + Escrow

```typescript
import { betterSol } from 'better-sol'
import {
  program, account, ix, defineErrors,
  u64, u8, pubkey,
  p, token, emit,
} from 'better-sol/program'

// ── Program Definition ──

const Escrow = account({
  maker: pubkey,
  takerMint: pubkey,
  makerMint: pubkey,
  makerAmount: u64,
  takerAmount: u64,
  escrowId: u64,
  bump: u8,
}).seeds('escrow', '{maker}', '{escrowId}')

const errors = defineErrors({
  Unauthorized: 'Only the maker can refund',
  InvalidMint: 'Mint mismatch',
})

const escrow = program('escrow', 'EsCr0w11111111111111111111111111111111111', { errors }, {
  make: ix({
    accounts: {
      escrow: p.init(Escrow),
      maker: p.signer(),
    },
    args: { escrowId: u64, makerAmount: u64, takerAmount: u64 },
    run: ({ escrow, maker }, { escrowId, makerAmount, takerAmount }) => {
      escrow.maker = maker
      escrow.makerAmount = makerAmount
      escrow.takerAmount = takerAmount
      escrow.escrowId = escrowId
    },
  }),
  take: ix({ /* ... */ }),
  refund: ix({ /* ... */ }),
})

// ── Client Usage ──

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { escrow },
})

// Create escrow: I offer 1 SOL for 100 USDC
const escrowAddr = escrow.accounts.Escrow.derive({ maker: sol.payer, escrowId: 1n })

await sol.escrow.make({
  escrow: escrowAddr,
  maker: sol.payer,
  escrowId: 1n,
  makerAmount: 1_000_000_000n,
  takerAmount: 100_000_000n,
})

// Read escrow state
const escrowAccount = await escrow.accounts.Escrow.fetch(escrowAddr)
console.log(`Offering ${escrowAccount.makerAmount} for ${escrowAccount.takerAmount}`)
```

---

## The Architecture: Library + CLI

### `better-sol` — The Runtime Library

```typescript
import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter, amm },  // Programs as plugins — like Better Auth
})

// Core
sol.getBalance(address)
sol.transfer({ from, to, amount })

// Token (built-in)
sol.token.createMint({ decimals, authority })
sol.token.mintTo({ mint, destination, amount })
sol.token.transfer({ mint, from, to, amount })
sol.token.getBalance({ owner, mint })

// Program methods (auto-generated from program definitions)
sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
sol.amm.swapAForB({ pool: poolAddr, amountIn: 1_000_000n, minOut: 900_000n })

// Account fetching (typed)
const data = await counter.accounts.Counter.fetch(addr)

// Wallet (browser)
sol.connectWallet()

// Underlying access
sol.rpc                  // full @solana/kit RPC
sol.rpcSubscriptions     // full @solana/kit subscriptions
```

### `better-sol/program` — The Program Builder (subpath export)

Part of the `better-sol` package. Import it when defining on-chain programs.

```typescript
import {
  program, account, ix, defineErrors,
  u64, bool, pubkey,
  p, token, sol, emit, log,
} from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).seeds('counter', '{authority}')

const errors = defineErrors({
  Unauthorized: 'Not the authority',
})

const myProgram = program('my-program', 'MyPr0g11111111111111111111111111111111111', { errors }, {
  myInstruction: ix({
    accounts: { counter: p.mut(Counter), authority: p.signer() },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }) => {
      myProgram.require(authority === counter.authority, 'Unauthorized')
      counter.count += amount
    },
  }),
})

// What you get at runtime (no build step):
myProgram.idl                                        // Anchor IDL for ecosystem compatibility (Codama, Anchor TS, etc.)
myProgram.accounts.Counter.derive({ authority })      // PDA derivation
myProgram.accounts.Counter.fetch(addr)                // Typed account fetch
myProgram.require(cond, 'Error')                      // Type-safe require

// Optional: generate Rust + deploy to chain (separate CLI package)
// npm install -D @better-sol/cli
npx @better-sol/cli deploy --cluster devnet
// → Parses TS → generates Anchor Rust → cloud compile → deploy
```

### `@better-sol/cli` — The Compiler + Deployer

Separate package. Only needed when deploying programs. Not a runtime dependency.

```bash
# No install needed, just npx
npx @better-sol/cli deploy --cluster devnet
npx @better-sol/cli deploy --dry-run        # See generated Rust
npx @better-sol/cli deploy --verify       # Also write Rust to generated/ for verification
npx @better-sol/cli verify --program-id CouNTeR...  # Submit to OtterSec for verified build
```

The CLI is intentionally separate so:
- The library stays lean (no transpiler code in browser bundles)
- Projects that only use the client SDK never pull in the compiler
- The CLI can version independently from the library
```

---

## Library Checklist

| Question | Answer |
|---|---|
| Do I need a CLI to use it? | **No.** |
| Do I need a special folder structure? | **No.** |
| Do I need a config file? | **No.** CLI auto-discovers `programs/**/*.ts`. Optional `better-sol.config.ts` for defaults |
| Do I need a build step? | **No.** (Only for on-chain deployment, which is optional) |
| Can I use it in an existing project? | **Yes.** `npm install` and import |
| Can I use just the client without the program builder? | **Yes.** Subpath exports |
| Can I use just the program builder without the SDK? | **Yes.** It produces typed objects usable anywhere |
| Can I drop down to @solana/kit? | **Yes.** `sol.rpc` |
| Does it support verified builds? | **Yes.** `deploy --verify` + `verify` submits to OtterSec. Verified ✅ in Explorer. |
| Does it work in browser and Node? | **Yes.** Same API |
| Does it take over my test runner? | **No.** Use any test runner |

---

# Programs as Plugins (Better Auth Pattern)

## Programs as Plugins (Better Auth Pattern)

### The Problem with `kit.registerProgram()`

```typescript
// BAD — feels like configuration, not discovery
const sol = betterSol({ cluster: 'devnet', programs: { counter } })
// Why register separately if you already passed programs?
```

### The Better Auth Pattern

Better Auth works like this:

```typescript
// Server: define auth with plugins
const auth = betterAuth({
  database: ...,
  plugins: [twoFactor, admin]
})

// Client: create client with matching plugins
const sol = createAuthSol({
  baseURL: "...",
  plugins: [twoFactorClient, adminClient]
})

// Use: methods appear automatically from plugins
sol.twoFactor.enable({ password })
sol.admin.createUser({ ... })
```

The client mirrors the server's plugin structure. No manual registration.
Methods appear on the client object because the plugins define them.

### Our Equivalent

```typescript
// ── Server side: define your program ──
// programs/counter.ts
import { program, account, ix, defineErrors, u64, bool, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey, isActive: bool }).seeds('counter', '{authority}')
const errors = defineErrors({ Unauthorized: 'Not the authority', NotActive: 'Counter not active' })

export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, {
  // ix() instructions...
})
```

```typescript
// ── Client side: just import and use ──

// OPTION A: Your own program (defined with better-sol)
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'

const sol = betterSol({
  cluster: 'devnet',
  programs: { counter },  // ← like Better Auth plugins
})

// Methods appear automatically:
await sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
await sol.counter.fetch(addr)  // → typed account data
await sol.counter.accounts.Counter.derive({ authority: payer })

// OPTION B: From on-chain program (no local program definition)
import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
})

await sol.token.createMint({ decimals: 9, authority: payer })
await sol.token.transfer({ from, to, amount: 100n })
```

### The Key Insight: Programs ARE Plugins

In Better Auth, plugins extend both server and sol. In our system, program
definitions extend both the compiler and the sol. The same object that
defines accounts/instructions/logic also provides the client API.

No `registerProgram()`. The program IS the plugin.

### Full API Shape

```typescript
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'

const sol = betterSol({
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com', // optional, inferred from cluster
  payer: './keypair.json',                  // optional, can be set later
  programs: {
    counter,                                 // your custom program
  },
})

// ── Core operations (always available) ──
await sol.getBalance(address)
await sol.transfer({ from, to, amount })
await sol.execute(instruction)            // raw instruction execution

// ── Program-specific operations (from programs config) ──

// counter program — methods auto-generated from program definition
await sol.counter.initialize({ counter: addr, authority: payer, initialValue: 42n })
await sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
await sol.counter.close({ counter: addr, authority: payer })
await sol.counter.fetch(addr)             // → CounterAccount | null
await sol.counter.accounts.Counter.derive({ authority: payer })  // → PDA address

// token program — built-in, same API shape
await sol.token.createMint({ decimals: 9, authority: payer })
await sol.token.mintTo({ mint, destination, amount })
await sol.token.transfer({ mint, from, to, amount })
await sol.token.getBalance({ owner, mint })

// ── Multi-step (composing programs together) ──
await sol.steps([
  sol.token.createMint({ decimals: 9, authority: payer }),
  (s1) => sol.token.getATA({ owner: payer, mint: s1.mint }),
  (s1, s2) => sol.token.mintTo({ mint: s1.mint, destination: s2.address, amount: 1000n }),
])

// ── Wallet (browser) ──
const wallet = await sol.connectWallet()
// All methods now route through wallet for signing

// ── Testing ──
import { createTestSol } from 'better-sol/testing'

const sol = createTestSol({
  programs: { counter },
})
// Uses LiteSVM — milliseconds per test, no validator
```

### How Programs Become Client Methods

The `program()` function returns an object that serves dual purpose:

```typescript
// The program object has everything the client needs:
const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, { /* ix() instructions */ })

// For the client:
counter.name                                    // 'counter' → becomes sol.counter
counter.accounts.Counter.derive({ authority })  // PDA derivation
counter.accounts.Counter.decode(data)           // Account deserialization
counter.accounts.Counter.size                   // Space calculation
counter.instructions.increment.build(args)      // Instruction serialization

// For the compiler:
counter.idl                                     // Anchor IDL (auto-generated, ecosystem compatible)
counter.accounts                                 // Account schemas
counter.instructions                             // Instruction schemas + logic functions
```

When you pass a program to `betterSol({ programs: { counter } })`, the client:
1. Reads the program's accounts → creates `sol.counter.fetch()`, `sol.counter.accounts.*`
2. Reads the program's instructions → creates `sol.counter.increment()`, etc.
3. Reads the instruction schemas → knows how to serialize args, deserialize accounts
4. Uses the address from the program definition → PDAs derive correctly, transactions route to the right program

The address comes from `program('counter', 'CouNTeR...', { ... })` — it's right there in the
source code. No resolution, no environment variables, no hidden files.

Same address on every cluster:
```typescript
const devnetSol = betterSol({ cluster: 'devnet', programs: { counter } })
const mainnetSol = betterSol({ cluster: 'mainnet-beta', programs: { counter } })
// Same program address! PDA derivations are identical.
```

No code generation at runtime. The program object IS the runtime type information.
Like a Zod schema — it validates and provides types simultaneously.

---

## Developer Workflow

### Writing a New Program

```bash
# 1. Scaffold a program (like laravel make:migration)
npx @better-sol/cli create counter
# → Created programs/counter.ts
# → Generated keypair: CoUnTeR11111111111111111111111111111111111
# → Saved .better-sol/counter.json (private, gitignored)

# 2. Edit the generated file to add your logic
# (or skip `create` and write from scratch)
```
import { program, account, ix, defineErrors, u64, bool, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey, isActive: bool }).seeds('counter', '{authority}')
const errors = defineErrors({ Unauthorized: 'Not the authority', NotActive: 'Counter not active' })

export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, {
  initialize: ix({
    accounts: {
      counter: p.init(Counter),
      authority: p.signer(),
    },
    args: { initialValue: u64 },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),
  increment: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }) => {
      ctx.require(authority === counter.authority, 'Unauthorized')
      ctx.require(counter.isActive, 'NotActive')
      counter.count += amount
    },
  }),
})
EOF

# 2. Push to devnet (compile + deploy)
npx @better-sol/cli deploy --cluster devnet
# → Parsing programs/counter.ts...
# → Generating Anchor Rust...
# → Compiling via cloud service... (3.2s)
# → Deploying to devnet... (1.1s)
# → Done! Program: CoUnTeR... on devnet

# 2b. (Optional) For mainnet: verify your build
npx @better-sol/cli deploy --cluster mainnet-beta --verify
# → Writing generated Rust to generated/counter/...
# 📋 Commit and push, then: npx @better-sol/cli verify --program-id CoUnTeR...
git add generated/ && git commit -m "deploy counter v1" && git push
npx @better-sol/cli verify --program-id CoUnTeR...
# → ✅ Verification pending (OtterSec builds in Docker, ~5 min)

# 3. Use the sol
cat > app.ts << 'EOF'
import { betterSol } from 'better-sol'
import { counter } from './programs/counter'

const sol = betterSol({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { counter },
})

const addr = sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.initialize({ counter: addr, authority: sol.payer, initialValue: 42n })
const data = await sol.counter.fetch(addr)
console.log(data.count) // → 42n
EOF

node app.ts
```

### Making Changes (Like Drizzle)

```bash
# Edit your program...
# Maybe add a new instruction, or change a field

npx @better-sol/cli deploy --cluster devnet
# → Parsing programs/counter.ts...
# → Changes detected:
#     counter account: added field "lastUpdated" (u64)
#     new instruction: "reset"
# → Generating Anchor Rust (633 lines)...
# → Compiling via cloud service...
# → Upgrading program on devnet...
# → Done.
```

### Consuming an Existing On-Chain Program

```typescript
// No local program definition needed
// Use the built-in token, system, and ATA program clients
import { betterSol } from 'better-sol'

const sol = betterSol({
  cluster: 'mainnet-beta',
  payer: './keypair.json',
})

// sol.token is always available — no registration needed
await sol.token.transfer({ mint, from, to, amount })
```

### Where Does the Program Address Come From?

The `program()` definition includes the address as the second argument.
It was put there by `create`. You never type it manually.

```typescript
// Definition — address included (generated by `create`)
export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, {
  increment: ix({ ... }),
})

const sol = betterSol({
  cluster: 'devnet',
  programs: { counter },  // address from program definition
})
```

The address is in the program definition — it's the second argument of `program()`.
It was put there by `create`. You never type it manually.

Same address across all clusters:
```typescript
const devnetSol = betterSol({ cluster: 'devnet', programs: { counter } })

const mainnetSol = betterSol({ cluster: 'mainnet-beta', programs: { counter } })

// Same program address on both! PDA derivations are identical.
```

For CI/CD deployments, provide the keypair from a secret manager:
```bash
COUNTER_KEYPAIR=<base64> npx @better-sol/cli deploy --cluster mainnet-beta
```

**Where `deploy` gets the keypair:**
- First deploy: if no keypair exists in `.better-sol/`, `deploy` generates one and saves it to `.better-sol/counter.json`
- Subsequent deploys: reads the existing keypair from `.better-sol/counter.json`
- CI/CD: provide the keypair via `COUNTER_KEYPAIR` environment variable from your secret manager
- Security: for mainnet programs, set upgrade authority to multisig after deployment

**Where the client gets the address:**
- From the program definition — it's `program('counter', 'CouNTeR...', { ... })` in the source code
- No hidden files, no resolution logic, no environment variables
- It's just there

**For PDA derivation:** the program object carries the address.
`counter.accounts.Counter.derive({ authority })` uses the address from the definition.

---

### Using Someone Else's Program (from IDL)

If someone else built a program with Anchor (or our library), they published an IDL.
You can import it and get a typed client without our program builder:

```typescript
import { betterSol, fromIdl } from 'better-sol'
import { mangoIdl } from '@mango/idl'

const mango = fromIdl(mangoIdl)

const sol = betterSol({
  cluster: 'mainnet-beta',
  programs: { mango },
})

// Typed client generated from the IDL at runtime
await sol.mango.createAccount({ ... })
```

### Mixing Program Definitions and IDLs

`programs: { }` accepts both — program definitions AND IDL imports — in the same client:

```typescript
import { betterSol, fromIdl } from 'better-sol'
import { counter } from './programs/counter'  // our program builder
import { mangoIdl } from '@mango/idl'            // someone else's IDL

const mango = fromIdl(mangoIdl)

const sol = betterSol({
  cluster: 'mainnet-beta',
  payer: './keypair.json',
  programs: {
    counter,    // ← defined with our program builder
    mango,      // ← imported from IDL
  },
})

// All three work — methods appear on sol.programName
await sol.counter.increment({ ... })
await sol.mango.createAccount({ ... })
await sol.token.transfer({ ... })    // ← built-in, no registration needed
```

This is the Better Auth plugin pattern: *anything that implements the program interface*
can be a plugin. `program()` definitions, `fromIdl()` conversions, and built-in
programs all implement the same interface.

### How `fromIdl()` Works Under the Hood

The IDL contains everything needed to build a client at runtime:
- **Instruction discriminators** → used to serialize instruction data
- **Account discriminators** → used to identify and deserialize account data
- **PDA seeds** → used to derive addresses
- **Error codes** → mapped to names + messages

`fromIdl()` parses the IDL and produces the same shape as `program()`:
instruction builders, account decoders, PDA derivation functions. The client
can't tell the difference.

This also works with programs built by **our** library — since we auto-publish
an Anchor-compatible IDL alongside every deployment, anyone can use `fromIdl()`
to get a typed client without installing better-sol.

---

