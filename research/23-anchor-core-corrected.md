# Anchor TypeScript SDK — Corrected Deep Analysis (`@anchor-lang/core`)

Date: 2026-05-04
Source: https://github.com/solana-foundation/anchor (cloned, analyzed from scratch)
Package examined: `@anchor-lang/core` v1.0.1 (ts/packages/anchor/)
Supporting packages: `@anchor-lang/borsh`, `@anchor-lang/errors`, `@anchor-lang/cli`

**CORRECTION from previous analysis**: The official Anchor TypeScript packages are:
- `@anchor-lang/core` — Main client SDK (was previously `@coral-xyz/anchor` → was previously `@project-serum/anchor`)
- `@anchor-lang/borsh` — Borsh serializer/deserializer
- `@anchor-lang/errors` — Error types
- `@anchor-lang/cli` — CLI binary wrapper (thin Node wrapper around Rust `anchor-cli`)
- `@anchor-lang/spl-token`, `@anchor-lang/spl-memo`, etc. — SPL program TypeScript clients

---

## 1. `@anchor-lang/core` — Package Architecture

### 1.1 Dependencies

`@anchor-lang/core` depends on:
- `@solana/web3.js` — All transaction/instruction/connection types
- `@anchor-lang/borsh` — Re-exports for Borsh serialization
- `bn.js` — BigNumber for u64/u128/i128
- `pako` — Gzip/zlib decompression for IDL accounts
- `camelcase` — snake_case → camelCase IDL conversion
- `buffer` — Node.js Buffer

**Critical**: Anchor v1.0 uses `@solana/web3.js` exclusively — NOT `@solana/kit`. All instruction types are `TransactionInstruction` from web3.js v1. This is a fundamental architectural difference from `better-sol` which uses `@solana/kit` v6.8.0.

### 1.2 Public API Surface

```typescript
// Main classes
export class Program<IDL extends Idl> { /* ... */ }
export class AnchorProvider implements Provider { /* ... */ }
export class BorshCoder implements Coder { /* ... */ }

// Re-exports
export { default as BN } from "bn.js";
export * as web3 from "@solana/web3.js";
export * from "@anchor-lang/errors";

// TypeScript IDL types (manually maintained, not generated from Rust)
export type Idl = { address, metadata, instructions, accounts?, events?, errors?, types?, constants? }
export type IdlInstruction = { name, discriminator, accounts, args, returns? }
export type IdlInstructionAccount = { name, writable?, signer?, optional?, address?, pda?, relations? }
export type IdlAccount = { name, discriminator }
export type IdlTypeDef = { name, type: { kind: "struct"|"enum"|"type", fields?, variants?, alias? } }
// ... many more IDL types

// IDL utilities
export function decodeIdlAccount<IDL>(data: Buffer): IDL;
export function idlAddress(programId: PublicKey): PublicKey;
export function convertIdlToCamelCase(idl: Idl): Idl;

// Namespace factories
export class NamespaceFactory { static build(idl, coder, programId, provider): [...] }
export class MethodsBuilderFactory { static build(...): MethodsFn }
```

---

## 2. Program Class — The Central API

### 2.1 Constructor

```typescript
class Program<IDL extends Idl = Idl> {
  constructor(
    idl: IDL,                           // CamelCase IDL (auto-converted internally)
    provider: Provider = getProvider(),  // Network + wallet
    coder?: Coder,                      // Default: new BorshCoder(idl)
    getCustomResolver?: (ix) => CustomAccountResolver  // Optional account resolver
  )
}
```

### 2.2 Properties

```typescript
program.programId: PublicKey
program.idl: IDL            // camelCase IDL
program.rawIdl: Idl         // Original (snake_case) IDL
program.coder: Coder        // BorshCoder
program.provider: Provider  // Wallet + Connection
```

### 2.3 Namespaces

Each namespace is dynamically generated from the IDL at construction time:

```typescript
// ❌ DEPRECATED — Use .methods.* instead
program.rpc.initialize(args, ctx): Promise<TransactionSignature>
program.instruction.initialize(args, ctx): Promise<TransactionInstruction>
program.transaction.initialize(args, ctx): Promise<Transaction>
program.simulate.initialize(args, ctx): Promise<SimulateResponse>

// ✅ CURRENT (non-deprecated) — Builder pattern
program.methods.initialize(args): MethodsBuilder
  .accounts({ accountName: address })          // auto-resolve (rejects resolvable accounts)
  .accountsPartial({ accountName: address })   // auto-resolve (allows all accounts)
  .accountsStrict({ accountName: address })    // no resolution
  .signers([signer])
  .remainingAccounts([accountMeta])
  .preInstructions([ix])                       // prepended instructions
  .postInstructions([ix])                      // appended instructions
  .rpc(opts?): Promise<TransactionSignature>   // send + confirm
  .rpcAndKeys(opts?): Promise<{signature, pubkeys}>
  .instruction(): Promise<TransactionInstruction>
  .transaction(): Promise<Transaction>
  .simulate(opts?): Promise<SimulateResponse>
  .prepare(): Promise<{instruction, signers, pubkeys}>
  .pubkeys(): Promise<Partial<InstructionAccountAddresses>>

// Account fetching
program.account.counter.fetch(address): Promise<AccountClient>
program.account.counter.fetchMultiple(addresses): Promise<AccountClient[]>
program.account.counter.all(filter?): Promise<ProgramAccount[]>

// Events
program.addEventListener("EventName", callback): number
program.removeEventListener(listenerId): Promise<void>

// Views (read-only instructions with return values)
program.views.getData(args): Promise<ReturnType>

// Static methods
Program.at<IDL>(address, provider?): Promise<Program<IDL>>   // fetch IDL from chain
Program.fetchIdl<IDL>(address, provider?): Promise<IDL | null>
```

---

## 3. The MethodsBuilder Pattern — Deep Dive

### 3.1 Construction

```typescript
const builder = program.methods.initialize(data, moreData);
// MethodsBuilder<IDL, AllInstructions<IDL>>
```

### 3.2 Configuration Methods (chainable, return `this`)

| Method | Purpose |
|--------|---------|
| `.accounts(accounts)` | Set accounts with auto-resolution. Rejects accounts that can be resolved from IDL seeds. |
| `.accountsPartial(accounts)` | Set accounts with auto-resolution. Allows specifying all accounts including resolvable ones. |
| `.accountsStrict(accounts)` | Set accounts WITHOUT resolution. All must be explicitly provided. |
| `.signers(signers)` | Append extra signers (besides fee payer and instruction signers). |
| `.remainingAccounts(metas)` | Append remaining accounts. |
| `.preInstructions(ixs, prepend?)` | Insert instructions before this one in the transaction. |
| `.postInstructions(ixs)` | Append instructions after this one in the transaction. |
| `.args(args)` | Override instruction arguments (rare, args come from initial `.methods.ix(args)` call). |

### 3.3 Terminal Methods (return Promise)

| Method | Returns | Description |
|--------|---------|-------------|
| `.rpc(opts?)` | `TransactionSignature` | Build, sign, send, confirm |
| `.rpcAndKeys(opts?)` | `{ signature, pubkeys }` | rpc() + resolved addresses |
| `.instruction()` | `TransactionInstruction` | Build instruction (no sign/send) |
| `.transaction()` | `Transaction` | Build full transaction (no send) |
| `.simulate(opts?)` | `SimulateResponse` | Simulate transaction |
| `.view(opts?)` | `any` | View function (read-only, returns value) |
| `.prepare()` | `{ instruction, signers, pubkeys }` | Everything needed to add to another tx |
| `.pubkeys()` | `Partial<InstructionAccountAddresses>` | Resolve account addresses |

### 3.4 Account Resolution

Anchor's `AccountsResolver` automatically resolves PDA accounts from IDL seeds:

```typescript
// IDL says: pda account "vault" has seeds [b"vault", authority.key()]
// User provides authority address, vault is auto-resolved:
await program.methods.deposit(amount)
  .accounts({ authority: authorityPubkey }) // vault auto-resolved from IDL seeds
  .rpc();
```

This is similar to our `.derive()` pattern but happens at runtime via IDL metadata rather than at compile-time via TypeScript types.

---

## 4. Provider — Network + Wallet Abstraction

### 4.1 Interface

```typescript
interface Provider {
  readonly connection: Connection;           // @solana/web3.js Connection
  readonly publicKey?: PublicKey;
  send?(tx, signers?, opts?): Promise<TransactionSignature>;
  sendAndConfirm?(tx, signers?, opts?): Promise<TransactionSignature>;
  sendAll?(txWithSigners[], opts?): Promise<TransactionSignature[]>;
  simulate?(tx, signers?, commitment?, includeAccounts?): Promise<SuccessfulTxSimulationResponse>;
}
```

### 4.2 AnchorProvider (default implementation)

```typescript
class AnchorProvider implements Provider {
  constructor(connection, wallet, opts?)

  static local(url?, opts?): AnchorProvider     // Filesystem wallet
  static env(): AnchorProvider                  // ANCHOR_PROVIDER_URL + ANCHOR_WALLET

  static defaultOptions(): ConfirmOptions {
    return { preflightCommitment: "processed", commitment: "processed" };
  }
}
```

### 4.3 Key Observation

Anchor's `Provider` is tightly coupled to `@solana/web3.js`:
- Uses `Connection` (not `Rpc` from `@solana/kit`)
- Uses `Transaction` / `VersionedTransaction` (not `TransactionMessage`)
- Uses `SendTransactionError` from web3.js
- Has no concept of `RpcSubscriptions` or reactive stores

**This is where `better-sol` diverges positively** — we use `@solana/kit` which is the modern, official replacement for `@solana/web3.js`.

---

## 5. IDL — Interface Definition Language

### 5.1 IDL TypeScript Types (manually maintained)

The TypeScript IDL types in `idl.ts` are hand-written to match the Rust `idl/spec/src/lib.rs` types. They are NOT generated from the Rust spec.

Key structure:
```typescript
type Idl = {
  address: string;                          // Program ID
  metadata: IdlMetadata;                    // { name, version, spec, description?, ... }
  docs?: string[];
  instructions: IdlInstruction[];           // Each instruction
  accounts?: IdlAccount[];                  // Account definitions
  events?: IdlEvent[];                       // Event definitions
  errors?: IdlErrorCode[];                  // Error codes
  types?: IdlTypeDef[];                     // User-defined types
  constants?: IdlConst[];                   // Program constants
};

type IdlInstruction = {
  name: string;
  discriminator: number[];                  // Variable-length byte array
  accounts: IdlInstructionAccountItem[];    // Can be flat or composite (nested)
  args: IdlField[];
  returns?: IdlType;                        // For view functions (v1.0+)
};

type IdlInstructionAccount = {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  address?: string;                         // Fixed address
  pda?: IdlPda;                            // PDA derivation info
  relations?: string[];                    // Related account names
};

type IdlPda = {
  seeds: IdlSeed[];                        // [{ kind: "const", value: [...] }, { kind: "arg", path: "..." }, { kind: "account", path: "...", account?: "..." }]
  program?: IdlSeed;                       // Optional: program that owns the PDA
};
```

### 5.2 IDL On-Chain Storage — Program Metadata Program (PMP)

Anchor v1.0 switched from a custom IDL account format to the **Program Metadata Program**:
```
Program ID: ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S
PDA seeds: [programId, [], "idl"]
```

The IDL account stores metadata including:
- `format`: JSON/YAML/TOML (JSON only supported)
- `compression`: none/gzip/zlib
- `encoding`: none/utf8/base58/base64
- `dataSource`: direct/indirect (direct only supported)

### 5.3 IDL CamelCase Conversion

Anchor auto-converts snake_case IDL names to camelCase for TypeScript:
- `my_instruction` → `myInstruction`
- `my_account.field` → `myAccount.field`

We do NOT do this conversion in `better-sol` — we use camelCase natively since our source is TypeScript.

---

## 6. Anchor CLI (`@anchor-lang/cli`)

### 6.1 Architecture

`@anchor-lang/cli` is a thin Node.js wrapper around the Rust `anchor-cli` binary:
- `npm-package/package.json` has `"bin": { "anchor": "./anchor.js" }`
- The `anchor.js` is a shell script that runs the compiled Rust binary
- The actual CLI is written in Rust (`cli/src/`)

### 6.2 Key Commands

```
anchor init <name>       — Scaffold new workspace
anchor build             — Compile Rust → .so
anchor deploy            — Deploy to cluster
anchor test              — Run tests with local validator
anchor idl init          — Publish IDL to chain (via PMP)
anchor idl fetch <addr>  — Fetch IDL from chain
anchor idl upgrade       — Upgrade published IDL
anchor idl close         — Close IDL account
anchor keys list         — List program keypairs
anchor keys sync         — Sync keypairs across configs
```

---

## 7. Comparison: better-sol vs `@anchor-lang/core`

### 7.1 Architectural Differences

| Aspect | `@anchor-lang/core` | `better-sol` |
|--------|---------------------|-------------|
| Web3 library | `@solana/web3.js` v1 | `@solana/kit` v6.8.0 |
| Instruction type | `TransactionInstruction` (web3.js) | `Instruction & InstructionWithAccounts & InstructionWithData` (kit) |
| Transaction type | `Transaction` / `VersionedTransaction` (web3.js) | `TransactionMessage` (kit) |
| Connection type | `Connection` (web3.js) | `Rpc<SolanaRpcApi>` (kit) |
| Signer type | `Signer` / `Keypair` (web3.js) | `TransactionSigner` / `KeyPairSigner` (kit) |
| Account fetch | `Connection.getAccountInfo()` + Borsh decode | `rpc.getAccountInfo()` + custom Borsh decode |
| Event system | `program.addEventListener()` via log parsing | ❌ Not implemented |
| Account resolution | Runtime from IDL seeds | Compile-time via `.derive()` |

### 7.2 API Style Comparison

```typescript
// === Anchor (@anchor-lang/core) ===
import { Program, AnchorProvider, web3 } from "@anchor-lang/core";
const provider = AnchorProvider.local();
const program = new Program(idl, provider);

// Builder pattern:
const sig = await program.methods
  .initialize(new BN(42))
  .accounts({ counter: counterPubkey, authority: provider.publicKey })
  .rpc();

// Composable:
const ix = await program.methods
  .initialize(new BN(42))
  .accounts({ counter: counterPubkey, authority: provider.publicKey })
  .instruction();

// Account fetch:
const account = await program.account.counter.fetch(counterPubkey);

// === better-sol ===
import { betterSol, keypairFile } from "better-sol";
const sol = await betterSol({
  cluster: "devnet",
  payer: await keypairFile("~/.config/solana/id.json"),
  programs: { counter: myCounterProgram },
});

// Single-call:
const sig = await sol.counter.initialize({ args: { data: 42n }, accounts: { counter, authority } });

// Just instruction (also possible but secondary API):
const { instruction } = sol.counter.initialize({ args: { data: 42n }, accounts: { counter, authority } });

// Account fetch:
const account = await sol.counter.account.counter.fetch(counterPubkey);
```

### 7.3 Feature-by-Feature Comparison

| Feature | `@anchor-lang/core` | `better-sol` | Assessment |
|---------|---------------------|-------------|------------|
| **Program class** | `new Program(idl, provider)` | `betterSol({ programs: {...} })` | Different philosophy; both valid |
| **Instruction building** | Builder pattern: `.methods.ix(args).accounts({}).instruction()` | Single call: `sol.program.ix({args, accounts}).instruction()` | Anchor more composable |
| **Transaction building** | `.methods.ix(args).accounts({}).transaction()` | Not separate from `.send()` | **GAP** |
| **Send + confirm** | `.methods.ix(args).accounts({}).rpc()` | `sol.program.ix({args, accounts})` (returns sendable) | Similar convenience |
| **Simulation** | `.methods.ix(args).accounts({}).simulate()` | ❌ Not implemented | **GAP** |
| **Account fetch** | `program.account.name.fetch(addr)` | `sol.program.account.name.fetch(addr)` | Similar |
| **Account fetch all** | `program.account.name.all(filter?)` | ❌ Not implemented | **GAP** |
| **Account fetch multiple** | `program.account.name.fetchMultiple(addrs)` | ❌ Not implemented | **GAP** |
| **Events** | `program.addEventListener('Name', cb)` | ❌ Not implemented | **GAP** |
| **Views** | `program.views.getData(args)` | ❌ Not implemented | **GAP** |
| **Pubkeys resolution** | `.pubkeys()` after builder config | N/A (compile-time types) | Different approach |
| **Pre/post instructions** | `.preInstructions(ixs)`, `.postInstructions(ixs)` | ❌ Not implemented | **GAP** |
| **Remaining accounts** | `.remainingAccounts(metas)` | `sol.program.ix({..., remainingAccounts: [...]})` | Similar |
| **Signers** | `.signers(signers)` | Implicit from payer + accounts | Less explicit |
| **IDL from chain** | `Program.at(address)` / `Program.fetchIdl(address)` | `fromIdl(manualIdlObject)` | **GAP** |
| **IDL publishing** | `anchor idl init` (CLI) | ❌ Not implemented | **GAP** |
| **PDA resolution** | Runtime from IDL seeds | Compile-time via `.derive()` | **better-sol better** |
| **Zero-copy accounts** | ❌ Not supported client-side | ✅ `struct()` + zeroCopy decode | **better-sol better** |
| **Token-2022** | Manual (separate SPL packages) | First-class `sol.token2022.*` | **better-sol better** |
| **Wallet adapters** | Roll your own | Built-in subpaths | **better-sol better** |
| **@solana/kit** | ❌ Uses web3.js v1 | ✅ Uses @solana/kit v6 | **better-sol forward-looking** |
| **Cluster management** | Manual URL strings | `Cluster` type + automatic URLs | **better-sol better** |
| **DB schema gen** | ❌ | ✅ `generate db` | **better-sol unique** |
| **Steps (multi-ix)** | Manual `.preInstructions`/`.postInstructions` | `sol.steps()` | Similar, different approach |

### 7.4 What `@anchor-lang/core` Does Better

1. **Builder pattern composability** — `.accounts().signers().remainingAccounts().rpc()/.instruction()/.transaction()/.simulate()` is more flexible than our single-call approach
2. **Simulation** — Built-in, no extra setup
3. **Events** — Listener pattern integrated
4. **Views** — Read-only instructions with return values
5. **Account resolution** — Auto-resolves PDAs from IDL seeds at runtime
6. **IDL from chain** — `Program.at()` fetches and parses IDL automatically
7. **IDL publishing** — `anchor idl init` publishes to PMP
8. **Pre/post instructions** — Atomic composition within transaction

### 7.5 What `better-sol` Does Better

1. **`@solana/kit` native** — Forward-looking, uses official v2 TypeScript toolkit
2. **TypeScript-first programs** — Write program + get typed client (Anchor requires separate Rust code)
3. **Zero-copy client support** — Anchore has no client-side zero-copy equivalent
4. **Token-2022 first class** — `sol.token2022.*` mirror, Anchor requires manual CPI
5. **Wallet adapter subpaths** — Built-in for Wallet Adapter, Reown, Privy, Dynamic
6. **Cluster management** — Typed `Cluster` union with automatic RPC URLs
7. **DB schema generation** — `generate db` for drizzle
8. **Compile-time account types** — Our `.derive()` validates seeds at type level, not runtime

---

## 8. Our `fromIdl()` — Gap Analysis

### 8.1 Current State

Our `fromIdl()` accepts a simplified IDL format:
```typescript
type AnchorIdl = {
  name: string;
  instructions: { name, accounts?: { name, writable, signer }[], args?: { name, type }[] }[];
  accounts?: { name, type: { kind: "struct", fields: { name, type }[] } }[];
  errors?: { code, name, msg }[];
  metadata?: { address?: string };
};
```

### 8.2 Missing from Anchor IDL Spec

| Anchor IDL Feature | Our fromIdl | Impact |
|-------------------|-------------|--------|
| `discriminator` on instructions | ❌ | Can't verify instruction identity |
| `discriminator` on accounts | ❌ | Can't verify account type on fetch |
| `pda` with seeds on accounts | ❌ | Can't auto-resolve PDAs at runtime |
| `optional` flag on accounts | ❌ | Can't handle optional accounts |
| `relations` on accounts | ❌ | Can't auto-resolve related accounts |
| `returns` on instructions | ❌ | Can't support view functions |
| `docs` on everything | ❌ | No documentation in IDL |
| `metadata.spec` version | ❌ | Can't version-check IDL |
| `constants` | ❌ | Can't expose program constants |
| `types` (enum, generic, repr) | ❌ Partial | Can't represent complex types |
| `IdlInstructionAccounts` (composite) | ❌ | Can't handle nested account groups |

### 8.3 Recommendation

Our `fromIdl()` should accept the full Anchor IDL spec. For missing fields we can't use, we should skip/generate reasonable defaults rather than rejecting.

---

## 9. Key Design Decisions — Re-evaluated

### 9.1 Should we follow Anchor's builder pattern?

**Yes, but selectively.** We should add terminal methods to our instruction return type:

```typescript
// Current:
const sig = await sol.counter.initialize({ args: { data: 42n }, accounts: {...} });

// Proposed:
const op = sol.counter.initialize({ args: { data: 42n }, accounts: {...} });
const sig = await op.send();           // current behavior
const ix = op.instruction();           // @solana/kit Instruction (NEW)
const sim = await op.simulate();       // simulate (NEW)
const { instruction, signers, pubkeys } = op.prepare(); // (NEW)
```

We should NOT adopt Anchor's full builder chain (`.accounts().signers().remainingAccounts()`) because our accounts are already fully specified in the single call.

### 9.2 Should we support events?

**Yes.** Events are essential for production Solana programs. We should:
1. Support `event()` in the TypeScript DSL
2. Generate `#[event]` structs and `emit!()` calls in Rust
3. Provide `sol.program.addEventListener('EventName', callback)` in the client

### 9.3 Should we support `Program.at()` / IDL from chain?

**Not immediately.** `@anchor-lang/core` fetches IDL from the Program Metadata Program. We could support this but it's not critical — our primary path is generating the client from the TypeScript program definition.

### 9.4 Should we switch to `@solana/web3.js` to match Anchor?

**Absolutely NOT.** `@anchor-lang/core` uses `@solana/web3.js` because it predates `@solana/kit`. `@solana/kit` IS the official modern replacement. Switching would be a regression. The fact that Anchor hasn't adopted it yet is a timing issue, not a design choice.

---

## 10. Updated Summary

### What we correctly identified before:
- Anchor output target is correct ✅
- Transpiler approach is sound ✅
- Better-sol has unique value (TS-first, kit-native, zero-copy, t22) ✅

### What we got WRONG:
- Called the package `@project-serum/anchor` / `@coral-xyz/anchor` — correct name is `@anchor-lang/core` ❌
- Didn't identify the full `@anchor-lang/*` ecosystem (16 SPL packages) ❌
- Missed that IDL is now fetched via Program Metadata Program (not old format) ❌
- Underestimated the richness of the Anchor IDL spec (discriminators, PDAs, composite accounts, returns, docs, generics) ❌

### What we properly identified now:
- Anchor uses `@solana/web3.js` exclusively (our `@solana/kit` choice is correct + forward-looking) ✅
- Builder pattern is more composable than our single `.send()` ✅
- Events, simulation, views, close accounts are missing from better-sol ✅
- Our `fromIdl()` is too simplified for real Anchor IDL interop ✅

---

## Progress Update (2026-05-04)

| Gap Identified | Status |
|---|---|
| Simulation missing | ✅ Added `.simulate()` to all instruction methods |
| Events missing | ✅ Added `event()` DSL function; transpiler already handled `emit!()` |
| Close accounts missing | ✅ Already existed (`p.close()` + transpiler) |
| `fetchAll`/`fetchMultiple` missing | ✅ Added `fetchMultiple()` to BoundAccount |
| `.transaction()` terminal | ✅ Already existed |
| `.prepare()` terminal | ✅ Added |
| `fromIdl()` too simplified | ✅ Updated for full Anchor IDL (coption, composite accounts, optionals, address fields) |
| Views missing | ❌ Deferred |
| Event listener missing | ❌ Deferred |
| IDL from chain (`Program.at()`) | ❌ Deferred |
