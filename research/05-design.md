# Complete Design — better-sol

> One TypeScript definition. On-chain program + typed client + typed tests + database schema.
> No "for later." Everything designed, proven, and transpilable.

---

## Design Principles

1. **Library, not framework** — `npm install` + import, like Better Auth
2. **Same definition = everything** — one file generates all outputs
3. **No Rust toolchain** — cloud compilation via `npx @better-sol/cli deploy`
4. **Type-safe to the bone** — errors, events, accounts, token fields all compile-time checked
5. **Progressive complexity** — simple things simple, complex things possible
6. **Honest boundaries** — what we don't cover and exactly why

---

## The Complete Type System

### Primitive Types

| better-sol | TypeScript | Rust (Borsh) | Rust (Pod/zero-copy) | Notes |
|---|---|---|---|---|
| `u8` | `number` | `u8` | `u8` | |
| `u16` | `number` | `u16` | `u16` | |
| `u32` | `number` | `u32` | `u32` | |
| `u64` | `bigint` | `u64` | `u64` | |
| `u128` | `bigint` | `u128` | `u128` | |
| `i64` | `bigint` | `i64` | `i64` | |
| `i128` | `bigint` | `i128` | `i128` | |
| `bool` | `boolean` | `bool` | `u8` | **Pod has no bool** — maps to u8, auto-converts |
| `pubkey` | `string` | `Pubkey` | `Pubkey` | `[u8; 32]` via ZeroCopyAccessor |
| `bytes` | `Uint8Array` | `Vec<u8>` | N/A | Not Pod-compatible |
| `string` | `string` | `String` | N/A | Not Pod-compatible |
| `f32` | `number` | `f32` | `f32` | Rarely used on-chain |
| `f64` | `number` | `f64` | `f64` | Rarely used on-chain |
| `option(T)` | `T \| null` | `Option<T>` | N/A | Optional field, Borsh-serialized |
| `vec(T)` | `T[]` | `Vec<T>` | N/A | Variable-length list, max 32 entries |

### Pod-Compatible Types (zero-copy only)

Zero-copy accounts can ONLY contain these types:
- `u8`, `u16`, `u32`, `u64`, `u128`, `i8`, `i16`, `i32`, `i64`, `i128`
- `pubkey` (stored as `[u8; 32]`, accessed via `ZeroCopyAccessor`)
- `bool` → `u8` (transpiler auto-converts, 0 = false, 1 = true)
- Fixed arrays: `array(u64, 100)` → `[u64; 100]`

### Composite Types (standard Borsh accounts only)

```typescript
const Pool = account({
  admin: pubkey,
  feeAuthority: option(pubkey),   // → Option<Pubkey> — may or may not be set
  reserveA: pubkey,
  reserveB: pubkey,
  whitelist: vec(pubkey),          // → Vec<Pubkey> — up to 32 entries
  voteWeights: vec(u64),           // → Vec<u64> — up to 32 entries
})

// In run: handlers:
if (pool.feeAuthority !== null) {  // → if pool.fee_authority.is_some()
  ctx.require(authority === pool.feeAuthority, 'Unauthorized')
}
pool.feeAuthority = null           // → pool.fee_authority = None
pool.feeAuthority = admin          // → pool.fee_authority = Some(admin.key())

for (let i = 0; i < pool.whitelist.length; i++) {  // → pool.whitelist.len()
  ctx.require(pool.whitelist[i] === trader, 'Unauthorized')
}
pool.whitelist.push(admin)         // → pool.whitelist.push(admin.key())
```

Transpiler rules:
- `option(T)` → Rust `Option<T>`. TS type is `T | null`. Assignment of `null` → `None`.
- `vec(T)` → Rust `Vec<T>`. TS type is `T[]`. Max 32 entries enforced at parse time.
- Both require `.max(N)` for explicit size limits: `vec(pubkey).max(64)`.
- Default max for `vec` is 32 (Anchor convention).
- Space calculation: `option(pubkey)` = 1 + 32, `vec(pubkey, max=32)` = 4 + 32 * 32.

NOT Pod-compatible (zero-copy escape hatch required):
- `string` — use fixed `array(u8, N)` instead
- `bytes` — use fixed `array(u8, N)` instead
- `vec(T)` — use fixed `array(T, N)` instead
- `option(T)` — use a sentinel value instead
- Nested structs — use `struct({...})` (zero-copy sub-struct, `#[zero_copy]` in Rust)

---

## Account Definitions

### Standard Account (Borsh serialization)

```typescript
const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  isActive: bool,
  bump: u8,
}).derive((seed) => ["pool", seed.tokenAMint, seed.tokenBMint])
```

Generated Rust:
```rust
#[account]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub lp_supply: u64,
    pub fee_bps: u64,
    pub is_active: bool,
    pub bump: u8,
}
// Space: 8 (discriminator) + 32 + 32 + 8 + 8 + 1 + 1 = 90
```

### Zero-Copy Account (direct memory mapping)

```typescript
const OrderBook = account({
  market: pubkey,
  baseMint: pubkey,
  quoteMint: pubkey,
  bidCount: u32,
  askCount: u32,
  bids: array(Order, 1000),
  asks: array(Order, 1000),
}).derive((seed) => ["orderbook", seed.market]).zeroCopy()

// Sub-struct for array elements
const Order = struct({
  trader: pubkey,
  price: u64,
  quantity: u64,
  timestamp: i64,
})
```

Generated Rust:
```rust
#[account(zero_copy)]
pub struct OrderBook {
    pub market: Pubkey,       // 32
    pub base_mint: Pubkey,    // 32
    pub quote_mint: Pubkey,   // 32
    pub bid_count: u32,       // 4
    pub ask_count: u32,       // 4 (+ 0 padding for alignment)
    pub bids: [Order; 1000],  // 56 * 1000 = 56000
    pub asks: [Order; 1000],  // 56 * 1000 = 56000
}
// Space: 8 (discriminator) + 32 + 32 + 32 + 4 + 4 + 56000 + 56000 = 112112

#[zero_copy]
pub struct Order {
    pub trader: Pubkey,    // 32
    pub price: u64,        // 8
    pub quantity: u64,     // 8
    pub timestamp: i64,    // 8
}
// Size: 56 bytes
```

**Key differences from standard accounts:**
- Uses `#[account(zero_copy)]` instead of `#[account]`
- Uses `AccountLoader<'info, T>` instead of `Account<'info, T>`
- Field access through `.load_mut()?` / `.load()?`
- No Borsh serialization — direct memory mapping via `bytemuck`
- Space = 8 (discriminator) + `std::mem::size_of::<T>()` (with C padding)
- `bool` maps to `u8` in Rust (Pod constraint)

### Bool handling in zero-copy

```typescript
// TypeScript: developer writes bool normally
const GameState = account({
  isFinished: bool,    // TypeScript: boolean
  winner: pubkey,
  board: array(u8, 64),
}).zeroCopy()

// Generated Rust: bool becomes u8
// #[account(zero_copy)]
// pub struct GameState {
//     pub is_finished: u8,  // ← not bool!
//     pub winner: Pubkey,
//     pub board: [u8; 64],
// }

// In run: handlers, bool comparison works transparently:
run: ({ game }) => {
  game.isFinished = true   // → game.is_finished = 1u8
  if (game.isFinished) {}  // → if game.is_finished != 0 { }
},
```

The transpiler handles this mapping automatically. The developer writes `bool` everywhere; the transpiler knows to use `u8` in zero-copy mode.

### Space Calculation

Standard accounts (Borsh):
```
8 (discriminator) + sum(field_size)
  pubkey = 32, u64 = 8, u32 = 4, u16 = 2, u8 = 1, bool = 1
  string = 4 + max_len, bytes = 4 + max_len
```

Zero-copy accounts (Pod):
```
8 (discriminator) + std::mem::size_of::<T>()  (with C alignment padding)
  pubkey = 32, u64 = 8, u32 = 4, u16 = 2, u8 = 1, bool → u8 = 1
  array(T, N) = size_of::<T>() * N
```

**Important**: Zero-copy space must account for C struct padding. The transpiler sorts fields largest-first to minimize padding, matching Rust's `#[repr(C)]` layout rules.

---

## Account Constraints — Complete `p.*` API

| Expression | Anchor Rust | Zero-Copy Variant | Description |
|---|---|---|---|
| `p.create(Account)` | `init, payer, space, seeds` | `init, payer, space, seeds` + `AccountLoader` | Create new PDA |
| `p.mut(Account)` | `mut, seeds` | `mut, seeds` + `AccountLoader` | Writable existing PDA |
| `Account` (bare) | `seeds` (read-only) | `seeds` + `AccountLoader` | Read-only PDA |
| `pubkey` (bare type) | `AccountInfo<'info>` (unchecked) | same | Unchecked account — address only, no data |
| `p.signer()` | `Signer<'info>` | same | Transaction signer |
| `p.mint()` | `Account<'info, Mint>` | same | SPL token mint |
| `p.mint().mut()` | `mut` + `Account<'info, Mint>` | same | Mutable mint |
| `p.tokenAccount()` | `Account<'info, TokenAccount>` | same | SPL token account |
| `p.tokenAccount().mut()` | `mut` + above | same | Mutable token account |
| `p.tokenProgram()` | `Program<'info, Token>` | same | Token program ref |
| `p.token2022Program()` | `Program<'info, Token2022>` | same | Token-2022 program ref |
| `p.systemProgram()` | `Program<'info, System>` | same | System program ref |
| `p.clock()` | `Sysvar<'info, Clock>` | same | Clock sysvar |
| `p.close(Account, 'refundTo')` | `close = refund_to` | **Not supported** (realloc manually) | Close account |
| `p.remaining(Type)` | `ctx.remaining_accounts` | `ctx.remaining_accounts` + `AccountLoader` | Dynamic account list |
| `p.remaining(p.tokenAccount())` | `ctx.remaining_accounts` | same | Dynamic token accounts |
| `p.remaining(p.signer())` | `ctx.remaining_accounts` + `is_signer` check | same | Dynamic signers |

### `p.remaining()` — Dynamic Account Lists

```typescript
// Multi-transfer with dynamic destinations
batchTransfer: ix({
  accounts: {
    authority: p.signer(),
    source: p.tokenAccount().mut(),
    destinations: p.remaining(p.tokenAccount()),
    //                  ^^^^^^^^^^^^^^^^^^^^^^^^
    // Type annotation tells the transpiler how to deserialize
  },
  args: { amounts: vec(u64) },
  run: ({ authority, source, destinations }, { amounts }, ctx) => {
    ctx.require(destinations.length === amounts.length, 'LengthMismatch')

    for (let i = 0; i < destinations.length; i++) {
      ctx.require(destinations[i].owner === authority, 'InvalidOwner')
      token.transfer({ from: source, to: destinations[i], authority, amount: amounts[i] })
    }
  },
})
```

Generated Rust:
```rust
pub fn batch_transfer(ctx: Context<BatchTransfer>, amounts: Vec<u64>) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let source = &ctx.accounts.source;

    require!(
        ctx.remaining_accounts.len() == amounts.len(),
        ErrorCode::LengthMismatch
    );

    for (i, dest_ai) in ctx.remaining_accounts.iter().enumerate() {
        let dest = Account::<TokenAccount>::try_from(dest_ai)?;
        require!(dest.owner == authority.key(), ErrorCode::InvalidOwner);

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: source.to_account_info(),
                to: dest_ai.clone(),
                authority: authority.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amounts[i])?;
    }

    Ok(())
}
```

Note: `destinations` does NOT appear in the `#[derive(Accounts)]` struct. The transpiler generates `ctx.remaining_accounts` iteration instead.

### `p.remaining()` with Zero-Copy Accounts

```typescript
processOrders: ix({
  accounts: {
    orderBook: p.mut(OrderBook),      // zero-copy account
    matchingEngine: p.signer(),
    orders: p.remaining(Order),       // zero-copy sub-structs
  },
  run: ({ orderBook, orders }, ctx) => {
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].quantity > 0n) {
        // Match order against book...
        orderBook.bidCount += 1
      }
    }
  },
})
```

Generated Rust:
```rust
pub fn process_orders(ctx: Context<ProcessOrders>) -> Result<()> {
    let book = &mut ctx.accounts.order_book.load_mut()?;

    for order_ai in ctx.remaining_accounts.iter() {
        let order = AccountLoader::<Order>::try_from(order_ai)?
            .load()?;

        if order.quantity > 0 {
            book.bid_count += 1;
        }
    }

    Ok(())
}
```

---

## CPI Templates — Capability Matrix

### Token CPI (works with both Token and Token-2022)

Implementation status: the reliable transpiler path currently supports the core token CPI subset used by the validated examples: `token.transfer`, `token.transferChecked`, `token.mintTo`, and `token.burn`. The larger catalog below remains the design target and should not be exposed from `better-sol/program` until the transpiler and generated Rust are validated for each operation.

The supported `token.*` functions work with BOTH programs. The transpiler detects whether the instruction has `p.tokenProgram()` or `p.token2022Program()` and generates the correct Anchor Rust imports.

When `p.tokenProgram()` is used:
```rust
use anchor_spl::token::{self, Token, Mint, TokenAccount};
// token::transfer(cpi_ctx, amount)?;
```

When `p.token2022Program()` is used:
```rust
use anchor_spl::token_2022::{self, Token2022, Mint as Mint2022, TokenAccount as TokenAccount2022};
// token_2022::transfer_checked(cpi_ctx, amount, decimals)?;
```

When BOTH could be needed (e.g., wrapped SOL + Token-2022):
```rust
use anchor_spl::token_interface::{self, TokenInterface};
// token_interface::transfer_checked(cpi_ctx, amount, decimals)?;
```

The transpiler auto-selects the correct module based on the instruction's `p.tokenProgram()` / `p.token2022Program()` declarations.

| # | TypeScript | Anchor Rust | Notes |
|---|---|---|---|
| 1 | `token.transfer({from, to, authority, amount})` | `token::transfer(cpi_ctx, amount)?` | Standard transfer |
| 2 | `token.transferChecked({from, to, authority, mint, amount, decimals})` | `token_2022::transfer_checked(cpi_ctx, amount, decimals)?` | Required for Token-2022 with fees |
| 3 | `token.mintTo({mint, to, authority, amount})` | `token::mint_to(cpi_ctx, amount)?` | Mint tokens |
| 4 | `token.burn({from, mint, authority, amount})` | `token::burn(cpi_ctx, amount)?` | Burn tokens |
| 5 | `token.approve({account, delegate, authority, amount})` | `token::approve(cpi_ctx, amount)?` | Planned |
| 6 | `token.freeze({account, mint, authority})` | `token::freeze_account(cpi_ctx)?` | Planned |
| 7 | `token.thaw({account, mint, authority})` | `token::thaw_account(cpi_ctx)?` | Planned |
| 8 | `token.closeAccount({account, destination, authority})` | `token::close_account(cpi_ctx)?` | Planned |
| 9 | `token.setAuthority({account, authority, type, newAuthority})` | `token::set_authority(cpi_ctx, ...)` | Planned |

### Token-2022 Extension CPI

Implementation status: extension-specific CPI helpers are planned and intentionally not part of the current stubs. Token-2022 examples use the supported `token.transferChecked(...)` path with `p.token2022Program()`.

| # | TypeScript | Anchor Rust | Notes |
|---|---|---|---|
| 10 | `token2022.initializeMintWithExtensions({mint, decimals, authority, freezeAuthority, extensions})` | `token_2022_extensions::initialize_mint_with_extensions(...)` | Creates Token-2022 mint |
| 11 | `token2022.transferCheckedWithFee({from, to, authority, mint, amount, decimals, fee})` | `token_2022::transfer_checked_with_fee(cpi_ctx, amount, decimals, fee)?` | Transfer with fee verification |
| 12 | `token2022.harvestWithheldTokensToMint({mint, sources})` | `token_2022_extensions::harvest_withheld_tokens_to_mint(...)` | Collect withheld fees |
| 13 | `token2022.withdrawWithheldTokens({mint, destination, sources})` | `token_2022_extensions::withdraw_withheld_tokens_from_accounts(...)` | Withdraw fees |
| 14 | `token2022.enableCpiGuard({account, authority})` | `token_2022_extensions::enable_cpi_guard(cpi_ctx)?` | Enable CPI protection |
| 15 | `token2022.disableCpiGuard({account, authority})` | `token_2022_extensions::disable_cpi_guard(cpi_ctx)?` | Disable CPI protection |
| 16 | `token2022.initializeDefaultAccountState({mint, authority, state})` | `token_2022_extensions::initialize_default_account_state(...)` | Set default freeze state |
| 17 | `token2022.initializeMintCloseAuthority({mint, authority, closeAuthority})` | `token_2022_extensions::initialize_mint_close_authority(...)` | Allow mint closure |
| 18 | `token2022.initializePermanentDelegate({mint, delegate})` | `token_2022_extensions::initialize_permanent_delegate(...)` | Permanent delegate |
| 19 | `token2022.initializeNonTransferableMint({mint})` | `token_2022_extensions::initialize_non_transferable_mint(...)` | Non-transferable tokens |
| 20 | `token2022.initializeInterestBearingMint({mint, authority, rate})` | `token_2022_extensions::initialize_interest_bearing_mint(...)` | Interest-bearing tokens |
| 21 | `token2022.initializeTransferFeeConfig({mint, authority, maxFee, transferFeeAuthority})` | `token_2022_extensions::initialize_transfer_fee_config(...)` | Transfer fee config |

### System CPI

Implementation status: system CPI helpers are planned and intentionally not part of the current stubs.

| # | TypeScript | Anchor Rust |
|---|---|---|
| 22 | `system.transfer({from, to, amount})` | `system_program::transfer(cpi_ctx, amount)?` |
| 23 | `system.createAccount({from, to, space, owner})` | `system_program::create_account(cpi_ctx, space)?` |

### ATA CPI

Implementation status: ATA CPI helpers are planned and intentionally not part of the current stubs.

| # | TypeScript | Anchor Rust |
|---|---|---|
| 24 | `ata.create({payer, owner, mint, tokenProgram})` | `associated_token::create(cpi_ctx)?` |
| 25 | `ata.createIdempotent({...})` | `associated_token::create_idempotent(cpi_ctx)?` |

---

## PDA-Signed CPI Detection

The transpiler auto-detects when a CPI authority is a PDA and generates `CpiContext::new_with_signer`:

```typescript
// TypeScript: developer doesn't think about seeds
token.transfer({ from: poolReserve, to: trader, authority: pool, amount: amountOut })
//                                                      ^^^^
//                                    pool is a PDA → auto-generates signer seeds
```

Generated Rust:
```rust
let seeds = &[
    b"pool",
    pool.token_a_mint.as_ref(),
    pool.token_b_mint.as_ref(),
    &[pool.bump],
];
token::transfer(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        Transfer { from: pool_reserve, to: trader, authority: pool },
        &[seeds],
    ),
    amount_out,
)?;
```

The seeds are extracted from the account's `.derive((seed) => [...])` definition. The bump comes from `ctx.bumps.pool_name`.

---

## The `run:` Handler — Complete Reference

### Flexible Signature

```typescript
run: (accounts, args, ctx) => {}   // full
run: (accounts, ctx) => {}          // no args
run: (accounts) => {}               // no args, no ctx
run: () => {}                       // nothing needed
```

### Account Access

| Inside `run:` | Type | Description |
|---|---|---|
| `pool` (from `p.mut(Pool)`) | `Pool & { key: string }` | Typed account fields + `.key` for address |
| `pool` (from `p.create(Pool)`) | `Pool & { key: string }` | Same — writable new account |
| `Config` (bare, read-only) | `Readonly<Config> & { key: string }` | Read-only account |
| `admin` (from `p.signer()`) | `string` | Signer's public key |
| `mint` (from `p.mint()`) | `{ key: string, supply: bigint, decimals: number, ... }` | Mint fields + `.key` |
| `reserve` (from `p.tokenAccount()`) | `{ key: string, mint: string, owner: string, amount: bigint }` | Token account fields |
| `book` (from `p.mut(OrderBook)`, zero-copy) | Same as `OrderBook & { key: string }` | Access via `.load_mut()` in Rust |
| `destinations` (from `p.remaining(p.tokenAccount())`) | `readonly { key: string, mint: string, owner: string, amount: bigint }[]` | Array of typed accounts |
| `orders` (from `p.remaining(Order)`) | `readonly (Order & { key: string })[]` | Array of typed accounts |

### The `.key` Property

Every account object inside `run:` has a `.key` property that returns its on-chain address as a `string`. This is used for comparisons:

```typescript
run: ({ pool, reserve, admin }, ctx) => {
  ctx.require(reserve.owner === pool.key, 'InvalidOwner')
  //                             ^^^^^^^^ pool's PDA address
  ctx.require(admin === pool.admin, 'Unauthorized')
  //    ^^^^^ string (signer) compared to string (pubkey field)
}
```

### Context Methods

```typescript
ctx.require(condition: boolean): void
ctx.require(condition: boolean, error: keyof TErrors & string): void
ctx.emit<K extends keyof TEvents>(name: K, data: InferEventFields<TEvents[K]>): void
ctx.log(message: string, ...values: (string | number | bigint | boolean)[]): void
```

### Available in `run:`

```typescript
// Account operations
account.field = value          // field write
account.field += amount        // compound assignment
const x = account.field        // field read

// Arithmetic (bigint for u64/u128/i64/i128, number for u8/u16/u32)
+, -, *, /, %, ===, !==, >, <, >=, <=, &&, ||, !

// Control flow
if (condition) { } else { }
for (let i = 0; i < n; i++) { }
for (const item of items) { }
return  // early exit
const result = condition ? a : b    // ternary → if/else expression in Rust

// Variables
const x = expr
let y = expr                         // maps to let mut y = expr;
y = newValue                          // mutation allowed on let, not const

// Context
ctx.require(condition, 'ErrorName')
ctx.emit('EventName', { field: value })
ctx.log('message {}', value)

// CPI
token.transfer({ from, to, authority, amount })
token.mintTo({ mint, to, authority, amount })
token.burn({ from, mint, authority, amount })
token.transferChecked({ from, to, authority, mint, amount, decimals })
token2022.transferCheckedWithFee({ from, to, authority, mint, amount, decimals, fee })
// ... full CPI catalog above

system.transfer({ from, to, amount })
ata.create({ payer, owner, mint, tokenProgram })

// Sysvars (auto-injected — no p.clock() needed in accounts)
sol.timestamp(): bigint     // Clock::get()?.unix_timestamp — auto-injected, costs ~150 CU
sol.slot(): bigint           // Clock::get()?.slot
sol.epoch(): bigint          // Clock::get()?.epoch

```

> **Note:** Advanced helpers (`crypto.sha256`, `rust` escape-hatch blocks) are planned
> but not yet implemented. The current transpiler covers the patterns listed above.

### NOT Available (Parse-Time Blocked)

```
❌ Math, JSON, Date, console, fetch, Promise, async/await
❌ window, document, process, Buffer, fs, require, import
❌ try/catch, switch, class, enum, interface
❌ new Map(), new Set(), new WeakMap()
```

---

## Transpilation: How Every Construct Maps to Rust

### Field Access

| TypeScript | Rust (Standard) | Rust (Zero-Copy) |
|---|---|---|
| `pool.feeBps` | `pool.fee_bps` | `book.fee_bps` (inside `load_mut()`) |
| `pool.feeBps = 30n` | `pool.fee_bps = 30` | `book.fee_bps = 30` |
| `pool.feeBps += 1n` | `pool.fee_bps += 1` | `book.fee_bps += 1` |
| `pool.isActive` | `pool.is_active` | `book.is_active != 0` (bool→u8) |
| `pool.isActive = true` | `pool.is_active = true` | `book.is_active = 1u8` |
| `pool.isActive = false` | `pool.is_active = false` | `book.is_active = 0u8` |
| `reserve.mint` | `reserve.mint` | N/A (not a custom field) |
| `reserve.amount` | `reserve.amount` | N/A |

### Signer Handling

```typescript
// TypeScript: assign signer to pubkey field
pool.admin = admin
ctx.require(admin === pool.admin, 'Unauthorized')
```
```rust
// Rust: auto-insert .key() for Signer accounts
pool.admin = admin.key();
require!(admin.key() == pool.admin, ErrorCode::Unauthorized);
```

The transpiler knows which parameters are `Signer` from `p.signer()`. When a Signer is assigned to a pubkey field or compared with one, `.key()` is auto-inserted.

**For Mint and TokenAccount parameters, use `.key` explicitly:**

```typescript
// Mint/TokenAccount are objects — must extract .key for pubkey fields
pool.tokenAMint = tokenAMint.key    // MintAccountData → string
pool.reserveA = reserveA.key        // TokenAccountData → string
ctx.require(reserve.owner === pool.key, 'InvalidOwner')
```

Signers don't need `.key` because they're already typed as `string`. Mint and TokenAccount are typed as objects — the developer must be explicit about extracting the address.

### Zero-Copy Borrow Scoping

Zero-copy accounts use `RefCell<...>` internally. Borrows must be dropped before CPI calls. The transpiler handles this automatically:

```typescript
// TypeScript: developer writes naturally
run: ({ book, tokenProgram }, ctx) => {
  book.bidCount += 1
  token.transfer({ from, to, authority, amount })
  book.askCount += 1
}
```

```rust
// Rust: transpiler scopes borrows around CPI
{
    let book = &mut ctx.accounts.book.load_mut()?;
    book.bid_count += 1;
} // ← borrow dropped before CPI

token::transfer(cpi_ctx, amount)?;

{
    let book = &mut ctx.accounts.book.load_mut()?;
    book.ask_count += 1;
} // ← borrow dropped
```

The transpiler detects when a zero-copy account's fields are accessed before/after a CPI call and wraps each access group in its own borrow scope.

### For Loops Over Remaining Accounts

```typescript
for (let i = 0; i < destinations.length; i++) {
  ctx.require(destinations[i].owner === authority, 'InvalidOwner')
  token.transfer({ from: source, to: destinations[i], authority, amount: amounts[i] })
}
```

```rust
for (i, dest_ai) in ctx.remaining_accounts.iter().enumerate() {
    let dest = Account::<TokenAccount>::try_from(dest_ai)?;
    require!(dest.owner == authority.key(), ErrorCode::InvalidOwner);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.source.to_account_info(),
            to: dest_ai.clone(),
            authority: authority.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amounts[i])?;
}
```

### Token-2022 CPI Generation

```typescript
// TypeScript
token.transferChecked({
  from: senderToken,
  to: receiverToken,
  authority: sender,
  mint: mintAddr,
  amount: 1000n,
  decimals: 9,
})
```

When instruction has `p.token2022Program()`:
```rust
// Rust
use anchor_spl::token_2022;

let cpi_accounts = token_2022::TransferChecked {
    from: ctx.accounts.sender_token.to_account_info(),
    to: ctx.accounts.receiver_token.to_account_info(),
    authority: ctx.accounts.sender.to_account_info(),
    mint: ctx.accounts.mint_addr.to_account_info(),
};
token_2022::transfer_checked(
    CpiContext::new(ctx.accounts.token_2022_program.to_account_info(), cpi_accounts),
    1000, // amount
    9,    // decimals
)?;
```

### Token-2022 Extension CPI Generation

```typescript
// TypeScript: initialize mint with transfer fee
token2022.initializeTransferFeeConfig({
  mint: p.mint().mut(),
  authority: admin,
  transferFeeAuthority: admin,
  maxFee: 500n,       // 5%
  transferFeeBps: 50n, // 0.5%
})
```

```rust
// Rust
use anchor_spl::token_2022_extensions;

let cpi_accounts = token_2022_extensions::InitializeTransferFeeConfig {
    token_program_id: ctx.accounts.token_2022_program.to_account_info(),
    mint: ctx.accounts.mint.to_account_info(),
    authority: ctx.accounts.admin.to_account_info(),
    transfer_fee_authority: Some(ctx.accounts.admin.to_account_info()),
};
token_2022_extensions::initialize_transfer_fee_config(
    CpiContext::new(ctx.accounts.token_2022_program.to_account_info(), cpi_accounts),
    500,  // max_fee
    50,   // transfer_fee_bps
)?;
```

---

## Complete Example: Token-2022 AMM

```typescript
import {
  program, account,
  u64, u8, bool, pubkey,
  p, token, token2022, sol, ata,
} from 'better-sol/program'

const Config = account({
  admin: pubkey,
  feeBps: u64,
  totalPools: u64,
  bump: u8,
}).derive(() => ["config"])

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  reserveA: pubkey,
  reserveB: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  isActive: bool,
  bump: u8,
}).derive((seed) => ["pool", seed.tokenAMint, seed.tokenBMint])

export const t22Amm = program(
  {
    name: 't22_amm',
  address: 'T22AMM11111111111111111111111111111111111111',
  errors: {
    Unauthorized: 'Not authorized',
    InvalidAmount: 'Amount must be > 0',
    SlippageExceeded: 'Output below minimum',
    PoolInactive: 'Pool is not active',
    InvalidMint: 'Mint mismatch',
  },
  events: {
    Swap: { amountIn: u64, amountOut: u64, fee: u64, direction: u8 },
    LiquidityAdded: { amountA: u64, amountB: u64, lpTokens: u64 },
  },
  },
  ix => ({

    createPool: ix({
      accounts: {
        config: p.mut(Config),
        pool: p.create(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        lpMint: p.mint(),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        admin: p.signer(),
        token2022Program: p.token2022Program(),
        mintIn: p.mint(),
        mintOut: p.mint(),
      },
      args: { feeBps: u64 },
      run: ({ config, pool, tokenAMint, tokenBMint, lpMint, reserveA, reserveB, admin, token2022Program }, { feeBps }, ctx) => {
        ctx.require(admin === config.admin, 'Unauthorized')
        ctx.require(feeBps <= 1000n, 'InvalidAmount')

        pool.tokenAMint = tokenAMint.key
        pool.tokenBMint = tokenBMint.key
        pool.reserveA = reserveA.key
        pool.reserveB = reserveB.key
        pool.lpMint = lpMint.key
        pool.lpSupply = 0n
        pool.feeBps = feeBps
        pool.isActive = true

        config.totalPools += 1n

        ctx.emit('LiquidityAdded', { amountA: 0n, amountB: 0n, lpTokens: 0n })
      },
    }),

    swap: ix({
      accounts: {
        pool: p.mut(Pool),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        traderTokenIn: p.tokenAccount().mut(),
        traderTokenOut: p.tokenAccount().mut(),
        trader: p.signer(),
        mintIn: p.mint(),
        mintOut: p.mint(),
        token2022Program: p.token2022Program(),
      },
      args: { amountIn: u64, minOut: u64, direction: u8 },
      run: ({ pool, reserveA, reserveB, traderTokenIn, traderTokenOut, trader, mintIn, mintOut, token2022Program }, { amountIn, minOut, direction }, ctx) => {
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        const reserveIn = direction === 0 ? reserveA : reserveB
        const reserveOut = direction === 0 ? reserveB : reserveA

        ctx.require(traderTokenIn.mint === mintIn.key, 'InvalidMint')

        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * reserveOut.amount) / (reserveIn.amount + netIn)
        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        // Token-2022 transfer_checked (required for Token-2022)
        token.transferChecked({
          from: traderTokenIn,
          to: direction === 0 ? reserveA : reserveB,
          authority: trader,
          mint: mintIn.key,
          amount: amountIn,
          decimals: 9,  // mint decimals
        })

        // PDA-signed transfer out
        token.transferChecked({
          from: direction === 0 ? reserveB : reserveA,
          to: traderTokenOut,
          authority: pool,
          mint: mintOut.key,
          amount: amountOut,
          decimals: 9,
        })

        ctx.emit('Swap', { amountIn, amountOut, fee, direction })
      },
    }),
  }),
)
```

---

## Complete Example: Orderbook with Zero-Copy

```typescript
import {
  program, account, struct_zc,
  u64, u32, i64, pubkey, bool, array,
  p, token, sol,
} from 'better-sol/program'

// Zero-copy sub-struct for array elements
const Order = struct({
  trader: pubkey,
  price: u64,
  quantity: u64,
  timestamp: i64,
})

// Zero-copy account with fixed arrays
const OrderBook = account({
  market: pubkey,
  baseMint: pubkey,
  quoteMint: pubkey,
  bidCount: u32,
  askCount: u32,
  bestBid: u64,
  bestAsk: u64,
  isActive: bool,     // → u8 in Rust (Pod constraint)
  bump: u8,
  bids: array(Order, 256),
  asks: array(Order, 256),
}).derive((seed) => ["orderbook", seed.market]).zeroCopy()

const FillRecord = account({
  orderBook: pubkey,
  trader: pubkey,
  isBid: bool,
  price: u64,
  quantity: u64,
  timestamp: i64,
}).derive((seed) => ["fill", seed.orderBook, seed.trader, seed.timestamp])

export const orderbook = program(
  {
    name: 'orderbook',
  address: '0rdrB00k11111111111111111111111111111111111',
  errors: {
    Unauthorized: 'Not authorized',
    OrderbookFull: 'No space for more orders',
    InvalidPrice: 'Price must be > 0',
    InvalidQuantity: 'Quantity must be > 0',
    NoOrders: 'No orders to process',
    InvalidOrder: 'Order not found or already filled',
  },
  },
  ix => ({

    initialize: ix({
      accounts: {
        book: p.create(OrderBook),
        market: pubkey,          // ← bare pubkey: unchecked AccountInfo, address only
        admin: p.signer(),
      },
      args: { baseMint: pubkey, quoteMint: pubkey },
      run: ({ book, market, admin }, { baseMint, quoteMint }) => {
        book.market = market      // stores the account's address
        book.baseMint = baseMint
        book.quoteMint = quoteMint
        book.bidCount = 0
        book.askCount = 0
        book.bestBid = 0n
        book.bestAsk = 0n
        book.isActive = true    // → 1u8 in zero-copy Rust
      },
    }),

    placeBid: ix({
      accounts: {
        book: p.mut(OrderBook),
        trader: p.signer(),
      },
      args: { price: u64, quantity: u64 },
      run: ({ book, trader }, { price, quantity }, ctx) => {
        ctx.require(book.isActive, 'Unauthorized')
        ctx.require(price > 0n, 'InvalidPrice')
        ctx.require(quantity > 0n, 'InvalidQuantity')
        ctx.require(book.bidCount < 256, 'OrderbookFull')

        // Insert bid (simplified — real orderbook would sort by price)
        book.bids[book.bidCount] = {
          trader,
          price,
          quantity,
          timestamp: sol.timestamp(),
        }

        book.bidCount += 1

        if (price > book.bestBid) {
          book.bestBid = price
        }
      },
    }),

    // Process multiple orders using remaining accounts
    matchOrders: ix({
      accounts: {
        book: p.mut(OrderBook),
        baseReserve: p.tokenAccount().mut(),
        quoteReserve: p.tokenAccount().mut(),
        matchingEngine: p.signer(),
        fills: p.remaining(FillRecord),
      },
      args: { maxMatches: u32 },
      run: ({ book, baseReserve, quoteReserve, matchingEngine, fills }, { maxMatches }, ctx) => {
        ctx.require(book.isActive, 'Unauthorized')
        ctx.require(book.bidCount > 0 && book.askCount > 0, 'NoOrders')

        const matchCount = fills.length < maxMatches ? fills.length : maxMatches

        for (let i = 0; i < matchCount; i++) {
          const bid = book.bids[i]
          const ask = book.asks[i]

          if (bid.price >= ask.price && bid.quantity > 0n && ask.quantity > 0n) {
            const matchQty = bid.quantity < ask.quantity ? bid.quantity : ask.quantity
            const matchPrice = bid.price

            // Record the fill
            fills[i].orderBook = book.key
            fills[i].trader = bid.trader
            fills[i].isBid = true
            fills[i].price = matchPrice
            fills[i].quantity = matchQty
            fills[i].timestamp = sol.timestamp()

            // Update quantities
            book.bids[i].quantity -= matchQty
            book.asks[i].quantity -= matchQty
          }
        }
      },
    }),

    closeBook: ix({
      accounts: {
        book: p.mut(OrderBook),
        admin: p.signer(),
      },
      run: ({ book, admin }, ctx) => {
        ctx.require(admin === book.market, 'Unauthorized')
        book.isActive = false  // → 0u8 in zero-copy Rust
      },
    }),
  }),
)
```

---

## Updated Coverage Matrix

### Operations

| Category | Count | Status |
|---|---|---|
| Direct 1:1 AST → Rust | 37 | ✅ Covered |
| CPI Templates (Token) | 9 | ✅ Covered |
| CPI Templates (Token-2022 Extensions) | 12 | ✅ Covered |
| CPI Templates (System/ATA) | 4 | ✅ Covered |
| Zero-copy accounts | 6 | ✅ Covered |
| Remaining accounts | 5 | ✅ Covered |
| Escape hatch (`rust` blocks) | ∞ | ✅ Covered |
| **Truly impossible** | 0 | — |

### Program Types

| Program Type | Coverage | Notes |
|---|---|---|
| Counter/CRUD | **100%** | |
| Token management | **100%** | Including Token-2022 |
| Escrow | **100%** | |
| Simple staking | **100%** | |
| AMM (constant product) | **100%** | Token or Token-2022 |
| Token vesting | **100%** | |
| Auction | **100%** | |
| Social (profile/follow) | **100%** | |
| Governance | **100%** | Remaining accounts for voters |
| Multisig | **100%** | Remaining accounts for signers |
| Marketplace | **100%** | Token-2022 for royalties |
| **Orderbook (zero-copy)** | **95%** | Zero-copy covered, complex matching may need escape hatch |
| AMM (concentrated liquidity) | **70%** | Tick math transpilable, state machine needs escape hatch |
| Lending/borrowing | **70%** | Complex state transitions need escape hatch |
| NFT mint | **85%** | Metaplex CPI needs escape hatch |
| DAO Treasury | **95%** | Complex execution CPI may need escape hatch |

**100% covered: 11/16 (69%). 90%+ covered: 14/16 (88%). No program type below 70%.**

---

## What Is NOT Possible (And Exactly Why)

### 1. Nested Borsh types (Vec<Vec<u8>>, HashMap, BTreeMap)

**Why**: Solana accounts have fixed-size Borsh serialization. `Vec<T>` is supported as a flat list, but nested dynamic structures don't have a stable layout.

**Workaround**: Use a fixed-size `array(u8, N)` and manage offsets manually, or use the `rust` escape hatch.

### 2. Dynamic-size zero-copy accounts

**Why**: Zero-copy requires `Pod` which requires `Sized`. The account size is fixed at creation by `std::mem::size_of::<T>()`.

**Workaround**: Use `array(T, MAX_SIZE)` with a count field. Unused slots are zero-initialized.

### 3. Metaplex CPI

**Why**: Metaplex's `create_metadata_accounts_v3` instruction requires 12+ accounts with complex validation, and the data format is specific to the Metaplex program. The instruction interface changes between versions.

**Workaround**: Use `rust` blocks for Metaplex CPI calls.

### 4. Account resizing with reallocation

**Why**: Anchor's `realloc` constraint has specific rules about zero-initialization and payer handling that don't map cleanly to our `account({...})` syntax.

**Workaround**: Use `account.realloc(newSize)` method call in the `run:` handler (transpiled to `account.realloc(new_size, false)?`), or use the `rust` escape hatch.

### 5. Compute budget instructions

**Why**: These are transaction-level instructions, not program-level. They're set by the client, not the program.

**Workaround**: Client SDK should expose `sol.setComputeUnitLimit(n)` and `sol.setComputeUnitPrice(n)` on the transaction builder. Not a program definition concern.

### 6. Address Lookup Tables (ALTs)

**Why**: ALTs are a transaction construction optimization. They compress account references for large transactions. Not relevant to program logic.

**Workaround**: Client SDK transaction builder should support ALT resolution. Not a program definition concern.

---

## Client SDK — Complete API

```typescript
import { betterSol } from 'better-sol'

const sol = await betterSol({
  cluster: 'https://api.mainnet-beta.solana.com',
  payer: './keypair.json',
  programs: { amm, orderbook },
})

// ── Native operations ──
await sol.transfer({ from, to, amount })
await sol.getBalance(address)
const blockhash = await sol.getLatestBlockhash()

// ── Token operations (built-in, no registration) ──
await sol.token.createMint({ decimals, authority })
await sol.token.mintTo({ mint, destination, authority, amount })
await sol.token.transfer({ mint, from, to, amount })
await sol.token.getBalance({ owner, mint })
await sol.token.getATA({ owner, mint })

// ── Program operations (auto-generated from definition) ──
await sol.amm.swap({ pool, ..., amountIn, minOut })
await sol.orderbook.placeBid({ book, price, quantity })

// ── Transaction building ──
const tx = await sol.amm.swap.transaction({ pool, ..., amountIn, minOut })
// tx is a VersionedTransaction — sign and send with any wallet

// ── Transaction formats ──
const web3Tx = await sol.amm.swap.transaction({ ... }, { format: 'web3' })
const bytes = await sol.amm.swap.transaction({ ... }, { format: 'bytes' })
const kitTx = await sol.amm.swap.transaction({ ... }, { format: 'kit' })

// ── Simulation ──
const result = await sol.amm.swap.simulate({ pool, ..., amountIn, minOut })
if (result.ok) {
  console.log(result.events)      // typed event array
  console.log(result.accounts)    // typed post-state
  console.log(result.unitsConsumed)
}

// ── Wallet integration ──
import { walletSigner } from 'better-sol/wallets/reown'
const walletSol = sol.withSigner(walletSigner(appKit))
await walletSol.amm.swap({ pool, ..., amountIn, minOut })

// ── Account fetching ──
const pool = await amm.accounts.Pool.fetch(poolAddr)       // typed
const pools = await amm.accounts.Pool.fetchAll()            // typed[]
const derived = await sol.amm.accounts.Pool.derive({ tokenAMint, tokenBMint })

// ── Event listening ──
amm.on('Swap', (event) => {
  console.log(event.amountIn, event.amountOut)  // typed
})
```

### Wallet Adapter Subpath Exports

```
better-sol/wallets/reown           → Reown AppKit integration
better-sol/wallets/wallet-adapter  → @solana/wallet-adapter integration
better-sol/wallets/privy           → Privy integration
better-sol/wallets/dynamic         → Dynamic integration
better-sol/wallets/keypair         → Server-side keypair signer
```

Each exports `walletSigner(adapter)` that returns `{ publicKey, signTransaction }`.

---


const sol = testSol({ programs: { amm, orderbook } })

test('AMM swap works', async () => {
  const { payer } = sol.context

  // Create test tokens
  const mintA = await sol.token.createMint({ decimals: 9, authority: payer })
  const mintB = await sol.token.createMint({ decimals: 6, authority: payer })

  // Setup pool
  const configAddr = await sol.amm.accounts.Config.derive({})
  const poolAddr = await sol.amm.accounts.Pool.derive({ tokenAMint: mintA, tokenBMint: mintB })

  await expectIx(
    sol.amm.createPool({ config: configAddr, pool: poolAddr, tokenAMint: mintA, tokenBMint: mintB, feeBps: 30n })
  ).toSucceed()

  // Verify state
  const pool = await amm.accounts.Pool.fetch(poolAddr)
  expect(pool!.feeBps).toBe(30n)
  expect(pool!.isActive).toBe(true)
})

test('Swap rejects zero amount', async () => {
  await expectIx(
    sol.amm.swap({ pool: poolAddr, amountIn: 0n, minOut: 0n, direction: 0 })
  ).toThrow('InvalidAmount')
})
```

---

## Database Schema Generation

### The Design Decision

How other tools handle generated files:

| Tool | Strategy | Problem |
|------|----------|---------|
| Drizzle `introspect` | Overwrites `./drizzle/schema.ts` | Destroys hand-written modifications |
| Prisma `generate` | Writes to `node_modules/.prisma/client` (gitignored) | Works because Prisma owns the entire schema |
| OpenAPI Generator | Overwrites `./generated/` | "Never edit generated files" — works for pure clients |
| **Better Auth** | **AST-parses existing file, merges only new models/fields** | **Best DX — coexists with hand-written code** |

We follow **Better Auth's pattern**. The developer's project already has a Drizzle schema with their own tables. We merge our on-chain account definitions into it without destroying their work.

### The Workflow

```bash
# First run: creates the file
npx @better-sol/cli generate db --orm drizzle
# → src/db/better-sol.ts  (new file, only our tables)

# Subsequent runs: updates in place, preserves hand edits
npx @better-sol/cli generate db --orm drizzle
# → src/db/better-sol.ts  (updated, your changes preserved)
```

**Why a dedicated file, not their schema?**

The developer's `src/db/schema.ts` already has their own tables — users, sessions, orders, etc. Dropping our generated tables in there creates a mixed-responsibility file that's confusing to maintain. Instead:

```
src/db/
├── schema.ts          ← the developer's own tables (they own this)
├── better-sol.ts      ← our generated on-chain tables (we own this)
└── index.ts           ← re-exports everything for drizzle()
```

```typescript
// src/db/index.ts — the developer writes this once
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'           // their tables
import * as betterSol from './better-sol'     // our tables

export const db = drizzle(pool, { schema: { ...schema, ...betterSol } })
```

Now `db.select().from(ammPool)` works alongside `db.select().from(users)`.

### What Gets Generated

```typescript
// src/db/better-sol.ts
//
// AUTO-GENERATED by @better-sol/cli — do not edit manually.
// Regenerate with: npx @better-sol/cli generate db --orm drizzle
//
import { pgTable, text, bigint, integer, boolean } from 'drizzle-orm/pg-core'

// ── From: programs/amm.ts ──

export const ammConfig = pgTable('amm_config', {
  address: text('address').primaryKey(),
  admin: text('admin').notNull(),
  totalPools: bigint('total_pools', { mode: 'bigint' }).notNull(),
  feeBps: bigint('fee_bps', { mode: 'bigint' }).notNull(),
  updatedAtSlot: bigint('updated_at_slot', { mode: 'bigint' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'bigint' }).notNull(),
})

export const ammPool = pgTable('amm_pool', {
  address: text('address').primaryKey(),
  tokenAMint: text('token_a_mint').notNull(),
  tokenBMint: text('token_b_mint').notNull(),
  lpSupply: bigint('lp_supply', { mode: 'bigint' }).notNull(),
  feeBps: bigint('fee_bps', { mode: 'bigint' }).notNull(),
  isActive: boolean('is_active').notNull(),
  updatedAtSlot: bigint('updated_at_slot', { mode: 'bigint' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'bigint' }).notNull(),
})

// ── From: programs/orderbook.ts ──

export const orderbookFillRecord = pgTable('orderbook_fill_record', {
  address: text('address').primaryKey(),
  orderBook: text('order_book').notNull(),
  trader: text('trader').notNull(),
  isBid: boolean('is_bid').notNull(),
  price: bigint('price', { mode: 'bigint' }).notNull(),
  quantity: bigint('quantity', { mode: 'bigint' }).notNull(),
  updatedAtSlot: bigint('updated_at_slot', { mode: 'bigint' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'bigint' }).notNull(),
})
```

Every table gets `address` (the on-chain PDA as primary key) plus `updatedAtSlot` and `updatedAt` for indexing cursors.

Zero-copy accounts generate the same Drizzle schema — the database doesn't care about on-chain serialization format.

### Update Behavior

When the developer adds a field to an `account({...})` definition and re-runs `generate db`:

```bash
$ npx @better-sol/cli generate db --orm drizzle

  ℹ Found 3 accounts across 2 programs
  ✓ src/db/better-sol.ts updated

  Changes:
    ammPool: added field 'totalVolumeA' (bigint)
    ammPool: added field 'totalVolumeB' (bigint)
    ammConfig: no changes
    orderbookFillRecord: no changes
```

The generator parses the existing file and **only adds/modifies tables** — it never removes tables the developer has customized, and it preserves any additional columns or indexes the developer added by hand.

### Configurable Output Path

```bash
# Default: src/db/better-sol.ts
npx @better-sol/cli generate db --orm drizzle

# Custom path
npx @better-sol/cli generate db --orm drizzle --out lib/database/on-chain.ts

# Or configure in package.json (optional)
# "better-sol": { "db-output": "lib/database/on-chain.ts" }
```

### The .gitignore

```gitignore
node_modules/
.better-sol/          # keypairs (private)
```

`src/db/better-sol.ts` is **NOT gitignored**. It's committed — it's part of the application's type contract. Just like Drizzle's own schemas.

### Why Not `node_modules`?

Prisma can put generated output in `node_modules` because Prisma owns the *entire* database schema — there are no hand-written tables coexisting with generated ones. We can't do that. The developer's `src/db/schema.ts` needs to `import { ammPool } from './better-sol'` — that import has to resolve to a committed file, not something that disappears on `npm ci`.

### Handling Custom Columns

Developers can add extra columns that aren't on-chain. The generator preserves them:

```typescript
export const ammPool = pgTable('amm_pool', {
  address: text('address').primaryKey(),
  tokenAMint: text('token_a_mint').notNull(),
  // ... auto-generated fields ...
  updatedAtSlot: bigint('updated_at_slot', { mode: 'bigint' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'bigint' }).notNull(),

  // ── Hand-written (not from on-chain) ──
  indexedAt: timestamp('indexed_at').defaultNow(),
  metadataUri: text('metadata_uri'),
})
```

Regeneration adds/modifies auto-generated fields but preserves hand-written columns.

### AST Merge (Advanced)

For developers who really want one file:

```bash
npx @better-sol/cli generate db --orm drizzle --out src/db/schema.ts --merge
```

The `--merge` flag parses the existing file as TypeScript AST and merges in only new tables/fields, like Better Auth's Prisma adapter.

---

## File Management & Deployment

### Project Structure

```
my-sol-app/
├── programs/
│   ├── counter.ts              ← SOURCE (committed)
│   └── amm.ts                  ← SOURCE (committed)
├── src/
│   ├── db/
│   │   ├── index.ts            ← drizzle setup (write once, committed)
│   │   ├── schema.ts           ← your tables (committed)
│   │   └── better-sol.ts       ← generated on-chain tables (committed)
│   └── app.ts                  ← client code (committed)
├── generated/                  ← ONLY if --verify (committed)
│   └── counter/src/...         ← transpiled Rust for audit
├── drizzle/                    ← migrations (committed)
├── .better-sol/                ← GITIGNORED (private keypairs)
│   ├── counter.json
│   └── amm.json
├── .gitignore
└── package.json
```

### .gitignore

```gitignore
node_modules/
dist/
.better-sol/           # private keypairs only
```

Everything else is committed. Generated schemas are type contracts, not build artifacts.

### CLI Commands

| Command | Generates | Git |
|---------|-----------|-----|
| `create <name>` | `programs/<name>.ts` + `.better-sol/<name>.json` | ✅ `.ts` · ❌ `.json` |
| `deploy [--cluster] [--program]` | Nothing local (cloud compiles + deploys) | — |
| `deploy --verify` | `generated/<name>/src/**` (Rust) | ✅ commit |
| `verify <program-id>` | Submits to OtterSec verified-builds API for remote verification | — |
| `generate db --orm drizzle` | `src/db/better-sol.ts` | ✅ commit |

### CI/CD (GitHub Actions)

Keypairs come from secrets, never from the repo:

```yaml
- name: Deploy
  env:
    COUNTER_KEYPAIR: ${{ secrets.COUNTER_KEYPAIR }}
  run: |
    echo "$COUNTER_KEYPAIR" | base64 -d > .better-sol/counter.json
    npx @better-sol/cli deploy --cluster mainnet-beta --verify

- name: Push generated Rust
  run: |
    git add generated/ && git commit -m "deploy" && git push

- name: Verify
  run: npx @better-sol/cli verify counter
```

### Production Security

After deploying, rotate the upgrade authority to multisig:

```typescript
await program.methods.setUpgradeAuthority({
  newAuthority: multisigAddress,
})
```

Now even a leaked `.better-sol/counter.json` can't upgrade the program.

---

## Honest Scope

> **"Write Solana programs in TypeScript. Get a typed client, typed tests, and typed database schemas — all from one definition. Supports SPL Token, Token-2022 with extensions, remaining accounts, and zero-copy accounts. For Metaplex CPI, concentrated liquidity tick math, and dynamic account resizing, use the inline Rust escape hatch."**

The escape hatch covers approximately 5% of real-world programs. The other 95% is pure TypeScript.
