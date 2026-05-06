# 06 — Audit & Roadmap

Current implementation state, identified issues, and prioritized improvements.

---

## 1. Current State

### Completed

| Component | Status | Test count |
|---|---|---|
| Program definition DSL | Complete | 10 tests |
| Borsh + zero-copy codec | Complete | 16 tests |
| `fromIdl()` Anchor IDL import | Complete | 16 tests |
| Client SDK factory | Complete | 14 tests |
| Wallet adapters (4 providers) | Complete | 11 tests |
| TypeScript AST parser | Complete | Covered by fixture tests |
| Body transpiler (TS → Rust) | Complete | Covered by fixture tests |
| Anchor Rust + IDL generator | Complete | Covered by fixture tests |
| 18 unsupported-pattern diagnostics | Complete | 18 failure fixtures |
| CLI commands (create, login, deploy, verify, generate db) | Complete | Unit tested |
| Cloud compiler API | Complete | Integration tested |
| Database schema generator | Complete | Unit tested |
| Node.js + Bun compatibility | Complete | Smoke tested |
| `bs` namespace API | **Done** | All tests use `bs.*` |
| `cpi` namespace for transpiler stubs | **Done** | `cpi.token.*`, `cpi.sol.*` |
| Discriminator cache | **Done** | `Map<string, Uint8Array>` |
| `encodeInstruction` arg validation | **Done** | Throws on missing args |
| `toSnake` consecutive capitals fix | **Done** | `createATA` → `create_at_a` |
| `idl.ts` rewritten for `bs.*` API | **Done** | All tests pass |
| `index.ts` updated exports | **Done** | Exports `bs`, `cpi`, types |
| CLI parser: `bs.*` / `cpi.*` support | **Done** | 7 new namespace tests |
| CLI body transpiler: `cpi.*` / `cpi.sol.*` | **Done** | `isSolReference()`, CPI detection |
| Token-2022 mint decimals fallback | **Done** | Tries both programs |
| Client split into modules | **Done** | 6 modules in `src/client/` |
| Instruction plan composability | **Done** | `.plan()` method on instructions |
| Compute unit estimation | **Done** | `computeUnits` config, `withComputeBudget()` |
| Event subscription API | **Done** | `onTransaction()` on client |
| Runtime input validation | **Done** | `validateArgs()` with clear error messages |
| `better-sol/codec` subpath | **Done** | Standalone codec exports |
| `bs.realloc()` constraint | **Done** | SDK + CLI transpiler support |
| PDA derivation input validation | **Done** | Validates seed fields before PDA compute |
| `has_one` / `belongs_to` constraints | **Done** | `.hasOne("field")` on AccountDefinition + transpiler |

**Total: 155 passing tests (67 SDK + 88 CLI). Zero lint/type/build errors.**

### Not Yet Complete

| Feature | Status |
|---|---|
| ALT support | **Done.** `resolveWithLookupTables` converts `AccountMeta` → `AccountLookupMeta` for addresses found in lookup tables. Index built at client creation via `fetchAddressesForLookupTables`. |
| Durable nonce | **Done.** `fetchNonce` from `@solana-program/system` decodes nonce value. `setTransactionMessageLifetimeUsingDurableNonce` auto-prepends advance nonce instruction. |
| Watch mode / hot reload | Not yet implemented |
| VS Code extension or LSP | Not started |

---

## 2. Identified Bugs

### P0 — Data Corruption / Incorrect Behavior

| # | Issue | Location | Status |
|---|---|---|---|
| 1 | `encodeInstruction` accepts optional args, passes `undefined` to `encodeField` → silent garbage | `coder.ts:encodeInstruction()` | **Fixed** — args now required, throws on missing |
| 2 | Discriminator recomputed on every instruction build (SHA-256) | `coder.ts:discriminator()` | **Fixed** — `Map<string, Uint8Array>` cache |
| 3 | Token-2022 mint decimals fetch always queries Token program | `client.ts:fetchMintDecimals()` | **Fixed** — falls back to Token-2022 |
| 4 | `toSnake` incorrectly handles consecutive capitals (`createATA` → `create_a_t_a`) | `client.ts`, `cli/naming.ts` | **Fixed** in both locations |

### P1 — Runtime Robustness

| # | Issue | Location | Fix |
|---|---|---|---|
| 5 | PDA `derive()` silently accepts missing seed fields, producing incorrect addresses | `client.ts:BoundAccountImpl.derive()` | Validate all seed field names are present in input |
| 6 | Instruction methods don't validate input types at runtime | `client.ts:buildInstruction()` | Add runtime checks for bigint vs number, valid base58 addresses |
| 7 | Confirmation polling uses fixed-interval sleep, no early exit on terminal failure | `client.ts:sendAndConfirm()` | Use subscription-based confirmation or exponential backoff |

### P2 — Edge Cases

| # | Issue | Location | Fix |
|---|---|---|---|
| 8 | `decodeF32`/`decodeF64` use `data.buffer` which may reference a larger buffer with offset | `coder.ts` | Already correct via `data.byteOffset + offset`, but fragile; add tests for subarray views |
| 9 | `fromIdl()` maps `coption` to `option` — close enough but `coption` has different serialization in some Anchor versions | `idl.ts` | Document as best-effort; add note in README |
| 10 | Client build uses `Record<string, unknown>` internally with final `as unknown as` cast | `client.ts:buildClient()` | Type-safe but fragile; add explicit type assertion tests |

---

## 3. Type-Safety Gaps

| # | Gap | Impact | Fix |
|---|---|---|---|
| 1 | `AddressInput = string \| KitAddress` accepts any string, even invalid base58 | Compile-time safety lost | Provide `bs.address()` with branded type, or `assertAddress()` runtime check |
| 2 | Coder uses `as number` / `as bigint` casts based on `kind` string — no type-level guarantee that value matches kind | Theoretically unsound | Unavoidable at the boundary between TS types and binary encoding; document as intentional |
| 3 | `InferType<TToken>` relies on TypeToken branded symbols but doesn't prevent construction of invalid tokens | Low risk | Symbols make accidental construction unlikely; intentional misuse is out of scope |
| 4 | `InstructionParams<TIx>` type computation is ~200 lines of mapped/conditional types | Hard to maintain | Extract to separate types file; add type-level tests |

---

## 4. API Improvements (Priority-Ordered)

### P0 — Critical DX Issues

1. ~~**Implement `bs` namespace**~~ — **Done.** All primitives, constraints, and definitions under `bs.*`.

2. ~~**Implement `cpi` separate import**~~ — **Done.** `cpi.token.*` and `cpi.sol.*` exported from program.ts.

3. ~~**Fix `encodeInstruction` undefined args**~~ — **Done.** Required arg type, throws on missing.

4. ~~**Cache discriminators**~~ — **Done.** `Map<string, Uint8Array>` cache in coder.ts.

5. ~~**Fix `toSnake` for consecutive capitals**~~ — **Done.** Proper regex in client.ts.

6. ~~**Fix Token-2022 mint decimals fetch**~~ — **Done.** Falls back to Token-2022 when querying Token program.

### P1 — High Priority

7. ~~**Add instruction plan composability**~~ — **Done.** `.plan()` method returns composable `InstructionPlan`.

8. ~~**Add compute unit estimation**~~ — **Done.** `computeUnits` config in `betterSol()`, `withComputeBudget()` helper.

9. ~~**Add event subscription API**~~ — **Done.** `onTransaction()` method on `BetterSolClient`.

10. ~~**Export standalone codec functions**~~ — **Done.** `better-sol/codec` subpath exports `encodeField`, `decodeField`, `encodeAccount`, `decodeAccount`, `decodeZeroCopyAccount`, `encodeInstruction`, `anchorDiscriminator`, `accountDiscriminator`.

11. ~~**Add runtime input validation**~~ — **Done.** `validateArgs()` in factory.ts throws clear type-mismatch errors (e.g. `better-sol: instruction "increment" arg "amount" expects u64 (bigint), got 42`) instead of cryptic Borsh/RPC errors.

### P2 — Medium Priority

12. ~~**Add `bs.realloc()` constraint**~~ — **Done.** `bs.realloc(AccountDefinition, space)` returns `AccountConstraint<..., "realloc", true>`. CLI transpiles to `#[account(mut, realloc = N, realloc::payer = ..., realloc::zero = N)]`. System program auto-added when realloc is present.

13. ~~**Add instruction return value support**~~ — **Done.** `returns: bs.u64()` in `ix()` config. CLI: `parseReturnType()` extracts type from AST. Transpiler: `return <expr>` generates `return Ok(expr);`, instruction signature uses `-> Result<ReturnType>` instead of `-> Result<()>`. Body now supports return statements (was previously unsupported).

14. ~~**Add address lookup table support**~~ — **Done.** New module `client/lookup-tables.ts`: `buildLookupTableIndex` fetches all lookup table contents via `fetchAddressesForLookupTables`, builds reverse map (`address → { lookupTableAddress, addressIndex }`). `resolveWithLookupTables` converts matching `AccountMeta` to `AccountLookupMeta` at instruction build time. The v0 transaction compiler automatically generates `addressTableLookups` in the wire format. Signer accounts are excluded from lookup table resolution (signers cannot be in lookup tables).

15. ~~**Add durable nonce transaction support**~~ — **Done.** `fetchNonce` from `@solana-program/system` properly decodes the nonce account (returns `{ blockhash }` as the nonce value). `setTransactionMessageLifetimeUsingDurableNonce` auto-prepends the `AdvanceNonceAccount` instruction. Threaded through `buildAndSignTransaction` and all instruction methods. Nonce value fetched fresh per transaction.

16. ~~**Split `client.ts` into modules**~~ — **Done.**

17. ~~**Add PDA derivation input validation**~~ — **Done.** `BoundAccountImpl.derive()` now validates that all seed field names are present in the input before computing the PDA.

18. ~~**Add `has_one` / `belongs_to` constraints**~~ — **Done.** `AccountDefinition.hasOne("field")` adds a has-one constraint. CLI parser extracts `.hasOne()` from chain text, transpiler generates `has_one = field` in account attributes for init, mut, bare, and realloc constraints.

### P3 — Lower Priority

19. **Reconsider `program()` API shape** — chained builder (`bs.program().instruction().accounts().args().handler()`) vs current nested callback. Evaluate after `bs` namespace is implemented.

20. **Add Metaplex integration helpers**.

21. **Add RPC provider integrations** (Helius, Triton, QuickNode) — convenience wrappers for common provider-specific features.

22. **Watch mode for CLI** — `deploy --watch` for hot reload.

23. **VS Code extension** — diagnostics, autocomplete for `bs.*` constraints.

24. **Parallel instruction plan execution**.

---

## 5. Architecture Improvements

### Split `client.ts` into Concern-Specific Modules

Done. `client.ts` (791 lines) has been split into:
```
client/
  types.ts          — All type definitions, config types, exported constants
  signer.ts         — resolveSigner, requireSigner, keypair loading, seed encoding
  transaction.ts    — buildAndSignTransaction, sendAndConfirm, runSimulation, buildAccountMetas, withComputeBudget
  bound-account.ts  — BoundAccountImpl (derive, fetch, fetchMultiple)
  token-client.ts   — buildTokenClient, fetchMintDecimals (with Token-2022 fallback)
  factory.ts        — betterSol() entry point, buildClient, buildProgramClient
  index.ts          — Barrel re-exports
```

### Extract Borsh Codec as Standalone Package

Move `coder.ts` to a separate package (`@better-sol/codec`) for use by indexers, explorers, and custom tooling without the full client dependency.

### Add Instruction Plan Layer

```
Current:  instruction params → Instruction → Transaction → Sign → Send → Confirm
Target:   instruction params → Instruction → InstructionPlan (composable) → TransactionPlan → Execute
```

This enables:
- Composing instructions from multiple programs
- Parallel execution where safe
- Message packing for large instructions
- Compute unit estimation from the plan

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **API divergence from @solana/kit** | Users can't compose with official SDK | Export `.instruction()` and `.plan()` methods returning standard Kit types |
| **Transpiler maintenance burden** | 3,200 LOC of parsing/codegen to maintain | IR-based architecture enables multiple output targets; test fixture suite catches regressions |
| **Cloud compiler dependency** | Can't deploy if compiler API is down | Open-source compiler for self-hosting; `--dry-run` flag produces local Rust for manual compilation |
| **Ecosystem fragmentation** | Tools expecting standard Anchor layouts won't work | Generated output is standard Anchor; programs can be deployed via `solana program deploy` as fallback |
| **Adoption barriers** | Anchor devs see no reason to switch, new devs hit limitations | Target the "new Solana developer" segment; Anchor compatibility ensures escape hatch |
| **Type gymnastics fragility** | Complex mapped types break on TS version updates | Type-level tests; conservative use of advanced TS features |

---

## 7. Test Coverage Needed

| Area | Current | Target |
|---|---|---|
| Program definition types | 9 tests | Add: `bs` namespace, `cpi` import, constraint chaining |
| Borsh codec | 15 tests | Add: edge cases for option/vec/array, signed integer boundaries |
| `fromIdl()` | 12 tests | Add: Token-2022 IDL, events in IDL |
| Client SDK | 10 tests | Add: runtime validation, PDA seed validation, error messages |
| Wallet adapters | 6 tests | Add: error cases, multiple transaction signing |
| Transpiler parser | Covered by fixtures | Add: `bs.*` namespace resolution, `cpi.*` detection |
| Body transpiler | Covered by fixtures | Add: `cpi.token.*` generation, `ctx.emit()` validation |
| Rust generator | Covered by fixtures | Add: Token-2022 CPI output, zero-copy layout edge cases |

---

## 8. Migration Plan (Old API → New API)

Since we're in pre-1.0 development, breaking changes are acceptable. No backward compatibility layer needed. **The parser now actively rejects old API patterns** with a clear error message pointing users to the `bs`/`cpi` namespace.

### Changes to `program.ts`

| Old | New |
|---|---|
| `import { u8, u64, pubkey, bool, string, bytes, option, vec, array, p, token, sol } from "better-sol/program"` | `import { bs, cpi } from "better-sol/program"` |
| `account({ count: u64 })` | `bs.account({ count: bs.u64() })` |
| `p.mut(Counter)` | `bs.mut(Counter)` |
| `p.signer()` | `bs.signer()` |
| `p.mint().mut()` | `bs.mint().writable()` |
| `p.tokenAccount().mut()` | `bs.tokenAccount().writable()` |
| `p.tokenProgram()` | `bs.tokenProgram()` |
| `p.systemProgram()` | `bs.systemProgram()` |
| `p.clock()` | `bs.clock()` |
| `p.create(Counter)` | `bs.init(Counter)` |
| `p.close(Counter, "refund")` | `bs.close(Counter, "refund")` |
| `token.transfer({...})` | `cpi.token.transfer({...})` |
| `sol.timestamp()` | `cpi.sol.timestamp()` |
| `option(u64)` | `bs.optional(bs.u64())` |
| `vec(pubkey)` | `bs.vector(bs.pubkey())` |
| `array(u64, 10)` | `bs.array(bs.u64(), 10)` |
| `struct({...})` | `bs.struct({...})` |
| `program({...}, ix => {...})` | `bs.program({...}, ix => {...})` |

### Changes to `client.ts`

No breaking changes to the client API. `betterSol()`, `keypairFile()`, `secretKey()`, `fromIdl()`, and wallet adapters are unchanged. The program definition object shape is the same (the `bs.*` functions return the same `PrimitiveToken`, `AccountDefinition`, `ProgramDefinition` objects internally).

### Changes to CLI Parser

`resolveType()` and constraint resolution in `ast.ts` need to handle `PropertyAccessExpression` callees (`bs.u64`, `bs.init`, etc.) alongside the existing `Identifier` and `CallExpression` patterns. This is ~30 lines of additional parsing logic.

### Changes to Examples, Tests, Docs

All examples, test fixtures, and documentation need to be updated to use `bs.*` and `cpi.*` syntax. The runtime behavior is identical — only the public API surface changes.
