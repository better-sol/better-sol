# 02 — Program SDK (Definition DSL)

## Import

```typescript
import { bs, cpi } from "better-sol/program"
```

Two imports. `bs` contains everything for defining programs. `cpi` contains transpiler-only CPI stubs used inside `run()` bodies.

---

## 1. Primitive Types

Every primitive is a factory function returning a `TypeToken`. The internal `kind` string (e.g. `"u64"`, `"pubkey"`) is the contract between the public API and the coder/transpiler/codegen. Public names are cosmetic; internal kinds are canonical.

### Integer Types

| Factory | TypeScript type | Internal kind | Borsh bytes | Zero-copy | PDA seedable |
|---|---|---|---|---|---|
| `bs.u8()` | `number` | `"u8"` | 1 | Yes | Yes |
| `bs.u16()` | `number` | `"u16"` | 2 | Yes | Yes |
| `bs.u32()` | `number` | `"u32"` | 4 | Yes | Yes |
| `bs.u64()` | `bigint` | `"u64"` | 8 | Yes | Yes |
| `bs.u128()` | `bigint` | `"u128"` | 16 | Yes | Yes |
| `bs.i8()` | `number` | `"i8"` | 1 | Yes | Yes |
| `bs.i16()` | `number` | `"i16"` | 2 | Yes | Yes |
| `bs.i32()` | `number` | `"i32"` | 4 | Yes | Yes |
| `bs.i64()` | `bigint` | `"i64"` | 8 | Yes | Yes |
| `bs.i128()` | `bigint` | `"i128"` | 16 | Yes | Yes |

### Other Primitives

| Factory | TypeScript type | Internal kind | Borsh bytes | Zero-copy | PDA seedable |
|---|---|---|---|---|---|
| `bs.f32()` | `number` | `"f32"` | 4 | Yes | No |
| `bs.f64()` | `number` | `"f64"` | 8 | Yes | No |
| `bs.bool()` | `boolean` | `"bool"` | 1 | **Rejected** | No |
| `bs.pubkey()` | `Address` (string) | `"pubkey"` | 32 | Yes | Yes |
| `bs.string()` | `string` | `"string"` | 4 + len | No | No |
| `bs.bytes()` | `Uint8Array` | `"bytes"` | 4 + len | No | No |

### Compound Types

```typescript
bs.optional(inner)             // T | null — Borsh: 1-byte prefix + inner
bs.vector(inner)               // T[] — Borsh: 4-byte len + items, max 32
bs.vector(inner, 128)          // T[] — custom max entries
bs.array(inner, 10)            // FixedArray<T, 10> — fixed-size, no length prefix
```

---

## 2. Account Definitions

### Standard (Borsh) Accounts

```typescript
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
  label: bs.optional(bs.string()),
  bump: bs.u8(),
}).derive(seed => ["counter", seed.authority])
```

### Zero-Copy Accounts

```typescript
const Order = bs.struct({
  trader: bs.pubkey(),
  price: bs.u64(),
  quantity: bs.u64(),
  side: bs.u8(),
})

const OrderBook = bs.account({
  bids: bs.array(Order, 64),
  asks: bs.array(Order, 64),
  market: bs.pubkey(),
}).derive(seed => ["orderbook", seed.market]).zeroCopy()
```

### PDA Seeds

`.derive(seed => [...])` attaches PDA seeds to an account. Seeds are either literal strings or field references.

```typescript
.derive(() => ["config"])
.derive(seed => ["vault", seed.owner])
.derive(seed => ["pool", seed.tokenA, seed.tokenB])
```

**Seed rules enforced at transpile time:**
- Field seeds must reference pubkey or integer fields on the account
- During `bs.init()`, each field seed must be provided by a matching instruction arg or account
- Dynamic string templates are rejected — store values as account fields instead
- Account name and arg name collisions within an instruction are rejected

### Input Validation

PDA derivation validates seed fields at runtime before computing the address. Missing or invalid seed fields throw clear error messages naming the expected field names.

---

## 3. Struct Definitions (Zero-Copy Sub-Structs)

```typescript
const Order = bs.struct({
  trader: bs.pubkey(),
  price: bs.u64(),
  quantity: bs.u64(),
  side: bs.u8(),
})
```

Only valid inside zero-copy accounts. Fields must be Pod-safe. Generated Rust uses `#[zero_copy]` and `bytemuck`.

---

## 4. Event Definitions

Events are plain inline field schemas:

```typescript
bs.program({
  events: {
    Incremented: { newCount: bs.u64(), authority: bs.pubkey() },
    Transfer:   { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() },
  },
})
```

Parsed from transaction logs via `sol.counter.parseEvents(logs)` — returns decoded typed event objects using the same SHA-256 discriminator format Anchor uses.

---

## 5. Account Constraints

Constraints declare what each instruction does with each account. They map to Anchor's `#[derive(Accounts)]` attributes.

### User-Defined Accounts

| Constraint | Description | Anchor equivalent |
|---|---|---|
| `bs.init(Account)` | Create new PDA account | init, payer, space, seeds, bump |
| `bs.initIfNeeded(Account)` | Create PDA or reuse existing | init_if_needed |
| `bs.mut(Account)` | Read/write existing account | mut |
| `bs.close(Account, refundTo)` | Close account, send rent to refundTo | mut, close = refundTo |
| `bs.realloc(Account, newSpace)` | Resize account data | realloc, realloc::payer, realloc::zero |
| `bs.hasOne("field")` | Validate account matches a field | has_one = field |
| `bs.belongsTo(ParentAccount)` | Validate account is owned by parent | belongs_to |

### System Accounts

| Constraint | Description | Anchor equivalent |
|---|---|---|
| `bs.signer()` | Transaction signer | Signer<'info> |
| `bs.signer().writable()` | Writable signer | Signer<'info>, mut |
| `bs.mint()` | SPL Mint account (read-only) | Account<'info, Mint> |
| `bs.mint().writable()` | Writable mint | Account<'info, Mint>, mut |
| `bs.tokenAccount()` | SPL Token account (read-only) | Account<'info, TokenAccount> |
| `bs.tokenAccount().writable()` | Writable token account | mut |
| `bs.tokenProgram()` | Token program address | Program<'info, Token> |
| `bs.token2022Program()` | Token-2022 program address | Interface<'info, TokenInterface> |
| `bs.systemProgram()` | System program address | Program<'info, System> |
| `bs.clock()` | Clock sysvar | Sysvar<'info, Clock> |
| `bs.remaining(Account)` | Dynamic remaining accounts | ctx.remaining_accounts |

---

## 6. Program Definition

```typescript
const counter = bs.program({
  name: "counter",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can perform this action",
    NotActive: "Counter is not active",
    BelowZero: "Counter would go below zero",
  },
  events: {
    Incremented: { newCount: bs.u64(), authority: bs.pubkey() },
  },
}, ix => ({
  initialize: ix({
    accounts: {
      counter: bs.init(Counter),
      authority: bs.signer(),
    },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),

  increment: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
    },
    args: { amount: bs.u64() },
    returns: bs.u64(),
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      ctx.require(counter.isActive, "NotActive")
      counter.count += amount
      ctx.emit("Incremented", { newCount: counter.count, authority })
      return counter.count
    },
  }),

  close: ix({
    accounts: {
      counter: bs.close(Counter, "authority"),
      authority: bs.signer(),
    },
    run: () => {},
  }),
}))
```

### Instruction Callbacks

The `ix()` callback receives only what the definition specifies. TypeScript overloads handle four cases:

| Definition | Callback signature |
|---|---|
| No accounts, no args | `(ctx) => void` |
| Accounts only | `(accounts, ctx) => void` |
| Args only | `(args, ctx) => void` |
| Accounts + args | `(accounts, args, ctx) => void` |

### Return Values

Instructions can declare `returns: bs.u64()` (or any type token). The `run()` body may use `return <expr>` which transpiles to `return Ok(expr);` in Rust. The SDK exposes return data from simulation results.

---

## 7. Instruction Context (`ctx`)

Inside `run()` callbacks, `ctx` provides:

```typescript
ctx.require(condition, "ErrorName")  // Error must exist in program config
ctx.emit("EventName", { ... })       // Event must exist in program config
ctx.log("message")                   // Transpiles to msg!() macro
```

All names are validated at transpile time.

---

## 8. CPI Stubs (Transpiler-Only)

```typescript
import { cpi } from "better-sol/program"

cpi.token.transfer({ from, to, authority, amount })
cpi.token.transferChecked({ from, mint, to, authority, amount, decimals })
cpi.token.mintTo({ mint, to, authority, amount })
cpi.token.burn({ from, mint, authority, amount })

cpi.sol.timestamp()  // → Clock::get()?.unix_timestamp (i64)
```

---

## 9. Body Language (Transpilable TypeScript Subset)

### Supported

| Feature | TypeScript | Generated Rust |
|---|---|---|
| Field assignment | `counter.count = 5n` | `counter.count = 5;` |
| Arithmetic | `counter.count += amount` | `counter.count += amount;` |
| Require | `ctx.require(cond, "Err")` | `require!(cond, ProgramError::Err);` |
| Emit event | `ctx.emit("Name", { a, b })` | `emit!(Name { a, b });` |
| Log | `ctx.log("msg", val)` | `msg!("msg {}", val);` |
| Token CPI | `cpi.token.transfer({...})` | `anchor_spl::token::transfer(...)` |
| If/else | `if (cond) { ... }` | `if cond { ... }` |
| Bounded for | `for (let i = 0; i < n; i++)` | `for i in 0..n { ... }` |
| Array access | `orders[i]` | `orders[i as usize]` |
| Null assignment | `account.auth = null` | `account.auth = None;` |
| Return values | `return expr` | `return Ok(expr);` |
| Variable declaration | `let x = expr` | `let x = expr;` |
| Boolean negation | `!condition` | `!condition` |

### Unsupported (18 specific diagnostics)

| Pattern | Diagnostic |
|---|---|
| `while` / `do-while` | "Use a bounded for loop" |
| `for...of` / `for...in` | "Use a bounded index loop" |
| `switch` | "Use explicit if/else branches" |
| `try/catch/finally` | "Use ctx.require()" |
| `return` (without returns type) | "Instruction handlers must complete normally" |
| `throw` | "Use ctx.require()" |
| `await` | "On-chain logic cannot await" |
| `Math.max()` / `Math.min()` | "Compare directly" |
| Template strings | "Use string literals" |
| Object spread | "Write every field explicitly" |
| Destructuring | "Declare each local explicitly" |
| Nested functions | "Inline the logic" |
| External constants | "Only accounts, args, locals available" |
| Mutable conditional aliases | "Rewrite as explicit branches" |
| Unknown error/event names | "Add it to program config" |
| Unknown account field | "Field does not exist on this account type" |
| Wrong event payload | "Fields must match the event definition" |

---

## 10. Transpiler Surface Separation

### Runtime Schema (always available)

```typescript
import { bs } from "better-sol/program"
// Plain JavaScript objects with type metadata.
// Works in Node.js, Bun, and browser environments.
```

### Transpiler Source (only consumed by CLI)

```typescript
import { cpi } from "better-sol/program"
// Empty stubs — calling them at runtime does nothing.
// AST markers for the transpiler.
```

The `run()` bodies are transpiler-only. They're never executed as JavaScript.

---

## 11. Type Helpers

```typescript
type CounterData = bs.InferFields<typeof Counter.fields>
type IncrementAccounts = bs.InferAccounts<typeof counter, "increment">
type IncrementArgs = bs.InferArgs<typeof counter, "increment">
type IxNames = keyof typeof counter.instructions
type ErrorNames = keyof typeof counter.errors
```

---

## 12. Constraints No Longer Planned

All previously P2 constraints are now implemented:

| Constraint | Status |
|---|---|
| `bs.hasOne("field")` | **Done** |
| `bs.belongsTo(ParentAccount)` | **Done** |
| `bs.realloc(Account, newSpace)` | **Done** |
| Instruction return values (`returns:`) | **Done** |

### Future Constraints

| Anchor constraint | Priority | Notes |
|---|---|---|
| `seeds::program = expr` | P3 | Cross-program PDA derivation |
| `address = pubkey` | P3 | Fixed address constraint |
| `owner = program` | P3 | Cross-program account ownership |
| `rent_exempt = skip` | P4 | Rare edge case |
