# The Boundary Problem: Preventing Misuse While Preserving DX

## The Core Tension

Our transpiler converts TypeScript function bodies to Rust. The developer writes
imperative code that LOOKS like normal TypeScript but only a SUBSET of TypeScript
is actually supported.

**The question: How do we prevent developers from using unsupported features
without ruining the developer experience?**

---

## What I Tested

### Test 1: Branded Types (EffectTS approach)

```typescript
type SolU64 = Brand<bigint, 'SolU64'>  // bigint + phantom brand
```

| Pattern | TypeScript catches it? |
|---|---|
| `counter.count = 5n` (plain bigint → SolU64) | ✅ **YES** — type error |
| `Math.sqrt(counter.count)` (SolU64 → number param) | ✅ **YES** — type error |
| `counter.count += amount` (arithmetic) | ❌ **NO** — bigint + bigint = bigint, not SolU64 |
| `JSON.stringify(counter)` | ❌ **NO** — stringify accepts `any` |
| `new Date()` | ❌ **NO** — global, not type-checked |
| `fetch(...)` | ❌ **NO** — global, not type-checked |
| `console.log(...)` | ❌ **NO** — global, not type-checked |
| `a.toUpperCase()` on SolPubkey | ❌ **NO** — string methods leak through |

**Verdict: Branded types are NOT the answer.** They break native arithmetic
(`counter.count += amount` fails) while failing to block the most common
misuses (globals like Date, console, JSON). The "leakiness" is fundamental:
branded primitives still inherit all methods of their base type.

### Test 2: Parse-Time Reference Validation

I built a validator that walks the function body AST and checks every identifier
reference against an allowlist.

**Results: Perfect.** It catches all 8 unsupported operations in our test:

```
❌ Line 16: Math — Use arithmetic operators or sol.checkedMul()
❌ Line 17: JSON — Use sol.log() for debugging  
❌ Line 18: Date — Use sol.timestamp() for current time
❌ Line 19: console — Use sol.log() for program logs
❌ Line 20: fetch — Programs cannot make network requests
❌ Line 21: readFileSync — Programs can't read files
❌ Line 22: setTimeout — Programs are synchronous
❌ Line 23: Promise — Programs are synchronous
```

While allowing all valid references:
```
✅ require, authority, counter, amount, fee, token, log, emit, rust
```

**Verdict: Parse-time validation IS the answer.** It's precise, extensible,
and allows us to provide helpful error messages with alternatives.

---

## The Three-Layer Defense Strategy

### Layer 1: TypeScript Types (Autocomplete + Type Safety)

The developer gets full TypeScript autocomplete and type checking on:
- Account field types (counter.count: bigint, counter.authority: string)
- Argument types (amount: bigint)
- Available functions (require(), log(), emit(), token.transfer())

This is provided by our TypeScript type declarations. The developer installs
`@solana-kit/program` and gets full type support.

**What it catches:** Wrong types, missing args, typos, wrong field names.

### Layer 2: Parse-Time Validation (Unsupported Operation Detection)

When the developer runs `npx solana-kit push` (or `compile`), the transpiler:
1. Parses the TypeScript AST
2. Walks the logic function body
3. Checks every identifier against an allowlist
4. Reports errors with helpful messages and alternatives

The allowlist is: `{parameter names}` + `{local variable names}` + `{built-in functions}`

**What it catches:** Math.*, JSON.*, Date, console, fetch, async/await,
imports, globals, and ANY identifier not in the allowlist.

**What it DOESN'T catch:** Valid TS that has no Rust equivalent (like complex
closure patterns). These are caught by...

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
  • require() — validate conditions and return errors
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

### What the developer gets

```typescript
// ═══════════════════════════════════
// Available everywhere in logic functions
// ═══════════════════════════════════

// Validation
require(condition: boolean): void
require(condition: boolean, error: string): void

// Logging
log(message: string): void
log(message: string, ...values: unknown[]): void

// Events
emit<T>(name: string, data: T): void

// ═══════════════════════════════════
// CPI — Cross-Program Invocations
// ═══════════════════════════════════

// Token Program
token.transfer({ from, to, authority, amount }): void
token.mintTo({ mint, destination, authority, amount }): void
token.burn({ account, mint, authority, amount }): void
token.approve({ account, delegate, authority, amount }): void
token.setAuthority({ account, currentAuthority, newAuthority, type }): void
token.freeze({ account, mint, authority }): void
token.thaw({ account, mint, authority }): void
token.closeAccount({ account, destination, authority }): void

// System Program
system.transfer({ from, to, amount }): void
system.createAccount({ from, to, amount, space, owner }): void

// Associated Token Program
ata.create({ payer, owner, mint }): void

// Token-2022
token2022.transferChecked({ from, to, mint, authority, amount, decimals }): void
token2022.mintToChecked({ mint, destination, authority, amount, decimals }): void

// ═══════════════════════════════════
// Sysvars — On-Chain Data
// ═══════════════════════════════════

sol.timestamp(): bigint          // Current unix timestamp
sol.slot(): bigint               // Current slot number
sol.epoch(): bigint              // Current epoch
sol.epochStartTimestamp(): bigint // Epoch start time
sol.rentExemptBalance(size: bigint): bigint  // Rent for an account

// ═══════════════════════════════════
// Crypto
// ═══════════════════════════════════

crypto.sha256(data: Uint8Array): Uint8Array
crypto.keccak256(data: Uint8Array): Uint8Array
crypto.hash160(data: Uint8Array): Uint8Array

// ═══════════════════════════════════
// Vec Operations (for account Vec fields)
// ═══════════════════════════════════
// These are called as methods on Vec-typed account fields

// field.push(value)      → field.push(value)
// field.includes(value)  → field.contains(&value)
// field.length           → field.len()
// field[index]           → field[index]
// field.pop()            → field.pop()
// field.remove(index)    → field.remove(index)
// field.set(index, val)  → field[index] = val

// ═══════════════════════════════════
// Account Operations
// ═══════════════════════════════════

account.realloc(newSize: bigint): void  // Resize account data

// ═══════════════════════════════════
// Escape Hatch
// ═══════════════════════════════════

rust`raw Rust code here`  // Emitted verbatim into generated Rust

// ═══════════════════════════════════
// What's NOT provided (and why)
// ═══════════════════════════════════

// ❌ Math.random()     — Solana is deterministic. No randomness source.
//                        Use commit-reveal or Pyth VRF.
// ❌ Date.now()        — Use sol.timestamp() instead.
// ❌ JSON.stringify()  — No serialization needed. Fields are fixed layout.
// ❌ fetch()           — No network access. Programs are self-contained.
// ❌ console.log()     — Use log() instead (writes to program logs).
// ❌ setTimeout()      — Programs are synchronous. No timers.
// ❌ Promise/async     — Programs are synchronous. No async.
// ❌ new Map()         — Use account fields. State is in accounts.
// ❌ new Set()         — Use Vec fields with .includes() checks.
// ❌ parseInt()        — Use bigint literals. No string→number parsing.
// ❌ Regex             — No pattern matching on-chain.
// ❌ try/catch         — Use require() for validation. CPIs use ? (automatic).
```

### How This Differs From EffectTS

EffectTS takes an **all-wrapping** approach: you never use native Promise,
native try/catch, native anything. Everything goes through Effect.

Our approach is different:
- **Native operators are fine**: `+`, `-`, `*`, `/`, `===`, `>`, `<`, `&&`, `||`, `!`
- **Native control flow is fine**: `if/else`, `for..of`
- **Native assignments are fine**: `=`, `+=`, `-=`, `*=`
- **Native destructuring is fine**: `const { count, authority } = counter`

We DON'T wrap the basic operations. We only replace:
- **Globals** (Date → sol.timestamp(), console → log, Math → native operators)
- **Async** (not available — programs are synchronous)
- **I/O** (not available — programs can't do I/O)
- **CPI calls** (token.transfer, system.transfer — typed wrappers)

The boundary is: **you write natural TypeScript, but in a sandboxed environment
where only Solana-meaningful operations exist.**

---

## The Developer Experience — What It Feels Like

### Writing a Program

```typescript
import { program, u64, bool, signer, writable, pda, pubkey } from '@solana-kit/program'

export const counter = program('counter', 'CoUnTeR...', {
  accounts: {
    counter: {
      seeds: ['counter', '{authority}'],
      count: u64,
      authority: pubkey,
      isActive: bool,
    },
  },
  instructions: {
    increment: {
      accounts: {
        counter: [writable],
        authority: [signer],
      },
      args: { amount: u64 },
      logic: ({ counter, authority }, { amount }) => {
        // ← Inside here, you're in "Solana land"
        // ← Only our stdlib + native operators are available
        // ← TypeScript autocomplete shows you what's available
        
        require(authority === counter.authority)
        require(counter.isActive)
        counter.count += amount
        log("Count incremented to {}", counter.count)
        emit("Incremented", { newCount: counter.count })
      },
    },
  },
})
```

### If You Use Something Unsupported

```typescript
logic: ({ counter }, { amount }) => {
  counter.count += amount
  const random = Math.floor(Math.random() * 100)  // ← Oops
}
```

When you run `npx solana-kit push`:

```
❌ Error in programs/counter.ts:14:20

  Math.floor(Math.random() * 100)
  ^^^^

  Math is not available in Solana programs.
  Solana programs are deterministic — there is no source of randomness.
  
  Alternatives:
  • Use a commit-reveal scheme for pseudo-randomness
  • Use Pyth Network's VRF oracle
  • Use recent blockhash as a weak entropy source:
      sol.sha256(recentBlockhash)
  
  If you need custom Rust for this, use the escape hatch:
    rust`/* your Rust code */`
```

### The Escape Hatch Is Always There

```typescript
logic: ({ counter }, { amount }) => {
  // 90% transpiled automatically
  require(counter.isActive)
  counter.count += amount
  
  // 10% custom Rust for the edge case
  rust`
    // Complex custom logic that can't be expressed in TS
    let hash = solana_program::hash::hash(&counter.count.to_le_bytes());
    counter.random_seed = hash.to_bytes();
  `
}
```

---

## Why Not a Separate DSL / File Format?

| Approach | DX | Safety | Feasibility |
|---|---|---|---|
| **Natural TS + parse-time validation** ✅ | Best — native autocomplete, types, linting | Good — errors at compile time | Proven — our POC works |
| Separate .sol.ts files | Good — but needs custom tooling | Good — but limited IDE support | Medium — need language server |
| String DSL (like GraphQL) | Bad — no autocomplete inside strings | Good — only our syntax | Easy — but terrible DX |
| EffectTS-style wrappers | Bad — counter.count.add(amount) instead of += | Best — impossible to misuse | Medium — lots of boilerplate |
| Branded types | Medium — autocomplete works, arithmetic breaks | Poor — leaks globals, breaks ops | Proven — doesn't work for us |

The natural TS approach wins because:
1. **Zero learning curve** — you already know TypeScript
2. **Full IDE support** — autocomplete, type checking, go-to-definition
3. **Familiar syntax** — `counter.count += amount`, not `counter.update('count', c => c.add(amount))`
4. **Clear boundary** — the error messages tell you exactly what's wrong
5. **Escape hatch** — when you hit the wall, rust\`...\` is right there

---

## Summary: The Boundary Strategy

```
┌─────────────────────────────────────────────────┐
│           Developer's TypeScript file            │
│                                                  │
│  import { program, u64, ... } from '@solana-kit'│
│                                                  │
│  export const myProgram = program('...', {       │
│    instructions: {                               │
│      myInstruction: {                            │
│        logic: ({ accounts }, { args }) => {      │
│  ┌──────────────────────────────────────────┐    │
│  │         THE SANDBOX                      │    │
│  │                                          │    │
│  │  ✅ Native operators: + - * / % = +=     │    │
│  │  ✅ Native comparisons: === !== > < >=   │    │
│  │  ✅ Native control flow: if/else, for..of│    │
│  │  ✅ Native destructuring, let/const      │    │
│  │  ✅ Account fields: counter.count        │    │
│  │  ✅ Our stdlib: require, log, emit       │    │
│  │  ✅ CPI calls: token.transfer({...})     │    │
│  │  ✅ Sysvars: sol.timestamp()             │    │
│  │  ✅ Crypto: crypto.sha256(data)          │    │
│  │  ✅ Escape hatch: rust\`code\`             │    │
│  │                                          │    │
│  │  ❌ Globals: Math, JSON, Date, console   │    │
│  │  ❌ Async: Promise, fetch, await         │    │
│  │  ❌ I/O: fs, process, Buffer             │    │
│  │  ❌ DOM: window, document                │    │
│  │  ❌ Imports: only @solana-kit/program    │    │
│  │                                          │    │
│  │  Enforcement: Parse-time validation      │    │
│  │  with helpful error messages             │    │
│  └──────────────────────────────────────────┘    │
│        },                                        │
│      },                                          │
│    },                                            │
│  })                                              │
└─────────────────────────────────────────────────┘
```

The developer writes natural TypeScript. The sandbox is enforced by our
transpiler, not by the TypeScript type system. Error messages guide them
to the right alternative. And the escape hatch means they're never stuck.
