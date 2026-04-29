# DX Libraries Analysis: Better Auth, ElysiaJS, Paykit

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
4. **Single schema → multiple outputs** - One IDL → client, tests, docs, explorer data

---

## 3. Paykit / Commerce Kit (paykit.sh / launch.solana.com)

### Core Philosophy
"Framework-agnostic commerce primitives for Solana. Drop-in components to headless primitives."

### Key DX Patterns

#### 1. Drop-In Components
```tsx
import { PaymentButton } from '@solana-commerce/kit';

function App() {
  return (
    <PaymentButton
      config={{
        merchant: { name: 'My Store', wallet: 'your-solana-wallet-address' },
        mode: 'buyNow'
      }}
      onPaymentSuccess={(signature) => console.log('Payment successful:', signature)}
    />
  );
}
```
- One component = complete payment flow
- Handles wallet connection, token selection, transaction building, signing, sending

#### 2. Layered Abstraction
| Package | Level |
|---------|-------|
| `@solana-commerce/kit` | Meta package (everything) |
| `@solana-commerce/react` | Drop-in payment button |
| `@solana-commerce/connector` | Wallet connection |
| `@solana-commerce/headless` | Headless commerce primitives |
| `@solana-commerce/solana-pay` | QR code generation |
| `@solana-commerce/sdk` | React hooks for custom UIs |

#### 3. Framework Agnostic + Framework Enhanced
- Core works anywhere (Node, browser, React Native)
- React components for convenience
- Headless primitives for any framework

#### 4. Type-Safe Transaction Building
```typescript
import { createTransfer } from '@solana-commerce/solana-pay';

const transaction = await createTransfer(rpc, sender, {
  recipient: merchantAddress,
  amount: lamports(1000n),
  splToken: tokenMint, // Optional: auto-detects SOL vs SPL
});
```

### What Solana Can Learn
1. **Layered abstraction** - Headless core + framework-specific convenience
2. **Drop-in components** - For common use cases (transfer, token create, NFT mint)
3. **Auto-detection** - Smart defaults that reduce configuration
4. **Composability** - Use individual packages or the meta package
