# Concept — What We're Building

## What We're Building

**A TypeScript library + CLI that make Solana program development feel native to JavaScript developers.**

```
better-sol              →  Define programs + interact with them (runtime library)
@better-sol/cli         →  Create programs + compile + deploy (`create`, `push`, `verify`)
```

The same TypeScript file that defines the on-chain program is the typed client SDK. Zero extra code needed.

---

## The Developer Experience

### 1. Define a program (TypeScript only — no Rust)

```typescript
import { program, account, ix, defineErrors, defineEvents, u64, pubkey, p } from 'better-sol/program'

const Counter = account({ count: u64, authority: pubkey }).seeds('counter', '{authority}')

const errors = defineErrors({ Unauthorized: 'Not the authority' })

export const counter = program('counter', { errors }, {
  increment: ix({
    accounts: { counter: p.mut(Counter), authority: p.signer() },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, 'Unauthorized')
      counter.count += amount
    },
  }),
})
```

### 2. Push to chain (cloud compilation — no Rust toolchain)

```bash
npx @better-sol/cli push --cluster devnet
# → Parsing programs/counter.ts...
# → Generating Anchor Rust (437 lines)...
# → Compiling via cloud service... (3.2s)
# → Deploying to devnet...
#
# ✅ counter deployed
#    CouNTeR11111111111111111111111111111111111
#    https://explorer.solana.com/address/CouNTeR.../programs?cluster=devnet
```

No local files created. No Rust installed. The `.so` lives on-chain.

### 3. Use as client (same file — zero extra code)

```typescript
import { betterSol } from 'better-sol'
import { counter } from './counter-program'  // Same file as step 1

const sol = betterSol({
  cluster: 'devnet',
  programs: { counter },  // address auto-resolved from .better-sol/
})

await sol.counter.increment({ counter: addr, authority: payer, amount: 10n })
const data = await counter.accounts.Counter.fetch(addr)
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| **Scope** | Library, not framework | Import a function, call it. No folder structure, no config files. |
| **Packages** | Runtime: `better-sol` (library) · CLI: `@better-sol/cli` (transpiler + deploy) | Library has no compiler code. CLI has no runtime code. |
| **Compilation** | Cloud (TS AST → Anchor Rust → cargo build-sbf → .so) | Developer never installs Rust. Like `drizzle-kit push`. |
| **Type safety** | `ctx` parameter (ElysiaJS pattern) | `ctx.require()`, `ctx.emit()`, `ctx.log()` — all compile-time checked |
| **Events** | `defineEvents()` + `ctx.emit()` | Event names autocomplete, data shapes validated field-by-field |
| **Validation** | Parse-time AST walking (not branded types) | Enforce supported operations with helpful error messages |
| **Escape hatch** | `` rust`...` `` tagged template | Raw Rust for edge cases the transpiler can't handle |
| **Same definition** | Program definition = client SDK | Zero code generation for our users. IDL auto-published for ecosystem compatibility |
| **Program address** | Not in `program()`, auto-resolved from `.better-sol/` | Same address on all clusters. Address file committed to git, keypair gitignored. |
| **Verification** | `push --verify` writes Rust, then `verify` submits to OtterSec | Two commands, no auto-commit. Generated Rust in user's own repo. |
| **Config** | Optional `better-sol.config.ts` (Paykit pattern) | No config file required. CLI auto-discovers `programs/**/*.ts`. |

---

## What Makes This Novel

Nobody else does **TypeScript → Rust transpilation** for Solana programs:

| Feature | Anchor | Codama | Kite | Gill | **Ours** |
|---|---|---|---|---|---|
| Write programs in TypeScript | ❌ | ❌ | ❌ | ❌ | ✅ |
| TS → Rust transpilation | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cloud compilation (no Rust install) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Same def = client SDK | Via IDL | Via IDL | Via IDL | Via IDL | ✅ Direct (IDL auto-published) |
| Type-safe errors + events | ❌ | ❌ | ❌ | ❌ | ✅ Compile-time |
| Type-safe token account refs | ❌ | ❌ | ❌ | ❌ | ✅ Compile-time |
| Verified builds | Manual Docker | ❌ | ❌ | ❌ | ✅ `push --verify` |
| Keypair/address management | Manual | Manual | Manual | Manual | ✅ Auto |
| Built-in token support | ❌ | ❌ | ❌ | ✅ | ✅ |
| Test framework | ❌ | ❌ | ❌ | ❌ | ✅ LiteSVM |

---

## Research Files

| # | File | Content |
|---|---|---|
| 00 | This file | What we're building, one-page overview |
| 01 | `01-reference-ecosystem.md` | Solana architecture, @solana/kit API, Rust SDK |
| 02 | `02-reference-dx.md` | Better Auth/ElysiaJS patterns, pain points |
| 03 | `03-reference-competition.md` | Kite/Gill/Codama, hackathon winning patterns |
| 04 | `04-transpiler.md` | Feasibility, 75 operations, coverage matrix, build plan |
| 05 | `05-compiler.md` | Cloud compiler, push workflow, CLI, config, verification |
| 06 | `06-api.md` | Complete API, ctx, type safety, stdlib, sandbox |
| 07 | `07-sdk.md` | Client SDK, betterSol, wallet, testing |
| 08 | `08-dx.md` | End-to-end developer experience, workflow, invisible infrastructure |

---

## Verified Results

- **AMM program**: 320 lines TS → generates 633 lines Anchor Rust, 7 instructions, 10 CPI calls
- **Type safety**: All verified with tsc 6.0.3 — error names, event names, event data shapes, token account fields
- **Transpiler coverage**: 83% of all Solana program operations, 0 common program types impossible
- **Counter program**: 50 lines TS, fully type-safe, same file = client SDK
