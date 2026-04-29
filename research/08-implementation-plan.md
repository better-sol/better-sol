# Technical Implementation Plan

## Project: `@solana-kit/framework` (Working Name)

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  User Application                │
├─────────────────────────────────────────────────┤
│          @solana-framework/react (optional)      │
│   Provider, Hooks, Components, ErrorBoundary    │
├─────────────────────────────────────────────────┤
│          @solana-framework/core                  │
│   createSolanaApp(), Recipes, Plugins, Config    │
├─────────────────────────────────────────────────┤
│     @solana-framework/program-client             │
│   IDL Parser, Code Generator, Typed Clients     │
├─────────────────────────────────────────────────┤
│     @solana-framework/errors                     │
│   Error Decoder, Human Messages, Fix Suggestions│
├─────────────────────────────────────────────────┤
│          @solana/kit (Foundation Layer)           │
│   RPC, Codecs, Signers, Transactions, Accounts  │
├─────────────────────────────────────────────────┤
│            Solana Blockchain                      │
└─────────────────────────────────────────────────┘
```

### Package Structure

#### 1. `@solana-framework/core`
The heart of the framework. Declarative config + plugin system + transaction recipes.

```typescript
// src/create-solana-app.ts
export function createSolanaApp<TConfig extends SolanaAppConfig>(config: TConfig): SolanaApp<TConfig> {
  // 1. Parse and validate config
  // 2. Set up RPC connection
  // 3. Initialize plugin system
  // 4. Generate program clients from IDLs
  // 5. Register transaction recipes
  // 6. Return typed SolanaApp instance
}

// src/recipe.ts
export function recipe<TInput, TOutput>(name: string): RecipeBuilder<TInput, TOutput> {
  // Fluent builder for transaction recipes
  // Auto-resolves dependencies between steps
  // Handles multi-transaction splitting
}

// src/plugins/
// - priority-fees.ts: Auto-estimate compute units and set priority fees
// - transaction-logging.ts: Log all transaction details in dev mode
// - error-recovery.ts: Retry failed transactions with new blockhash
// - simulation.ts: Pre-simulate transactions before sending
// - batch.ts: Batch multiple transactions efficiently
```

#### 2. `@solana-framework/program-client`
Auto-generated typed clients from IDLs.

```typescript
// src/idl-parser.ts
export function parseIdl(idl: AnchorIdl | CodamaIdl): ProgramDefinition {
  // Parse IDL into normalized program definition
  // Extract instructions, accounts, types, errors
}

// src/code-generator.ts
export function generateProgramClient(program: ProgramDefinition): ProgramClient {
  // Generate runtime program client (no codegen step needed)
  // Type-safe instruction builders
  // Account fetchers with auto-decoding
  // Error type detection
}

// src/instruction-builder.ts
// Dynamic instruction builder that validates inputs against IDL schema
// Auto-serializes account data using codecs from IDL type definitions
```

#### 3. `@solana-framework/react`
React integration with hooks and providers.

```typescript
// src/provider.tsx
export function SolanaProvider({ config, children }: SolanaProviderProps) {
  // Initialize SolanaApp from config
  // Set up wallet connection
  // Provide context to children
}

// src/hooks/use-transaction.ts
export function useTransaction<TInput, TOutput>(
  recipe: Recipe<TInput, TOutput>,
  options?: TransactionOptions
): UseTransactionResult<TInput, TOutput> {
  // Returns { execute, loading, error, data, reset }
  // Handles signing, sending, confirming
  // Shows human-readable errors
}

// src/hooks/use-wallet.ts
export function useWallet(): UseWalletResult {
  // Returns { connected, publicKey, connect, disconnect, signTransaction, balance }
  // Auto-updates balance
  // Wallet standard compatible
}

// src/hooks/use-account.ts
export function useAccount<TAccount>(address: Address, decoder: Decoder<TAccount>): UseAccountResult<TAccount> {
  // Returns { data, loading, error, refetch }
  // Auto-subscribes to account changes via WebSocket
  // Decodes using provided decoder
}

// src/components/error-boundary.tsx
export function SolanaErrorBoundary({ children, fallback }: SolanaErrorBoundaryProps) {
  // Catches Solana errors and renders human-readable messages
  // Suggests fixes (e.g., "Insufficient SOL for transaction. Need 0.005 SOL more.")
}
```

#### 4. `@solana-framework/errors`
Human-readable error messages and fix suggestions.

```typescript
// src/error-decoder.ts
export function decodeSolanaError(error: unknown): DecodedSolanaError {
  // Pattern matches against known error types:
  // - Transaction errors (simulation failure, preflight failure)
  // - Program errors (custom error codes from IDL)
  // - RPC errors (rate limiting, network issues)
  // - Wallet errors (user rejected, wallet not connected)
  //
  // Returns:
  // - Human-readable title
  // - Detailed description
  // - Suggested fix
  // - Relevant documentation link
}

// src/error-messages.ts
// Curated error message database
// Maps program IDs + error codes to human messages
// Includes Anchor error code database
// Includes System Program, Token Program, Associated Token Program errors
```

#### 5. `@solana-framework/cli`
CLI tool for scaffolding and code generation.

```bash
# Create a new Solana dApp
npx create-solana-framework my-app --template nextjs

# Generate program client from IDL
npx solana-framework generate --idl ./idl.json --output ./src/clients

# Start development with auto-reload
npx solana-framework dev

# Deploy programs
npx solana-framework deploy --network devnet
```

### Key Design Principles

1. **Layer on Kit, don't replace it**: All types are compatible. Users can drop down to raw @solana/kit at any point.

2. **Convention over configuration**: Sensible defaults that work for 80% of cases. Escape hatches for the other 20%.

3. **Declarative where possible, imperative where needed**: Config files for setup, code for custom logic.

4. **Type-safe end-to-end**: From IDL → program client → recipe → React hook → UI. Types flow through the entire stack.

5. **Progressive complexity**: Start simple (3 lines for a transfer), add complexity as needed (recipes, plugins, custom transactions).

6. **Framework agnostic core**: Core works in Node.js, browser, React Native. Framework-specific packages are optional.

### Demo Application: Token Launchpad

A simple token launchpad that demonstrates all framework features:

```typescript
// solana.config.ts
import { createSolanaApp, recipe } from '@solana-framework/core';
import { priorityFees, transactionLogging, errorRecovery } from '@solana-framework/plugins';

export const app = createSolanaApp({
  network: 'devnet',
  
  programs: {
    token: { idl: '@solana-program/token' },
    metaplex: { idl: '@metaplex-foundation/mpl-token-metadata' },
  },
  
  transactions: {
    launchToken: recipe('launchToken')
      .input<{ name: string; symbol: string; image: string; supply: bigint }>()
      .steps((ctx) => ({
        createMint: ctx.programs.token.createMint({
          decimals: 9,
          authority: ctx.payer,
        }),
        createMetadata: ctx.programs.metaplex.createMetadata({
          mint: ctx.steps.createMint.output,
          name: ctx.input.name,
          symbol: ctx.input.symbol,
          uri: ctx.input.image,
        }),
        mintSupply: ctx.programs.token.mintTo({
          mint: ctx.steps.createMint.output,
          destination: ctx.payer,
          amount: ctx.input.supply,
          authority: ctx.payer,
        }),
      }))
      .build(),
  },
  
  plugins: [
    priorityFees({ strategy: 'simulate' }),
    transactionLogging(),
    errorRecovery({ retryOnBlockhashExpiry: true }),
  ],
});
```

```tsx
// app/page.tsx
'use client';

import { SolanaProvider, useTransaction, useWallet } from '@solana-framework/react';
import { app } from '../solana.config';

function LaunchTokenForm() {
  const { connected, connect } = useWallet();
  const { execute, loading, error } = useTransaction(app.transactions.launchToken);
  
  if (!connected) return <button onClick={connect}>Connect Wallet</button>;
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      execute({
        name: 'My Token', symbol: 'MTK', image: 'https://...', supply: 1_000_000_000n
      });
    }}>
      {/* ... form fields ... */}
      <button type="submit" disabled={loading}>
        {loading ? 'Launching...' : 'Launch Token'}
      </button>
      {error && <SolanaError error={error} />}
    </form>
  );
}

export default function Page() {
  return (
    <SolanaProvider config={app}>
      <LaunchTokenForm />
    </SolanaProvider>
  );
}
```

### What This Demo Shows
1. **3 lines** to configure the entire app (vs 30+ with raw Kit)
2. **Recipe pattern** for multi-step transactions (vs manual instruction building)
3. **Auto program clients** from IDLs (vs Codama codegen setup)
4. **React hooks** with loading/error states (vs manual state management)
5. **Plugin system** for cross-cutting concerns (vs scattered utility code)
6. **Human errors** (vs hex error codes)
