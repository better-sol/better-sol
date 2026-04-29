# Syntax Redesign — The Final API

## What Changed (Old → New)

### 1. Accounts: Extracted and Flat

**Before** (nested inside `program()`):
```typescript
export const amm = program('amm', '...', {
  accounts: {
    config: {
      seeds: ['config'],
      fields: { admin: pubkey, totalPools: u64, feeBps: u64, bump: u8 },
    },
    pool: { ... },
  },
  instructions: { ... },
})
```

**After** (standalone, like Zod schemas):
```typescript
const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
}).seeds('config')

const Pool = account({
  tokenAMint: pubkey,
  // ...
}).seeds('pool', '{tokenAMint}', '{tokenBMint}')
```

Why this is better:
- **Separate from program** — accounts can be imported, reused, composed
- **Flat fields** — no `fields: { ... }` wrapper
- **Chainable seeds** — `.seeds()` reads like a constraint on the account
- **Like Zod** — `z.object({...})` becomes `account({...})`
- **Like Drizzle** — `pgTable('name', {...})` becomes `account({...})`

### 2. Account Constraints: Chaining, Not Arrays

**Before** (opaque arrays):
```typescript
accounts: {
  config: [pda, writable],        // What does this mean?
  authority: [signer, writable],  // Order matters?
  tokenProgram: [tokenProgram],   // Redundant naming
}
```

**After** (fluent chaining):
```typescript
accounts: {
  config: p.init(Config),              // init = create PDA + pay for it
  pool: p.mut(Pool),                   // mut = writable reference
  tokenAReserve: p.tokenAccount('tokenAMint').mut(),  // token account + writable
  trader: p.signer(),                  // must sign the transaction
  tokenProgram: p.tokenProgram(),      // built-in program reference
}
```

Why this is better:
- **Readable** — `p.init(Config)` reads as "initialize a Config account"
- **Discoverable** — type `p.` and autocomplete shows all options
- **Chainable** — `.mut()` for writable, `.init()` for creation, `.close()` for closing
- **No arrays** — every constraint is a named method, not a positional value
- **Type-safe** — `p.init(Config)` ensures the account type matches

### 3. Instructions: ix() instead of nested objects

**Before** (deeply nested, `logic` key):
```typescript
instructions: {
  swapAForB: {
    accounts: {
      pool: [writable],
      // ...
    },
    args: { amountIn: u64, minimumAmountOut: u64 },
    logic: ({ pool, trader }, { amountIn, minimumAmountOut }) => {
      // ...
    },
  },
}
```

**After** (flat, `run` key):
```typescript
swapAForB: ix({
  accounts: {
    pool: p.mut(Pool),
    // ...
  },
  args: { amountIn: u64, minOut: u64 },
  run: ({ pool, trader }, { amountIn, minOut }) => {
    // ...
  },
}),
```

Why this is better:
- **3 keys, not 4** — `accounts`, `args`, `run` (dropped the `logic` → `run` rename)
- **`run` not `logic`** — shorter, clearer, reads like "this is what runs on-chain"
- **`ix()` wrapper** — makes it visually distinct from account definitions
- **`minOut` not `minimumAmountOut`** — shorter args for the common case

### 4. Token Account References: Field Name Strings

**Before** (awkward field references):
```typescript
tokenAReserve: [tokenAccount(tokenAMint), writable],
// Where does tokenAMint come from? It's a reference to Pool.tokenAMint
```

**After** (string references to account fields):
```typescript
tokenAReserve: p.tokenAccount('tokenAMint').mut(),
// 'tokenAMint' is the field on Pool that specifies the mint
```

The string `'tokenAMint'` references a field on the account that defines
which mint this token account holds. The transpiler resolves it to the
correct Anchor constraint: `#[account(constraint = token_a_reserve.mint == pool.token_a_mint)]`

### 5. Program: Flat Map

**Before** (everything nested):
```typescript
export const amm = program('amm', '...', {
  accounts: { ... },
  instructions: { ... },
  errors: { ... },
  events: { ... },
})
```

**After** (accounts extracted, instructions flat):
```typescript
const Config = account({...}).seeds('config')
const Pool = account({...}).seeds('pool', ...)

export const amm = program('amm', '...', {
  initializeConfig: ix({ ... }),
  createPool: ix({ ... }),
  swapAForB: ix({ ... }),
  // ... flat instruction map
})
```

Accounts are defined OUTSIDE the program. Instructions are the TOP level of the program.
No more `instructions: { ... }` nesting. The program IS its instruction map.

---

## The Complete Syntax (Full AMM Example)

```typescript
import {
  program, account, ix,
  u64, u8, bool, pubkey,
  p, token, sol, emit, require,
} from '@solana-kit/program'

// ══ Accounts (like Zod schemas) ══════════════════════

const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
}).seeds('config')

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  tokenAReserve: pubkey,
  tokenBReserve: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  createdAt: u64,
  admin: pubkey,
  isActive: bool,
  totalVolumeA: u64,
  totalVolumeB: u64,
  bump: u8,
}).seeds('pool', '{tokenAMint}', '{tokenBMint}')

// ══ Program (flat instruction map) ══════════════════

export const amm = program('amm', 'AMMxPooL...', {

  initializeConfig: ix({
    accounts: {
      config: p.init(Config),
      admin: p.signer(),
    },
    run: ({ config, admin }) => {
      config.admin = admin
      config.totalPools = 0n
      config.feeBps = 30n
    },
  }),

  createPool: ix({
    accounts: {
      config: Config,
      pool: p.init(Pool),
      tokenAMint: p.mint(),
      tokenBMint: p.mint(),
      creator: p.signer(),
    },
    args: { feeBps: u64 },
    run: ({ config, pool, tokenAMint, tokenBMint, creator }, { feeBps }) => {
      require(creator === config.admin, 'Unauthorized')
      require(feeBps <= 1000n, 'InvalidFeeBps')
      pool.tokenAMint = tokenAMint
      pool.tokenBMint = tokenBMint
      pool.lpSupply = 0n
      pool.feeBps = feeBps
      pool.createdAt = sol.timestamp()
      pool.admin = creator
      pool.isActive = true
      pool.totalVolumeA = 0n
      pool.totalVolumeB = 0n
      config.totalPools += 1n
      emit('PoolCreated', { pool, tokenA: tokenAMint, tokenB: tokenBMint })
    },
  }),

  swapAForB: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount('tokenAMint').mut(),
      tokenBReserve: p.tokenAccount('tokenBMint').mut(),
      traderTokenA: p.tokenAccount('tokenAMint').mut(),
      traderTokenB: p.tokenAccount('tokenBMint').mut(),
      trader: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { amountIn: u64, minOut: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, traderTokenA, traderTokenB, trader }, { amountIn, minOut }) => {
      require(pool.isActive, 'PoolDoesNotExist')
      require(amountIn > 0n, 'InvalidAmount')

      const fee = (amountIn * pool.feeBps) / 10000n
      const netIn = amountIn - fee
      const amountOut = (netIn * tokenBReserve.amount) / (tokenAReserve.amount + netIn)
      require(amountOut >= minOut, 'SlippageExceeded')

      token.transfer({ from: traderTokenA, to: tokenAReserve, authority: trader, amount: amountIn })
      token.transfer({ from: tokenBReserve, to: traderTokenB, authority: pool, amount: amountOut })

      pool.totalVolumeA += amountIn
      pool.totalVolumeB += amountOut
      emit('SwapExecuted', { pool, amountIn, amountOut, fee, direction: 0 })
    },
  }),

  updateFee: ix({
    accounts: {
      pool: p.mut(Pool),
      admin: p.signer(),
    },
    args: { newFeeBps: u64 },
    run: ({ pool, admin }, { newFeeBps }) => {
      require(admin === pool.admin, 'Unauthorized')
      require(newFeeBps <= 1000n, 'InvalidFeeBps')
      pool.feeBps = newFeeBps
      emit('FeeUpdated', { pool, newFeeBps })
    },
  }),
})
```

---

## The p.* Constraint API (Autocomplete-Friendly)

| Expression | Anchor Equivalent | Meaning |
|---|---|---|
| `p.init(Config)` | `#[account(init, payer = .., space = .., seeds = ..)]` | Create a new PDA |
| `p.mut(Config)` | `#[account(mut, seeds = ..)]` | Writable reference to existing PDA |
| `Config` (bare) | `#[account(seeds = ..)]` | Read-only reference to PDA |
| `p.signer()` | `#[account(mut)]` + `Signer<'info>` | Transaction signer |
| `p.mint()` | `Account<'info, Mint>` | SPL token mint |
| `p.mint().mut()` | `Account<'info, Mint>` + mut | Mutable mint reference |
| `p.tokenAccount('field')` | `Account<'info, TokenAccount>` + constraint | Token account for a specific mint |
| `p.tokenAccount('field').mut()` | Same + mutable | Writable token account |
| `p.tokenProgram()` | `Program<'info, Token>` | Token program reference |
| `p.systemProgram()` | `Program<'info, System>` | System program reference |
| `p.close(Config, 'recipient')` | `#[account(close = recipient)]` | Close account, return rent |
| `p.clock()` | `Sysvar<'info, Clock>` | Clock sysvar |

The `p.*` namespace is the developer's constraint toolbox. Type `p.` and autocomplete
shows every available constraint with documentation.

---

## Type Safety — How It Works

### Account Types Flow Into Instructions

```typescript
const Config = account({
  admin: pubkey,    // string
  totalPools: u64,  // bigint
  feeBps: u64,      // bigint
})

// When used in an instruction:
run: ({ config }) => {
  config.admin       // TypeScript knows: string (pubkey)
  config.totalPools  // TypeScript knows: bigint (u64)
  config.feeBps      // TypeScript knows: bigint (u64)

  config.totalPools = "hello"  // ❌ Type error! string is not bigint
  config.totalPools = 42n      // ✅ Correct
}
```

### Instruction Args Are Typed

```typescript
args: { amountIn: u64, minOut: u64 }

run: ({ ... }, { amountIn, minOut }) => {
  amountIn  // TypeScript knows: bigint
  minOut    // TypeScript knows: bigint

  amountIn + "hello"  // ❌ Type error!
  amountIn + minOut   // ✅ bigint + bigint = bigint
}
```

### Token Accounts Have Standard Fields

```typescript
run: ({ tokenAReserve, trader }) => {
  tokenAReserve.amount    // bigint — the token balance
  tokenAReserve.owner     // string — the pubkey of the owner
  tokenAReserve.mint      // string — the pubkey of the mint
  tokenAReserve.decimals  // number — mint decimals
}
```

### CPI Functions Are Typed

```typescript
token.transfer({
  from: traderTokenA,      // must be a token account
  to: tokenAReserve,       // must be a token account
  authority: trader,        // must be a signer or PDA account
  amount: amountIn,         // must be bigint
})

token.mintTo({
  mint: lpMint,            // must be a mint
  to: depositorLp,         // must be a token account
  authority: pool,          // must be a PDA account (for signing)
  amount: lpTokens,        // must be bigint
})
```

### PDA Detection Is Automatic

When `authority` in a CPI call matches a PDA account (detected from `.seeds()`),
the transpiler automatically generates `CpiContext::new_with_signer` instead of
`CpiContext::new`. No manual annotation needed.

---

## Client SDK (Same Definition, Zero Extra Code)

```typescript
import { createClient } from '@solana-kit/sdk'
import { amm } from './programs/amm'  // Same file as the program definition

const client = createClient({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { amm },
})

// PDA derivation — from seed definitions
const configAddr = amm.accounts.Config.derive()
const poolAddr = amm.accounts.Pool.derive({
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
})

// Typed instruction calls
await client.amm.createPool({
  config: configAddr,
  pool: poolAddr,
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
  feeBps: 30n,
})

await client.amm.swapAForB({
  pool: poolAddr,
  amountIn: 1_000_000_000n,
  minOut: 90_000_000n,
})

// Typed account fetching
const pool = await client.amm.accounts.Pool.fetch(poolAddr)
console.log(pool.feeBps)        // bigint
console.log(pool.isActive)      // boolean
console.log(pool.totalVolumeA)  // bigint
```

---

## Side-by-Side: Old vs New

| Aspect | Old Syntax | New Syntax |
|---|---|---|
| Account nesting | `accounts: { counter: { seeds: [...], fields: {...} } }` | `const Counter = account({...}).seeds(...)` |
| Account constraints | `counter: [pda, writable]` | `counter: p.init(Counter)` / `p.mut(Counter)` |
| Instruction nesting | `instructions: { name: { accounts: {...}, logic: ... } }` | `name: ix({ accounts: {...}, run: ... })` |
| Program structure | `program('id', { accounts: {}, instructions: {} })` | `program('id', { instruction1: ix(...), ... })` |
| Token account refs | `tokenAccount(tokenAMint)` — where does it come from? | `p.tokenAccount('tokenAMint')` — field name string |
| Handler name | `logic:` | `run:` |
| Nesting depth | 4 levels | 2 levels |
| Accounts reusable? | No (trapped inside program()) | Yes (standalone const) |
| Autocomplete | Limited (arrays, nested objects) | Full (p.*, token.*, sol.*) |

---

## Line Count Comparison (Same AMM Program)

| Metric | Old Syntax | New Syntax |
|---|---|---|
| Total lines | 271 | 263 |
| Nesting levels (max) | 4 | 2 |
| Account definitions | Inside program() | Standalone |
| Constraint style | Arrays `[pda, writable]` | Chaining `p.init(Config)` |
| Lines for `swapAForB` handler | 28 | 25 |

The line count is similar, but the COGNITIVE LOAD is dramatically lower.
Every identifier is meaningful. Every nesting level has a purpose.
There are no "wrapper" objects that exist only for structure.
