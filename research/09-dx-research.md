# DX Research — Building a Library Developers Love

## Methodology

- Analyzed developer reviews, complaints, and praise across Zod, Drizzle, Prisma, tRPC, Better Auth, openapi-fetch, ElysiaJS
- Cloned and studied source code of Zod (v4), Drizzle ORM, Better Auth
- Reviewed 20+ articles on SDK/library API design patterns
- Read developer frustration reports from Solana (Anchor issues, cargo dependency hell, opaque errors)
- Studied API design guides from Rust (RustStack, Microsoft Rust Guidelines), Elixir, Go

---

## 1. What Makes Developers Say "Wow"

### The "Wow" Libraries All Share These Traits

| Trait | Zod | Drizzle | tRPC | Better Auth | Prisma |
|---|---|---|---|---|---|
| **Import one thing, get going** | `import { z } from 'zod'` | `import { pgTable } from 'drizzle-orm/pg-core'` | `import { initTRPC } from '@trpc/server'` | `import { betterAuth } from 'better-auth'` | `import { PrismaClient } from '@prisma/client'` |
| **First example < 5 lines** | ✅ `z.object({ name: z.string() })` | ✅ `pgTable('users', { id: serial() })` | ✅ `t.router({ hello: t.proc.query(() => 'hi') })` | ✅ `betterAuth({ database })` | ✅ `prisma.user.findMany()` |
| **Types inferred, never written** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Method chaining for transforms** | ✅ `.min(3).max(100)` | ✅ `.primaryKey().default()` | ❌ (nested calls) | ❌ (config object) | ❌ (config DSL) |
| **No config file required** | ✅ | ✅ | ✅ | ✅ | ❌ (schema.prisma) |
| **No code generation** | ✅ | ✅ | ✅ | ✅ | ❌ (prisma generate) |
| **Error messages name the field** | ✅ "Expected string, received number at path 'email'" | ✅ | ✅ | ✅ | ✅ |
| **Works on first try** | ✅ | ✅ | ✅ | ✅ | ✅ (after generate) |

### Key Insight: The Pattern Is "Import → Define → Use"

Every beloved library follows the same three-step pattern:

```typescript
// Step 1: Import
import { z } from 'zod'

// Step 2: Define
const User = z.object({ name: z.string(), age: z.number() })

// Step 3: Use
type UserType = z.infer<typeof User>  // types come for free
User.parse({ name: 'Alice', age: 30 }) // runtime validation too
```

No setup. No config file. No code generation. No boilerplate.

### The Anti-Patterns Developers Hate

From developer complaints across blogs, GitHub issues, and forums:

1. **"I spent more time on setup than coding"** — Cargo dependency conflicts, Anchor version mismatches, solana-toolchain installs
2. **"The error message was 12 lines of nested angle brackets"** — Complex conditional types producing unreadable TS errors
3. **"I had to read the source code to understand how to use it"** — Missing or wrong types, no IntelliSense
4. **"The codegen step breaks my workflow"** — Prisma's `prisma generate`, Anchor's IDL → Codama pipeline
5. **"It works in the tutorial but breaks in my project"** — Version pinning hell, missing peer dependencies
6. **"I can't figure out what to import"** — Scattered exports, unclear package structure

---

## 2. The Principles (From Research)

### P1. Progressive Disclosure

> "Simple things should be simple. Complex things should be possible." — Alan Kay

The best libraries have a "flat" learning curve for the common case:

```typescript
// Hello world — 3 lines (Zod)
const schema = z.object({ count: z.number() })

// Advanced — gradually discover features
const schema = z.object({
  count: z.number().min(0).max(100).int().describe("A counter"),
}).strict().passthrough()
```

**Apply to better-sol:** The counter example should be < 20 lines. The AMM example
adds complexity gradually — more accounts, events, CPI calls. Never front-load.

### P2. The "Single Import" Test

> "If your SDK needs documentation beyond IntelliSense, your SDK is wrong."
> — Tyson Cung, DEV Community

Can a developer go from `npm install` to a working example using ONLY autocomplete?

```typescript
// Zod: type "z." and autocomplete shows everything
z.string()  z.number()  z.boolean()  z.object({})  z.array()

// tRPC: type "t." and autocomplete shows the builder
t.router()  t.procedure  t.middleware()
```

**Apply to better-sol:** The developer should type `p.` and see all constraint
methods. Type `ctx.` and see require/emit/log. Type `account(` and autocomplete
guides them through the schema. No doc lookup needed.

### P3. Method Chaining for Transformations

Zod's genius is `.min(3).max(100).email()` — each method returns a new type
that's more specific than the last. The developer reads left-to-right and
understands the full constraint.

Drizzle does the same: `serial('id').primaryKey()` — each method narrows
the column type.

**Apply to better-sol:** Our `p.` constraint system already does this:
```typescript
p.tokenAccount(Pool, 'tokenAMint').mut()  // read-only → writable
p.mint().mut()                              // read-only mint → writable mint
```
This is correct. Keep it. But consider whether more chaining would help:
```typescript
// Current: separate args
p.init(Counter)

// Could we do this?
p.use(Counter).init()  // ← reads left to right: "use Counter, initialize it"
```

**Verdict:** The current `p.init(Counter)` is simpler. Don't over-engineer.
Method chaining is only valuable when there's a meaningful transformation chain.
For us, `p.mint().mut()` is the only real chain — and it's already there.

### P4. Options Over Builders

> "I chose options objects for: destructuring support, conditional parameters,
> less cognitive overhead, better TypeScript inference."
> — Tyson Cung, SDK design

```typescript
// ❌ Builder pattern (fluent API) — harder to compose dynamically
new Client().setUrl('...').setAuth('...').setTimeout(5000).build()

// ✅ Options object — easy to compose, spread, and type
const client = createClient({
  url: '...',
  auth: '...',
  timeout: 5000,
})
```

**Apply to better-sol:** Our `betterSol({ cluster, payer, programs })` is already
an options object. Our `ix({ accounts, args, run })` is already an options object.
Good.

### P5. Types Should Be Invisible

> "Type inference over annotations — the best DX never asks you to manually
> type something the library can infer."
> — PkgPulse DX Revolution 2026

```typescript
// ❌ Developer must write types
const result: User = await db.query('SELECT * FROM users')

// ✅ Types are inferred
const result = await db.user.findMany()  // result is User[] automatically
```

**Apply to better-sol:** Our type system already infers everything from the
program definition. `ctx.require(cond, 'ErrorName')` autocompletes from
`defineErrors()`. `ctx.emit('EventName', data)` validates the shape.
No manual types anywhere. Good.

### P6. Error Messages Are Documentation

> "Write the error message, not just the type. When you define a generic,
> think about what happens when someone passes the wrong thing."
> — Inngest Blog, TypeScript for SDKs

The three rules of DX error messages (from type-level-typescript.com):
1. **If it type-checks, it should work** — no false positives
2. **Error messages should be short and understandable** — no wall of generics
3. **Auto-complete should nudge toward working code** — impossible states are unrepresentable

**Zod example:**
```
✅ Expected string, received number at "email"
✅ Required at "name"
✅ Expected 2 arguments, got 1
```

**@tanstack/react-table counter-example:**
```
❌ Type 'Record<string, any>' is not assignable to type 'DeepPartial<...>'
   Properties 'foo' are missing in type 'Record<string, any>' but required
   in type 'DeepPartial<{ foo: { bar: Baz<ReadonlyArray<...>> } }>'
```

**Apply to better-sol:**
- Parse-time errors (from the transpiler) should name the exact line and suggest the fix:
  ```
  ❌ Line 18: Date.now() — not available on-chain. Use sol.timestamp() instead.
  ❌ Line 23: JSON.parse() — not available on-chain. Store data in accounts instead.
  ❌ Line 31: Math.sqrt() — not supported. Use integer arithmetic or the rust escape hatch.
  ```
- Type errors (from TypeScript) should be minimized. Our type system uses
  inference, not complex conditional types. Good.

### P7. No Code Generation

The strongest signal from the Drizzle vs Prisma comparison:

> "Drizzle's killer feature is TypeScript. You can make a change to your schema
> and instantly get updated types — no codegen step involved."
> — Sophia Willows

> "In a monorepo, the codegen step can be a small pain. Drizzle feels more
> 'live' in day-to-day editing."
> — Gerson Calienes, Drizzle vs Prisma 2026

Our library already avoids code generation — the TS definition IS the client.
This is a **massive** DX advantage. Emphasize it.

### P8. The 30-Second Rule

> "If a mid-level developer cannot read the type and understand what it accepts
> within 30 seconds, simplify it."
> — Rizz Development, TypeScript Type Complexity

Every exported type should be self-documenting. If someone reads our README
example, they should be able to write their own program in 30 seconds without
looking at docs.

### P9. Factory Functions Over Classes

> "Factories beat constructors for configuration. They're more testable,
> more composable, and clearer about defaults."
> — Steve McDougall, Building a TypeScript SDK

```typescript
// ✅ Factory function (our approach)
export const counter = program('counter', 'addr', { errors }, { instructions })

// ❌ Class-based
class CounterProgram extends Program {
  constructor() { super('counter', 'addr') }
  defineErrors() { return { ... } }
  defineInstructions() { return { ... } }
}
```

Our approach is correct. Factory functions compose naturally:
```typescript
const sol = betterSol({ programs: { counter, amm } })
```

### P10. Debugging Is Part of DX

> "Debugging remains a pain point. Anchor macro errors can be opaque and hard
> to trace. When CPI fails, logs aren't always clear."
> — Superteam, State of Dev Tooling on Solana

From Solana developer complaints:
- Anchor macro errors are "opaque and hard to trace"
- CPI failures have unclear logs
- Cargo dependency conflicts take hours to debug
- `solana program deploy` feels "broken and not usable"

**Apply to better-sol:**
- Every runtime error should include the program name, instruction name, and
  the exact check that failed
- Test failures should show the full instruction + accounts context
- Deploy errors should be actionable: "Your account needs 165 bytes but only
  has 128. Add `.space(165)` to your account definition."

---

## 3. Audit: Our API Against These Principles

### What We're Doing Right

| Principle | Our Implementation | Score |
|---|---|---|
| P1. Progressive disclosure | Counter = 20 lines, AMM = 320 lines | ✅ |
| P2. Single import test | `import { program, account, ix, p } from 'better-sol/program'` | ✅ |
| P4. Options over builders | `betterSol({ ... })`, `ix({ ... })`, `account({ ... })` | ✅ |
| P5. Types invisible | `ctx.require(cond, 'Error')` autocompletes | ✅ |
| P7. No code generation | Same file = client | ✅ |
| P8. 30-second rule | Counter example is readable in 10 seconds | ✅ |
| P9. Factory functions | `program()`, `account()`, `ix()`, `betterSol()` | ✅ |

### What Could Be Improved

#### Issue 1: The `run:` Handler Has Too Many Positional Args

**Current:**
```typescript
run: ({ counter, authority }, { amount }, ctx) => {
  ctx.require(authority === counter.authority, 'Unauthorized')
  counter.count += amount
}
```

Three positional parameters: accounts, args, ctx. This works but:
- The developer has to remember the order
- For instructions with no args, you still write `({}, {}, ctx)`
- For instructions with no accounts, same issue

**Improvement option A — Destructured single object:**
```typescript
run: ({ accounts: { counter, authority }, args: { amount }, ctx }) => {
  ctx.require(authority === counter.authority, 'Unauthorized')
  counter.count += amount
}
```
This is worse. More nesting, not better.

**Improvement option B — Make ctx implicit:**
We can't. It needs to carry the type parameters.

**Improvement option C — Merge ctx into accounts:**
```typescript
run: ({ counter, authority, amount, ctx }) => {
  ctx.require(authority === counter.authority, 'Unauthorized')
  counter.count += amount
}
```
This flattens accounts and args into one object. Problem: name collisions
between account names and arg names. `amount` could be both.

**Verdict:** Keep the current design. Three positional params is the Drizzle
pattern (their `.values()` takes positional args too). It's already clean.
The only improvement: **for instructions with no args**, allow omitting the
second parameter:

```typescript
// Current (works but requires empty object)
run: ({ counter, authority }, {}, ctx) => {

// Improvement (allow skipping empty args)
run: ({ counter, authority }, ctx) => {
```

This is a nice-to-have. Not critical for v1.

#### Issue 2: `program()` Has Four Arguments

**Current:**
```typescript
export const counter = program('counter', 'CouNTeR...', { errors }, { instructions })
```

Four positional arguments. Developer has to remember:
1. name (string)
2. address (string)
3. config (errors, events)
4. instructions

Could we merge name and address? No — the address is a specific pubkey.
Could we merge config and instructions? Not cleanly — they're different concerns.

**Alternative — named parameters:**
```typescript
export const counter = program({
  name: 'counter',
  address: 'CouNTeR...',
  errors,
  instructions: {
    increment: ix({ ... }),
  },
})
```

This is more readable but more verbose. The Zod pattern is positional
(`z.object({})`, `z.string()`). The Better Auth pattern is named
(`betterAuth({ database, plugins })`).

For something with 4 args, named is better. But our 4-arg pattern is already
established across all docs. Changing it now would be costly.

**Verdict:** Keep positional. The pattern `program('name', 'addr', { config }, { instructions })`
is consistent and the developer sees the shape immediately. The config object
groups errors and events; the instructions object groups all ix() calls.

#### Issue 3: The `.seeds()` Pattern Uses String Templates

**Current:**
```typescript
const Counter = account({ count: u64, authority: pubkey })
  .seeds('counter', '{authority}')
```

The `'{authority}'` string references a field by name in quotes. This is:
- **Not type-safe** — you could typo `'{authortiy}'` and it would fail at runtime
- **Unusual** — most libraries don't use string interpolation in quotes
- **Inconsistent** — the account fields use plain identifiers (`authority: pubkey`)
  but seeds reference them with braces

**Better approach — use the field variable directly:**
```typescript
const Counter = account({ count: u64, authority: pubkey })
  .seeds('counter', p.authority)
```

But `p.authority` doesn't exist yet at definition time — `p` is for instruction
constraints, not account field references.

**Alternative — use a callback:**
```typescript
const Counter = account({ count: u64, authority: pubkey })
  .seeds('counter', (fields) => [fields.authority])
```

This IS type-safe. But it's more verbose and complex for the common case.

**Alternative — seeds as part of the account definition:**
```typescript
const Counter = account({
  count: u64,
  authority: pubkey.seeds('counter'),  // ← field IS the seed
})
```

This is more elegant — the field that seeds the PDA is marked directly.
Problem: a PDA can have multiple seed components, some of which are
fields and some of which are constants. Like `'pool', '{tokenAMint}', '{tokenBMint}'`.

**Verdict:** The current `'{field}'` pattern is a pragmatic choice. The string
template syntax is immediately understandable: "the PDA seeds are 'counter'
followed by the authority field." The type system CAN validate these at
compile time by checking that every `{name}` references a real field.

This is a v2 improvement. Document it as a known limitation:
"Seed field names are checked at compile time. A typo like `'{authortiy}'`
will produce a type error."

#### Issue 4: Token Operations Split Across Contexts

On-chain (inside `run:`):
```typescript
token.transfer({ from, to, authority, amount })
```

Off-chain (client):
```typescript
await sol.token.transfer({ mint, from, to, amount })
```

These have DIFFERENT signatures. `token.transfer` on-chain takes an authority,
but `sol.token.transfer` off-chain takes a mint. The developer has to learn
two different APIs for the same concept.

**Fix:** Unify the signatures where possible. On-chain, the mint is implicit
(from the token account). Off-chain, the authority might need to be explicit
(if not using the payer). But the *parameter names* should match:
- `from` and `to` should always mean the same thing
- `authority` should always mean the signer

This is already mostly correct. Just need to ensure the examples are consistent.

#### Issue 5: The `create` Command Feels Optional

From the P1 (progressive disclosure) principle, the simplest path should be
the one the developer discovers first. Right now, a developer could:

1. Skip `create` entirely
2. Write `programs/counter.ts` manually
3. Run `deploy` — which offers to generate a keypair

This is good! But the `deploy` flow for missing keypairs needs to be seamless.
If `deploy` prompts the developer interactively, that breaks CI/CD. If it
auto-generates without asking, that's surprising.

**Fix:** Make `deploy` non-interactive. If no keypair exists:
- Generate one silently
- Write it to `.better-sol/counter.json`
- Print the address
- But DON'T modify the source file (that's `create`'s job)

If the source file has no address:
- Error with a clear message: "Run `npx @better-sol/cli create counter` to scaffold the program file, or add the address manually: `program('counter', '<address>', ...)`"

This keeps `create` as the recommended path but makes `deploy` safe for CI/CD.

---

## 4. The "Wow" Checklist

Before we ship, every example should pass this test:

| # | Test | How to Verify |
|---|---|---|
| 1 | Can you go from `npm install` to a working counter in < 5 minutes? | Time a fresh developer |
| 2 | Does autocomplete guide you through the entire API? | Open VS Code, type `p.`, `ctx.`, `sol.` |
| 3 | Can you write a program without looking at docs? | Only use IntelliSense |
| 4 | Does every error message tell you exactly what to fix? | Deliberately make mistakes |
| 5 | Does the type system prevent invalid states? | Try passing wrong types to `ctx.require` |
| 6 | Does the same file work as both on-chain program and client? | Write a program, then import it client-side |
| 7 | Can you test without running a validator? | Write a test with `createTestSol()` |
| 8 | Does `deploy` "just work"? | Run it on a fresh project |
| 9 | Can you read someone else's program in 30 seconds? | Show the AMM to a friend |
| 10 | Does it feel like "this is how it should have been"? | Gut check |

---

## 5. Competitive DX Comparison

### What Solana Developers Currently Suffer Through

```
Traditional Solana Development:
1. Install Rust toolchain (30 min)
2. Install Solana CLI (15 min)
3. Install Anchor CLI (10 min, if it works)
4. Fix cargo dependency conflicts (1-4 hours)
5. Write Rust program (~100 lines)
6. Debug Anchor macro errors (opaque)
7. Write migration for account layout
8. Generate IDL
9. Run Codama to generate TypeScript client
10. Write client code
11. Debug serialization errors
12. Deploy with solana program deploy (flaky)
```

### What better-sol Should Feel Like

```
better-sol Development:
1. npm install better-sol (10 sec)
2. npx @better-sol/cli create counter (5 sec)
3. Edit programs/counter.ts (~20 lines, TypeScript)
4. npx @better-sol/cli deploy (10 sec)
5. Use the client — same file, zero extra code
```

5 steps. 0 Rust. 0 config files. 0 code generation. 0 dependency conflicts.

---

## 6. Action Items

### Must Fix Before Shipping
- [ ] **Seed field type safety** — compile-time check that `'{fieldName}'` references a real field
- [ ] **Deploy CI/CD safety** — non-interactive when no keypair, clear error when no address
- [ ] **Error message audit** — every parse-time error should suggest the fix
- [ ] **IntelliSense audit** — every `.` press should show helpful autocomplete

### Nice to Have (v1)
- [ ] Allow `run: ({ accounts }, ctx)` for instructions with no args (skip empty `{}`
- [ ] Unified token operation signatures (on-chain vs off-chain)

### Future (v2)
- [ ] Named parameter option for `program()`: `program({ name, address, errors, instructions })`
- [ ] `.seeds()` callback pattern for complex seed derivations
- [ ] Visual debugger / instruction explorer (like Prisma Studio)
