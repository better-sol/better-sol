# 06 — Audit & Roadmap

Current implementation state, type-safety audit results, and future improvements.

---

## 1. Current State

### Test Coverage

- **95 SDK tests** across 6 files (170 expect calls)
- **87 CLI tests** across 5 files (377 expect calls)
- Zero lint errors, zero type errors, zero build errors

### SDK Module Layout

| Module | Description |
|---|---|
| `src/program.ts` | Program definition DSL (`bs` namespace) |
| `src/codec.ts` | Borsh + zero-copy encode/decode |
| `src/idl.ts` | `fromIdl()` Anchor IDL import |
| `src/index.ts` | Public API entrypoint |
| `src/client/factory.ts` | Client factory, Proxy-based program client |
| `src/client/transaction.ts` | Build/sign/send with WebSocket confirmation |
| `src/client/types.ts` | All type definitions, config types |
| `src/client/events.ts` | Error parsing + event decoding |
| `src/client/token-client.ts` | Token + Token-2022 operations |
| `src/client/signer.ts` | Keypair loading, seed encoding |
| `src/client/lookup-tables.ts` | Address lookup table resolution |
| `src/client/bound-account.ts` | PDA derivation + account fetch |

### Build Tooling

- **tsdown** for both SDK and CLI (single build tool, replaces tsc + bun build)
- **`#*` import aliases** via Node.js subpath imports (package.json + tsconfig paths)
- SDK: `platform: "neutral"`, 7 entrypoints, code splitting
- CLI: `platform: "node"`, single bundled entry, version injection via `define`

### Feature Completeness

| Feature | Status |
|---|---|
| Program definition DSL (`bs.*`) | **Done** |
| `cpi` namespace for transpiler stubs | **Done** |
| Borsh + zero-copy codec | **Done** |
| `fromIdl()` Anchor IDL import | **Done** |
| Client SDK factory | **Done** |
| Wallet adapters (4 providers) | **Done** |
| AST parser + body transpiler | **Done** |
| Anchor Rust + IDL generator | **Done** |
| 18 unsupported-pattern diagnostics | **Done** |
| CLI commands (create, deploy, login, verify, generate) | **Done** |
| Cloud compiler API (Bun) | **Done** |
| Database schema generator | **Done** |
| `better-sol/codec` subpath | **Done** |
| Runtime input validation | **Done** |
| PDA derivation input validation | **Done** |
| `bs.realloc()` constraint | **Done** |
| `has_one` / `belongs_to` constraints | **Done** |
| Instruction return values | **Done** |
| Address lookup table support | **Done** |
| Durable nonce transactions | **Done** |
| Compute budget management | **Done** |
| WebSocket transaction confirmation | **Done** |
| Typed program error parsing | **Done** |
| Anchor event parsing | **Done** |
| Instruction plan composability | **Done** |
| Transaction notifications | **Done** |

---

## 2. Type-Safety Audit Results

### Cast Inventory

| Cast | Location | Status | Reason |
|---|---|---|---|
| `results as unknown as TOutputs` | `factory.ts` | **Irreducible** | Generic method on object literal cannot express tuple constraint from `StepChain<TOutputs>` |
| `fn as unknown as IxOverloads` | `program.ts` | **Irreducible** | TypeScript cannot type single function body as satisfying multiple overloaded signatures with different return types |
| `makeIx() as unknown as IxOverloads` | `program.ts` | **Irreducible** | Variance mismatch in function overload types |

**Total**: 3 `as unknown as`, zero `as any`, zero `as never`.

All three were confirmed irreducible by attempting alternatives (conditional return types broke all call-site inference).

### Eliminated During Audit

- `client as unknown as BetterSolClient` — eliminated via Proxy-based `ClientCore` + `ProgramNamespace` architectural redesign
- `reallocSpace` double-cast — eliminated via proper `AccountConstraint` constructor parameter
- 8 `as unknown as` in `validateToken`/`describeToken` — replaced with type-guard functions
- `fromIdl()` narrowing — reduced from `as unknown as IdlProgram` to single-level `as IdlProgram`
- `sendAndConfirm` error message — `String(signature)` instead of `signature as unknown as string`
- `signer.ts` parsed cast — `parsed: unknown` + `KeypairFile` type guard
- All `import("@solana/kit").X` inline type references — converted to named imports
- Dynamic `import("@solana/kit")` in `bound-account.ts` — replaced with top-level import
- Proxy `getOwnPropertyDescriptor` `_target as never` — eliminated

### Shared Type Guards

Extracted to `program.ts` for reuse:
- `hasInnerToken(token)` — checks for `option`, `vec` inner type
- `hasInnerAndSizeToken(token)` — checks for `vec` with size, `array`
- `innerOfToken(token)` — extracts inner type token

---

## 3. Architecture

### Client SDK Architecture

```
betterSol(config)
    │
    ▼
buildClientShape(params) → { ...core, ...programNamespace }
    │
    ├── ClientCore<TPrograms, THasSigner>
    │     payer, rpc, rpcSubscriptions, token, token2022
    │     send(), batch(), steps(), transfer(), onTransaction()
    │
    └── ProgramNamespace<TPrograms>  (mapped type)
          for each program → createProgramClient(program, rpc, ...)
              │
              ├── Proxy handler
              │     get → instruction methods + accounts + parseErrors + parseEvents
              │     ownKeys, has, getOwnPropertyDescriptor → transparency
              │
              ├── BoundAccountImpl per account
              │     derive(), fetch(), fetchMultiple()
              │
              └── createInstructionProxy per instruction
                    fn(), fn.send(), fn.instruction(), fn.transaction()
                    fn.simulate(), fn.prepare(), fn.plan()
                    WeakMap cache for reference equality
```

### Transaction Flow

```
instruction params
    → validateArgs()           // runtime type checking
    → buildInstruction()       // accounts + encoded data
    → buildAndSignTransaction() // message + sign
    → sendAndConfirm()         // WebSocket-first confirmation
        ├── confirmViaWebSocket()  // signatureNotifications subscription
        └── confirmViaPolling()    // fallback: getSignatureStatuses polling
```

---

## 4. Future Improvements

### Potential Features

| Feature | Description | Priority |
|---|---|---|
| Metaplex token-metadata helpers | `sol.metaplex.createMetadata(...)`, `updateMetadata()` for NFT operations | P3 |
| Codama IDL bridge | `fromCodama(idl)` for compatibility with newer Solana IDL format | P3 |
| Watch mode | `deploy --watch` — file watcher recompiles on change | P3 |
| VS Code extension | Diagnostics, autocomplete for `bs.*` constraints and `cpi.*` stubs | P4 |
| Parallel instruction plan execution | `parallelInstructionPlan()` composition in `sol.send()` | P3 |
| Reactive stores | `createReactiveStore` for UI framework integration | P4 |
| Cross-program PDA seeds | `seeds::program = expr` in Anchor constraints | P3 |
| Verified build integration | OtterSec/Sec3 verified build submission after deploy | P4 |
| Multi-sig support | Squads/Snowflake integration for multi-signature transaction workflows | P4 |
| Geyser plugin / Yellowstone gRPC | Real-time account change subscriptions for indexers | P4 |
| Program upgrade authority management | Transfer authority, upgrade program buffer | P3 |
| IDL on-chain initialization | `solana program deploy` + `anchor idl init` in single CLI step | P2 |

### Potential Architecture Changes

| Change | Description | Priority |
|---|---|---|
| Extract codec as standalone package | `@better-sol/codec` for use by indexers/explorers without full client dependency | P3 |
| Streaming event subscription | WebSocket-based `program.addEventListener()` for real-time event listening | P3 |
| Transaction builder pattern | Fluent API for composing complex multi-instruction transactions with conditional logic | P4 |

---

## 5. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| API divergence from @solana/kit | Users can't compose with official SDK | Export `.instruction()` and `.plan()` returning standard Kit types |
| Transpiler maintenance burden | 3,200+ LOC of parsing/codegen | IR-based architecture; test fixture suite catches regressions |
| Cloud compiler dependency | Can't deploy if API is down | Open-source for self-hosting; `--dry-run` produces local Rust |
| Ecosystem fragmentation | Tools expecting standard Anchor layouts won't work | Generated output is standard Anchor; `solana program deploy` as fallback |
| Type gymnastics fragility | Complex mapped types break on TS updates | Type-level tests; conservative use of advanced TS features |
| Proxy transparency issues | Debugging proxied objects harder | Full trap suite (ownKeys, has, getOwnPropertyDescriptor); no hidden properties |
