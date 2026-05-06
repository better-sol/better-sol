# 03 — Client SDK

The client SDK is generated at runtime from program definitions. The same `bs.program()` object used by the transpiler is registered with `betterSol()` to produce typed instruction methods, PDA derivation, account fetching, and token operations.

---

## 1. Factory: `betterSol()`

```typescript
import { betterSol, keypairFile, secretKey } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})
```

### Config Options

| Field | Type | Default | Description |
|---|---|---|---|
| `cluster` | `"devnet" \| "testnet" \| "mainnet" \| "localnet"` | `"devnet"` | Predefined RPC endpoint |
| `rpcUrl` | `string` | Auto from cluster | Custom RPC URL |
| `rpcSubscriptionsUrl` | `string` | Auto from cluster | Required if `rpcUrl` is custom |
| `payer` | `SignerInput` | — | `keypairFile(path)`, `secretKey(bytes)`, or `TransactionSigner` |
| `programs` | `Record<string, ProgramDefinition>` | `{}` | Program definitions to register |
| `commitment` | `"processed" \| "confirmed" \| "finalized"` | `"confirmed"` | RPC commitment level |
| `computeUnits` | `{ limit?: bigint; price?: bigint }` | — | Compute budget for all transactions |
| `addressLookupTables` | `Address[]` | — | Lookup table addresses to index |
| `durableNonce` | `{ nonceAccountAddress: Address; nonceAuthority?: SignerInput }` | — | Durable nonce for offline signing |

### Client Shape

```typescript
sol.payer              // Address | null — active signer's address
sol.rpc                // Kit Rpc instance — for direct Solana RPC calls
sol.rpcSubscriptions   // Kit RpcSubscriptions instance — WebSocket connection
sol.token              // TokenClient (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
sol.token2022          // TokenClient (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
sol.<programName>      // Typed program client for each registered program
sol.send([...])        // Multi-instruction transaction
sol.batch([...])       // Non-divisible sequential plan
sol.steps([...])       // Sequential steps with dependencies
sol.getBalance(addr)   // SOL balance in lamports
sol.transfer({...})    // SOL transfer
sol.onTransaction(cb)  // Transaction confirmation callback
```

---

## 2. Program Client

Each registered program becomes a typed namespace on the client. The program client is built with a JavaScript Proxy (tRPC `createRecursiveProxy` pattern) for full transparency.

### Instruction Calls

```typescript
// Default: sign + send → returns signature
const sig = await sol.counter.increment({ counter: addr, amount: 5n })

// Explicit send
const sig = await sol.counter.increment.send({ counter: addr, amount: 5n })

// Build instruction only → returns Kit Instruction
const ix = await sol.counter.increment.instruction({ counter: addr, amount: 5n })

// Build signed transaction → returns signed sendable transaction
const tx = await sol.counter.increment.transaction({ counter: addr, amount: 5n })

// Simulate without sending → returns logs, units consumed, return data
const sim = await sol.counter.increment.simulate({ counter: addr, amount: 5n })

// Prepare for external composition → returns instruction + signers + pubkeys
const prep = await sol.counter.increment.prepare({ counter: addr, amount: 5n })

// Get instruction plan → returns composable InstructionPlan
const plan = await sol.counter.increment.plan({ counter: addr, amount: 5n })
```

### Signer Auto-Fill

Accounts declared with `bs.signer()` are optional at the call site. When omitted, the active signer's address is used.

### Error Parsing

Program clients expose `parseErrors(logs)` that scans transaction logs for Anchor error format and returns a typed `ProgramError`:

```typescript
try {
  await sol.counter.increment({ counter: addr, amount: 5n })
} catch (e) {
  if (e instanceof ProgramError) {
    // e.programName, e.errorName, e.errorIndex, e.originalMessage
    // e.message === "counter.Unauthorized: Only the authority can perform this action"
  }
}
```

### Event Parsing

Program clients expose `parseEvents(logs)` that decodes Anchor events from transaction logs:

```typescript
const { value: { meta: { logMessages } } } = await rpc.getTransaction(sig).send()
const events = await sol.counter.parseEvents(logMessages)
// events[0].name === "Incremented"
// events[0].data.newCount === 5n
```

Uses SHA-256 discriminator matching (`sha256("global:EventName")[0..8]`) and the existing Borsh codec for field decoding. Discriminator index is cached per program client instance.

---

## 3. Transaction Confirmation

### WebSocket Confirmation (default)

When `rpcSubscriptions` is available, `sendAndConfirm` subscribes to `signatureNotifications` via WebSocket. The RPC pushes a notification on confirmation — no polling. Confirmation latency: ~400ms.

### Polling Fallback

When `rpcSubscriptions` is unavailable (e.g. custom RPC without WS endpoint), falls back to polling `getSignatureStatuses` with 1-second intervals, up to 30 retries.

### Transaction Notifications

`sol.onTransaction(callback)` registers a callback that fires on every confirmed transaction with `(signature, slot)`. Internally uses a pub/sub notifier pattern. Multiple subscribers supported.

---

## 4. Account Operations

```typescript
// PDA derivation — returns derived address
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })

// Account fetching — returns typed data or null
const data = await sol.counter.accounts.Counter.fetch(addr)

// Multiple account fetch
const results = await sol.counter.accounts.Counter.fetchMultiple([addr1, addr2])
```

---

## 5. Token Operations

`sol.token` (Token) and `sol.token2022` (Token-2022) provide identical APIs.

```typescript
const { mint, signature } = await sol.token.createMint({ decimals: 9 })
const ata = await sol.token.getATA({ owner: sol.payer, mint })
await sol.token.mintTo({ mint, to: ata, amount: 1_000_000_000n })
const balance = await sol.token.getBalance({ owner: sol.payer, mint })
await sol.token.transfer({ mint, to: recipient, amount: 100n })
```

Token clients support nonce configuration and transaction notifications, threaded from the parent client.

---

## 6. Advanced Features

### Address Lookup Tables

```typescript
const sol = await betterSol({
  cluster: "mainnet",
  payer: keypairFile("./keypair.json"),
  addressLookupTables: ["ALookupTableAddress..."],
  programs: { counter },
})
```

Lookup table addresses are fetched and indexed at client creation. At instruction build time, matching account addresses are resolved to `AccountLookupMeta` for compact v0 transaction encoding.

### Durable Nonce

```typescript
const sol = await betterSol({
  cluster: "mainnet",
  payer: keypairFile("./keypair.json"),
  durableNonce: {
    nonceAccountAddress: "NonceAccountAddress...",
  },
  programs: { counter },
})
```

Nonce value is fetched fresh per transaction. `setTransactionMessageLifetimeUsingDurableNonce` auto-prepends the `AdvanceNonceAccount` instruction.

### Compute Budget

```typescript
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  computeUnits: { limit: 200_000n, price: 1_000n },
})
```

`withComputeBudget()` prepends `setComputeUnitLimit` and `setComputeUnitPrice` instructions to every transaction.

---

## 7. Scoped Signers

```typescript
const baseSol = await betterSol({ cluster: "mainnet" })
const userSol = await baseSol.withSigner(walletAdapter(walletA))
await userSol.counter.increment({ counter: addr, amount: 1n })
```

`withSigner()` returns a full `BetterSolClient<TPrograms, true>` with `payer` typed as `Address`.

---

## 8. Architecture

### Proxy-Based Program Client

The program client uses a JavaScript Proxy (inspired by tRPC's `createRecursiveProxy`) to dynamically expose instruction methods without pre-enumerating them. This eliminates the `Record<string, unknown>` intermediate type that required unsafe casts.

**Proxy traps**: `get`, `ownKeys`, `has`, `getOwnPropertyDescriptor` — ensures transparency for `Object.keys()`, `in` operator, and autocomplete.

**Instruction cache**: `WeakMap<InstructionDefinition, InstructionFn>` preserves reference equality across multiple accesses to the same instruction.

**`then`/`toJSON` guards**: Return `undefined` to prevent Promise-like confusion (tRPC pattern).

### Type Architecture

```
ClientCore<TPrograms, THasSigner>     — typed static core (payer, rpc, token, send, etc.)
ProgramNamespace<TPrograms>           — mapped type { [K]: ProgramClientImpl }
BetterSolClientShape<T, H>            — intersection of core + namespace
createProgramClient() → Proxy         — runtime implementation
```

This split allows the static core methods to be fully typed without dynamic keys, while the program namespace uses mapped types for per-program type inference.

---

## 9. `fromIdl()` — Use Any Anchor Program

```typescript
import { fromIdl } from "better-sol"
import mangoIdl from "./mango.json"

const mango = fromIdl(mangoIdl)
const sol = await betterSol({ cluster: "mainnet", payer: keypairFile("./key.json"), programs: { mango } })
await sol.mango.someInstruction({ ... })
```

Handles compound IDL types (`option`, `vec`, `coption`, `defined`), nested/composite account items, optional accounts, and address resolution.

---

## 10. Package Exports

| Import path | Exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `ProgramError`, `bs`, `cpi`, types |
| `better-sol/program` | `bs`, `cpi`, type helpers |
| `better-sol/codec` | `encodeField`, `decodeField`, `encodeAccount`, `decodeAccount`, `decodeZeroCopyAccount`, `encodeInstruction`, `anchorDiscriminator`, `accountDiscriminator` |
| `better-sol/wallets/*` | Individual wallet adapters |

### Removed from Public API

- `generateSigner()` — server uses `keypairFile()`/`secretKey()`, client uses wallet adapters
- `SolSigner` type — `TransactionSigner` from `@solana/kit` accepted directly
- `sol.destroy()` — WebSocket closes on page unload
- `IxInstruction`, `IxTransaction` types — internal, leaked by accident
- `walletSigner()` — no-op wrapper
- `BoundAccount.size`, `borshSize()` — premature optimization
