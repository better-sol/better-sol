# DX Patterns & Developer Pain Points

Learnings from best-in-class developer tools and the Solana pain points they address.

---

## 1. Better Auth (better-auth.com)

### Core Philosophy
"Auth that lives inside your app. Composable, plugin-based, and built to scale."

### Key DX Patterns

#### 1. Declarative Configuration
```typescript
import { betterAuth } from "better-auth"
export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
    github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! },
  },
  plugins: [twoFactor(), passkey(), organization()],
})
```
- **No dashboard clicks** - everything lives in code, version controlled
- Single config file defines the entire auth system
- Type-safe configuration with IDE autocomplete

#### 2. Plugin Ecosystem (50+ plugins)
- Framework-agnostic core
- Plugins add: 2FA, passkeys, organizations, SSO, SAML, SCIM
- Each plugin is opt-in and composable
- Plugin types flow through to client automatically

#### 3. Type Inference System
- `$Infer` property for inferring session/user types
- Plugins extend base types automatically
- Client-side types mirror server-side types
- Works with TypeScript strict mode

#### 4. Framework Agnostic
- Works with Next.js, Nuxt, SvelteKit, Astro, Hono, and 20+ more
- No framework lock-in
- Same API surface everywhere

#### 5. AI-First Documentation
- MCP server for AI agents (mcp.better-auth.com/mcp)
- LLMs.txt for documentation
- Skills for coding assistants
- Agent auth support built-in

### What Solana Can Learn
1. **Declarative config over imperative API calls** - Define what you want, not how to build it
2. **Plugin system with type propagation** - Plugins should enhance types end-to-end
3. **Zero-config defaults** - Works out of the box, customize later
4. **Framework agnostic** - Don't tie to React/Next.js only
5. **AI-friendly** - MCP servers, LLMs.txt, skills

---

## 2. ElysiaJS (elysiajs.com)

### Core Philosophy
"Ergonomic framework for building backend APIs with Bun runtime."

### Key DX Patterns

#### 1. Method Chaining for Type Safety
```typescript
const app = new Elysia()
  .state('db', database)
  .derive(({ store }) => ({ user: getUser(store.db) }))
  .get('/users', ({ user }) => user)
  .listen(3000)
```
- Every method returns a new typed instance
- Type information flows through the chain
- No loss of type safety at any point

#### 2. Encapsulation by Default
- Lifecycle methods are encapsulated to their instance
- Must explicitly declare dependencies between instances
- Prevents accidental global state leakage
- Similar to JavaScript module scoping

#### 3. Macro System
```typescript
macro(({ onBeforeHandle }) => ({
  auth(enabled: boolean) {
    if (!enabled) return
    onBeforeHandle(({ headers }) => {
      // Check auth
    })
  }
}))

// Usage
app.get('/protected', () => 'secret', { auth: true })
```
- Custom route decorators with lifecycle control
- Full type safety for custom properties
- Schema validation integrated with macros
- Deduplication built-in

#### 4. Single Source of Truth Schema
- One schema definition works for:
  - Request validation
  - Response type inference
  - OpenAPI documentation
  - Client code generation

#### 5. Feature-Based Structure
- Controllers, services, models per feature
- Decoupled from framework internals
- Easy to test and swap

### What Solana Can Learn
1. **Method chaining with type propagation** - Already partially in Kit with `pipe()`
2. **Encapsulation by default** - Plugin isolation
3. **Macro-like extensibility** - Custom transaction decorators
4. **Single schema → multiple outputs** - One IDL → sol, tests, docs, explorer data

---

## 3. Paykit (paykit.sh / github.com/getpaykit/paykit)

### Core Philosophy
"The billing framework for TypeScript. Define products in code. Any provider. Gate features. Track usage."

Paykit is an embedded billing framework — it runs inside your app, uses your database,
and provides a single API to manage plans, subscriptions, entitlements, and usage billing.
It abstracts away Stripe, Polar, and other payment providers behind a unified interface.

### Key DX Patterns

#### 1. Declarative Schema → Multiple Outputs

The developer defines features and plans as pure TypeScript values:

```typescript
import { createPayKit, feature, plan } from "paykitjs"
import { stripe } from "@paykitjs/stripe"

const messages = feature({ id: "messages", type: "metered" })

const free = plan({
  id: "free",
  group: "base",
  default: true,
  includes: [messages({ limit: 100, reset: "month" })],
})

const pro = plan({
  id: "pro",
  group: "base",
  price: { amount: 19, interval: "month" },
  includes: [messages({ limit: 2_000, reset: "month" })],
})

export const paykit = createPayKit({
  provider: stripe({ secretKey: process.env.STRIPE_SECRET_KEY! }),
  database: process.env.DATABASE_URL!,
  plans: [free, pro],
})
```

This single definition serves THREE purposes:
- **Database schema** — Paykit auto-creates tables (customers, subscriptions, entitlements, products)
- **Provider sync** — `paykitjs push` syncs plans to Stripe as products/prices
- **Runtime API** — `paykit.subscribe()`, `paykit.check()`, `paykit.report()` use the same schema

**This is the Drizzle pattern applied to billing:** define once, use everywhere.

#### 2. `paykitjs push` — The Drizzle-Like Workflow

```bash
npx paykitjs push
# → Connecting...
# → Applying migrations (3 pending)
# → Checking products...
# → 2 products out of sync: free, pro
# → Push 2 product changes? yes
# → Done · synced 2 products
```

The `push` command:
1. Runs database migrations (Drizzle under the hood)
2. Dry-runs a product sync against the payment provider
3. Shows diffs (created, updated, unchanged)
4. Asks for confirmation
5. Syncs products to the provider

**This is exactly what our `npx @better-sol/cli push` does:** schema diff → generate code → compile → deploy.

#### 3. Provider Abstraction (Strategy Pattern)

Payment providers implement a `PaymentProvider` interface:

```typescript
interface PaymentProvider {
  createCustomer(data): Promise<{ providerCustomer: ProviderCustomer }>
  createSubscription(data): Promise<ProviderSubscriptionResult>
  cancelSubscription(data): Promise<ProviderSubscriptionResult>
  syncProducts(data): Promise<{ results: [...] }>
  handleWebhook(data): Promise<NormalizedWebhookEvent[]>
  // ... 15+ methods
}
```

Paykit ships adapters: `@paykitjs/stripe`, `@paykitjs/polar`.
The core framework never imports Stripe directly — everything goes through the interface.

**For us:** programs could be "providers" in the same way. The client SDK doesn't know
about specific program implementations — it talks to a unified interface.

#### 4. Entitlement System with Feature Gating

```typescript
// Check if customer can use a feature
const result = await paykit.check({
  customerId: "cus_123",
  featureId: "messages",
  required: 1,
})
// → { allowed: true, balance: { limit: 2000, remaining: 1847, resetAt: Date } }

// Report usage (metered billing)
await paykit.report({
  customerId: "cus_123",
  featureId: "messages",
  amount: 1,
})
```

The entitlement engine:
- Aggregates limits across multiple active subscriptions
- Handles lazy resets (expired entitlements reset on next check, not via cron)
- Falls back to stacked deductions when no single entitlement covers the amount
- Uses `SELECT ... FOR UPDATE` for concurrent safety

#### 5. Plugin System

```typescript
interface PayKitPlugin {
  id: string
  endpoints?: Record<string, unknown>  // Merge into the API router
}
```

Plugins can inject API endpoints into Paykit's router. The dashboard plugin (`@paykitjs/dash`)
uses this to add a full billing management UI at `/paykit/api/dash/*`.

#### 6. Monorepo Structure

```
packages/
  paykit/          → Core framework (createPayKit, feature, plan, CLI)
  stripe/          → Stripe provider adapter
  polar/           → Polar provider adapter
  dash/            → Embedded billing dashboard (SPA)
apps/
  demo/            → Demo app
  web/             → Marketing site (paykit.sh)
e2e/               → End-to-end tests
```

### Architecture Patterns We Should Copy

| Pattern | Paykit | Our Equivalent |
|---|---|---|
| Define schema in TS | `feature()`, `plan()` | `account()`, `defineErrors()`, `defineEvents()` |
| Single definition, many outputs | DB + Stripe sync + runtime API | Rust gen + cloud compile + client SDK |
| `push` workflow | `paykitjs push` (migrate + sync) | `better-sol push` (parse + compile + deploy) |
| Provider abstraction | `PaymentProvider` interface | Standard CPI interfaces (token.*, system.*) |
| Plugin system | `PayKitPlugin` with endpoints | Programs as plugins via `betterSol({ programs })` |
| Embedded dashboard | `@paykitjs/dash` SPA injected via handler | Not needed (CLI-first for v1) |
| Framework agnostic | Works with any JS runtime | Works with any JS runtime |

### What Solana Can Learn
1. **Declarative schema → multiple outputs** — Define it once, use for compilation, sol, and testing
2. **The `push` workflow** — We're already copying this. `paykitjs push` validates our design.
3. **Provider abstraction** — Payment providers map to Solana programs; same pattern applies
4. **Feature gating with metering** — Entitlement checking is similar to account validation
5. **Database-driven state** — Paykit uses Drizzle + PostgreSQL; we use on-chain accounts

---

## Identified Pain Points

### P1: Verbose Transaction Building
**Problem**: Even simple operations require 15-25 lines of boilerplate (blockhash, fee payer, lifetime, instructions, signing, sending).

**Evidence**:
- Raw @solana/kit requires 251 tokens for a simple SOL transfer
- Kite does the same in 79 tokens (3.2x less code)
- Need to manually manage: blockhashes, fee payers, transaction lifetime, signing

**Opportunity**: Build a higher-level transaction API that handles these automatically.

### P2: Type-Level Complexity
**Problem**: @solana/kit uses advanced TypeScript features (Ghost of Departed Proofs) that create unreadable type errors and slow IDE performance.

**Evidence**:
- GitHub Issue #1156: "Type-level programming makes @solana/kit extremely hard to understand"
- Types like `ExcludeTransactionMessageLifetime<ExcludeTransactionMessageFeePayer<EmptyTransactionMessage<0>>>`
- 15+ seconds for IntelliSense on some operations
- High barrier to entry for non-type-system experts

**Opportunity**: Provide a simpler type layer that sacrifices some compile-time safety for usability.

### P3: Learning Curve (Account Model)
**Problem**: Solana's account model is fundamentally different from EVM. New developers struggle with concepts like PDAs, rent, ownership, and CPIs.

**Evidence**:
- Solana's own docs have an entire "EVM to SVM" migration guide
- Account model is "one of the hardest concepts for developers transitioning from other blockchains"
- The separation of program code and data is unique and confusing

**Opportunity**: Build interactive learning tools, visualizers, or abstraction layers.

### P4: Fragmented Library Ecosystem
**Problem**: Multiple competing libraries with different APIs, all built on similar foundations.

**Evidence**:
- @solana/kit (official, verbose)
- Gill (built on kit, opinionated)
- Kite (built on kit, minimal)
- Umi (Metaplex-specific)
- micro-sol-signer (lightweight alternative)
- web3.js v1 (legacy, still widely used)
- Framework Kit (another abstraction)

**Opportunity**: Unify the ecosystem with a standard high-level layer.

### P5: Codama/IDL Code Generation Immaturity
**Problem**: Generated clients from program IDLs are still rough around the edges.

**Evidence**:
- "Converting any anchor/shank program IDL breaks half the functionality"
- "Codama's biggest contributor lately is dependabot"
- Dependency hell from generated clients
- Runtime IDL parsing is fragile

**Opportunity**: Improve IDL tooling, build better code generation, or create an alternative approach.

### P6: Testing Experience
**Problem**: Testing Solana programs and clients is complex and slow.

**Evidence**:
- bankrun and other tools are relatively new
- No equivalent of Hardhat's "instant" test experience
- Need to run a local validator for most tests
- LiteSVM exists but isn't well-integrated with TypeScript

**Opportunity**: Build a first-class testing framework for TS developers.

### P7: Error Debugging
**Problem**: Error messages are opaque and hard to trace back to source.

**Evidence**:
- "Hundreds of interfaces, types, helpers, and proxies — really hard to figure out where an error occurred"
- Error thrown inside error handlers
- Transaction simulation errors require manual RPC investigation

**Opportunity**: Build better error parsing, debugging tools, and developer-friendly error messages.

### P8: No "Create-Solana-App" Equivalent
**Problem**: No single command to scaffold a full-stack Solana dApp with best practices.

**Evidence**:
- create-solana-dapp exists but is basic
- No equivalent to create-next-app + better-auth + prisma setup
- Each project reinvents: wallet connection, transaction handling, error handling, state management

**Opportunity**: Build a comprehensive project scaffolding tool.

## Gap Analysis: What's Missing in the Ecosystem

| Need | Current State | Gap |
|------|--------------|-----|
| Simple transaction API | Kite exists but is very thin | Need deeper abstractions |
| Type-safe program interaction | Codama generates clients | Fragile, complex setup |
| Full-stack dApp scaffolding | create-solana-dapp (basic) | No opinionated stack |
| Testing framework | bankrun, LiteSVM | Not TS-native |
| Error handling/debugging | Manual log inspection | No devtools |
| Local dev experience | solana-test-validator (Rust) | Slow startup |
| Program deployment | CLI-based, manual | No CI/CD integration |
| Real-time state subscriptions | Manual WebSocket handling | No reactive layer |
| Multi-transaction operations | instruction-plans (new) | Complex API |
| Wallet abstraction | Wallet Standard | Fragmented UX |
