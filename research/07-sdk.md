# Client SDK Design — better-sol

The client SDK. Programs as plugins, like Better Auth. Zero code generation.

> **Implementation status (May 2026):** The client SDK is fully implemented: async `betterSol()` factory, typed instruction methods, typed PDA derivation via `sol.program.accounts.AccountName.derive()`, account fetching via `.fetch()` with zero-copy support, Kit-backed core operations (`getBalance`, `transfer`), Borsh encoding/decoding from TypeToken runtime objects, Token and Token-2022 client support (`sol.token.*`, `sol.token2022.*`), transaction confirmation with configurable retries, pre-flight simulation option, configurable commitment levels, `fromIdl()`, `.instruction()`, `.transaction()`, `sol.send()`, `sol.steps()`, `sol.withSigner()`, `sol.destroy()`, and wallet adapter subpaths.

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
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({ cluster: 'devnet' })

const balance = await sol.getBalance('GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV')
// → 2500000000n
```

No config file. No CLI. No folder structure.
Just import and call a function.

---

## 2. Send SOL

```typescript
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
})
const sender = sol.payer

const signature = await sol.transfer({
  to: 'GdG9JHTSWBChvf6dfBATEYCZbDwKtcC6tJEpqoyuVfqV',
  amount: 10_000_000n,
})
```

No blockhash. No fee payer setup. No `pipe()`.

---

## 3. Token Operations

```typescript
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
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
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'  // Same file as the program definition

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { counter },
})

// address is in the program definition

const counterAddr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })

// Execute an instruction — method appears automatically
await sol.counter.increment({
  counter: counterAddr,
  authority: sol.payer,
  amount: 10n,
})

// Read account — auto-decoded, fully typed
const account = await sol.counter.accounts.Counter.fetch(counterAddr)
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

## 6. Browser — Wallet Agnostic

better-sol does NOT include wallet connection. It gives you a shared Solana client and lets any wallet library provide a signing context.

### The Core Pattern: Shared `sol`, Scoped Wallet Sessions

```typescript
// lib/sol.ts — created ONCE, imported anywhere
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'

export const sol = await betterSol({
  cluster: 'mainnet-beta',
  programs: { counter },
})
```

Then, when you have a wallet:

```typescript
// One call creates a wallet-scoped client
const userSol = await sol.withSigner(kitTransactionSigner)

// All p.signer() accounts auto-fill from that wallet
await userSol.counter.increment({ counter: addr, amount: 1n })
```

No global mutable wallet state. No React `useEffect`. No `sol.connect()` lifecycle to synchronize. The base `sol` is static; `sol.withSigner(kitTransactionSigner)` creates a scoped client for the current user/action.

**Mental model:**

| Object | Lifetime | Contains |
|---|---|---|
| `sol` | App lifetime | Cluster, RPC, programs, IDLs |
| `userSol = await sol.withSigner(kitTransactionSigner)` | Request / render / handler | Same client + current Kit signer |

This is the cleanest fit for React, server components, multi-user apps, and concurrent requests.

---

### Adapter Shape

better-sol should expose tiny optional adapter helpers:

```typescript
import { reownWallet } from 'better-sol/wallets/reown'
import { walletAdapter } from 'better-sol/wallets/wallet-adapter'
import { privyWallet } from 'better-sol/wallets/privy'
import { dynamicWallet } from 'better-sol/wallets/dynamic'
```

These are **not wallet libraries**. They are 20-50 line shape adapters that convert each library's real API into better-sol's internal signer format. Each subpath has that wallet library as an optional peer dependency, so core `better-sol` stays wallet-free.

The generic pass-through still exists for callers who already have a Kit-compatible signer:

```typescript
import { walletSigner } from 'better-sol'

const userSol = await sol.withSigner(walletSigner(myKitSigner))
// walletSigner is a no-op convenience — it returns the Kit TransactionSigner unchanged
```

For wallets that expose a generic `{ publicKey, signTransaction }` interface (Phantom, Backpack, Solflare, or any wallet not covered by a dedicated adapter), use `walletAdapter()` from `better-sol/wallets/wallet-adapter` — it accepts the same shape.

---

### Reown AppKit — React

Real Reown Solana usage (verified against `@reown/appkit`):
- `useAppKitAccount()` → `{ address: string, isConnected: boolean }`
- `useAppKitProvider<Provider>('solana')` → `{ walletProvider }`
- `walletProvider.signTransaction<T extends AnyTransaction>(tx: T): Promise<T>` where `AnyTransaction = Transaction | VersionedTransaction`

```tsx
// lib/sol.ts
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'

export const sol = await betterSol({ cluster: 'mainnet-beta', programs: { counter } })
```

```tsx
// CounterButton.tsx
import { sol } from './lib/sol'
import { reownWallet } from 'better-sol/wallets/reown'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import type { Provider } from '@reown/appkit-adapter-solana'

export function CounterButton({ counterAddr }: { counterAddr: string }) {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<Provider>('solana')

  const handleIncrement = async () => {
    if (!isConnected || !address || !walletProvider) {
      open()
      return
    }

    const userSol = await sol.withSigner(reownWallet({ address, walletProvider }))
    await userSol.counter.increment({ counter: counterAddr, amount: 1n })
  }

  return <button onClick={handleIncrement}>Increment</button>
}
```

---

### Solana Wallet Adapter — React

Real Wallet Adapter usage exposes:
- `useWallet()` → `{ publicKey, signTransaction, sendTransaction }`
- `WalletMultiButton` for UI

```tsx
import { sol } from './lib/sol'
import { walletAdapter } from 'better-sol/wallets/wallet-adapter'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

export function CounterButton({ counterAddr }: { counterAddr: string }) {
  const wallet = useWallet()

  const handleIncrement = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return

    const userSol = await sol.withSigner(walletAdapter(wallet))
    await userSol.counter.increment({ counter: counterAddr, amount: 1n })
  }

  return (
    <>
      <WalletMultiButton />
      <button onClick={handleIncrement}>Increment</button>
    </>
  )
}
```

This follows the actual Solana Wallet Adapter pattern: provider at app root, `useWallet()` in components, `WalletMultiButton` for connect UI.

---

### Privy — React Solana

Real Privy Solana usage (verified against `@privy-io/react-auth@3.23.1`):
- `useWallets()` → `{ wallets: ConnectedStandardSolanaWallet[] }`
- `useSignTransaction()` → `{ signTransaction({ transaction: Uint8Array, wallet }): Promise<{ signedTransaction: Uint8Array }> }`
- `useSignAndSendTransaction()` → sends and signs in one call

```tsx
import { sol } from './lib/sol'
import { privyWallet } from 'better-sol/wallets/privy'
import { useWallets, useSignTransaction } from '@privy-io/react-auth'

export function CounterButton({ counterAddr }: { counterAddr: string }) {
  const { wallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  const wallet = wallets[0]

  const handleIncrement = async () => {
    if (!wallet) return

    const userSol = await sol.withSigner(privyWallet({ wallet, signTransaction }))
    await userSol.counter.increment({ counter: counterAddr, amount: 1n })
  }

  return <button onClick={handleIncrement}>Increment</button>
}
```

Privy accepts raw `Uint8Array` transaction bytes and returns `{ signedTransaction: Uint8Array }`. The adapter handles deserialization internally — no web3.js needed at the call site.

---

### Dynamic — React Solana

Real Dynamic Solana usage exposes:
- `useDynamicContext()` → `{ primaryWallet }`
- `isSolanaWallet(primaryWallet)` from `@dynamic-labs/solana`
- `primaryWallet.getSigner()`
- signer supports `signAndSendTransaction(versionedTransaction)` in their Solana examples

```tsx
import { sol } from './lib/sol'
import { dynamicWallet } from 'better-sol/wallets/dynamic'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { isSolanaWallet } from '@dynamic-labs/solana'

export function CounterButton({ counterAddr }: { counterAddr: string }) {
  const { primaryWallet } = useDynamicContext()

  const handleIncrement = async () => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet)) return

    const userSol = await sol.withSigner(dynamicWallet(primaryWallet))
    await userSol.counter.increment({ counter: counterAddr, amount: 1n })
  }

  return <button onClick={handleIncrement}>Increment</button>
}
```

Dynamic is compatible, but its signer is async (`primaryWallet.getSigner()`), so `dynamicWallet()` should lazily call `getSigner()` during signing.

---

### Direct Phantom Provider

For wallets that implement the standard `signTransaction` interface (Phantom, Backpack, Solflare):

```typescript
import { sol } from './lib/sol'
import { walletAdapter } from 'better-sol/wallets/wallet-adapter'

const provider = window.phantom?.solana
if (!provider) throw new Error('Phantom not installed')
await provider.connect()

const userSol = await sol.withSigner(walletAdapter({
  publicKey: provider.publicKey,
  signTransaction: (tx) => provider.signTransaction(tx),
}))

await userSol.counter.increment({ counter: addr, amount: 1n })
```

The `walletAdapter()` function accepts any object with `{ publicKey: { toBase58() }, signTransaction }` — matching Wallet Adapter, Phantom, Backpack, and Solflare directly.
```

---

### Real-World Use Case 1: Server Keypair — Wallet Monitoring Automation

**Product:** A wallet monitoring SaaS. Users subscribe to wallets they care about. The app watches on-chain activity and writes verified alerts to its own on-chain `alerts` program so other apps can consume them.

**Who signs?** The app's backend signer. Not the end user.

**Why a server keypair fits:**
- The backend is doing automated work: watching RPC streams, classifying transactions, posting alerts.
- The signer represents the app/service, not a user.
- Users are not approving every alert. They only configured monitoring rules off-chain.
- The keypair is an app authority with limited permissions inside the program.

```typescript
// lib/sol.server.ts — backend only, never bundled to browser
import 'server-only'
import { betterSol, keypairFile } from 'better-sol'
import { alerts } from '../programs/alerts'

export const sol = await betterSol({
  cluster: 'mainnet-beta',
  payer: process.env.ALERT_BOT_KEYPAIR!,
  programs: { alerts },
})
```

```typescript
// worker/monitor.ts — runs in a cron job or queue worker
import { sol } from '../lib/sol.server'

export async function handleWhaleTransfer(tx: ObservedTransfer) {
  // The app signer auto-fills p.signer() accounts like `reporter`.
  await sol.alerts.recordTransfer({
    watchedWallet: tx.owner,
    tokenMint: tx.mint,
    amount: tx.amount,
    signature: tx.signature,
    severity: tx.amount > 1_000_000n ? 3 : 1,
  })
}
```

The developer experience is strong because the worker code does not deal with blockhashes, instruction encoding, IDLs, or signing boilerplate. It reads like a normal business action: `recordTransfer(...)`.

**Important boundary:** This pattern is wrong for user-owned actions. If Alice posts, tips, swaps, follows, or authorizes funds, Alice's wallet must sign. The server keypair is only for app-owned automation/admin/crank work.

---

### Real-World Use Case 2: User Wallet Session — Social Media App

**Product:** A decentralized social app. Users connect with Reown, Phantom, Privy, or Dynamic. They create posts, follow accounts, and tip creators from their own wallet.

**Who signs?** The connected user wallet.

**Why `sol.withSigner(kitTransactionSigner)` fits:**
- The base `sol` client is shared and importable anywhere.
- Each user action scopes the wallet to that call.
- No global mutable signer, so concurrent users and React renders are safe.
- No React `useEffect`; the wallet is used exactly where the user clicks.

```typescript
// lib/sol.ts — browser-safe singleton
import { betterSol, keypairFile } from 'better-sol'
import { social } from '../programs/social'

export const sol = await betterSol({
  cluster: 'mainnet-beta',
  programs: { social },
})
```

```tsx
// PostButton.tsx — Reown example
import { sol } from '../lib/sol'
import { reownWallet } from 'better-sol/wallets/reown'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import type { Provider } from '@reown/appkit-adapter-solana/react'

export function PostButton({ content }: { content: string }) {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<Provider>('solana')

  const publish = async () => {
    if (!isConnected || !address || !walletProvider) {
      open()
      return
    }

    const userSol = await sol.withSigner(reownWallet({ address, walletProvider }))

    await userSol.social.createPost({
      content,
      visibility: 'public',
    })
  }

  return <button onClick={publish}>Post</button>
}
```

```tsx
// TipButton.tsx — same shared sol, different user action
import { sol } from '../lib/sol'
import { reownWallet } from 'better-sol/wallets/reown'

export function TipButton({ creator, amount, wallet }) {
  const tip = async () => {
    await (await sol.withSigner(kitTransactionSigner)).social.tipCreator({
      creator,
      amount,
    })
  }

  return <button onClick={tip}>Tip</button>
}
```

The developer experience is strong because the UI code says what the product does: `createPost`, `tipCreator`. The wallet library handles connection UI; better-sol handles account inference, transaction building, signing, and sending.

---

### Multi-User Rule of Thumb

```typescript
// App-owned work: server keypair
await adminSol.alerts.recordTransfer(...)
await adminSol.social.updateConfig(...)
await adminSol.amm.collectProtocolFees(...)

// User-owned work: scoped wallet
await (await sol.withSigner(userKitSigner)).social.createPost(...)
await (await sol.withSigner(userKitSigner)).social.tipCreator(...)
await (await sol.withSigner(userKitSigner)).amm.swapAForB(...)
```

`sol.withSigner(kitTransactionSigner)` returns a scoped clone. It does not mutate the base singleton, so it is safe for concurrent users, React render cycles, tests, and server requests.

---

### Current Kit-Based Browser API

The SDK backbone is `@solana/kit`. The official browser/server signer shape is a Kit `TransactionSigner`.

```typescript
const sol = await betterSol({ cluster, programs })

const userSol = await sol.withSigner(kitTransactionSigner)
await userSol.counter.increment({ counter: addr, amount: 1n })

const adminSol = await betterSol({
  cluster,
  payer: keypairFile('./keypair.json'),
  programs,
})
```

The key DX decision after the Kit migration: **`withSigner()` is Kit-native and accepts a `TransactionSigner`.** Framework-specific wallet adapters should convert Reown, Wallet Adapter, Privy, Dynamic, or Phantom shapes into a Kit-compatible signer at the boundary.

No legacy `@solana/web3.js` transaction type is part of the core SDK API. If a wallet library still exposes legacy transaction objects, the adapter may convert internally, but the public better-sol backbone remains Kit-only.

**Current hierarchy:**

| API | Status | Use case |
|---|---|---|
| `sol.program.method(args)` | ✅ Implemented | Sign, send, and confirm with the active Kit signer |
| `sol.withSigner(signer).program.method(args)` | ✅ Implemented | Scoped browser/user signer with adapter subpaths |
| `payer` in `betterSol()` | ✅ Implemented | Backend automation / admin / cranks |
| Framework wallet adapter subpaths | ✅ Implemented | `better-sol/wallets/*` converts Wallet Adapter, Reown, Privy, Dynamic to Kit `TransactionSigner` |
| `.transaction(args)` / `.instruction(args)` | ✅ Implemented | Kit-native build-and-sign or build-only flows |

**Guardrail:** signer auto-fill only uses the active signer for `p.signer()` accounts. If an explicit signer account is supplied, it must match the active signer. Use `sol.withSigner()` for a different signer.

---

### Planned Framework Wallet Adapter Examples

These examples are the intended adapter direction. The adapter packages are not implemented yet; they should produce Kit `TransactionSigner` objects.

#### Wallet Adapter

```tsx
import { sol } from './lib/sol'
import { walletAdapter } from 'better-sol/wallets/wallet-adapter'
import { useWallet } from '@solana/wallet-adapter-react'

export function PostButton({ content }: { content: string }) {
  const wallet = useWallet()

  const post = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return

    const userSol = await sol.withSigner(walletAdapter(wallet))
    await userSol.social.createPost({ content })
  }

  return <button onClick={post}>Post</button>
}
```

#### Reown AppKit

```tsx
import { sol } from './lib/sol'
import { reownWallet } from 'better-sol/wallets/reown'

const userSol = await sol.withSigner(reownWallet({ address, walletProvider }))
await userSol.counter.increment({ counter: counterAddr, amount: 1n })
```

#### Privy

```tsx
import { sol } from './lib/sol'
import { privyWallet } from 'better-sol/wallets/privy'

const userSol = await sol.withSigner(privyWallet({ wallet, signTransaction }))
await userSol.counter.increment({ counter: counterAddr, amount: 1n })
```

#### Dynamic

```tsx
import { sol } from './lib/sol'
import { dynamicWallet } from 'better-sol/wallets/dynamic'

const userSol = await sol.withSigner(dynamicWallet(primaryWallet))
await userSol.counter.increment({ counter: counterAddr, amount: 1n })
```

---

### Adapter Strategy

Most wallet libraries do **not** share one exact API shape:

| Library | Real API shape | Adapter needed? |
|---|---|---|
| Reown AppKit | `walletProvider.signTransaction(transaction)` from `useAppKitProvider('solana')` | ✅ yes |
| Wallet Adapter | `useWallet()` gives `publicKey`, `signTransaction`, `sendTransaction` | ✅ yes |
| Privy | `useSignTransaction({ transaction, wallet })` | ✅ yes |
| Dynamic | `primaryWallet.getSigner()` then `signAndSendTransaction()` | ✅ yes |
| Direct Phantom | `window.phantom.solana.signTransaction()` | generic `walletSigner()` works |
| Wallet Standard / Kit native | `TransactionSigner` / `UiWalletAccount` | generic/native works |

So yes: popular libraries deserve tiny adapters. But they should be optional subpath exports with peer dependencies, not bundled into core.

```
better-sol                         # core, no wallet deps
better-sol/wallets/reown            # peer: @reown/appkit
better-sol/wallets/wallet-adapter   # peer: @solana/wallet-adapter-react
better-sol/wallets/privy            # peer: @privy-io/react-auth
better-sol/wallets/dynamic          # peer: @dynamic-labs/*
```

This gives the best DX without turning better-sol into a wallet framework.

---

## 7. Use Your Test Runner

Use any test runner. No special setup — `bun test`, `vitest`, `node --test` all work.

---

## What `better-sol` Ships

```
better-sol                    # async betterSol(), sol.transfer(), sol.token.*, sol.token2022.*, sol.withSigner()
better-sol/program            # program(), account(), callback-scoped ix, p, token (CPI), sol (sysvars)
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
  program, account,
  u64, bool, pubkey,
  p,
} from 'better-sol/program'

// Define accounts (standalone, like Zod schemas)
const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).derive((seed) => ["counter", seed.authority])

// Define the program with a scoped instruction factory
export const counter = program(
  {
    name: 'counter',
    address: 'CouNTeR11111111111111111111111111111111111',
    errors: {
      Unauthorized: 'Not the authority',
      NotActive: 'Counter is not active',
      BelowZero: 'Count would go below zero',
    },
  },
  ix => ({
    initialize: ix({
      accounts: {
        counter: p.create(Counter),
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
      run: ({ counter, authority }, { amount }, ctx) => {
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
      run: () => {},
    }),
  }),
)
```

The full `program()` runtime target is a typed namespace. At runtime, this object should give you:
- PDA derivation: `await sol.counter.accounts.Counter.derive({ authority })`
- Account size: automatic from field definitions
- Account decoder: used by `betterSol` to deserialize on-chain data
- Instruction builders: used by `betterSol` to serialize instruction data
- IDL export: `counter.idl` — auto-generated Anchor IDL for Codama/Anchor/IDL Space compatibility
- Type-safe require/emit in handlers through the scoped builder pattern below

**Implementation status:** the `better-sol/program` package implements type tokens, `account()`, `.derive()`, `.zeroCopy()`, `struct()`, callback-scoped `ix`, `program(config, ix => instructions)` with inline errors/events, `p.*` constraints, token CPI stubs, and `sol.timestamp()`. The client SDK (`betterSol()`) is implemented on `@solana/kit`: typed instruction methods, async PDA derivation via `sol.program.accounts.Name.derive()`, account fetching via `.fetch()`, token helpers via `sol.token.*`, scoped signers via `sol.withSigner()`, and Borsh encoding/decoding from TypeToken runtime objects. The `program()` config accepts an optional `accounts` field to register account definitions for the client. Signer configuration uses `keypairFile()`, `secretKey()`, `generateSigner()`, or a Kit `TransactionSigner`. Not yet implemented: none.

**All source-definition typing works without any build step.**

### Error/event validation

The transpiler validates `ctx.require(cond, 'ErrorName')` and `ctx.emit('EventName', payload)` at build time. Errors and events are defined inline:

```typescript
import { program, account, u64, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey })

export const counter = program(
  {
    name: 'counter',
    address: '91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs',
    errors: { Unauthorized: 'Not the authority' },
    events: { Incremented: { amount: u64, authority: pubkey } },
  },
  ix => ({
    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        counter.count += amount
        ctx.emit('Incremented', { amount, authority })
      },
    }),
  }),
)
```

The CLI parser extracts errors/events from the `program()` config directly. Callback-scoped `ix(...)` is the single instruction definition shape.

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
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'  // Same file as the program definition

// Programs are plugins — like Better Auth
const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { counter },
})

const counterAddr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })

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
const account = await sol.counter.accounts.Counter.fetch(counterAddr)
console.log(account.count) // → 10n
```

---

## 11. Full Example: Token + Escrow

```typescript
import { betterSol, keypairFile } from 'better-sol'
import {
  program, account,
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
}).derive((seed) => ["escrow", seed.maker, seed.escrowId])

const escrow = program(
  {
    name: 'escrow',
    address: 'EsCr0w11111111111111111111111111111111111',
    errors: {
      Unauthorized: 'Only the maker can refund',
      InvalidMint: 'Mint mismatch',
    },
  },
  ix => ({
    make: ix({
      accounts: {
        escrow: p.create(Escrow),
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
  }),
)

// ── Client Usage ──

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { escrow },
})

// Create escrow: I offer 1 SOL for 100 USDC
const escrowAddr = await sol.escrow.accounts.Escrow.derive({ maker: sol.payer, escrowId: 1n })

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
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { counter, amm },  // Programs as plugins — like Better Auth
})

// Core
sol.getBalance(address)
sol.transfer({ to, amount })

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

// Wallet (browser — scoped wallet session)
// import { sol } from './lib/sol'
// const userSol = await sol.withSigner(kitTransactionSigner)
// await userSol.counter.increment({ counter: addr, amount: 1n })  // signer auto-fills authority

// Underlying access
sol.rpc                  // full @solana/kit RPC
sol.rpcSubscriptions     // full @solana/kit subscriptions
```

### `better-sol/program` — The Program Builder (subpath export)

Part of the `better-sol` package. Import it when defining on-chain programs. The current implementation is intentionally a source-definition library first; richer runtime client helpers listed below remain part of the SDK implementation.

```typescript
import {
  program, account,
  u64, bool, pubkey,
  p, token, sol,
} from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
  isActive: bool,
}).derive((seed) => ["counter", seed.authority])

const myProgram = program(
  {
    name: 'my-program',
    address: 'MyPr0g11111111111111111111111111111111111',
    errors: { Unauthorized: 'Not the authority' },
  },
  ix => ({
    myInstruction: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        counter.count += amount
      },
    }),
  }),
)

// What you get at runtime (no build step):
myProgram.idl                                        // Anchor IDL for ecosystem compatibility (Codama, Anchor TS, etc.)
await sol.myProgram.accounts.Counter.derive({ authority })      // PDA derivation
myProgram.accounts.Counter.fetch(addr)                // Typed account fetch

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
| Does it work in browser and Node? | **Yes.** Keypair for Node, any signer for browser |
| Does it take over my test runner? | **No.** Use any test runner |

---

# Programs as Plugins (Better Auth Pattern)

## Programs as Plugins (Better Auth Pattern)

### The Problem with `kit.registerProgram()`

```typescript
// BAD — feels like configuration, not discovery
const sol = await betterSol({ cluster: 'devnet', programs: { counter } })
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
import { program, account, u64, bool, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey, isActive: bool }).derive((seed) => ['counter', seed.authority])
export const counter = program(
  {
    name: 'counter',
    address: 'CouNTeR11111111111111111111111111111111111',
    errors: { Unauthorized: 'Not the authority', NotActive: 'Counter not active' },
  },
  ix => ({
    increment: ix({ /* ... */ }),
  }),
)
```

```typescript
// ── Client side: just import and use ──

// OPTION A: Your own program (defined with better-sol)
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'

const sol = await betterSol({
  cluster: 'devnet',
  programs: { counter },  // ← like Better Auth plugins
})

// Methods appear automatically:
await sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
await counter.accounts.Counter.fetch(addr)  // → typed account data
await sol.counter.accounts.Counter.derive({ authority: payer })  // → PDA address

// OPTION B: From on-chain program (no local program definition)
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
})

await sol.token.createMint({ decimals: 9, authority: payer })
await sol.token.transfer({ to: user, amount: 100n })
```

### The Key Insight: Programs ARE Plugins

In Better Auth, plugins extend both server and sol. In our system, program
definitions extend both the compiler and the sol. The same object that
defines accounts/instructions/logic also provides the client API.

No `registerProgram()`. The program IS the plugin.

### Full API Shape

```typescript
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'

const sol = await betterSol({
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com', // optional, inferred from cluster
  payer: keypairFile('./keypair.json'),                  // optional, can be set later
  programs: {
    counter,                                 // your custom program
  },
})

// ── Core operations (always available) ──
await sol.getBalance(address)
await sol.transfer({ to, amount })
await sol.execute(instruction)            // raw instruction execution

// ── Program-specific operations (from programs config) ──

// counter program — methods auto-generated from program definition
await sol.counter.initialize({ counter: addr, authority: payer, initialValue: 42n })
await sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
await sol.counter.close({ counter: addr, authority: payer })
await counter.accounts.Counter.fetch(addr)             // → CounterAccount | null
await sol.counter.accounts.Counter.derive({ authority: payer })  // → PDA address

// token program — built-in, same API shape
await sol.token.createMint({ decimals: 9, authority: payer })
await sol.token.mintTo({ mint, destination, amount })
await sol.token.transfer({ mint, to, amount })
await sol.token.getBalance({ owner, mint })

// ── Multi-step (composing programs together) ──
await sol.steps([
  sol.token.createMint({ decimals: 9, authority: payer }),
  (s1) => sol.token.getATA({ owner: payer, mint: s1.mint }),
  (s1, s2) => sol.token.mintTo({ mint: s1.mint, destination: s2.address, amount: 1000n }),
])

// ── Wallet (browser — scoped wallet session) ──
// import { sol } from './lib/sol'
// const userSol = await sol.withSigner(kitTransactionSigner)
// await userSol.counter.increment({ counter: addr, amount: 1n })  // signer auto-fills
```

### How Programs Become Client Methods

The `program()` function returns an object that serves dual purpose:

```typescript
// The program object has everything the client needs:
const counter = program({ name: 'counter', address: 'CouNTeR11111111111111111111111111111111111', errors }, ix => ({ /* ix() calls */ }))

// For the client:
counter.name                                    // 'counter' → becomes sol.counter
await sol.counter.accounts.Counter.derive({ authority })  // PDA derivation
counter.accounts.Counter.decode(data)           // Account deserialization
counter.accounts.Counter.size                   // Space calculation
counter.instructions.increment.build(args)      // Instruction serialization

// For the compiler:
counter.idl                                     // Anchor IDL (auto-generated, ecosystem compatible)
counter.accounts                                 // Account schemas
counter.instructions                             // Instruction schemas + logic functions
```

When you pass a program to `betterSol({ programs: { counter } })`, the client:
1. Reads the program's accounts → creates `sol.counter.increment()`, etc.
2. Reads the instruction schemas → knows how to serialize args, deserialize accounts
3. Uses the address from the program definition → PDAs derive correctly, transactions route to the right program
4. Client account operations live on the bound client namespace: `sol.counter.accounts.Counter.derive()`, `sol.counter.accounts.Counter.fetch()`

The address comes from `program({ name: 'counter', address: 'CouNTeR...', ... })` — it's right there in the
source code. No resolution, no environment variables, no hidden files.

Same address on every cluster:
```typescript
const devnetSol = await betterSol({ cluster: 'devnet', programs: { counter } })
const mainnetSol = await betterSol({ cluster: 'mainnet-beta', programs: { counter } })
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
import { program, account, u64, bool, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey, isActive: bool }).derive((seed) => ['counter', seed.authority])
export const counter = program(
  {
    name: 'counter',
    address: 'CouNTeR11111111111111111111111111111111111',
    errors: { Unauthorized: 'Not the authority', NotActive: 'Counter not active' },
  },
  ix => ({
    initialize: ix({
      accounts: {
        counter: p.create(Counter),
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
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, 'Unauthorized')
        ctx.require(counter.isActive, 'NotActive')
        counter.count += amount
      },
    }),
  }),
)
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
import { betterSol, keypairFile } from 'better-sol'
import { counter } from './programs/counter'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { counter },
})

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.initialize({ counter: addr, authority: sol.payer, initialValue: 42n })
const data = await counter.accounts.Counter.fetch(addr)
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
import { betterSol, keypairFile } from 'better-sol'

const sol = await betterSol({
  cluster: 'mainnet-beta',
  payer: keypairFile('./keypair.json'),
})

// sol.token is always available — no registration needed
await sol.token.transfer({ mint, to, amount })
```

### Where Does the Program Address Come From?

The `program()` definition includes the address as the named `address` parameter.
It was put there by `create`. You never type it manually.

```typescript
// Definition — address included (generated by `create`)
export const counter = program(
  {
    name: 'counter',
    address: 'CouNTeR11111111111111111111111111111111111',
    errors,
  },
  ix => ({
    increment: ix({ ... }),
  }),
)

const sol = await betterSol({
  cluster: 'devnet',
  programs: { counter },  // address from program definition
})
```

The address is in the program definition — it's the named `address` parameter of `program()`.
It was put there by `create`. You never type it manually.

Same address across all clusters:
```typescript
const devnetSol = await betterSol({ cluster: 'devnet', programs: { counter } })

const mainnetSol = await betterSol({ cluster: 'mainnet-beta', programs: { counter } })

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
- From the program definition — it's `program({ name: 'counter', address: 'CouNTeR...', ... })` in the source code
- No hidden files, no resolution logic, no environment variables
- It's just there

**For PDA derivation:** the program object carries the address.
`await sol.counter.accounts.Counter.derive({ authority })` uses the address from the definition.

---

### Using Someone Else's Program (from IDL)

If someone else built a program with Anchor (or our library), they published an IDL.
You can import it and get a typed client without our program builder:

```typescript
import { betterSol, fromIdl } from 'better-sol'
import { mangoIdl } from '@mango/idl'

const mango = fromIdl(mangoIdl)

const sol = await betterSol({
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

const sol = await betterSol({
  cluster: 'mainnet-beta',
  payer: keypairFile('./keypair.json'),
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

