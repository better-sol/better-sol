# DX Principles & Research

Research from analyzing Zod, Drizzle, Better Auth, tRPC, ElysiaJS, and Solana developer pain points.

---

## 1. What Makes Developers Say "Wow"

The pattern every beloved library follows:

```typescript
// Import → Define → Use
import { z } from 'zod'
const User = z.object({ name: z.string() })
type UserType = z.infer<typeof User>
```

No setup. No config file. No code generation. No boilerplate.

### Shared Traits

| Trait | Zod | Drizzle | tRPC | Better Auth |
|---|---|---|---|---|
| Import one thing, get going | ✅ | ✅ | ✅ | ✅ |
| First example < 5 lines | ✅ | ✅ | ✅ | ✅ |
| Types inferred, never written | ✅ | ✅ | ✅ | ✅ |
| No config file required | ✅ | ✅ | ✅ | ✅ |
| No code generation | ✅ | ✅ | ✅ | ✅ |
| Error messages name the field | ✅ | ✅ | ✅ | ✅ |

### Anti-Patterns Developers Hate

1. **Setup > coding** — Cargo conflicts, Anchor version mismatches, solana-toolchain installs
2. **Code generation required** — Prisma's `prisma generate` step breaks when you forget it
3. **Config files for simple things** — Next.js `next.config.js` for basic settings
4. **Generic errors** — `AnchorError: 0x1` without saying which account or why
5. **Magic strings** — Passing program names as strings without autocomplete
6. **Framework lock-in** — Being forced into a specific folder structure or runtime

---

## 2. ElysiaJS Pattern: Scoped Type Inference

ElysiaJS achieves end-to-end type safety through scoped factory functions:

```typescript
const app = new Elysia()
  .state('user', {} as User)
  .get('/profile', ({ store }) => store.user.name)  // typed!
```

**Application to better-sol:** Error/event definitions flow into `ix()` before instruction bodies are typed. This is why `ctx.require()` and `ctx.emit()` are typed from the `program()` config:

```typescript
export const counter = program(
  { errors: { Unauthorized: "msg" }, events: { Done: { count: u64 } } },
  ix => ({
    increment: ix({
      run: ({}, {}, ctx) => {
        ctx.require(false, "Unauthorized")  // typed — name must match config
        ctx.emit("Done", { count: 5n })     // typed — name + payload must match
      },
    }),
  }),
)
```

---

## 3. Drizzle Pattern: Declarative Schema = Query Builder

Drizzle's insight: the schema definition IS the query builder. No code generation.

```typescript
const users = pgTable('users', { id: serial(), name: text() })
db.select().from(users).where(eq(users.name, 'Alice'))
```

**Application to better-sol:** The program definition IS the client SDK. No IDL step, no code generation for client use.

```typescript
const counter = program({ ... }, ix => ({ ... }))
// Same `counter` export provides typed instruction methods, PDA derivation, account fetching
```

---

## 4. Better Auth Pattern: Plugin-Based Composition

Better Auth keeps the core minimal and adds features via plugins:

```typescript
betterAuth({ plugins: [twoFactor(), passkey(), organization()] })
```

**Application to better-sol:** Programs are registered as "plugins" to the client:

```typescript
const sol = await betterSol({ cluster: "devnet", programs: { counter, amm } })
sol.counter.initialize({ ... })
sol.amm.swap({ ... })
```

---

## 5. Error Message Quality

Zod's error messages are legendary because they name the exact field and expected type:

```
Expected string, received number at path 'email'
```

**Application to better-sol:** All 18 transpiler diagnostics name the exact pattern and suggest the fix:

| Pattern | Diagnostic |
|---|---|
| `while (cond) { ... }` | `Unsupported: while loops are not supported on Solana. Use a bounded for loop: for (let i = 0; i < N; i++)` |
| `Math.max(a, b)` | `Unsupported: Math.max() is not available on-chain. Compare directly: a > b ? a : b` |
| Unknown error name in `ctx.require()` | `Unknown error 'Foo'. Add it to program errors: { Foo: 'description' }` |

---

## 6. How better-sol Applies These Principles

| Principle | Implementation |
|---|---|
| Import → define → use | `program()`, `account()`, `ix()` — no config file needed |
| First example < 20 lines | Counter program is ~30 lines total |
| Types inferred | All instruction params, account fields, PDA seeds inferred from definition |
| No code generation for client | Same TS file = runtime client SDK |
| Names errors with fixes | 18 transpiler diagnostics + runtime validation |
| Plugin-based composition | `programs: { counter, amm }` in `betterSol()` |

### The 5-Step Flow

```
1. npm install better-sol                        (10 sec)
2. npx @better-sol/cli create counter             (5 sec)
3. Edit programs/counter.ts                       (TypeScript)
4. npx @better-sol/cli login && deploy            (10 sec)
5. Use the client — same file, zero extra code
```

5 steps. 0 Rust. 0 config files. 0 code generation. 0 dependency conflicts.
