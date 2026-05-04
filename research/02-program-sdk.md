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

### Design Decisions

**Why `bs.u64()` and not `bs.number()`?** TypeScript has two numeric types (`number`, `bigint`) but Solana has 14. `number` could be `u8`, `u16`, `u32`, `i8`, `i16`, `i32`, `f32`, or `f64`. `bigint` could be `u64`, `u128`, `i64`, or `i128`. Bit-width cannot be inferred. Semantic names (`bs.amount()`, `bs.count()`) would hide essential information that affects account rent cost, serialization, and PDA eligibility.

**Why `bs.u64()` instead of `u64`?** The function-call syntax makes primitives visually consistent with compound types (`bs.optional(bs.u64())`). Plain constants (`u64`) can't support chained metadata like `.min()`, `.description()`, or `.validate()` in the future.

**Why `bs.pubkey()` and not `bs.address()`?** `pubkey` is the canonical Solana term. An `address` alias may be added later but is not the primary name.

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

Zero-copy accounts use `AccountLoader` in Rust for reduced compute unit costs on reads. Only Pod-safe types are allowed: integers, `pubkey`, `f32`/`f64`, fixed arrays, and nested zero-copy structs. `bool`, `string`, `bytes`, `option`, and `vec` are rejected at transpile time.

```typescript
const Order = bs.struct({
  trader: bs.pubkey(),
  price: bs.u64(),
  quantity: bs.u64(),
  side: bs.u8(),              // bool is NOT Pod-safe — use u8 flag
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
// Literal seeds: static prefix
.derive(() => ["config"])                         // seeds = [b"config"]

// Field seeds: references an account field (must be pubkey or integer)
.derive(seed => ["vault", seed.owner])            // seeds = [b"vault", owner.as_ref()]
.derive(seed => ["pool", seed.tokenA, seed.tokenB]) // seeds = [b"pool", tokenA, tokenB]

// Mixed
.derive(seed => ["ticket", seed.lottery, seed.id])  // seeds = [b"ticket", lottery, id.to_le_bytes()]
```

**Seed rules enforced at transpile time:**
- Field seeds must reference pubkey or integer fields on the account
- During `bs.init()`, each field seed must be provided by a matching instruction arg or account
- Dynamic `"{argName}"` string templates are rejected — store values as account fields instead
- Account name and arg name collisions within an instruction are rejected

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

Events are plain inline field schemas — no wrapper function needed. They carry no extra metadata (no seeds, no zeroCopy flag, no discriminators).

```typescript
bs.program({
  events: {
    Incremented: { newCount: bs.u64(), authority: bs.pubkey() },
    Transfer:   { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() },
  },
})
```

For reusable event shapes, extract a plain `const`:

```typescript
const TransferFields = { from: bs.pubkey(), to: bs.pubkey(), amount: bs.u64() }
bs.program({ events: { Transfer: TransferFields } })
```

The transpiler validates event names and field types at transpile time. Generated Rust uses `#[event]` and `emit!()`.

---

## 5. Account Constraints

Constraints declare what each instruction does with each account. They map to Anchor's `#[derive(Accounts)]` attributes.

### User-Defined Accounts

```typescript
bs.init(Account)              // Create new PDA account. Requires seeds on Account.
                              // Anchor: init, payer, space, seeds, bump

bs.initIfNeeded(Account)      // Create PDA or reuse existing.
                              // Anchor: init_if_needed, payer, space, seeds, bump

bs.mut(Account)               // Read/write existing account.
                              // Anchor: mut

bs.close(Account, refundTo)   // Close account, send rent to refundTo.
                              // Anchor: mut, close = refundTo
```

### System Accounts

```typescript
bs.signer()                   // Transaction signer.
                              // Auto-fills from sol.payer when omitted at call site.
                              // Anchor: Signer<'info>

bs.signer().writable()        // Writable signer (rare).

bs.mint()                     // SPL Mint account (read-only).
                              // Anchor: Account<'info, Mint>

bs.mint().writable()          // Writable mint.

bs.tokenAccount()             // SPL Token account (read-only).
                              // Anchor: Account<'info, TokenAccount>

bs.tokenAccount().writable()  // Writable token account.

bs.tokenProgram()             // Token program address.
                              // Anchor: Program<'info, Token>

bs.token2022Program()         // Token-2022 program address.
                              // Anchor: Interface<'info, TokenInterface>

bs.systemProgram()            // System program address.
                              // Auto-injected when instruction has bs.init().
                              // Anchor: Program<'info, System>

bs.clock()                    // Clock sysvar.
                              // Anchor: Sysvar<'info, Clock>
```

### Remaining Accounts

```typescript
bs.remaining(Account)         // Dynamic remaining accounts of Account type.
                              // Typed at call site: remaining: Address[]
                              // Anchor: ctx.remaining_accounts
```

### Design Decisions

**Why `bs.mut(Account)` and not `bs.account(Account).writable()`?** `mut` is the most common constraint for user accounts. It deserves a terse name. The `.writable()` chaining pattern is used for special accounts (`bs.mint().writable()`) where the read-only variant is the default.

**Why rename `p` to inline functions under `bs`?** `p` is cryptic — it doesn't communicate "account constraints" to a new developer. Moving constraints into the `bs` namespace makes them discoverable alongside types and definitions. The `p` namespace existed because constraints and types were separate concepts; unifying them under `bs` reflects that they're all part of the same program definition surface.

**Why `.writable()` chaining for special accounts?** Special accounts (mint, token account, signer) are read-only by default because most instructions only read them. The chaining pattern `bs.mint().writable()` is more self-documenting than a separate `bs.writableMint()` function for each special account type. It mirrors how the official `@solana/kit` SDK handles conditional signer/writable roles.

---

## 6. Program Definition

```typescript
const counter = bs.program({
  name: "counter",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  accounts: { Counter },         // registers account definitions for the typed client
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
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      ctx.require(counter.isActive, "NotActive")
      counter.count += amount
      ctx.emit("Incremented", { newCount: counter.count, authority })
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

### Program Config

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Program name (used in generated Rust module, IDL) |
| `address` | `Address` | Yes | On-chain program ID (base58) |
| `accounts` | `Record<string, AccountDefinition>` | No | Account definitions registered for the typed client |
| `errors` | `Record<string, string>` | No | Error codes with human-readable messages |
| `events` | `Record<string, FieldSchema>` | No | Event definitions with typed fields |

### Instruction Callbacks

The `ix()` callback receives only what the definition specifies. TypeScript overloads handle four cases:

| Definition | Callback signature |
|---|---|
| No accounts, no args | `(ctx) => void` |
| Accounts only | `(accounts, ctx) => void` |
| Args only | `(args, ctx) => void` |
| Accounts + args | `(accounts, args, ctx) => void` |

```typescript
ping: ix({ run: ctx => ctx.log("ping") })
setValue: ix({ args: { value: bs.u64() }, run: (args, ctx) => {} })
closeVault: ix({ accounts: { vault: bs.mut(Vault) }, run: (accounts, ctx) => {} })
increment: ix({
  accounts: { counter: bs.mut(Counter), authority: bs.signer() },
  args: { amount: bs.u64() },
  run: (accounts, args, ctx) => {},
})
```

---

## 7. Instruction Context (`ctx`)

Inside `run()` callbacks, `ctx` provides:

```typescript
// Error checking — error name must exist in program config errors
ctx.require(condition, "ErrorName")

// Event emission — event name + payload must match program config events
ctx.emit("EventName", { field1: value1, field2: value2 })

// Logging — transpiles to msg!() macro
ctx.log("message with {} placeholder", value1, value2)
```

All names are validated at transpile time. Referencing an undefined error or event produces a specific diagnostic.

---

## 8. CPI Stubs (Transpiler-Only)

Used inside `run()` bodies to invoke other Solana programs. These are transpiler-only markers — the actual CPI code is generated in Rust.

```typescript
import { cpi } from "better-sol/program"

// Token operations
cpi.token.transfer({ from, to, authority, amount })
cpi.token.transferChecked({ from, mint, to, authority, amount, decimals })
cpi.token.mintTo({ mint, to, authority, amount })
cpi.token.burn({ from, mint, authority, amount })

// Sysvar access
cpi.sol.timestamp()  // → Clock::get()?.unix_timestamp (i64)
```

**Design decision**: `cpi` is a separate import from `bs`. This makes the transpiler boundary explicit: `bs` is used at definition time and is always available in the runtime SDK. `cpi` is only meaningful inside `run()` bodies and is tree-shaken from browser builds. It also avoids confusion with the client-side `sol.token.transfer()` which actually executes token transfers.

---

## 9. Body Language (Transpilable TypeScript Subset)

The `run()` body transpiles a restricted subset of TypeScript to Rust.

### Supported

| Feature | TypeScript | Generated Rust |
|---|---|---|
| Field assignment | `counter.count = 5n` | `counter.count = 5;` |
| Arithmetic | `counter.count += amount` | `counter.count += amount;` |
| Require | `ctx.require(cond, "Err")` | `require!(cond, ProgramError::Err);` |
| Emit event | `ctx.emit("Name", { a, b })` | `emit!(Name { a, b });` |
| Log | `ctx.log("msg", val)` | `msg!("msg {}", val);` |
| Token CPI | `cpi.token.transfer({...})` | `anchor_spl::token::transfer(CpiContext::new(...), amount)?;` |
| If/else | `if (cond) { ... } else { ... }` | `if cond { ... } else { ... }` |
| Bounded for | `for (let i = 0; i < n; i++)` | `for i in 0..n { ... }` |
| Array access | `orders[i]` | `orders[i as usize]` |
| Null assignment | `account.auth = null` | `account.auth = None;` |
| Pubkey coercion | `account.field` in comparison | `account.field.key()` when comparing to address |
| Variable declaration | `let x = expr` | `let x = expr;` / `let mut x = expr;` |
| Boolean negation | `!condition` | `!condition` |

### Unsupported (18 specific diagnostics)

The transpiler rejects these patterns at parse time with messages naming the exact line and suggesting a fix:

| Pattern | Diagnostic |
|---|---|
| `while` / `do-while` | "Use a bounded for loop: `for (let i = 0; i < limit; i++)`" |
| `for...of` / `for...in` | "Use a bounded index loop" |
| `switch` | "Use explicit if/else branches" |
| `try/catch/finally` | "Use ctx.require() and Result-returning operations" |
| `return` statements | "Instruction handlers must complete normally" |
| `throw` | "Use ctx.require(condition, 'ErrorName')" |
| `await` | "On-chain logic cannot await" |
| `Math.max()` / `Math.min()` | "Compare directly: `a > b ? a : b`" |
| Template strings | "Use string literals only in supported log/message contexts" |
| Object spread `{...obj}` | "Write every object field explicitly" |
| Destructuring declarations | "Declare each local explicitly" |
| Nested functions / arrow functions | "Inline the logic" |
| External constants | "Only instruction accounts, args, and locals are available" |
| Mutable conditional aliases | "Rewrite as explicit branches" |
| Unknown error name in `ctx.require()` | "Add it to program errors" |
| Unknown event name in `ctx.emit()` | "Add it to program events" |
| Unknown account field access | "Field does not exist on this account type" |
| Extra/missing event payload fields | "Event payload fields must match the event definition" |

---

## 10. Transpiler Surface Separation

The program definition serves two distinct roles. The design makes these roles explicit:

### Runtime Schema (always available)

```typescript
import { bs } from "better-sol/program"
// bs.u64(), bs.pubkey(), bs.account(), bs.program()
// These are plain JavaScript objects with type metadata.
// They work in Node.js, Bun, and browser environments.
```

The `bs.program()` call returns a `ProgramDefinition` object that the client SDK uses directly:
- Account schemas with field types (for Borsh/zero-copy decoding)
- Instruction definitions with account constraints (for building instructions)
- Error messages (for decoding error returns)
- Event schemas (future event listeners)
- PDA seed templates (for address derivation)

### Transpiler Source (only consumed by CLI)

```typescript
import { cpi } from "better-sol/program"
// cpi.token.transfer(), cpi.sol.timestamp()
// These are empty stubs — calling them at runtime does nothing.
// They exist only as AST markers for the transpiler.
```

The `run()` bodies are also transpiler-only:
```typescript
run: ({ counter, authority }, { amount }, ctx) => {
  ctx.require(authority === counter.authority, "Unauthorized")
  counter.count += amount
}
// This function is NEVER executed as JavaScript.
// The transpiler reads its AST and generates equivalent Rust.
// In the client SDK build, these functions exist only to satisfy TypeScript types.
```

### Why This Separation Matters

1. **Bundle size** — `cpi` stubs and `run()` bodies are tree-shaken from browser builds
2. **Clear mental model** — developers understand that `bs` = definition, `cpi` = on-chain logic
3. **No runtime surprises** — calling `cpi.token.transfer()` in the browser won't silently fail; it's clearly not for that
4. **Testability** — the runtime schema can be unit-tested without the transpiler
5. **Future-proofing** — if the transpiler ever targets a different output (Pinocchio, raw solana-program), the runtime schema is unchanged

---

## 11. Type Helpers

```typescript
import { bs } from "better-sol/program"

// Extract account data type from an account definition
type CounterData = bs.InferFields<typeof Counter.fields>
// → { count: bigint; authority: Address; isActive: boolean; label: string | null; bump: number }

// Extract instruction accounts type
type IncrementAccounts = bs.InferAccounts<typeof counter, "increment">
// → { counter: CounterData & { key: Address }; authority: Address }

// Extract instruction args type
type IncrementArgs = bs.InferArgs<typeof counter, "increment">
// → { amount: bigint }

// Extract all instruction names
type IxNames = keyof typeof counter.instructions
// → "initialize" | "increment" | "close"

// Extract all error names
type ErrorNames = keyof typeof counter.errors
// → "Unauthorized" | "NotActive" | "BelowZero"
```

These types are used internally by the client SDK to type instruction methods. They're also exported for advanced use cases like indexers, explorers, and custom tooling.

---

## 12. Generated Rust Output

When the transpiler processes a program definition, it generates:

```
generated/counter/
├── Cargo.toml          # Pinned to Anchor 1.0.2, includes anchor-spl if token CPI used
├── src/
│   └── lib.rs          # Complete Anchor program:
│                        #   declare_id!()
│                        #   #[program] module with all instruction functions
│                        #   #[derive(Accounts)] structs per instruction
│                        #   #[account] / #[account(zero_copy)] structs
│                        #   #[error_code] enum with #[msg()] attributes
│                        #   #[event] structs
│                        #   anchor-spl imports for Token/Token-2022 CPI
└── idl.json            # Anchor-compatible IDL
```

The generated Rust passes `cargo check` with zero warnings and no `#[allow()]` attributes.

### Anchor Target Justification

Anchor is the correct transpiler target because:
- Most widely used Solana program framework
- IDL format is the ecosystem standard for client generation
- Account constraint model covers the vast majority of use cases
- `declare_program!()` (v1.0+) enables composability with external programs
- `#[derive(Accounts)]` generates security-critical validation code

Future potential targets: Pinocchio (zero-dependency, smaller `.so`), raw `solana-program` (maximum control). These are lower priority.

---

## 13. Constraints Not Yet Supported

These Anchor account constraints are valid but not yet in the DSL. They can be added incrementally:

| Anchor constraint | DSL equivalent | Priority |
|---|---|---|
| `has_one = owner` | `bs.hasOne("owner")` on AccountDefinition | P2 |
| `belongs_to = parent` | `bs.belongsTo(ParentAccount)` | P2 |
| `constraint = expr` | Inline in `run()` body via `ctx.require()` | Already covered |
| `realloc` | `bs.realloc(Account, newSize)` | P2 |
| `seeds::program = expr` | Derive from program address | P3 |
| `address = pubkey` | `bs.address(pubkey)` on constraint | P3 |
| `owner = program` | Implicit for program-owned accounts | Already covered |
| `rent_exempt = skip` | `bs.skipRentExempt()` | P3 |
| `executable` | N/A (program accounts rarely used) | P4 |
