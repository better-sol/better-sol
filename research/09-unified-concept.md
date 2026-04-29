# UNIFIED CONCEPT: A Full-Stack Solana Development Platform

## The Vision

**One framework that covers the entire Solana development lifecycle** — from defining on-chain programs to building client apps, with meaningful plugins that add real features (not just plumbing).

Inspired by how Better Auth covers the *entire* auth lifecycle (server + client + plugins + types), but applied to the entire Solana development lifecycle.

---

## Why This Is Different from Everything Else

| Existing Tool | What It Does | What It Misses |
|---|---|---|
| Anchor | Write Rust programs | No client, no testing in TS, no framework |
| Codama | Generate clients from IDL | Fragile, codegen step, no program dev |
| @solana/kit | Low-level TS primitives | 251 tokens for a transfer. No program dev. |
| Kite/Gill | Thin convenience wrappers | No plugins, no program dev, no framework |
| **Our platform** | **Everything** | — |

Nobody covers the full lifecycle. Nobody has meaningful plugins. Nobody lets you define programs from TypeScript.

---

## The Three Pillars

```
┌──────────────────────────────────────────────────────┐
│                    YOUR DAPP                          │
├──────────────┬──────────────────┬────────────────────┤
│   PILLAR 1   │     PILLAR 2     │      PILLAR 3      │
│  Program SDK  │  Client Framework │  Plugin Ecosystem  │
│              │                  │                    │
│ Define       │ Build client     │ Token management   │
│ programs     │ apps with        │ NFT lifecycle      │
│ in TypeScript│ declarative      │ Payments           │
│              │ config           │ Governance         │
│ Generate:    │                  │ Escrow / Swap      │
│ - Rust code  │ Transaction      │ Multi-sig          │
│ - TS clients │ recipes          │ Identity           │
│ - Tests      │ React hooks      │ Staking            │
│ - IDL        │ Error handling   │ Compression        │
│              │                  │                    │
├──────────────┴──────────────────┴────────────────────┤
│              @solana/kit (Foundation Layer)            │
├──────────────────────────────────────────────────────┤
│                 Solana Blockchain                      │
└──────────────────────────────────────────────────────┘
```

### Pillar 1: Program SDK (Define programs in TypeScript → Generate Rust + Clients)

Define your program's schema in TypeScript. From that single source of truth, generate:
- Anchor-compatible Rust program code
- TypeScript account codecs and instruction builders
- Program IDL (Anchor + Codama formats)
- Test harness with LiteSVM

### Pillar 2: Client Framework (Declarative, composable, type-safe end-to-end)

Build client applications with a declarative config, composable transaction recipes, React hooks, and human-readable error handling.

### Pillar 3: Plugin Ecosystem (Real features, like Better Auth)

Each plugin is a **complete feature** — not a technical utility. Plugins ship with on-chain instructions (where applicable), client-side helpers, React hooks, and testing utilities.

---

## Pillar 1: Program SDK

### The Problem
Writing Anchor programs requires deep Rust knowledge, even for simple programs. The boilerplate is enormous. Testing requires running a full validator. Client types must be manually kept in sync.

### The Solution: Define Once, Generate Everything

```typescript
// programs/counter.ts
import { defineProgram, u64, publicKey, bool } from '@solana-framework/program';

export const counterProgram = defineProgram({
  id: 'CounTer1111111111111111111111111111111111111',
  name: 'counter',
  version: '0.1.0',

  accounts: {
    counter: {
      fields: {
        count: u64,
        authority: publicKey,
        isActive: bool,
      },
    },
  },

  instructions: {
    initialize: {
      accounts: {
        counter: { writable: true, signer: true },
        payer: { writable: true, signer: true },
        systemProgram: { type: 'systemProgram' },
      },
      args: {
        initialValue: u64,
      },
      // Logic expressed as TypeScript — gets converted to Anchor Rust
      handler(ctx) {
        ctx.accounts.counter.count = ctx.args.initialValue;
        ctx.accounts.counter.authority = ctx.accounts.payer;
        ctx.accounts.counter.isActive = true;
      },
    },

    increment: {
      accounts: {
        counter: { writable: true },
        authority: { signer: true },
      },
      args: {
        amount: u64,
      },
      handler(ctx) {
        // Runtime assertions → Anchor constraint checks
        require(ctx.accounts.authority.equals(ctx.accounts.counter.authority));
        require(ctx.accounts.counter.isActive);
        ctx.accounts.counter.count += ctx.args.amount;
      },
    },

    reset: {
      accounts: {
        counter: { writable: true },
        authority: { signer: true },
      },
      args: {},
      handler(ctx) {
        require(ctx.accounts.authority.equals(ctx.accounts.counter.authority));
        ctx.accounts.counter.count = 0n;
      },
    },

    close: {
      accounts: {
        counter: { writable: true },
        authority: { signer: true, writable: true },
      },
      args: {},
      handler(ctx) {
        require(ctx.accounts.authority.equals(ctx.accounts.counter.authority));
        close(ctx.accounts.counter, ctx.accounts.authority);
      },
    },
  },
});
```

### What Gets Generated

#### 1. Anchor Rust Program (`programs/counter/src/lib.rs`)
```rust
use anchor_lang::prelude::*;

declare_id!("CounTer1111111111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, initial_value: u64) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = initial_value;
        counter.authority = ctx.accounts.payer.key();
        counter.is_active = true;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>, amount: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.counter.authority);
        require!(ctx.accounts.counter.is_active);
        ctx.accounts.counter.count += amount;
        Ok(())
    }

    pub fn reset(ctx: Context<Reset>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.counter.authority);
        ctx.accounts.counter.count = 0;
        Ok(())
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.counter.authority);
        let counter = &mut ctx.accounts.counter;
        let authority = &mut ctx.accounts.authority;
        counter.close(authority.to_account_info())?;
        Ok(())
    }
}

#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
    pub is_active: bool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = Counter::INIT_SPACE)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Reset<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut, close = authority)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
}
```

#### 2. TypeScript Client (auto-generated, no Codama needed)
```typescript
// Auto-generated from counterProgram definition
import { getCodec, getDecoder, getEncoder } from '@solana-framework/codecs';

// Account codec
export const counterAccount = {
  codec: getStructCodec([
    ['discriminator', getBytesCodec({ size: 8 })],
    ['count', getU64Codec()],
    ['authority', getPublicKeyCodec()],
    ['isActive', getBooleanCodec()],
  ]),
  
  // Space calculator (replaces manual Anchor space calculations)
  space: 8 + 8 + 32 + 1, // discriminator + count + authority + isActive
};

// Instruction builders (fully typed)
export const getInitializeInstruction = (args: {
  counter: TransactionSigner;
  payer: TransactionSigner;
  systemProgram?: Program<SystemProgram>;
}, input: { initialValue: bigint }) => { /* ... */ };

export const getIncrementInstruction = (args: {
  counter: Address;
  authority: TransactionSigner;
}, input: { amount: bigint }) => { /* ... */ };
```

#### 3. IDL (Anchor + Codama formats)
```json
{
  "address": "CounTer1111111111111111111111111111111111111",
  "name": "counter",
  "version": "0.1.0",
  "accounts": [{ "name": "counter", "fields": { "count": "u64", "authority": "publicKey", "isActive": "bool" } }],
  "instructions": [
    { "name": "initialize", "accounts": [...], "args": [{ "name": "initialValue", "type": "u64" }] },
    { "name": "increment", "accounts": [...], "args": [{ "name": "amount", "type": "u64" }] }
  ]
}
```

#### 4. Test Harness
```typescript
// tests/counter.test.ts
import { describe, test, expect } from 'vitest';
import { useForge } from '@solana-framework/testing';
import { counterProgram } from '../programs/counter';

describe('counter program', () => {
  const forge = useForge({
    programs: [counterProgram], // Auto-compiles to BPF, loads into LiteSVM
  });

  test('initialize sets the initial count', async () => {
    const { payer } = forge.context;
    const counter = forge.deriveAddress('counter', [payer]);

    await forge.execute(counterProgram.instructions.initialize({
      counter, payer, initialValue: 42n,
    }));

    const account = await forge.fetchAccount(counterProgram.accounts.counter, counter);
    expect(account.count).toBe(42n);
    expect(account.authority).toEqual(payer.address);
  });

  test('increment adds to the count', async () => {
    const { payer } = forge.context;
    const counter = forge.deriveAddress('counter', [payer]);

    await forge.execute(counterProgram.instructions.increment({
      counter, authority: payer, amount: 10n,
    }));

    const account = await forge.fetchAccount(counterProgram.accounts.counter, counter);
    expect(account.count).toBe(52n); // 42 + 10
  });

  test('non-authority cannot increment', async () => {
    const stranger = forge.createKeypair();
    const counter = forge.deriveAddress('counter', [forge.context.payer]);

    await expect(
      forge.execute(counterProgram.instructions.increment({
        counter, authority: stranger, amount: 1n,
      }))
    ).toThrowError('Constraint failed');
  });
});
```

### Supported Types

| TypeScript Type | Rust Type | Size (bytes) |
|---|---|---|
| `u8` | `u8` | 1 |
| `u16` | `u16` | 2 |
| `u32` | `u32` | 4 |
| `u64` | `u64` | 8 |
| `u128` | `u128` | 16 |
| `i64` | `i64` | 8 |
| `bool` | `bool` | 1 |
| `publicKey` | `Pubkey` | 32 |
| `string(size)` | `String` | 4 + size |
| `bytes(size)` | `Vec<u8>` | 4 + size |
| `option(T)` | `Option<T>` | 1 + T.size |
| `vec(T, maxLen)` | `Vec<T>` | 4 + maxLen * T.size |
| `enum(...)` | `enum` | 1 + max variant |
| `struct({...})` | `struct` | sum of fields |

### Complex Program Example: Escrow

```typescript
// programs/escrow.ts
import { defineProgram, u64, publicKey, bytes } from '@solana-framework/program';

export const escrowProgram = defineProgram({
  id: 'EscRow111111111111111111111111111111111111111',
  name: 'escrow',

  accounts: {
    escrow: {
      seeds: ['escrow', 'maker'],
      fields: {
        maker: publicKey,
        makerMint: publicKey,
        takerMint: publicKey,
        makerAmount: u64,
        takerAmount: u64,
        bump: u8,
      },
    },
  },

  instructions: {
    make: {
      accounts: {
        escrow: { writable: true, pda: ['escrow', 'maker'] },
        maker: { signer: true, writable: true },
        makerAta: { writable: true },       // Maker's token account
        mintA: {},
        mintB: {},
        tokenProgram: { type: 'tokenProgram' },
        systemProgram: { type: 'systemProgram' },
      },
      args: {
        makerAmount: u64,
        takerAmount: u64,
      },
      handler(ctx) {
        ctx.accounts.escrow.maker = ctx.accounts.maker;
        ctx.accounts.escrow.makerMint = ctx.accounts.mintA;
        ctx.accounts.escrow.takerMint = ctx.accounts.mintB;
        ctx.accounts.escrow.makerAmount = ctx.args.makerAmount;
        ctx.accounts.escrow.takerAmount = ctx.args.takerAmount;
        // Transfer tokens to escrow (via CPI)
        transferTokens(ctx.accounts.makerAta, ctx.accounts.escrow, ctx.args.makerAmount);
      },
    },

    take: {
      accounts: {
        escrow: { writable: true },
        taker: { signer: true, writable: true },
        takerAta: { writable: true },
        makerAta: { writable: true },
        escrowAta: { writable: true },
        mintA: {},
        mintB: {},
        tokenProgram: { type: 'tokenProgram' },
      },
      args: {},
      handler(ctx) {
        require(ctx.accounts.escrow.takerMint.equals(ctx.accounts.mintB));
        // Taker sends their tokens to maker
        transferTokens(ctx.accounts.takerAta, ctx.accounts.makerAta, ctx.accounts.escrow.takerAmount);
        // Escrow sends maker's tokens to taker
        transferTokens(ctx.accounts.escrowAta, ctx.accounts.takerAta, ctx.accounts.escrow.makerAmount);
        // Close escrow
        close(ctx.accounts.escrow, ctx.accounts.escrow.maker);
      },
    },

    refund: {
      accounts: {
        escrow: { writable: true },
        maker: { signer: true, writable: true },
        escrowAta: { writable: true },
        makerAta: { writable: true },
        tokenProgram: { type: 'tokenProgram' },
      },
      args: {},
      handler(ctx) {
        require(ctx.accounts.escrow.maker.equals(ctx.accounts.maker));
        // Return tokens to maker
        transferTokens(ctx.accounts.escrowAta, ctx.accounts.makerAta, ctx.accounts.escrow.makerAmount);
        // Close escrow
        close(ctx.accounts.escrow, ctx.accounts.maker);
      },
    },
  },
});
```

---

## Pillar 2: Client Framework

### The Problem
Even with @solana/kit, building a client app requires stitching together 10+ libraries with no unified experience.

### The Solution: Declarative Config + Recipes + React

```typescript
// solana.config.ts
import { createApp } from '@solana-framework/core';
import { token, payments, identity } from '@solana-framework/plugins';
import { counterProgram } from './programs/counter';

export const app = createApp({
  // Network configuration
  network: {
    cluster: 'devnet',
    rpc: process.env.SOLANA_RPC_URL!,
    ws: process.env.SOLANA_WS_URL!,
  },

  // Programs (from Pillar 1 definitions or from existing on-chain programs)
  programs: {
    counter: counterProgram,                    // Our custom program
    system: { idl: '@solana-program/system' },  // Existing program via package
    token: { idl: '@solana-program/token' },    // Token program
  },

  // Transaction recipes (reusable, composable)
  recipes: {
    // Simple recipe: single transaction
    incrementCounter: (ctx) =>
      ctx.programs.counter.increment({
        counter: ctx.input.counterAddress,
        authority: ctx.wallet,
        amount: ctx.input.amount,
      }),

    // Complex recipe: multi-step, multi-transaction
    launchTokenAndAirdrop: (ctx) => ctx.steps({
      // Step 1: Create the mint
      createMint: () => ctx.programs.token.createMint({
        decimals: ctx.input.decimals,
        authority: ctx.wallet,
      }),

      // Step 2: Create metadata (parallel with step 3)
      createMetadata: () => ctx.programs.metadata.create({
        mint: ctx.steps.createMint.mint,
        name: ctx.input.name,
        symbol: ctx.input.symbol,
        uri: ctx.input.metadataUri,
      }),

      // Step 3: Mint supply and distribute (parallel per recipient)
      distribute: () => ctx.parallel(
        ctx.input.recipients.map(recipient =>
          ctx.series([
            ctx.programs.token.createAssociatedTokenAccount({
              mint: ctx.steps.createMint.mint,
              owner: recipient,
            }),
            ctx.programs.token.mintTo({
              mint: ctx.steps.createMint.mint,
              destination: recipient,
              amount: ctx.input.amountPerRecipient,
            }),
          ])
        )
      ),
    })),
  },

  // Plugins (complete features, not plumbing)
  plugins: [
    token(),        // Full token management
    payments(),     // Accept SOL/SPL payments
    identity(),     // On-chain identity profiles
  ],
});
```

### React Integration

```tsx
// app/layout.tsx
import { SolanaProvider } from '@solana-framework/react';
import { app } from '../solana.config';

export default function RootLayout({ children }) {
  return (
    <SolanaProvider app={app}>
      {children}
    </SolanaProvider>
  );
}
```

```tsx
// app/counter/page.tsx
import { useRecipe, useWallet, useAccount } from '@solana-framework/react';
import { SolanaError } from '@solana-framework/react';
import { app } from '../../solana.config';

function CounterDashboard() {
  const { connected, connect, publicKey } = useWallet();
  const counterAddress = deriveCounterAddress(publicKey);

  // Reactive account subscription via WebSocket
  const { data: counter, loading } = useAccount(
    app.programs.counter.accounts.counter,
    counterAddress
  );

  // Transaction execution with loading/error/success states
  const increment = useRecipe(app.recipes.incrementCounter);

  if (!connected) return <button onClick={connect}>Connect Wallet</button>;
  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Counter: {counter?.count.toString() ?? '0'}</h1>
      <button
        onClick={() => increment.execute({
          counterAddress,
          amount: 1n,
        })}
        disabled={increment.loading}
      >
        {increment.loading ? 'Incrementing...' : 'Increment'}
      </button>

      {/* Human-readable error with fix suggestions */}
      <SolanaError error={increment.error} />
    </div>
  );
}
```

---

## Pillar 3: Plugin Ecosystem

### How Better Auth Plugins Work (The Model)

Better Auth plugins are **complete features**. Each plugin:
- Adds **database tables** (schema)
- Adds **API endpoints** (routes)
- Adds **hooks** (lifecycle interception)
- Adds **client methods** (frontend actions)
- Extends **types end-to-end** ($Infer)

### How Our Plugins Work

Each plugin is a **complete Solana feature**. A plugin provides:
- **On-chain**: Program definitions or references to existing programs
- **Client**: Typed instruction builders + account fetchers
- **Recipes**: Pre-built transaction recipes for common operations
- **React**: Hooks and optional UI components
- **Testing**: Test utilities and fixtures

### Plugin: `token()`

```typescript
import { token } from '@solana-framework/plugins';

// In config:
plugins: [
  token({
    defaultDecimals: 9,
    supportToken2022: true,
  }),
],

// What you get:
app.token.createMint({ decimals: 9, authority: wallet });
app.token.mintTo({ mint, destination, amount: 1000n });
app.token.transfer({ source, destination, amount: 100n, owner: wallet });
app.token.burn({ mint, account, amount: 50n, owner: wallet });
app.token.getBalance(tokenAccount);
app.token.getTokenAccountsByOwner(owner);

// React hooks:
const { data: balance } = useTokenBalance(mint, owner);
const { data: tokenAccounts } = useTokenAccounts(owner);
const createMint = useTokenCreateMint();
const transfer = useTokenTransfer();
```

### Plugin: `nft()`

```typescript
import { nft } from '@solana-framework/plugins';

plugins: [
  nft({
    supportCompressed: true,  // State compression via Bubblegum
    supportToken2022: true,
  }),
],

// What you get:
app.nft.mint({ name, symbol, uri, collection? });
app.nft.createCollection({ name, symbol, uri });
app.nft.addToCollection({ mint, collection });
app.nft.transfer({ mint, to });
app.nft.burn({ mint });
app.nft.getMetadata(mint);
app.nft.getNFTsByOwner(owner);

// Compressed NFT support
app.nft.mintCompressed({ name, symbol, uri, tree, leafOwner });
app.nft.transferCompressed({ assetId, leafOwner, newLeafOwner });

// React hooks:
const { data: nfts } = useNFTs(owner);
const { data: metadata } = useNFTMetadata(mint);
const mintNFT = useMintNFT();
```

### Plugin: `payments()`

```typescript
import { payments } from '@solana-framework/plugins';

plugins: [
  payments({
    merchantWallet: 'YOUR_WALLET_ADDRESS',
    acceptedTokens: ['SOL', 'USDC', 'USDT'],
    supportQRCodes: true,
  }),
],

// What you get:
app.payments.createPaymentUrl({ amount, token, reference? });
app.payments.generateQR({ amount, token });
app.payments.verifyPayment({ reference, expectedAmount });
app.payments.createTransfer({ recipient, amount, splToken?, memo? });

// React hooks:
const PaymentButton = usePaymentButton({
  amount: 10.00,
  token: 'USDC',
  onSuccess: (sig) => console.log('Paid!', sig),
});

// Drop-in component:
<PaymentButton amount={10} token="USDC" onSuccess={handleSuccess} />
```

### Plugin: `governance()`

```typescript
import { governance } from '@solana-framework/plugins';

plugins: [
  governance({
    proposalQuorum: 0.1,   // 10% of tokens must vote
    proposalThreshold: 0.51, // 51% to pass
    votingPeriod: 7 * 24 * 3600, // 7 days in seconds
  }),
],

// What you get:
app.governance.createProposal({ title, description, instructions });
app.governance.vote({ proposal, side: 'for' | 'against' });
app.governance.executeProposal({ proposal });
app.governance.getProposals({ status? });
app.governance.getVoteRecord({ proposal, voter });

// React hooks:
const { data: proposals } = useProposals({ status: 'active' });
const { data: votingPower } = useVotingPower(mint, wallet);
const createProposal = useCreateProposal();
const vote = useVote();
```

### Plugin: `escrow()`

```typescript
import { escrow } from '@solana-framework/plugins';

plugins: [
  escrow({
    programId: 'YOUR_ESCROW_PROGRAM',
  }),
],

// What you get:
app.escrow.make({ makerMint, takerMint, makerAmount, takerAmount });
app.escrow.take({ escrow });
app.escrow.refund({ escrow });
app.escrow.getEscrows({ maker? });
app.escrow.getEscrowByAddress(address);

// React hooks:
const { data: escrows } = useEscrows({ maker: wallet });
const makeEscrow = useMakeEscrow();
```

### Plugin: `multisig()`

```typescript
import { multisig } from '@solana-framework/plugins';

plugins: [
  multisig({
    threshold: 2,    // Require 2 signatures
    maxSigners: 10,
  }),
],

app.multisig.createWallet({ owners, threshold });
app.multisig.proposeTransaction({ wallet, instructions });
app.multisig.approveTransaction({ wallet, transactionIndex });
app.multisig.executeTransaction({ wallet, transactionIndex });

// React hooks:
const { data: wallets } = useMultisigWallets(owner);
const { data: pendingTxs } = usePendingTransactions(wallet);
```

### Plugin: `identity()`

```typescript
import { identity } from '@solana-framework/plugins';

plugins: [
  identity({
    supportVerifiableCredentials: true,
  }),
],

app.identity.createProfile({ name, avatar, bio });
app.identity.updateProfile({ name?, avatar?, bio? });
app.identity.getProfile(address);
app.identity.resolveHandle(handle);

// React hooks:
const { data: profile } = useIdentity(address);
const { data: myProfile } = useMyIdentity();
const updateProfile = useUpdateProfile();
```

### Plugin: `staking()`

```typescript
import { staking } from '@solana-framework/plugins';

plugins: [
  staking({
    rewardMint: 'REWARD_TOKEN_MINT',
    rewardRatePerSecond: 100n,
    lockupPeriod: 30 * 24 * 3600, // 30 days
  }),
],

app.staking.stake({ amount });
app.staking.unstake({ amount });
app.staking.claimRewards();
app.staking.getPosition(staker);
app.staking.getTotalStaked();

// React hooks:
const { data: position } = useStakingPosition(wallet);
const { data: rewards } = usePendingRewards(wallet);
```

### How to Write a Custom Plugin

```typescript
import { definePlugin } from '@solana-framework/core';

export function myFeature(options: { param: string }) {
  return definePlugin({
    id: 'myFeature',

    // On-chain program (optional — can reference existing program)
    program: myFeatureProgram, // from defineProgram()

    // Schema extensions (like Better Auth's schema)
    schema: {
      accounts: {
        myData: { /* ... */ },
      },
    },

    // Recipes this plugin provides
    recipes: {
      doSomething: (ctx) => ctx.programs.myFeature.doSomething({
        account: ctx.input.account,
        authority: ctx.wallet,
        param: ctx.input.param,
      }),
    },

    // React hooks (optional)
    hooks: {
      useMyData: (address) => useAccount(myFeatureProgram.accounts.myData, address),
      useDoSomething: () => useRecipe(/* ... */),
    },

    // Plugin dependencies (validated at startup)
    dependencies: ['token'], // Requires token plugin

    // Type extensions (like Better Auth's $Infer)
    $Infer: {
      MyData: {} as MyDataType,
    },
  });
}
```

---

## The Unified Development Flow

### 1. Define your program
```bash
npx solana-framework program:create counter
# Creates programs/counter.ts with scaffold
```

### 2. Build & generate
```bash
npx solana-framework build
# Generates:
#   programs/counter/src/lib.rs      (Anchor Rust)
#   clients/counter/index.ts         (TypeScript client)
#   target/idl/counter.json          (IDL)
#   tests/generated/counter.test.ts  (Test scaffold)
```

### 3. Test in TypeScript
```bash
npx solana-framework test
# Uses LiteSVM for instant in-process testing
# No validator startup needed
```

### 4. Deploy
```bash
npx solana-framework deploy --network devnet
# Compiles Rust, deploys program, verifies deployment
```

### 5. Build the client app
```typescript
// solana.config.ts — single file defines everything
import { createApp } from '@solana-framework/core';
import { token, payments } from '@solana-framework/plugins';
import { counterProgram } from './programs/counter';

export const app = createApp({
  network: { cluster: 'devnet' },
  programs: { counter: counterProgram },
  recipes: { /* ... */ },
  plugins: [token(), payments()],
});
```

### 6. Build the frontend
```tsx
import { SolanaProvider, useRecipe, useWallet } from '@solana-framework/react';
import { app } from './solana.config';
// ... React components using hooks
```

### 7. Ship
```bash
npx solana-framework build:web
# Optimized, tree-shaken bundle
```

---

## Package Structure

```
@solana-framework/core              # createApp(), recipes, plugin system
@solana-framework/program           # defineProgram(), type system, Rust codegen
@solana-framework/codecs            # Auto-generated codecs from program definitions
@solana-framework/react             # SolanaProvider, hooks
@solana-framework/testing           # useForge(), LiteSVM integration
@solana-framework/errors            # Human-readable error decoder
@solana-framework/cli               # CLI: program:create, build, test, deploy

# Official Plugins (each is a complete feature)
@solana-framework/plugin-token       # Token creation, minting, transfers, burning
@solana-framework/plugin-nft         # NFT lifecycle, metadata, collections, compression
@solana-framework/plugin-payments    # Solana Pay, QR codes, payment verification
@solana-framework/plugin-governance  # Proposals, voting, execution
@solana-framework/plugin-escrow      # Atomic escrow, swaps
@solana-framework/plugin-multisig    # Multi-signature wallets
@solana-framework/plugin-identity    # On-chain profiles, verifiable credentials
@solana-framework/plugin-staking     # Staking, rewards, lockup
@solana-framework/plugin-compression # State compression, compressed NFTs
```

---

## Why This Wins a Hackathon

### Track: Crypto Infrastructure ($25k) + Public Goods ($5k)

| Judging Criteria | How We Score |
|---|---|
| **Innovation** | First TypeScript-first program definition system + first Solana framework with real plugins |
| **Impact** | Benefits every Solana developer — from program writing to frontend |
| **Technical Complexity** | Program codegen, IDL parsing, plugin type propagation, LiteSVM integration, React hooks |
| **Demo-ability** | "Watch me define a program, test it, deploy it, and build a UI — all in 5 minutes, all in TypeScript" |
| **Ecosystem Growth** | Makes Solana accessible to the millions of TypeScript developers who don't know Rust |
| **Feasibility** | MVP focuses on core + 2-3 plugins. Program SDK starts with a subset of types |

### The Killer Demo

**5-minute live demo building a token launchpad:**

1. `npx solana-framework program:create token_sale` → Scaffold
2. Define the program in TypeScript (accounts: Sale, instructions: initialize, buy, close)
3. `npx solana-framework test` → Tests pass in milliseconds (LiteSVM)
4. `npx solana-framework deploy --network devnet` → Deployed
5. Build the frontend: 15 lines of React with `useRecipe`, `useAccount`, `useWallet`
6. Open browser → Connect wallet → Buy tokens → See balance update in real-time

**This is the "5 minutes from idea to production" story. Nobody else can tell it.**

---

## MVP Scope (4 Weeks)

### Week 1: Program SDK
- [ ] `defineProgram()` with type system (u8-u128, bool, publicKey, string, option, vec, struct, enum)
- [ ] Account schema parser and space calculator
- [ ] Anchor Rust code generator
- [ ] TypeScript codec generator
- [ ] IDL generator (Anchor format)
- [ ] `require()` constraint → Anchor constraint codegen

### Week 2: Core Framework + Testing
- [ ] `createApp()` with declarative config
- [ ] Plugin system with dependency validation and type propagation
- [ ] Transaction recipe builder with auto-splitting
- [ ] Auto transaction lifecycle (blockhash, fee payer, signing)
- [ ] `useForge()` with LiteSVM integration
- [ ] Error decoder with human-readable messages

### Week 3: React + Plugins
- [ ] `SolanaProvider` component
- [ ] `useWallet()`, `useAccount()`, `useRecipe()` hooks
- [ ] `token()` plugin (create mint, mintTo, transfer, getBalance)
- [ ] `payments()` plugin (Solana Pay integration, QR codes)
- [ ] `nft()` plugin (mint, metadata, collections)

### Week 4: CLI + Demo
- [ ] CLI: `program:create`, `build`, `test`, `deploy`
- [ ] Token launchpad demo app
- [ ] Documentation
- [ ] Video walkthrough
