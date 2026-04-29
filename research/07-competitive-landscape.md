# Competitive Landscape: Existing TypeScript Libraries for Solana

## Library Comparison Matrix

| Feature | @solana/kit | Gill | Kite | Umi | web3.js v1 | Framework Kit |
|---------|------------|------|------|-----|------------|---------------|
| **Maintainer** | Anza (official) | Ironforge | Mike MacCana | Metaplex | Solana Labs | Community |
| **Token count** | 251 | 157 | 79 | 182 | 145 | 99 |
| **Size** | Large | 2.3MB | 310KB | Large | Large | Small |
| **Tree-shakable** | ✅ | ✅ | ✅ | Partial | ❌ | ✅ |
| **Plugin system** | ✅ (new) | ❌ | ✅ (Kit plugin) | ❌ | ❌ | ❌ |
| **Framework agnostic** | ✅ | ✅ | ✅ | ❌ (Metaplex) | ✅ | ✅ |
| **React hooks** | @solana/react | ❌ | ❌ | ❌ | ❌ | ❌ |
| **IDL codegen** | Via Codama | Via Codama | ❌ | Built-in | ❌ | ❌ |
| **Declarative config** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Transaction recipes** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Built-in testing** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Error handling DX** | Complex | Moderate | Simple | Moderate | Simple | Simple |
| **Multi-tx orchestration** | instruction-plans | ❌ | ❌ | ❌ | ❌ | ❌ |

## Key Insight: What NOBODY Does

1. **Declarative Configuration** — No library lets you define your entire Solana app in a config file
2. **Transaction Recipes** — No library provides reusable, composable transaction definitions
3. **Full-Stack Integration** — No library spans backend (Node) + frontend (React) + testing
4. **Auto-managed Transaction Lifecycle** — All libraries require manual blockhash/fee-payer management
5. **Human-Readable Error Layer** — No library provides a "Solana errors explained for humans" layer
6. **Program Discovery** — No library auto-detects programs from your project and generates clients

## Why Another Library Wins

The Solana TypeScript ecosystem has many thin wrappers but no **framework**. Compare to:

| Domain | Before Framework | After Framework |
|--------|-----------------|-----------------|
| Auth | Passport.js, custom JWT | Better Auth |
| API | Express.js | ElysiaJS, tRPC |
| Payments | Stripe API | Stripe SDK + Paykit |
| **Solana** | **@solana/kit + 10 libraries** | **???** |

The gap is clear. Nobody has built the "framework" layer for Solana. This is a $25k infrastructure prize opportunity.

## Why Kite/Gill Don't Satisfy This

### Kite
- Thin convenience layer (helpers for common tasks)
- No plugin system of its own (just wraps Kit's)
- No transaction orchestration
- No IDL integration
- No React hooks
- No testing utilities
- No declarative config

### Gill  
- Opinionated but imperative (still write transaction building code)
- Built on Kit but doesn't add structural improvements
- No plugin ecosystem
- No transaction recipes
- No IDL integration

### What They Both Miss
The leap from "library" to "framework" requires:
1. **Conventions** — Standard ways to structure a Solana project
2. **Configuration** — Declarative over imperative
3. **Code generation** — From IDLs and schemas
4. **Composition** — Plugin ecosystem
5. **Testing** — Built-in test utilities
6. **DevEx** — CLI, scaffolding, debugging tools
