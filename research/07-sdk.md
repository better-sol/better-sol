# Client SDK Design — better-sol

Internal design doc. The client SDK is fully implemented.

---

## Architecture

```
better-sol           Runtime library: client SDK + program definition
@better-sol/cli      CLI: transpiler + deploy (dev dependency only)
```

The CLI never ships to the browser. Programs using only the client pull zero transpiler code.

---

## Factory: `betterSol()`

```typescript
// Full client (server-side) — payer required for signing
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

// Read-only client — no payer needed
const sol = await betterSol({ cluster: "devnet" })
```

### Config Options

| Field | Type | Default | Notes |
|---|---|---|---|
| `cluster` | `"devnet" \| "testnet" \| "mainnet-beta" \| "localnet"` | `"devnet"` | Sets RPC URL |
| `rpcUrl` | `string` | cluster default | Custom RPC endpoint |
| `rpcSubscriptionsUrl` | `string` | cluster default | Required if `rpcUrl` is set |
| `payer` | `SolSigner` | `undefined` | Read-only if omitted |
| `programs` | `ProgramInputs` | `{}` | Program definitions |
| `commitment` | `"processed" \| "confirmed" \| "finalized"` | `"confirmed"` | RPC commitment level |
| `confirmationRetries` | `number` | `30` | Blockhash confirmation polls |
| `confirmationInterval` | `number` | `1000` | ms between polls |
| `rpcRetries` | `number` | `3` | RPC call retries |
| `simulate` | `boolean` | `false` | Pre-flight simulation |

### Payer Types

Server-side:
```typescript
keypairFile("./keypair.json")   // Read from file
secretKey(Uint8Array)           // From raw bytes
```

Client-side:
```typescript
// Wallet adapters return TransactionSigner directly
sol.withSigner(walletAdapter(adapter))
```

`payer` is `Address` (string) when a signer is configured, `null` for read-only. No `generateSigner()` — server side uses explicit keypair sources, client side uses wallet adapters.

---

## Core Operations

```typescript
sol.getBalance(address)              // → bigint
sol.transfer({ to, amount, from? })  // → signature
sol.send([...ixs])                   // Sign + send transaction
sol.steps([...])                     // StepChain<T> for sequential txs
sol.withSigner(signer)               // → scoped client with different payer
```

`withSigner` returns a client where `payer` is typed as `Address` (not `null`), enabling signing operations.

---

## Program Methods

Programs registered via `programs: { counter }` get namespaced methods:

```typescript
// Default: sign + send in one call
await sol.counter.initialize({ counter: addr, authority: sol.payer, initialValue: 0n })

// Build only
const ix = await sol.counter.initialize.instruction({ ... })
const tx = await sol.counter.initialize.transaction({ ... })

// PDA derivation
const [addr, bump] = sol.counter.accounts.Counter.derive({ authority: pub })

// Account fetch
const data = await sol.counter.accounts.Counter.fetch(addr)
```

### Natural Call Signatures

The `ix()` method supports four cases with only what's needed:

| Definition | Call signature | Notes |
|---|---|---|
| No accounts, no args | `()` | Nothing required |
| Args only | `({ arg1, arg2 })` | |
| Accounts only | `({ account1, account2 })` | Signers auto-filled |
| Both | `({ ...accounts, ...args })` | Merged |

Signer accounts (`p.signer()`) are auto-filled from `sol.payer` — users never pass them manually.

---

## Token Operations

```typescript
sol.token.createMint({ decimals, authority? })
sol.token.mintTo({ mint, to, amount, authority? })
sol.token.transfer({ mint, from?, to, amount })
sol.token.getBalance(mint, owner)

sol.token2022.*  // Same API, Token-2022 program address
```

Authority defaults to `sol.payer`. `from` defaults to `sol.payer`. Token-2022 operations use the Token-2022 program ID internally.

---

## Wallet Adapters

Subpath exports for browser-side wallet integration:

```typescript
import { walletAdapter } from "better-sol/wallets/wallet-adapter"   // @solana/wallet-adapter-react
import { reownWallet } from "better-sol/wallets/reown"               // @reown/appkit
import { privyWallet } from "better-sol/wallets/privy"               // @privy-io/react-auth
import { dynamicWallet } from "better-sol/wallets/dynamic"           // @dynamic-labs/sdk-react-core
```

All return `TransactionSigner` from `@solana/kit`. Shared signing logic in `sign-utils.ts`.

Usage:
```typescript
const signer = walletAdapter(useWallet())
const sol = await betterSol({ cluster: "mainnet-beta", payer: signer, programs: { counter } })
```

---

## Borsh Codec

`coder.ts` handles encoding/decoding for instruction data and account data.

### Encoding
- Each field encoded by type (u8=1 byte, u64=8 bytes, pubkey=32 bytes, etc.)
- Instruction data: 8-byte Anchor discriminator + encoded args
- Account discriminators: `sha256("account:" + PascalCase(name))[0..8]`

### Zero-Copy Decoding
- Struct layout computed from field types and alignment
- Nested zero-copy structs inside arrays decoded correctly
- `bool` bytes validated (must be 0 or 1)
- Account names normalized from snake_case to PascalCase for discriminator

---

## `fromIdl()`

```typescript
import { fromIdl } from "better-sol"
const program = fromIdl(idlJson)
```

Consumes a standard Anchor IDL and produces a `ProgramDefinition`-compatible object. Used for programs not built with better-sol. Handles:
- Instructions with accounts and args
- Account types
- Error definitions
- Writable/signer account flags
- Compound IDL types (vec, option, defined types)

---

## StepChain

```typescript
const result = await sol.steps([
  async (ctx) => {
    const sig = await sol.counter.initialize({ ... })
    return { signature: sig }
  },
  async (ctx, { signature }) => {
    // Use previous step output
    const sig2 = await sol.counter.increment({ ... })
    return { signature2: sig2 }
  },
])
```

Single generic `StepChain<TOutputs>`. No multi-overload complexity.

---

## Removed APIs

Do not re-add these — they were removed for good reasons:

| API | Why removed |
|---|---|
| `generateSigner()` | Server uses `keypairFile()`/`secretKey()`, client uses wallets |
| `SolSigner` type | `TransactionSigner` accepted directly |
| `sol.destroy()` | WS closes on page unload; users needing control create own RPC |
| `IxInstruction`, `IxTransaction` | Internal types leaked to public |
| `TokenClient`, `Cluster` type exports | Unnecessary type exports |
| `walletSigner()` | No-op wrapper — pass `TransactionSigner` directly |
| `BoundAccount.size`, `borshSize()` | Premature optimization |
| 4-overload `sol.steps()` | Single generic is simpler |
| `{ type: "generate" }` signer | No random keypair generation in public API |

---

## Public Type Exports

```typescript
// From better-sol
export type { BetterSolClient, BetterSolConfig, BoundAccount }

// From better-sol/program
export type { Address, InferType, FieldSchema, ... }
```

Deliberately not exported: `IxInstruction`, `IxTransaction`, `SolSigner`, `TokenClient`, `Cluster`.
