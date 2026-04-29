# End-to-End Vision v3 — Two Focused Libraries

## The Split

```
@solana-kit/sdk     →  Client library: interact with Solana (transfer, tokens, accounts, wallets)
@solana-kit/program →  Program builder: define + compile Solana programs from TypeScript
```

They're separate packages with separate concerns.
You can use either one without the other.
They compose naturally when you need both.

---

# Part 1: @solana-kit/sdk (The Client Library)

**`npm install @solana-kit/sdk` and go.**

---

## 1. Hello World — 4 Lines

```typescript
import { solanaKit } from '@solana-kit/sdk'

const kit = solanaKit({ cluster: 'devnet' })

const balance = await kit.getBalance('GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV')
// → 2500000000n
```

No config file. No CLI. No folder structure.
Just import and call a function.

---

## 2. Send SOL

```typescript
import { solanaKit, lamports } from '@solana-kit/sdk'

const kit = solanaKit({ cluster: 'devnet' })
const sender = await kit.loadSignerFromFile('./keypair.json')

const signature = await kit.transfer({
  from: sender,
  to: 'GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV',
  amount: lamports('0.01'),
})
```

No blockhash. No fee payer setup. No `pipe()`.

---

## 3. Token Operations

```typescript
import { solanaKit } from '@solana-kit/sdk'

const kit = solanaKit({ cluster: 'devnet' })
const payer = kit.payer

// Create a token
const { mint } = await kit.token.createMint({ decimals: 9, authority: payer })

// Mint tokens
await kit.token.mintTo({ mint, destination: payer, amount: 1_000_000_000n })

// Check balance
const balance = await kit.token.getBalance({ owner: payer, mint })
// → 1_000_000_000n

// Transfer
await kit.token.transfer({
  mint,
  from: payer,
  to: 'GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV',
  amount: 100n,
})
```

`kit.token` is built-in. No extra install. No plugin.

---

## 4. Use an On-Chain Program (via IDL)

```typescript
import { solanaKit } from '@solana-kit/sdk'
import { getCounterProgram } from './generated/counter'  // generated from IDL

const kit = solanaKit({ cluster: 'devnet' })

const counter = getCounterProgram(kit)
const counterAddr = counter.accounts.counter.derive({ authority: kit.payer })

// Execute an instruction
await kit.execute(
  counter.instructions.increment({
    counter: counterAddr,
    authority: kit.payer,
    amount: 10n,
  })
)

// Read account — auto-decoded
const account = await counter.fetchAccount(counterAddr)
console.log(account.count) // → 52n
```

---

## 5. Multi-Step Operations

```typescript
// Array of instructions → one transaction (or auto-split if too large)
await kit.execute([
  counter.instructions.initialize({ counter: addr1, authority: payer, initialValue: 0n }),
  counter.instructions.initialize({ counter: addr2, authority: payer, initialValue: 0n }),
])

// Sequential steps with dependencies
const result = await kit.steps([
  kit.token.createMint({ decimals: 9, authority: payer }),

  (s1) => kit.token.createAssociatedTokenAccount({ owner: payer, mint: s1.mint }),

  (s1, s2) => kit.token.mintTo({ mint: s1.mint, destination: s2.address, amount: 1000n }),
])

result[0].mint       // Address of the mint
result[2].signature  // Final tx signature
```

---

## 6. Browser — Wallet Connection

```typescript
import { solanaKit } from '@solana-kit/sdk'

const kit = solanaKit({ cluster: 'mainnet-beta' })

const wallet = await kit.connectWallet()  // auto-detects Phantom, Solflare, etc.

await kit.execute(
  counter.instructions.increment({
    counter: counterAddr,
    authority: wallet,  // prompts user to approve
    amount: 1n,
  })
)
```

Same API. The library detects the environment and adapts.

---

## 7. Testing

Use any test runner. No special setup.

```typescript
import { test, equal } from 'node:test'
import { testKit } from '@solana-kit/sdk'

test('transfer SOL', async () => {
  // testKit spins up LiteSVM — milliseconds, no validator
  const kit = testKit()
  const sender = kit.payer
  const receiver = await kit.createAccount()

  await kit.transfer({ from: sender, to: receiver.address, amount: 5000n })

  const balance = await kit.getBalance(receiver.address)
  equal(balance, 5000n)
})
```

```bash
node --test tests/transfer.ts
```

Your test runner. Your files. Your structure.

---

## What `@solana-kit/sdk` Ships

```
@solana-kit/sdk                    # solanaKit(), testKit(), transfer(), execute(), steps()
@solana-kit/sdk/programs/token     # kit.token — built-in token operations
@solana-kit/sdk/programs/system    # kit.system — built-in system operations
@solana-kit/sdk/testing            # testKit() with LiteSVM
```

---

# Part 2: @solana-kit/program (The Program Builder)

**`npm install @solana-kit/program` and define programs in TypeScript.**

This is a SEPARATE concern.
You only install this if you're writing on-chain programs.
Most developers will only use `@solana-kit/sdk`.

---

## 8. Define a Program

```typescript
import { defineProgram, u64, bool, pubKey } from '@solana-kit/program'

export const counter = defineProgram({
  id: 'CoUnTeR1111111111111111111111111111111111111',
  name: 'counter',

  accounts: {
    counter: {
      seeds: ['counter', '{authority}'],
      fields: {
        count: u64,
        authority: pubKey,
        isActive: bool,
      },
    },
  },

  instructions: {
    initialize: {
      accounts: {
        counter: { writable: true, pda: true },
        authority: { signer: true, writable: true },
      },
      args: { initialValue: u64 },
    },
    increment: {
      accounts: {
        counter: { writable: true },
        authority: { signer: true },
      },
      args: { amount: u64 },
    },
    close: {
      accounts: {
        counter: { writable: true, closeTo: 'authority' },
        authority: { signer: true, writable: true },
      },
      args: {},
    },
  },
})
```

`defineProgram()` returns a typed object. At runtime, this object gives you:
- PDA derivation: `counter.accounts.counter.derive({ authority })`
- Account size: `counter.accounts.counter.size`
- Account decoder: used by `kit.fetchAccount()` to deserialize on-chain data
- Instruction builders: used by `kit.execute()` to serialize instruction data
- IDL export: `counter.idl` — compatible with Codama, Anchor, IDL Space, etc.

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

### What are the realistic options?

#### Option A: Generate Rust, compile with existing toolchain
```
TypeScript definition → Rust/Anchor code → cargo build-sbf → .so file
```
This is what Poseidon does. It works, but requires the developer to have the Solana/Rust toolchain installed (~2GB).

#### Option B: Compile via a cloud service
```
TypeScript definition → send to API → get back .so file
```
The cloud service runs the Rust compiler. Developer never installs Rust.
This is the most seamless experience but requires a server.

#### Option C: Ship pre-compiled program templates
```
You pick from a catalog → we deploy a pre-compiled .so → you configure it
```
No compilation at all. But limited to the programs in the catalog.
Think of it like "program templates" — escrow, multisig, governance, staking, etc.

#### Option D: WASM → sBPF (experimental, not possible today)
Solana's runtime cannot execute WASM. It only runs sBPF.
There is no WASM-to-sBPF compiler. This path doesn't exist.

### Our recommended approach: Option B + C

For the hackathon, we can:
1. **Ship a catalog of pre-compiled program templates** (escrow, token sale, governance, staking, multisig, NFT mint)
2. **Offer optional Rust generation** for developers who want custom programs
3. **The `defineProgram()` schema works as a client regardless** — even without compilation, you get typed clients, account decoders, and PDA derivation

---

## 10. Using the Program Builder with the SDK

The two packages compose naturally:

```typescript
import { solanaKit } from '@solana-kit/sdk'
import { defineProgram, u64, pubKey } from '@solana-kit/program'

// Define your program (no build step needed for client-side use)
const counter = defineProgram({
  /* ... */
})

// Use it with the SDK
const kit = solanaKit({ cluster: 'devnet' })

// Register the program so the kit knows how to encode/decode
kit.registerProgram(counter)

const counterAddr = counter.accounts.counter.derive({ authority: kit.payer })

// Execute — the kit uses the program definition to serialize instruction data
await kit.execute(
  counter.instructions.increment({
    counter: counterAddr,
    authority: kit.payer,
    amount: 10n,
  })
)

// Fetch — the kit uses the program definition to deserialize account data
const account = await kit.fetchAccount(counter.accounts.counter, counterAddr)
console.log(account.count)
```

---

## 11. Full Example: Token + Escrow

```typescript
import { solanaKit, lamports } from '@solana-kit/sdk'
import { defineProgram, u64, u8, pubKey } from '@solana-kit/program'

// ── Program Definition (separate concern) ──

const escrow = defineProgram({
  id: 'EsCr0w11111111111111111111111111111111111111',
  name: 'escrow',
  accounts: {
    escrow: {
      seeds: ['escrow', '{maker}', '{escrowId}'],
      fields: {
        maker: pubKey,
        takerMint: pubKey,
        makerMint: pubKey,
        makerAmount: u64,
        takerAmount: u64,
        escrowId: u64,
        bump: u8,
      },
    },
  },
  instructions: {
    make: {
      accounts: {
        escrow: { writable: true, pda: true },
        maker: { signer: true, writable: true },
        makerAta: { writable: true },
        mintA: {}, mintB: {},
        tokenProgram: { type: 'tokenProgram' },
        systemProgram: { type: 'systemProgram' },
      },
      args: { escrowId: u64, makerAmount: u64, takerAmount: u64 },
    },
    take: { /* ... */ },
    refund: { /* ... */ },
  },
})

// ── Client Usage ──

const kit = solanaKit({ cluster: 'devnet' })
kit.registerProgram(escrow)

// Create escrow: I offer 1 SOL for 100 USDC
await kit.execute(
  escrow.instructions.make({
    escrow: escrow.accounts.escrow.derive({ maker: kit.payer, escrowId: 1n }),
    maker: kit.payer,
    makerAta: kit.token.getAssociatedTokenAddress({
      owner: kit.payer,
      mint: 'So11111111111111111111111111111111111111112',
    }),
    mintA: 'So11111111111111111111111111111111111111112',
    mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    escrowId: 1n,
    makerAmount: lamports('1'),
    takerAmount: 100_000_000n,
  })
)

// Read escrow state
const escrowAccount = await kit.fetchAccount(
  escrow.accounts.escrow,
  escrow.accounts.escrow.derive({ maker: kit.payer, escrowId: 1n }),
)
console.log(`Offering ${escrowAccount.makerAmount} for ${escrowAccount.takerAmount}`)
```

---

## The Two Packages: Summary

### `@solana-kit/sdk` — The Client Library

```typescript
import { solanaKit } from '@solana-kit/sdk'

const kit = solanaKit({ cluster: 'devnet' })

// Core
kit.getBalance(address)
kit.transfer({ from, to, amount })
kit.execute(instruction | instruction[])
kit.steps([step1, (s1) => step2])

// Token (built-in)
kit.token.createMint({ decimals, authority })
kit.token.mintTo({ mint, destination, amount })
kit.token.transfer({ mint, from, to, amount })
kit.token.getBalance({ owner, mint })
kit.token.getAssociatedTokenAddress({ owner, mint })

// Accounts
kit.fetchAccount(accountDef, address)
kit.getAccountInfo(address)

// Programs
kit.registerProgram(programDef)

// Wallet (browser)
kit.connectWallet()
kit.disconnectWallet()

// Signers (node)
kit.loadSignerFromFile(path)
kit.loadSignerFromEnv(name)

// Underlying access
kit.rpc                  // full @solana/kit RPC
kit.rpcSubscriptions     // full @solana/kit subscriptions
```

### `@solana-kit/program` — The Program Builder

```typescript
import { defineProgram, u64, bool, pubKey, string, option, vec } from '@solana-kit/program'

const myProgram = defineProgram({
  id: '...program address...',
  name: 'my-program',
  accounts: { /* ... */ },
  instructions: { /* ... */ },
})

// What you get at runtime (no build step):
myProgram.idl                                           // IDL for Codama/Anchor/IDL Space
myProgram.accounts.myAccount.derive({ seed1, seed2 })   // PDA derivation
myProgram.accounts.myAccount.size                       // Space calculation
myProgram.accounts.myAccount.decoder                    // Account decoder
myProgram.instructions.myInstruction({ ... })           // Instruction builder

// Optional: generate Rust for on-chain deployment
myProgram.generateRust()   // Returns Anchor Rust source code as string
```

---

## Library Checklist

| Question | Answer |
|---|---|
| Do I need a CLI to use it? | **No.** |
| Do I need a special folder structure? | **No.** |
| Do I need a config file? | **No.** |
| Do I need a build step? | **No.** (Only for on-chain deployment, which is optional) |
| Can I use it in an existing project? | **Yes.** `npm install` and import |
| Can I use just the SDK without the program builder? | **Yes.** Separate packages |
| Can I use just the program builder without the SDK? | **Yes.** It produces typed objects usable anywhere |
| Can I drop down to @solana/kit? | **Yes.** `kit.rpc` |
| Does it work in browser and Node? | **Yes.** Same API |
| Does it take over my test runner? | **No.** Use any test runner |
