# 05 — Ecosystem Analysis

Analysis of official Solana SDKs, Anchor, and competing approaches. Used to inform design decisions and identify gaps.

---

## 1. Official Solana SDK (`@solana/kit`)

### Architecture

The official TypeScript SDK (v6.8.0) is organized into layered, composable primitives:

```
@solana/kit
  ├── RPC layer: createSolanaRpc(), createSolanaRpcSubscriptions()
  ├── Transaction layer: createTransactionMessage(), signTransactionMessageWithSigners()
  ├── Instruction plans: parallelInstructionPlan(), sequentialInstructionPlan()
  ├── Codec layer: getAddressEncoder(), getU64Encoder(), getStructEncoder()
  ├── Program SDKs: @solana-program/token, @solana-program/system
  └── Reactive stores: createReactiveStoreWithInitialValueAndSlotTracking()
```

### What better-sol Adopts

- Uses `@solana/kit` as the foundation for RPC, transactions, subscriptions, and address encoding
- Uses `@solana-program/token` and `@solana-program/system` for token and SOL operations
- Follows the `TransactionSigner` interface for wallet integration
- Uses `Instruction` type as the return type for `.instruction()` method

### What better-sol Abstracts Away

- Manual transaction message building (`createTransactionMessage` → `setFeePayer` → `setLifetime` → `appendInstructions`)
- Explicit signing (`signTransactionMessageWithSigners`)
- Manual confirmation polling
- Account meta construction (role: writable/signer determination)

### What better-sol Is Missing

The official SDK's instruction plan system is more sophisticated:

| Feature | @solana/kit | better-sol |
|---|---|---|
| Sequential plans | `sequentialInstructionPlan()` | `sol.send([...])` |
| Parallel plans | `parallelInstructionPlan()` | ❌ Not yet |
| Non-divisible sequences | `nonDivisibleSequentialInstructionPlan()` | ❌ Not yet |
| Message packer (large txs) | `getLinearMessagePackerInstructionPlan()` | ❌ Not yet |
| Reallocation packer | `getReallocMessagePackerInstructionPlan()` | ❌ Not yet |
| Transaction planner | `createTransactionPlanner()` | ❌ Implicit only |
| Compute unit estimation | `estimateComputeUnitLimitFactory()` | ❌ Not yet |
| Durable nonce transactions | `sendAndConfirmDurableNonceTransactionFactory()` | ❌ Not yet |
| Reactive stores | `createReactiveStoreWithInitialValueAndSlotTracking()` | ❌ Out of scope |

### Design Conflict: Instruction Lifecycle Conflation

The official SDK intentionally separates: instruction building → transaction planning → signing → sending → confirming. better-sol combines these into a single `.send()` method by default, with individual steps available via `.instruction()`, `.transaction()`, `.simulate()`, `.prepare()`.

**Risk**: Developers who learn better-sol may not understand the Solana transaction lifecycle, making debugging harder when things go wrong.

**Mitigation**: The individual step methods are available and documented. The convenience API is a progressive enhancement, not a replacement for understanding.

---

## 2. Anchor Framework

### Architecture

Anchor is the most widely used Solana program framework. Four major components:

1. **`anchor-lang`** — Rust eDSL for onchain programs
   - `#[program]` — instruction module with auto-generated dispatch
   - `#[derive(Accounts)]` — account validation, serialization, constraint checking
   - `#[account]` / `#[account(zero_copy)]` — account data structures
   - `#[event]` + `emit!()` — structured event logging
   - `#[error_code]` — custom error types
   - `declare_id!()` — program ID constant
   - `declare_program!()` (v1.0+) — import external programs from IDL

2. **`anchor-syn`** — proc-macro codegen backend
   - Parses `#[program]` module into IR
   - Generates dispatch logic, account validation, CPI clients, IDL

3. **Anchor TypeScript SDK** (`@coral-xyz/anchor`)
   - `Program<IDL>` class with methods builder
   - `program.methods.instructionName(args).accounts({...}).rpc()`
   - BorshCoder for encode/decode
   - Account resolution (PDA derivation from IDL seeds)
   - Provider (Wallet + Connection) abstraction
   - Workspace (auto-load IDL + program from config)
   - Event listener (`program.addEventListener()`)

4. **Anchor CLI** (`anchor`)
   - `anchor init/build/deploy/test`
   - `anchor idl init/fetch/upgrade/close`
   - `anchor keys list/sync`

### What better-sol Adopts from Anchor

- **Account constraint model** — `bs.init()`, `bs.mut()`, `bs.close()`, `bs.signer()`, etc. map directly to Anchor's `#[derive(Accounts)]` attributes
- **Instruction discriminators** — 8-byte SHA256 prefix, matching Anchor's `DISCRIMINATOR` convention
- **Borsh serialization** — account data and instruction args use Anchor-compatible Borsh encoding
- **IDL format** — generated IDL is Anchor-compatible for ecosystem tooling compatibility
- **Error codes** — `#[error_code]` enum with `#[msg()]` attributes
- **Event system** — `#[event]` + `emit!()` pattern
- **Zero-copy accounts** — `#[account(zero_copy)]` with `AccountLoader`

### What better-sol Improves Over Anchor

| Aspect | Anchor | better-sol |
|---|---|---|
| **Program language** | Rust (steep learning curve for TS devs) | TypeScript (familiar) |
| **Client SDK** | Separate IDL → codegen step | Same definition = client, zero codegen |
| **Single source of truth** | Rust + IDL + separate TS client | One `.ts` file |
| **Local toolchain** | Rust, Cargo, Solana CLI, BPF target | None (cloud compilation) |
| **TypeScript idioms** | Wraps Rust concepts | Namespaced factories, chained builders |
| **Wallet adapters** | Roll your own | Built-in for 4 major providers |
| **Token-2022** | Separate package, manual config | First-class parallel API (`sol.token2022.*`) |
| **DB schema** | Not provided | Drizzle ORM generation |
| **Error messages** | `AnchorError: 0x1` (cryptic) | Named errors with messages at transpile time |

### What Anchor Does Better

- **Production maturity** — battle-tested across thousands of programs
- **Full Rust expressiveness** — can use any Rust library, macro, or pattern
- **Account validation** — richer constraint model (`has_one`, `belongs_to`, `constraint`)
- **Multiple program types** — programs, interfaces, associated token
- **Instruction return values** — `-> Result<ReturnType>` supported
- **CPI composition** — `declare_program!()` for importing external programs
- **Ecosystem tooling** — IDL explorers, verified builds, security auditors familiar with the format

### Key Insight: Anchor Compatibility = Ecosystem Compatibility

By targeting Anchor Rust as the transpiler output, better-sol programs are:
- Auditable by any Anchor-familiar security auditor
- Verifiable via OtterSec and Sec3 verified-builds
- Interoperable with Anchor-based frontends and indexers
- Deployable via standard Solana CLI as a fallback

This is the right trade-off: better-sol innovates on the development experience while maintaining full compatibility with the Anchor ecosystem.

---

## 3. Competitor Landscape

### shank + Codama (Metaplex)

- Shank: Rust IDL extraction from native Solana programs
- Codama: Autogenerated TypeScript clients from IDL specs
- **Difference from better-sol**: Rust-first, code generation required, no TypeScript → Rust path

### Solana Playground

- Browser-based IDE for Solana development
- Supports Anchor and native Rust
- **Difference from better-sol**: Browser-only, Rust-only, no TypeScript DSL

### Seahorse (by Solana Foundation)

- Python → Anchor Rust transpiler
- **Difference from better-sol**: Python, not TypeScript; different target audience

### Neptune (by Triton)

- TypeScript-based Solana program framework
- **Difference from better-sol**: Programs run in a modified SVM runtime, not standard Solana

---

## 4. DX Principles (from Library Analysis)

Analysis of Zod, Drizzle, Better Auth, tRPC, and ElysiaJS informed the SDK design:

| Principle | Source | Application in better-sol |
|---|---|---|
| Import → define → use | All | `import { bs }` → `bs.account({...})` → use |
| Types inferred, never written | Zod | `InferFields`, `InferAccounts`, `InferArgs` |
| No code generation | Drizzle | Definition = client SDK at runtime |
| Single import namespace | Zod | `bs.*` contains everything |
| Plugin-based composition | Better Auth | `programs: { counter, amm }` in `betterSol()` |
| Scoped type inference | ElysiaJS | `ix()` callback inherits error/event types from `bs.program()` config |
| Errors name the exact field | Zod | 18 transpiler diagnostics name the line and pattern |

### Anti-Patterns Avoided

1. **Setup > coding** — no config files, no toolchain installs (cloud compilation)
2. **Code generation required** — client works without any generation step
3. **Magic strings** — error names and event names are typed from the definition
4. **Framework lock-in** — programs are plain TypeScript; the transpiler is a separate tool

---

## 5. Key Design Trade-Offs

### Trade-off: Anchor Compatibility vs. Higher-Level Abstraction

**Chosen**: Target Anchor Rust directly. The DSL maps constraints, accounts, and instructions to Anchor equivalents with minimal abstraction.

**Alternative considered**: Create a higher-level abstraction that generates Anchor Rust indirectly. Rejected because:
- Every abstraction layer adds potential for generated code that doesn't compile
- Anchor is the ecosystem standard; compatibility is more valuable than novelty
- Security auditors need to understand the generated code
- The "Anchor but in TypeScript" value proposition is already compelling enough

### Trade-off: Single `bs` Namespace vs. Separate Type/Constraint Imports

**Chosen**: Single `bs` namespace containing types, constraints, and definitions.

**Alternative considered**: Separate imports for types (`bs.u64()`), constraints (`cs.mut()`), and definitions (`def.account()`). Rejected because:
- Three imports for one task is worse than one
- Zod proves that one namespace works for diverse primitives
- The boundary between "type" and "constraint" is not always clear to users

### Trade-off: `cpi` as Separate Import vs. Under `bs`

**Chosen**: Separate `cpi` import for transpiler-only stubs.

**Alternative considered**: `bs.cpi.token.transfer()`. Rejected because:
- CPI stubs are never used outside `run()` bodies
- A separate import makes the transpiler boundary explicit
- Tree-shaking is simpler with a separate module
- Avoids confusion with client-side `sol.token.transfer()`

### Trade-off: `run()` as Function Body vs. Template Literal

**Chosen**: `run()` as a regular arrow function with typed parameters.

**Alternative considered**: Tagged template literal or separate `.behavior()` method. Rejected because:
- Arrow functions provide TypeScript autocomplete and type checking
- Template literals don't offer the same type inference
- A separate method would require a different API shape for the same concept
- The "transpiler-only" nature is communicated by the `cpi` import and documentation, not forced by syntax

---

## 6. Missing Ecosystem Features (Priority)

| Feature | Priority | Source of truth |
|---|---|---|
| Instruction plan composability (parallel, messagePacker) | P1 | @solana/kit |
| Compute unit estimation and priority fees | P1 | @solana/kit |
| Event subscription API | P1 | Anchor |
| Reallocation support (`bs.realloc()`) | P2 | Anchor |
| `has_one` / `belongs_to` constraints | P2 | Anchor |
| Durable nonce transactions | P2 | @solana/kit |
| Address lookup tables | P2 | @solana/kit |
| Instruction return values | P2 | Anchor |
| Reactive stores for UI frameworks | Out of scope | @solana/kit |
