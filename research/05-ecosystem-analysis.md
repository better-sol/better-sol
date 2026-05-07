# 05 — Ecosystem Analysis

Analysis of official Solana SDKs, Anchor, and competing approaches. Used to inform design decisions and identify gaps.

---

## 1. Official Solana SDK (`@solana/kit`)

### What better-sol Adopts

- Uses `@solana/kit` as foundation for RPC, transactions, subscriptions, and address encoding
- Uses `@solana-program/token` and `@solana-program/system` for token and SOL operations
- Follows the `TransactionSigner` interface for wallet integration
- Uses `Instruction` type as the return type for `.instruction()` method
- Re-exports `nonDivisibleSequentialInstructionPlan` and `flattenInstructionPlan` for instruction plan composition

### What better-sol Abstracts Away

- Manual transaction message building (create → setFeePayer → setLifetime → append)
- Explicit signing
- Confirmation polling (WebSocket-first, polling fallback)
- Account meta construction (role: writable/signer determination)
- Compute budget instruction management

### What better-sol Has That @solana/kit Doesn't

| Feature | better-sol | @solana/kit |
|---|---|---|
| Program definition DSL | `bs.program()` | None |
| Typed instruction methods | Auto from definition | Manual per-program SDKs |
| PDA derivation from seeds | `accounts.Counter.derive({...})` | Manual `getProgramDerivedAddress()` |
| Account fetching with decode | `accounts.Counter.fetch(addr)` | Manual codec + RPC |
| Error parsing | `sol.counter.parseErrors(logs)` | Manual |
| Event parsing | `sol.counter.parseEvents(logs)` | Manual |
| Token convenience API | `sol.token.createMint({...})` | Manual instruction composition |

---

## 2. Anchor Framework

### What better-sol Adopts from Anchor

- Account constraint model (`bs.init()`, `bs.mut()`, etc. → Anchor's `#[derive(Accounts)]`)
- Instruction discriminators (8-byte SHA256 prefix)
- Borsh serialization
- IDL format compatibility
- Error codes with named messages
- Event system (`#[event]` + `emit!()`)
- Zero-copy accounts (`#[account(zero_copy)]` with `AccountLoader`)

### What better-sol Improves Over Anchor

| Aspect | Anchor | better-sol |
|---|---|---|
| Program language | Rust | TypeScript (transpiled to Anchor Rust) |
| Client SDK | Separate IDL → codegen step | Same definition = client, zero codegen |
| Single source of truth | Rust + IDL + separate TS client | One `.ts` file |
| Local toolchain | Rust, Cargo, Solana CLI | None (cloud compilation) |
| Error messages | `AnchorError: 0x1` | Named errors with human messages |
| Token-2022 | Separate package | First-class parallel API |

### What Anchor Does Better

- Production maturity (battle-tested)
- Full Rust expressiveness
- `declare_program!()` for external program imports
- Ecosystem tooling (IDL explorers, verified builds)

### Key Insight

By targeting Anchor Rust as transpiler output, better-sol programs are auditable by Anchor-familiar auditors, verifiable via OtterSec/Sec3, and interoperable with the Anchor ecosystem.

---

## 3. DX Principles (from Library Analysis)

| Principle | Source | Application |
|---|---|---|
| Import → define → use | All | `import { bs }` → `bs.account({...})` → use |
| Types inferred, never written | Zod | `InferFields`, `InferAccounts`, `InferArgs` |
| No code generation | Drizzle | Definition = client SDK at runtime |
| Single import namespace | Zod | `bs.*` |
| Proxy-based client | tRPC | `createProgramClient()` with Proxy traps |
| Errors name the exact field | Zod | 18 transpiler diagnostics + runtime validation errors |

---

## 4. Completed Features

All P1 and P2 features from the original ecosystem analysis are now implemented:

| Feature | Status |
|---|---|
| Instruction plan composability | **Done** — `.plan()` method, re-exported Kit plan utilities |
| Compute unit estimation | **Done** — `computeUnits` config, `withComputeBudget()` |
| Event subscription API | **Done** — `onTransaction()` pub/sub |
| Runtime input validation | **Done** — `validateArgs()` with clear error messages |
| Address lookup tables | **Done** — `addressLookupTables` config, `resolveWithLookupTables()` |
| Durable nonce transactions | **Done** — `durableNonce` config, `fetchNonce` + auto-prepend |
| `has_one` / `belongs_to` constraints | **Done** |
| `bs.realloc()` constraint | **Done** |
| Instruction return values | **Done** — `returns:` config, `return <expr>` in body |
| WebSocket transaction confirmation | **Done** — `signatureNotifications` subscription |
| Typed program error parsing | **Done** — `ProgramError` class, `parseErrors()` on program client |
| Anchor event parsing | **Done** — `parseEvents()` on program client, discriminator matching |

---

## 5. Key Design Trade-Offs

### Instance Methods vs Standalone Functions

**Decision**: Error parsing (`parseErrors`) and event parsing (`parseEvents`) are instance methods on the program client, not standalone functions.

**Rationale**: Consistency (every program interaction goes through `sol.counter.X()`), discoverability (autocomplete shows everything), caching (discriminator index lives on the instance), and encapsulation (user doesn't need a separate program reference).

### Proxy vs Static Object

**Decision**: JavaScript Proxy for program client (tRPC pattern).

**Rationale**: Eliminates `Record<string, unknown>` intermediate type that required unsafe casts. Proxy traps (`ownKeys`, `has`, `getOwnPropertyDescriptor`) ensure transparency. `WeakMap` cache preserves reference equality. `then`/`toJSON` guards prevent Promise confusion.

### WebSocket-First Confirmation

**Decision**: `signatureNotifications` WebSocket subscription with polling fallback.

**Rationale**: ~400ms confirmation vs 1-5s polling. Kit's built-in `sendAndConfirmTransactionFactory` is cluster-branded and doesn't work with custom RPC URLs, so we implement the subscription directly. Polling fallback ensures compatibility with any RPC endpoint.
