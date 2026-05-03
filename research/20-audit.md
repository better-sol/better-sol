# Implementation Audit

Compares the current implementation against research, identifies gaps, and tracks progress.

## Current State

| Layer | Status | Details |
|---|---|---|
| Program definition API | ✅ Complete | Single `program(config, ix => instructions)` shape, typed `.derive()`, inline errors/events, `account()`, `p.*`, type tokens |
| TypeScript AST parser | ✅ Complete | `ts-morph` based, extracts inline errors/events from `program()` config |
| Body transpiler | ✅ Complete | Assignments, arithmetic, control flow, CPI, sysvars, `null` → `None` |
| Anchor Rust generator | ✅ Complete | `lib.rs`, `Cargo.toml`, IDL |
| Unsupported-pattern diagnostics | ✅ Complete | 18 failure fixtures with specific diagnostics |
| CLI commands | ✅ Complete | `create`, `generate`, `deploy`, `verify` |
| `cargo check` validation | ✅ Complete | 12 programs pass with zero warnings |
| Client SDK (`betterSol()`) | ✅ Implemented | Async Kit-backed factory, typed instruction methods (sign+send, `.instruction()`, `.transaction()`), PDA derivation, account fetching with owner verification, Borsh codec, token helpers, transaction confirmation, `sol.send()`, `sol.steps()` |
| Scoped Kit signer (`sol.withSigner()`) | ✅ Implemented | Accepts Kit `TransactionSigner`; wallet adapter subpaths implemented for Wallet Adapter, Reown, Privy, Dynamic |
| `fromIdl()` | ✅ Implemented | Consumes Anchor IDLs, produces a `ProgramDefinition`-compatible object |
| Testing SDK (`better-sol/testing`) | 📋 Planned | `createTestSol()` with LiteSVM |

## API Design

### Single `program()` entry point

```typescript
export const counter = program(
  {
    name: 'counter',
    address: '...',
    errors: { Unauthorized: 'msg' },
    events: { Incremented: { newCount: u64 } },
  },
  ix => ({
    increment: ix({ ... }),
  }),
)
```

- Errors and events are inline plain objects — no `defineErrors()` or `defineEvents()` wrappers
- `ctx.require(cond, 'ErrorName')` and `ctx.emit('EventName', payload)` are typed before transpilation and validated again by the transpiler
- No top-level `ix`, `instructions:` object, `createProgramBuilder()`, or `ProgramBuilder` class needed
- Parser extracts errors/events directly from `program()` config or traces shorthand variables

### Validated Programs (12, all pass `cargo check --quiet`)

| Program | Instructions | Features |
|---|---|---|
| `counter` | 5 | Seeds, errors, close, init |
| `amm` | 7 | SPL token CPI, events, complex arithmetic |
| `t22_amm` | 7 | Token-2022, `transferChecked` |
| `orderbook` | 6 | Zero-copy, `struct_zc`, `p.remaining()`, `array()` |
| `clmm` | 8 | All features, `option()`, `vec()` |
| `escrow` | 3 | Inline errors/events, token CPI |
| `nft_staking` | 6 | `vec()` type, bounded loops |
| `showcase` | 9 | All `p.*` constraints, all token CPI ops |
| `lending_market` | 11 | Multi-account DeFi, PDA authorities |
| `perpetuals_clearing` | 9 | Zero-copy order book, remaining accounts |
| `dao_governance` | 9 | Governance, string/bytes, close, remaining |

## Transpiler Fixes

1. **`null` → `None`** — `option(T)` assignment to `null` now generates `None`; non-null assignment wraps in `Some()`
2. **`msg!()` format placeholders** — Detects existing `{}` in message vs auto-inserting
3. **`p.token2022Program()` naming** — Matches on constraint kind, not variable name
4. **`emit!` removed** — The `emit!(Name {})` macro syntax is removed; all examples use `ctx.emit()`
5. **Non-null assertion stripping** — `items[i]!.field` correctly strips `!`
6. **Zero-copy mutable borrows** — `let mut` only when account is actually mutated
7. **Deferred initialization** — Conservative enough to avoid possibly-uninitialized Rust

## Known Limitations

1. **`for` loop type mixing** — Loop variables and `u32` bounds can create type mismatches
2. **`struct_zc` in Borsh accounts** — Only valid inside `account().zeroCopy()` accounts
3. **PDA-signed token CPI** — Token transfer with `authority: tokenAccount` generates invalid signer seeds; authority must be a PDA account from the program or a signer
