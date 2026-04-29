# API Reference — Complete Syntax, Type Safety & Stdlib

---


## Overview

Programs are defined with three building blocks:

1. **`account({...})`** — define state schemas (like Zod)
2. **`defineErrors({...})` / `defineEvents({...})`** — typed registries
3. **`program('name', { errors, events }, { instructions })`** — the program

Each instruction uses `ix()` with three keys: `accounts`, `args`, `run:`.

The `run:` handler receives `(accounts, args, ctx)` where `ctx` carries typed
`require`, `emit`, and `log`.

---

## Accounts — Standalone Schemas

```typescript
const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
}).seeds('config')

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  tokenAReserve: pubkey,
  tokenBReserve: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  admin: pubkey,
  isActive: bool,
  bump: u8,
}).seeds('pool', '{tokenAMint}', '{tokenBMint}')
```

- **Separate from program** — import, reuse, compose across programs
- **Flat fields** — no `fields: { ... }` wrapper
- **Chainable seeds** — `.seeds()` reads like a constraint
- **Like Zod** — `z.object({...})` becomes `account({...})`

---

## Errors & Events — Typed Registries

```typescript
const errors = defineErrors({
  Unauthorized: 'Caller is not authorized',
  PoolDoesNotExist: 'Pool does not exist or is inactive',
  SlippageExceeded: 'Output amount below minimum (slippage)',
})

const events = defineEvents({
  PoolCreated: {
    tokenA: pubkey,
    tokenB: pubkey,
  },
  SwapExecuted: {
    amountIn: u64,
    amountOut: u64,
    fee: u64,
    direction: u8,
  },
})
```

Both flow into `ctx` — `ctx.require(cond, 'Error')` and `ctx.emit('Event', data)`.
All names and data shapes are compile-time checked. See below for the full type safety details.

---

## Program — Flat Instruction Map

```typescript
export const amm = program('amm', {
  errors,
  events,
}, {

  initializeConfig: ix({
    accounts: {
      config: p.init(Config),
      admin: p.signer(),
    },
    run: ({ config, admin }, {}, ctx) => {
      config.admin = admin
      config.totalPools = 0n
      config.feeBps = 30n
    },
  }),

  swapAForB: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount(Pool, 'tokenAMint').mut(),
      tokenBReserve: p.tokenAccount(Pool, 'tokenBMint').mut(),
      trader: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { amountIn: u64, minOut: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, trader }, { amountIn, minOut }, ctx) => {
      ctx.require(pool.isActive, 'PoolDoesNotExist')
      ctx.require(amountIn > 0n, 'InvalidAmount')

      const fee = (amountIn * pool.feeBps) / 10000n
      const netIn = amountIn - fee
      const amountOut = (netIn * tokenBReserve.amount) / (tokenAReserve.amount + netIn)
      ctx.require(amountOut >= minOut, 'SlippageExceeded')

      token.transfer({ from: traderTokenA, to: tokenAReserve, authority: trader, amount: amountIn })

      ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 0 })
    },
  }),

})
```

- **3 keys per instruction** — `accounts`, `args`, `run`
- **`run:` handler** — `(accounts, args, ctx) => { ... }`
- **`ctx`** — typed context with `require`, `emit`, `log`
- **Max 2 levels nesting** — from 4 in the old approach

---

## The p.* Constraint API

| Expression | Anchor Equivalent | Meaning |
|---|---|---|
| `p.init(Config)` | `#[account(init, payer = .., space = .., seeds = ..)]` | Create a new PDA |
| `p.mut(Config)` | `#[account(mut, seeds = ..)]` | Writable reference to existing PDA |
| `Config` (bare) | `#[account(seeds = ..)]` | Read-only reference to PDA |
| `p.signer()` | `#[account(mut)]` + `Signer<'info>` | Transaction signer |
| `p.mint()` | `Account<'info, Mint>` | SPL token mint |
| `p.mint().mut()` | Same + mut | Mutable mint reference |
| `p.tokenAccount(Account, 'field')` | `Account<'info, TokenAccount>` + constraint | Type-safe token account (field must be pubkey) |
| `p.tokenAccount(Account, 'field').mut()` | Same + mutable | Writable type-safe token account |
| `p.tokenProgram()` | `Program<'info, Token>` | Token program reference |
| `p.systemProgram()` | `Program<'info, System>` | System program reference |
| `p.close(Account, 'recipient')` | `#[account(close = recipient)]` | Close account, return rent |
| `p.clock()` | `Sysvar<'info, Clock>` | Clock sysvar |

The `p.*` namespace is the developer's constraint toolbox. Type `p.` and autocomplete
shows every available constraint with documentation.

---


---


## The Three Problems

### Problem 1: Error names are magic strings
```typescript
// No autocomplete, no validation. Typos = runtime failures.
require(authority === config.admin, 'Unathroized')
//                                  ^^^^^^^^^^^^ typo — compiles fine
```

### Problem 2: Event names and data shapes are magic
```typescript
// No autocomplete for event names. No validation of data shape.
emit('SwapExecuted', { amountin: 1n })
//    ^^^^^^^^^^^^^^              ^^^^^^^ typo in field name — compiles fine
```

### Problem 3: Token account field references are magic
```typescript
p.tokenAccount('feeBps')
//              ^^^^^^^^ u64 field — wrong! Only pubkey fields are valid
```

All three are **string literals with no compile-time validation**.

---

## The Solution: `ctx` — ElysiaJS-Style Typed Context

The `run:` handler receives **three parameters**: `(accounts, args, ctx)`.

`ctx` carries the program's error and event types through TypeScript generic inference:

```typescript
run: ({ pool, trader }, { amountIn, minOut }, ctx) => {
  //   ^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^   ^^^
  //   typed accounts      typed args            typed context

  ctx.require(pool.isActive, 'PoolDoesNotExist')   // ✅ autocomplete errors
  ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 0 })  // ✅ autocomplete + validate shape
  ctx.log('Swapped {} for {}', amountIn, amountOut)
}
```

### How ElysiaJS Does This

ElysiaJS carries typed state through class generic parameters:

```typescript
new Elysia()
  .error({ Unauthorized: ... })
  .get('/path', (ctx) => {
    ctx.error('Unauthorized')  // ← typed from .error() definition
  })
```

### How We Do This

Same pattern, functional API:

```typescript
const errors = defineErrors({ Unauthorized: '...' })
const events = defineEvents({ SwapExecuted: { amountIn: u64, amountOut: u64 } })

const amm = program('amm', { errors, events }, {
  swap: ix({
    accounts: { pool: p.mut(Pool) },
    args: { amountIn: u64 },
    run: ({ pool }, { amountIn }, ctx) => {
      // ctx.require — typed by TErrors from defineErrors()
      // ctx.emit    — typed by TEvents from defineEvents()
      // ctx.log     — always available
    },
  }),
})
```

TypeScript infers ALL of this through const generic parameters. Zero annotations needed.

---

## How Each Feature Works

### `ctx.require()` — Type-Safe Error Names

```typescript
const errors = defineErrors({
  Unauthorized: 'Not authorized',
  PoolDoesNotExist: 'Pool does not exist',
  SlippageExceeded: 'Output below minimum',
})

// Inside run: handlers:
ctx.require(condition, 'Unauthorized')      // ✅ autocomplete
ctx.require(condition, 'SlippageExceeded')  // ✅ autocomplete
ctx.require(condition, 'Typo')             // ❌ TS2345: not in error registry
```

The type machinery:
```typescript
type RequireFn<TErrors extends Record<string, string>> = {
  (condition: boolean): void
  (condition: boolean, error: keyof TErrors & string): void
}

interface ProgramContext<TErrors, TEvents> {
  require: RequireFn<TErrors>
  emit: EmitFn<TEvents>
  log: LogFn
}
```

### `ctx.emit()` — Type-Safe Event Names AND Data Shapes

```typescript
const events = defineEvents({
  SwapExecuted: { amountIn: u64, amountOut: u64, fee: u64, direction: u8 },
  PoolCreated: { tokenA: pubkey, tokenB: pubkey },
})

// Inside run: handlers:
ctx.emit('SwapExecuted', { amountIn: 100n, amountOut: 90n, fee: 1n, direction: 0 })
// ✅ event name autocompletes, data shape validated field-by-field

ctx.emit('SwapExecuted', { amountIn: 100n })
// ❌ TS2345: missing 'amountOut', 'fee', 'direction'

ctx.emit('SwapExecuted', { amountIn: 100n, amountOut: 90n, fee: 1n, direction: 'wrong' })
// ❌ TS2322: string not assignable to number (u8)

ctx.emit('NotAnEvent', {})
// ❌ TS2345: 'NotAnEvent' not assignable to 'SwapExecuted' | 'PoolCreated'
```

The type machinery:
```typescript
type EmitFn<TEvents extends Record<string, Record<string, SolField>>> = {
  <K extends keyof TEvents & string>(name: K, data: InferFields<TEvents[K]>): void
}
```

### `p.tokenAccount()` — Type-Safe Field References

```typescript
const Pool = account({
  tokenAMint: pubkey,   // pubkey → valid for tokenAccount()
  feeBps: u64,          // u64 → REJECTED
  isActive: bool,       // bool → REJECTED
})

p.tokenAccount(Pool, 'tokenAMint')  // ✅ autocomplete
p.tokenAccount(Pool, 'feeBps')     // ❌ TS2345: not a pubkey field
```

The type machinery:
```typescript
type PubkeyFields<T> = { [K in keyof T]: T[K] extends SolField<'pubkey'> ? K : never }[keyof T]

function tokenAccount<T, K extends PubkeyFields<T> & string>(acct: SolAccount<T>, field: K): ...
```

---

## Compile-Time Verification Results

Tested with TypeScript 6.0.3, `--strict` mode:

| Test | Expected | Result |
|---|---|---|
| Valid error name `'Unauthorized'` | Compiles | ✅ |
| Invalid error name `'Typo'` | TS2345 | ✅ `"Typo"` not assignable |
| Valid event name `'SwapExecuted'` | Compiles | ✅ |
| Invalid event name `'NotAnEvent'` | TS2345 | ✅ `"NotAnEvent"` not assignable |
| Complete event data `{ amountIn, amountOut, fee, direction }` | Compiles | ✅ |
| Missing event field `amountOut` | TS2345 | ✅ `Property 'amountOut' is missing` |
| Wrong event field type (string for u8) | TS2322 | ✅ `string not assignable to number` |
| Valid pubkey field `'tokenAMint'` | Compiles | ✅ |
| u64 field `'feeBps'` in tokenAccount | TS2345 | ✅ `"feeBps"` not assignable |
| Counter naming collision (program=account name) | Compiles | ✅ Zero errors |

**Every test passes. Full end-to-end type safety verified.**

---

## Why `ctx` Instead of `amm.require()`

The original design put `require` on the program object:

```typescript
amm.require(cond, 'Error')  // Problem: naming collision
```

This breaks when the program name matches an account name:

```typescript
export const counter = program('counter', { errors }, {
  increment: ix({
    accounts: { counter: p.mut(Counter) },  // account named 'counter'
    run: ({ counter }, { amount }) => {
      counter.require(...)  // ❌ 'counter' is the ACCOUNT, not the program!
    },
  }),
})
```

The `ctx` parameter eliminates this completely:

```typescript
run: ({ counter, authority }, { amount }, ctx) => {
  ctx.require(authority === counter.authority, 'Unauthorized')  // ✅ No collision
}
```

This is the same pattern ElysiaJS uses: typed context flows into handler callbacks.

---

## The Complete API Surface

```typescript
// ── Definitions (module-level) ──
account({ fields }).seeds(...)
defineErrors({ name: message, ... })
defineEvents({ name: { field: type, ... }, ... })

// ── Program ──
program('name', { errors, events }, { instructions })

// The program address is NOT in the definition — it's resolved at configuration time.
// This lets you use different addresses per environment (devnet, mainnet).
//
// Auto-resolved: programs: { myProgram }
// Auto-resolved from .better-sol/
// programs: { myProgram }

// ── Instruction ──
ix({
  accounts: { name: p.mut(Account), ... },
  args: { name: u64, ... },
  run: (accounts, args, ctx) => {
    ctx.require(condition, 'ErrorName')          // type-safe
    ctx.emit('EventName', { field: value })      // type-safe
    ctx.log('message', ...values)                // structured
  },
})

// ── Account constraints ──
p.init(Account)                                  // create PDA
p.mut(Account)                                   // writable reference
p.signer()                                       // transaction signer
p.tokenAccount(Account, 'pubkeyField').mut()     // type-safe token account
p.mint().mut()                                   // SPL token mint
p.close(Account, 'refundTo')                     // close account
p.tokenProgram()                                 // Token program
```

---

## Impact On The DX

The developer types `ctx.` and their IDE shows:
- `require(condition, error)` — with error names autocompleted
- `emit(name, data)` — with event names AND field shapes autocompleted
- `log(message, ...values)` — structured logging

Every mistake is caught at compile time, not at runtime or transpile time.
The TypeScript compiler IS the linter. There are no additional tools needed.

---

# The Boundary Problem: Preventing Misuse While Preserving DX

## The Core Tension

Our transpiler converts TypeScript function bodies to Rust. The developer writes
imperative code that LOOKS like normal TypeScript but only a SUBSET of TypeScript
is actually supported.

**The question: How do we prevent developers from using unsupported features
without ruining the developer experience?**

---

## The Answer: Parse-Time Validation

The transpiler walks the `run:` function body AST and checks every identifier
against an allowlist. This catches all unsupported operations with helpful messages:

```
❌ Line 16: Math — Use arithmetic operators or sol.checkedMul()
❌ Line 17: JSON — Use ctx.log() for debugging  
❌ Line 18: Date — Use sol.timestamp() for current time
❌ Line 19: console — Use ctx.log() for program logs
❌ Line 20: fetch — Programs cannot make network requests
❌ Line 21: readFileSync — Programs can't read files
❌ Line 22: setTimeout — Programs are synchronous
❌ Line 23: Promise — Programs are synchronous
```

While allowing all valid references:
```
✅ ctx, counter, authority, amount, fee, token, sol, rust
```

---

## The Three-Layer Defense Strategy

### Layer 1: TypeScript Types (Autocomplete + Type Safety)

The developer gets full TypeScript autocomplete and type checking on:
- Account field types (counter.count: bigint, counter.authority: string)
- Argument types (amount: bigint)
- Context methods (ctx.require(), ctx.emit(), ctx.log())

This is provided by our TypeScript type declarations. The developer installs
`better-sol/program` and gets full type support.

**What it catches:** Wrong types, missing args, typos, wrong field names, wrong error/event names.

### Layer 2: Parse-Time Validation (Unsupported Operation Detection)

When the developer runs `npx @better-sol/cli push`, the transpiler:
1. Parses the TypeScript AST
2. Walks the `run:` function body
3. Checks every identifier against an allowlist
4. Reports errors with helpful messages and alternatives

**What it catches:** Math.*, JSON.*, Date, console, fetch, async/await,
imports, globals, and ANY identifier not in the allowlist.

### Layer 3: Transpile-Time Errors (Missing AST Handlers)

If the developer uses a TS construct we don't have a Rust mapping for
(e.g., `try/catch`, `switch`, ternary operator), the transpiler emits
a clear error:

```
❌ programs/amm.ts:42:5

  try { ... } catch (e) { ... }
  ^^^

  try/catch is not supported in Solana program logic.
  
  Solana programs handle errors through:
  • ctx.require() — validate conditions and return errors
  • The ? operator — propagate errors from CPI calls (automatic)
  
  If you need complex error handling, use the escape hatch:
    rust`
      match result {
        Ok(val) => { /* ... */ },
        Err(e) => { /* ... */ },
      }
    `
```

---

## The Solana Standard Library

Instead of blocking native JS and leaving developers stranded, we provide
our OWN standard library that covers everything a Solana program needs.

```typescript
// ═════════════════════════════════════
// Available in run: handlers via ctx
// ═════════════════════════════════════

ctx.require(condition: boolean): void
ctx.require(condition: boolean, error: keyof TErrors & string): void

ctx.log(message: string): void
ctx.log(message: string, ...values: unknown[]): void

ctx.emit(name: keyof TEvents, data: InferFields<TEvents[name]>): void

// ═════════════════════════════════════
// CPI — Cross-Program Invocations
// ═════════════════════════════════════

token.transfer({ from, to, authority, amount }): void
token.mintTo({ mint, destination, authority, amount }): void
token.burn({ account, mint, authority, amount }): void
token.approve({ account, delegate, authority, amount }): void
token.freeze({ account, mint, authority }): void
token.thaw({ account, mint, authority }): void
token.closeAccount({ account, destination, authority }): void

system.transfer({ from, to, amount }): void
system.createAccount({ from, to, amount, space, owner }): void

ata.create({ payer, owner, mint }): void

// ═════════════════════════════════════
// Sysvars — On-Chain Data
// ═════════════════════════════════════

sol.timestamp(): bigint          // Current unix timestamp
sol.slot(): bigint               // Current slot number
sol.epoch(): bigint              // Current epoch
sol.rentExemptBalance(size: bigint): bigint

// ═════════════════════════════════════
// Crypto
// ═════════════════════════════════════

crypto.sha256(data: Uint8Array): Uint8Array
crypto.keccak256(data: Uint8Array): Uint8Array

// ═════════════════════════════════════
// Escape Hatch
// ═════════════════════════════════════

rust`raw Rust code here`  // Emitted verbatim into generated Rust
```

### What's NOT available (and why)

```
❌ Math.random()     — Solana is deterministic. Use commit-reveal or Pyth VRF.
❌ Date.now()        — Use sol.timestamp() instead.
❌ JSON.stringify()  — No serialization needed. Fields are fixed layout.
❌ fetch()           — No network access. Programs are self-contained.
❌ console.log()     — Use ctx.log() instead.
❌ setTimeout()      — Programs are synchronous.
❌ Promise/async     — Programs are synchronous.
❌ new Map()         — Use account fields. State is in accounts.
❌ try/catch         — Use ctx.require() for validation. CPIs use ? (automatic).
```

---


## Summary

```
┌─────────────────────────────────────────────────┐
│           Developer's TypeScript file            │
│                                                  │
│  import { program, ... } from 'better-sol'      │
│                                                  │
│  export const myProgram = program('...', {       │
│    errors, events                                │
│  }, {                                            │
│    myInstruction: ix({                           │
│  ┌──────────────────────────────────────────┐    │
│  │         THE SANDBOX (run: handler)       │    │
│  │                                          │    │
│  │  ✅ Native operators: + - * / % = +=     │    │
│  │  ✅ Native comparisons: === !== > < >=   │    │
│  │  ✅ Native control flow: if/else, for..of│    │
│  │  ✅ Native destructuring, let/const      │    │
│  │  ✅ Account fields: counter.count        │    │
│  │  ✅ Context: ctx.require, ctx.emit       │    │
│  │  ✅ CPI calls: token.transfer({...})     │    │
│  │  ✅ Sysvars: sol.timestamp()             │    │
│  │  ✅ Crypto: crypto.sha256(data)          │    │
│  │  ✅ Escape hatch: rust`code`             │    │
│  │                                          │    │
│  │  ❌ Globals: Math, JSON, Date, console   │    │
│  │  ❌ Async: Promise, fetch, await         │    │
│  │  ❌ I/O: fs, process, Buffer             │    │
│  │  ❌ DOM: window, document                │    │
│  │                                          │    │
│  │  Enforcement: Parse-time AST validation  │    │
│  └──────────────────────────────────────────┘    │
│        },                                        │
│      }),                                         │
│    },                                            │
│  })                                              │
└─────────────────────────────────────────────────┘
```
