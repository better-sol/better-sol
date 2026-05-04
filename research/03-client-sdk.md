# 03 — Client SDK

The client SDK is generated at runtime from program definitions. The same `bs.program()` object used by the transpiler is registered with `betterSol()` to produce typed instruction methods, PDA derivation, account fetching, and token operations.

---

## 1. Factory: `betterSol()`

```typescript
import { betterSol, keypairFile, secretKey } from "better-sol"
import { counter } from "./programs/counter"

// Server-side with keypair file
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

// Server-side with raw secret key
const sol = await betterSol({
  cluster: "mainnet",
  payer: secretKey(new Uint8Array(64)),
  programs: { counter },
})

// Read-only — no payer needed
const sol = await betterSol({ cluster: "devnet" })

// Browser — signer passed later via withSigner
const sol = await betterSol({ cluster: "mainnet" })
const userSol = await sol.withSigner(walletAdapter(useWallet()))
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

### Signer Input Types

```typescript
// Server-side
keypairFile("./keypair.json")   // Reads JSON keypair file (Node.js only)
secretKey(Uint8Array)           // From raw 64-byte secret key

// Browser-side — wallet adapters (see §8)
walletAdapter(wallet)           // @solana/wallet-adapter-react
reownWallet(provider)           // Reown AppKit
privyWallet(privy)              // @privy-io/react-auth
dynamicWallet(dynamic)          // @dynamic-labs/sdk-react-core

// Direct — any @solana/kit TransactionSigner
myCustomSigner
```

### Client Shape

```typescript
sol.payer              // Address | null — active signer's address
sol.rpc                // Kit Rpc instance — for direct Solana RPC calls
sol.rpcSubscriptions   // Kit RpcSubscriptions instance
sol.token              // TokenClient (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
sol.token2022          // TokenClient (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
sol.<programName>      // Typed program client for each registered program
```

---

## 2. Program Methods

Each instruction in the program definition becomes a callable method on the program client. Signer accounts (`bs.signer()`) auto-fill from `sol.payer` when omitted.

### Instruction Calls

```typescript
// Default: sign + send in one call → returns signature
const sig = await sol.counter.increment({ counter: addr, amount: 5n })

// Explicit send
const sig = await sol.counter.increment.send({ counter: addr, amount: 5n })

// Build instruction only → returns Kit Instruction
const ix = await sol.counter.increment.instruction({ counter: addr, amount: 5n })

// Build signed transaction → returns signed sendable transaction
const tx = await sol.counter.increment.transaction({ counter: addr, amount: 5n })

// Simulate without sending → returns logs, units consumed, return data
const sim = await sol.counter.increment.simulate({ counter: addr, amount: 5n })
// → { logs: string[]; unitsConsumed: bigint; returnData: Uint8Array | null }

// Prepare for external composition → returns instruction + signers + pubkeys
const prep = await sol.counter.increment.prepare({ counter: addr, amount: 5n })
// → { instruction: Instruction; signers: TransactionSigner[]; pubkeys: Record<string, Address> }
```

### Natural Call Signatures

The call signature matches what the instruction definition requires:

```typescript
// No accounts, no args
await sol.app.ping()

// Args only — auto-fill not needed
await sol.app.setValue({ value: 1n })

// Accounts only — signer auto-fills
await sol.app.closeVault({ vault: vaultAddr })

// Both — signer auto-fills, args explicit
await sol.counter.increment({ counter: addr, amount: 5n })
```

### Signer Auto-Fill

Accounts declared with `bs.signer()` are optional at the call site. When omitted, the active signer's address is used:

```typescript
// authority auto-fills from sol.payer
await sol.counter.increment({ counter: addr, amount: 5n })

// Explicit override
await sol.counter.increment({ counter: addr, authority: otherAddr, amount: 5n })
```

If multiple signer accounts are declared and more than one is omitted, an error is thrown at runtime: "Multiple signer accounts omitted. Pass explicit addresses for all but one signer."

### Multi-Instruction Batching

```typescript
// Multiple instructions in one transaction
const sig = await sol.send([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  sol.counter.increment.instruction({ counter: addr2, amount: 2n }),
])

// Sequential steps with dependencies (StepChain)
const [mintResult, mintSig] = await sol.steps([
  async () => sol.token.createMint({ decimals: 9 }),
  async ({ mint }) => sol.token.mintTo({ mint, to: sol.payer, amount: 1000n }),
])
```

---

## 3. Account Operations

```typescript
// PDA derivation — returns derived address
const addr: Address = await sol.counter.accounts.Counter.derive({
  authority: sol.payer,
})

// Account fetching — returns typed data or null
const data = await sol.counter.accounts.Counter.fetch(addr)
// → { count: bigint; authority: Address; isActive: boolean; ... } | null

// Multiple account fetch
const results = await sol.counter.accounts.Counter.fetchMultiple([addr1, addr2])
// → (CounterData | null)[]

// Data is auto-decoded:
//   - Borsh for standard accounts
//   - Zero-copy layout for zeroCopy() accounts
```

### PDA Derivation Input Types

The `derive()` parameter type is inferred from the seed template:

```typescript
// .derive(seed => ["counter", seed.authority])
// → derive(values: { authority: AddressInput })

// .derive(seed => ["pool", seed.tokenA, seed.tokenB])
// → derive(values: { tokenA: AddressInput; tokenB: AddressInput })

// .derive(() => ["config"])
// → derive(values?: {})  // no fields needed
```

---

## 4. SOL Operations

```typescript
// Get balance in lamports
const balance: bigint = await sol.getBalance(address)

// Transfer SOL — from defaults to sol.payer
const sig = await sol.transfer({
  to: "recipient...",
  amount: 10_000_000n,   // lamports
  from: sol.payer,        // optional — defaults to active signer
})
```

---

## 5. Token Operations

`sol.token` (Token) and `sol.token2022` (Token-2022) provide identical APIs.

```typescript
// Create a mint
const { mint, mintSigner, signature } = await sol.token.createMint({
  decimals: 9,
  authority: sol.payer,              // optional — defaults to payer
  freezeAuthority: null,             // optional — defaults to null
})

// Get associated token account address (no RPC call — computed locally)
const ata: Address = await sol.token.getATA({ owner: sol.payer, mint })

// Mint tokens
await sol.token.mintTo({
  mint,
  to: sol.payer,
  amount: 1_000_000_000n,
  decimals: 9,                       // optional — fetched from mint if omitted
})

// Get token balance
const balance: bigint = await sol.token.getBalance({ owner: sol.payer, mint })

// Transfer tokens
await sol.token.transfer({
  mint,
  to: "recipient...",
  amount: 100n,
  from: sol.payer,                   // optional — defaults to active signer
  decimals: 9,                       // optional — fetched from mint if omitted
})

// Token-2022 (same API, different program address internally)
await sol.token2022.createMint({ decimals: 6 })
```

---

## 6. Scoped Signers

`withSigner()` creates a new client with a different signer. The original client is unchanged.

```typescript
const baseSol = await betterSol({ cluster: "mainnet" })

// User A's session
const userASol = await baseSol.withSigner(walletAdapter(walletA))
await userASol.counter.increment({ counter: addr, amount: 1n })

// User B's session — separate signer, same RPC + programs
const userBSol = await baseSol.withSigner(walletAdapter(walletB))
await userBSol.counter.increment({ counter: addr, amount: 2n })
```

`withSigner()` returns `BetterSolClient<TPrograms, true>` where `payer` is typed as `Address` (not `Address | null`), enabling all signing operations.

---

## 7. Transaction Lifecycle

### Current (Simplified)

```
instruction params → build instruction → build tx message → sign → send → poll confirm
         ↑                                    ↑              ↑       ↑       ↑
    .instruction()                      .transaction()  (auto)  .send()  (auto)
```

The default `.send()` does everything. Individual steps are accessible via `.instruction()`, `.transaction()`, `.simulate()`, `.prepare()`.

### Future: Instruction Plan Composability

The current `sol.send()` and `sol.steps()` support sequential transactions only. The official `@solana/kit` SDK has first-class instruction plans:

```typescript
// Future API (not yet implemented):
import { sequential, parallel } from "better-sol"

const plan = sequential([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  parallel([
    sol.token.transfer.instruction({ mint, to: addr1, amount: 100n }),
    sol.token.transfer.instruction({ mint, to: addr2, amount: 200n }),
  ]),
])
await sol.execute(plan)
```

This would enable parallel execution, message packing, and compute unit estimation. Priority: P1.

### Future: Compute Unit Estimation

```typescript
// Future API (not yet implemented):
await sol.counter.increment({ counter: addr, amount: 5n }, {
  computeUnitLimit: 200_000n,
  computeUnitPrice: 1_000n,
})
```

Priority: P1. Currently developers must manually add compute budget instructions.

### Future: Event Subscriptions

```typescript
// Future API (not yet implemented):
const sub = sol.counter.events.Incremented.subscribe((event) => {
  console.log(event.newCount, event.authority)
})
sub.unsubscribe()
```

Priority: P1. Events are emitted on-chain but there's no client-side listener.

---

## 8. Wallet Adapters

Subpath exports for tree-shakeable wallet integration. Each adapter converts a wallet library's signer into a `@solana/kit` `TransactionSigner`.

```typescript
// @solana/wallet-adapter-react
import { walletAdapter } from "better-sol/wallets/wallet-adapter"
const signer = walletAdapter(useWallet())

// Reown AppKit
import { reownWallet } from "better-sol/wallets/reown"
const signer = reownWallet(useAppKitProvider("solana"))

// Privy
import { privyWallet } from "better-sol/wallets/privy"
const signer = privyWallet(usePrivySolanaWallet())

// Dynamic
import { dynamicWallet } from "better-sol/wallets/dynamic"
const signer = dynamicWallet(useDynamicSolanaWallet())
```

All return `TransactionSigner` compatible with `sol.withSigner(signer)`.

### Adapter Implementation Pattern

Each adapter wraps wallet-specific transaction signing into the Kit-compatible `signTransactions` interface. Shared logic in `sign-utils.ts` handles the conversion from `VersionedTransaction` signatures back to `SignatureDictionary` format.

---

## 9. `fromIdl()` — Use Any Anchor Program

Import existing Anchor IDLs as typed programs without a TypeScript definition:

```typescript
import { betterSol, fromIdl } from "better-sol"
import mangoIdl from "./mango.json"

const mango = fromIdl(mangoIdl)
const sol = await betterSol({
  cluster: "mainnet",
  payer: keypairFile("./keypair.json"),
  programs: { mango },
})

await sol.mango.someInstruction({ ... })
```

Handles:
- Instructions with accounts and args
- Account type schemas
- Error definitions
- Writable/signer account flags
- Compound IDL types (`option`, `vec`, `coption`, `defined`)
- Nested/composite account items
- Optional accounts (skipped)
- Address from top-level or metadata

All types are derived at runtime from the IDL JSON — zero code generation.

---

## 10. Package Exports

| Import path | Exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `version` |
| `better-sol/program` | `bs`, `cpi`, type helpers |
| `better-sol/wallets` | `walletAdapter`, `reownWallet`, `privyWallet`, `dynamicWallet` |
| `better-sol/wallets/wallet-adapter` | `walletAdapter` |
| `better-sol/wallets/reown` | `reownWallet` |
| `better-sol/wallets/privy` | `privyWallet` |
| `better-sol/wallets/dynamic` | `dynamicWallet` |

### Removed from Public API

These were removed during design iterations and should not be re-added:

- `generateSigner()` — server uses `keypairFile()`/`secretKey()`, client uses wallet adapters
- `SolSigner` type — `TransactionSigner` from `@solana/kit` accepted directly
- `sol.destroy()` — WebSocket closes on page unload; users needing control create their own RPC
- `IxInstruction`, `IxTransaction` types — internal, leaked to public by accident
- `TokenClient`, `Cluster` type exports — unnecessary
- `walletSigner()` — no-op wrapper
- `BoundAccount.size`, `borshSize()` — premature optimization
- 4-overload `sol.steps()` — replaced by single generic `StepChain<T>`
