# Anchor `remaining_accounts` — Exhaustive Reference

Deep-dive reference: Anchor remaining_accounts mechanics, validation patterns, transpiler design for `p.remaining()`. For internal use only.

## Table of Contents
1. [How `remaining_accounts` Works in Anchor Rust](#1-how-remaining_accounts-works-in-anchor-rust)
2. [Real-World Examples from Production Programs](#2-real-world-examples-from-production-programs)
3. [Account Validation Patterns](#3-account-validation-patterns)
4. [TypeScript Client API](#4-typescript-client-api)
5. [Transpilation Design for `p.remaining()`](#5-transpilation-design-for-premaining)
6. [Typed Deserialization of Remaining Accounts](#6-typed-deserialization-of-remaining-accounts)
7. [Security Concerns & Transpiler Enforcement](#7-security-concerns--transpiler-enforcement)

---

## 1. How `remaining_accounts` Works in Anchor Rust

### The `Context` Struct

From `/lang/src/context.rs`:

```rust
pub struct Context<'info, T: Bumps> {
    pub program_id: &'info Pubkey,
    pub accounts: &'info mut T,
    /// Remaining accounts given but not deserialized or validated.
    /// Be very careful when using this directly.
    pub remaining_accounts: &'info [AccountInfo<'info>],
    pub bumps: T::Bumps,
}
```

**Key facts:**
- Type: `&'info [AccountInfo<'info>]` — a **slice of raw AccountInfo**, NOT typed
- It is everything in the transaction's account array AFTER the `#[derive(Accounts)]` struct consumes its fields
- Anchor performs **zero validation** on these accounts — no ownership checks, no deserialization, no signer checks
- The name is a misnomer — they are not "remaining" in the sense of optional; they are simply "extra" accounts appended after the struct fields

### How Anchor Populates It (from generated handler code)

From `/lang/syn/src/codegen/program/handlers.rs`:

```rust
// The full accounts array from Solana runtime
let mut __remaining_accounts = __accounts;  // ALL accounts

// try_accounts consumes from the FRONT of the slice, field by field
let mut __accounts = #accounts_struct_name::try_accounts(
    __program_id,
    &mut __remaining_accounts,  // <- passed as mutable reference
    __ix_data,
    &mut __bumps,
    &mut __reallocs,
)?;

// After try_accounts returns, __remaining_accounts is the SLICE
// of whatever wasn't consumed by struct fields
// This gets passed to Context::new()
Context::new(
    __program_id,
    unsafe { __shrink_lifetime(&mut __accounts) },
    __remaining_accounts,  // <- whatever's left
    __bumps,
)
```

### How `try_accounts` Consumes Accounts (slice peeling)

From `/lang/syn/src/codegen/accounts/try_accounts.rs`:

Each field in the `#[derive(Accounts)]` struct peels one account from the front of the slice:

```rust
// For each non-init field:
let #typed_name = anchor_lang::Accounts::try_accounts(
    __program_id,
    __accounts,   // mutable reference to remaining slice
    __ix_data,
    __bumps,
    __reallocs
)?;

// For init fields (simpler — just takes the raw AccountInfo):
if __accounts.is_empty() {
    return Err(anchor_lang::error::ErrorCode::AccountNotEnoughKeys.into());
}
let #name = &__accounts[0];
*__accounts = &__accounts[1..];  // advance the slice
```

Every account type's `try_accounts` implementation peels `&accounts[0]` and advances the slice:
```rust
// From Account<T>::try_accounts:
let account = &accounts[0];
*accounts = &accounts[1..];  // consume one, advance
```

**Result:** After all struct fields are deserialized, whatever's left in the slice is `remaining_accounts`.

### Also: `CpiContext` Has Its Own `remaining_accounts`

```rust
pub struct CpiContext<'a, 'b, 'c, 'info, T> {
    pub accounts: T,
    pub remaining_accounts: Vec<AccountInfo<'info>>,
    pub program_id: Pubkey,
    pub signer_seeds: &'a [&'b [&'c [u8]]],
}

// Builder pattern for CPI with remaining accounts:
pub fn with_remaining_accounts(mut self, ra: Vec<AccountInfo<'info>>) -> Self {
    self.remaining_accounts = ra;
    self
}
```

When doing CPI, remaining accounts from the CPI context get appended AFTER the typed accounts in the instruction's account list.

---

## 2. Real-World Examples from Production Programs

### Example 1: OpenBook v2 — `consume_events` (Dynamic OpenOrders Lookup)

**Use case:** Process events for multiple open orders accounts, passed as remaining accounts.

```rust
// accounts_ix/consume_events.rs — only 3 fields in the struct
#[derive(Accounts)]
pub struct ConsumeEvents<'info> {
    pub consume_events_admin: Option<Signer<'info>>,
    #[account(mut, has_one = event_heap, /* ... */)]
    pub market: AccountLoader<'info, Market>,
    #[account(mut)]
    pub event_heap: AccountLoader<'info, EventHeap>,
}

// instructions/consume_events.rs
pub fn consume_events<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ConsumeEvents>,
    limit: usize,
    slots: Option<Vec<usize>>,
) -> Result<()> {
    let mut market = ctx.accounts.market.load_mut()?;
    let mut event_heap = ctx.accounts.event_heap.load_mut()?;
    let remaining_accs = &ctx.remaining_accounts;

    for slot in slots_to_consume {
        let event = event_heap.at_slot(slot).unwrap();
        match EventType::try_from(event.event_type) {
            EventType::Fill => {
                let fill: &FillEvent = cast_ref(event);
                // Look up the maker's OpenOrders account by pubkey match
                let loader = match remaining_accs.iter().find(|ai| ai.key == &fill.maker) {
                    None => { msg!("skipping"); continue; }
                    Some(ai) => AccountLoader::<OpenOrdersAccount>::try_from(ai)?,
                };
                let mut maker = loader.load_mut()?;
                maker.execute_maker(&mut market, fill);
            }
            // ...
        }
    }
}
```

**Pattern:** Struct declares fixed accounts; remaining accounts are dynamically matched by pubkey.

### Example 2: OpenBook v2 — `place_order` / `edit_order` (Reusing remaining_accounts across sub-contexts)

```rust
// edit_order creates a new Context from the current one, passing remaining_accounts through
pub fn edit_order<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, PlaceOrder<'info>>,
    cancel_client_order_id: u64,
    expected_cancel_size: i64,
    mut order: Order,
    limit: u8,
) -> Result<Option<u128>> {
    // Reuse remaining_accounts by creating a new Context with a different accounts struct
    let leaf_node_quantity = crate::instructions::cancel_order_by_client_order_id(
        Context::new(
            ctx.program_id,
            &mut ctx.accounts.to_cancel_order(),  // Convert to CancelOrder struct
            ctx.remaining_accounts,               // Pass through remaining accounts
            ctx.bumps.to_cancel_order(),
        ),
        cancel_client_order_id,
    )?;

    // Then call place_order with the SAME context
    crate::instructions::place_order(ctx, order, limit)
}
```

**Pattern:** One instruction reuses `remaining_accounts` across multiple sub-instructions with different account struct types.

### Example 3: Anchor Lockup — `whitelist_withdraw` (Raw CPI Relay)

```rust
// Pass remaining accounts directly into a CPI invoke_signed
pub fn whitelist_withdraw(ctx: Context<WhitelistWithdraw>, instruction_data: Vec<u8>, amount: u64) -> Result<()> {
    whitelist_relay_cpi(&ctx.accounts.transfer, ctx.remaining_accounts, instruction_data)?;
    // ...
}

pub fn whitelist_relay_cpi<'info>(
    transfer: &WhitelistTransfer<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    instruction_data: Vec<u8>,
) -> Result<()> {
    let mut meta_accounts = vec![
        AccountMeta::new_readonly(*transfer.vesting.to_account_info().key, false),
        AccountMeta::new(*transfer.vault.to_account_info().key, false),
        // ...fixed accounts...
    ];
    // Append remaining accounts as additional account metas
    meta_accounts.extend(remaining_accounts.iter().map(|a| {
        if a.is_writable {
            AccountMeta::new(*a.key, a.is_signer)
        } else {
            AccountMeta::new_readonly(*a.key, a.is_signer)
        }
    }));
    let relay_instruction = Instruction { program_id, accounts: meta_accounts, data };
    let mut accounts = transfer.to_account_infos();
    accounts.extend_from_slice(&remaining_accounts);
    invoke_signed(&relay_instruction, &accounts, signer)
}
```

**Pattern:** Remaining accounts are relayed verbatim into CPI calls.

### Example 4: Anchor Lockup Registry — CPI with typed remaining accounts

```rust
// Extract typed accounts from remaining_accounts for CPI
let remaining_accounts: &[AccountInfo] = ctx.remaining_accounts;
let cpi_program = ctx.accounts.lockup_program.clone();
let cpi_accounts = {
    let accs = &mut remaining_accounts.iter();
    lockup::cpi::accounts::CreateVesting {
        vesting: next_account_info(accs)?.to_account_info(),
        vault: next_account_info(accs)?.to_account_info(),
        depositor: next_account_info(accs)?.to_account_info(),
        depositor_authority: next_account_info(accs)?.to_account_info(),
        token_program: next_account_info(accs)?.to_account_info(),
        clock: next_account_info(accs)?.to_account_info(),
    }
};
let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
```

**Pattern:** Using `next_account_info()` to peel accounts from remaining_accounts and construct typed CPI account structs.

### Example 5: Anchor Declare Program — `proxy` (Generic Instruction Forwarding)

```rust
pub fn proxy(ctx: Context<Proxy>, data: Vec<u8>) -> Result<()> {
    let accounts = ctx.remaining_accounts
        .iter()
        .map(|ra| AccountMeta {
            pubkey: ra.key(),
            is_signer: ra.is_signer || &authority == ra.key,
            is_writable: ra.is_writable,
        })
        .collect();

    invoke_signed(
        &Instruction {
            program_id: ctx.accounts.program.key(),
            accounts,
            data,
        },
        ctx.remaining_accounts,
        signer_seeds,
    )?;
    Ok(())
}
```

**Pattern:** ALL instruction accounts are passed as remaining accounts for a generic proxy.

### Example 6: Auction House — `pay_creator_fees` (NFT Royalty Distribution)

```rust
// Iterating remaining_accounts to pay multiple NFT creators
pub fn pay_creator_fees<'a>(
    remaining_accounts: &mut Iter<AccountInfo<'a>>,
    metadata_info: &AccountInfo<'a>,
    // ...other params
) -> Result<u64> {
    for creator in creators {
        let pct = creator.share as u128;
        let creator_fee = (pct * total_fee) / 100;
        // Peel the next creator wallet from remaining accounts
        let current_creator_info = next_account_info(remaining_accounts)?;
        assert_keys_equal(creator.address, *current_creator_info.key)?;
        if !is_native {
            // Peel the next creator token account too
            let current_creator_token_account_info = next_account_info(remaining_accounts)?;
            // ... transfer
        }
    }
}

// Called with:
pay_creator_fees(&mut ctx.remaining_accounts.iter(), /* ... */)
```

**Pattern:** For each NFT creator in metadata, peel 2 accounts (wallet + token account) from remaining accounts. Validates pubkey matches on-chain metadata.

### Example 7: Anchor Lockup — `is_realized` (Program Lookup from Remaining)

```rust
fn is_realized(ctx: &Context<Withdraw>) -> Result<()> {
    if let Some(realizor) = &ctx.accounts.vesting.realizor {
        let cpi_program = {
            let p = ctx.remaining_accounts[0].clone();
            // SECURITY: Verify the program ID matches what's stored on-chain
            if p.key != &realizor.program {
                return err!(ErrorCode::InvalidLockRealizor);
            }
            p
        };
        let cpi_accounts = ctx.remaining_accounts.to_vec()[1..].to_vec();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        realize_lock::is_realized(cpi_ctx, vesting)
            .map_err(|_| error!(ErrorCode::UnrealizedVesting))?;
    }
    Ok(())
}
```

**Pattern:** First remaining account is a program ID (validated against on-chain data); rest are CPI accounts.

---

## 3. Account Validation Patterns

### Pattern A: No Validation (Raw AccountInfo iteration)

The most common (and dangerous) pattern. Programs simply iterate `&ctx.remaining_accounts`:

```rust
for account_info in ctx.remaining_accounts.iter() {
    // Use raw account_info — NO ownership check, NO deserialization
    let data = &account_info.data.borrow();
    // ...
}
```

**Used when:** The program only needs pubkeys (e.g., OpenBook event matching by key).

### Pattern B: `AccountLoader::try_from` / `Account::try_from` (Typed Deserialization)

Deserialize each remaining account into a typed wrapper:

```rust
// OpenBook pattern — find by key, then deserialize
let loader = match remaining_accs.iter().find(|ai| ai.key == &fill.maker) {
    None => continue,
    Some(ai) => AccountLoader::<OpenOrdersAccount>::try_from(ai)?,
};
let mut maker = loader.load_mut()?;

// OR: Account::try_from for Anchor accounts
let token_acct: Account<TokenAccount> = Account::try_from(&remaining_accounts[0])?;
```

`AccountLoader::try_from` validates:
- Account is owned by the expected program (via `Owner` trait)
- Discriminator matches (via `Discriminator` trait for `Account`)
- Data can be deserialized

### Pattern C: `next_account_info` Peeling (Manual Sequential Consumption)

```rust
let accs = &mut ctx.remaining_accounts.iter();
let account1 = next_account_info(accs)?;
let account2 = next_account_info(accs)?;
// etc.
```

This is Solana's `account_info::next_account_info` utility. It simply advances an iterator over the slice — NO validation. It only fails if you request more accounts than exist.

### Pattern D: Pubkey Validation (Manual Key Checks)

```rust
// Verify remaining account matches an expected address
require!(
    *ctx.remaining_accounts[0].key == expected_pubkey,
    ErrorCode::InvalidAccount
);

// Verify ownership by a specific program
require!(
    *ctx.remaining_accounts[0].owner == token_program::ID,
    ErrorCode::InvalidOwner
);

// Verify signer status
require!(
    ctx.remaining_accounts[0].is_signer,
    ErrorCode::NotSigner
);
```

### Pattern E: PDA Seed Validation

```rust
// Validate that a remaining account is a PDA with expected seeds
let (expected_key, bump) = Pubkey::find_program_address(
    &[b"prefix", some_key.as_ref()],
    program_id,
);
require!(
    *ctx.remaining_accounts[0].key == expected_key,
    ErrorCode::InvalidPDA
);
```

### Pattern F: `Vec<T>` in Accounts Struct (Anchor's Built-in Typed Remaining)

Anchor supports `Vec<T>` as a field type in `#[derive(Accounts)]`:

```rust
#[derive(Accounts)]
pub struct BatchTransfer<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub source: Account<'info, TokenAccount>,
    // This consumes ALL remaining accounts!
    pub destinations: Vec<Account<'info, TokenAccount>>,
}
```

**How it works** (from `/lang/src/vec.rs`):
```rust
impl<'info, B, T: Accounts<'info, B>> Accounts<'info, B> for Vec<T> {
    fn try_accounts(
        program_id: &Pubkey,
        accounts: &mut &'info [AccountInfo<'info>],
        ix_data: &[u8],
        bumps: &mut B,
        reallocs: &mut BTreeSet<Pubkey>,
    ) -> Result<Self> {
        let mut vec: Vec<T> = Vec::new();
        // Keep trying to deserialize T from the remaining slice
        // until it fails (runs out of accounts or wrong type)
        T::try_accounts(program_id, accounts, ix_data, bumps, reallocs)
            .map(|item| vec.push(item))?;
        Ok(vec)
    }
}
```

**WARNING:** This implementation only pushes ONE item and returns. The comment says "Keep trying" but the actual code deserializes a single `T` and wraps it in a `Vec`. This means `Vec<T>` in an accounts struct currently consumes exactly ONE account of type T, not all remaining. This is a known Anchor behavior — if you need multiple accounts, you typically use `ctx.remaining_accounts` directly.

**UPDATE:** Looking more carefully at the test, `Vec::<Test>::try_accounts` is called with a 2-element slice and returns a 2-element Vec. The behavior is that it consumes ALL accounts that match type T from the slice. Actually re-reading the code:

```rust
fn try_accounts(/* ... */) -> Result<Self> {
    let mut vec: Vec<T> = Vec::new();
    T::try_accounts(program_id, accounts, ix_data, bumps, reallocs)
        .map(|item| vec.push(item))?;
    Ok(vec)
}
```

This pushes exactly ONE `T`. The test works because each `Test` struct has one field and the slice peeling consumes them. But wait — this only calls `T::try_accounts` once, so it produces a `Vec` with exactly one element. Looking at the test:
```rust
let mut accounts = &[account1, account2][..];
let parsed_accounts = Vec::<Test>::try_accounts(&program_id, &mut accounts, /* ... */).unwrap();
assert_eq!(accounts.len(), parsed_accounts.len());  // accounts = 2 remaining, parsed = 2 items
```

Hmm, actually `parsed_accounts.len()` would be 1 (only one `try_accounts` call). But `accounts.len()` after would be 1 (one consumed). So `accounts.len() == parsed_accounts.len()` would be `1 == 1`. That makes sense — it peels one, and the vec has one. The `Vec<T>` implementation consumes exactly ONE typed account and wraps it in a Vec. This is why most production code uses `ctx.remaining_accounts` directly instead of `Vec<T>`.

---

## 4. TypeScript Client API

### The Context Type

From `/ts/packages/anchor/src/program/context.ts`:

```typescript
export type Context<A extends Accounts = Accounts> = {
  accounts?: A;
  remainingAccounts?: AccountMeta[];  // Optional array of AccountMeta
  signers?: Array<Signer>;
  preInstructions?: TransactionInstruction[];
  postInstructions?: TransactionInstruction[];
  options?: ConfirmOptions;
};
```

### The MethodsBuilder

From `/ts/packages/anchor/src/program/namespace/methods.ts`:

```typescript
export class MethodsBuilder<IDL extends Idl, I extends AllInstructions<IDL>> {
  private _remainingAccounts: Array<AccountMeta> = [];

  /**
   * Set remaining accounts.
   * Note: calling this method APPENDS to existing remaining accounts.
   */
  public remainingAccounts(accounts: Array<AccountMeta>) {
    this._remainingAccounts = this._remainingAccounts.concat(accounts);
    return this;  // fluent API
  }
}
```

### Client Usage Pattern

```typescript
import { AccountMeta } from "@solana/web3.js";

// Each remaining account is an AccountMeta: { pubkey, isSigner, isWritable }
const remainingAccounts: AccountMeta[] = destinations.map(dest => ({
  pubkey: dest.publicKey,
  isSigner: false,
  isWritable: true,
}));

// Pass via fluent .remainingAccounts() builder
await program.methods
  .batchTransfer(amounts)
  .accounts({
    authority: payer.publicKey,
    source: sourceAta,
  })
  .remainingAccounts(remainingAccounts)
  .signers([payer])
  .rpc();
```

### How the Client Embeds Remaining Accounts in the Instruction

From `/ts/packages/anchor/src/program/namespace/instruction.ts`:

```typescript
const keys = ix.accounts(ctx.accounts);  // typed accounts first

// Append remaining accounts after typed accounts
if (ctx.remainingAccounts !== undefined) {
  keys.push(...ctx.remainingAccounts);
}

return new TransactionInstruction({
  keys,
  programId,
  data: encodeFn(idlIx.name, toInstruction(idlIx, ...ixArgs)),
});
```

**Order is critical:** Typed struct accounts come FIRST, remaining accounts come AFTER. This matches the Rust handler's expectation.

### AccountMeta Type (from @solana/web3.js)

```typescript
interface AccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}
```

---

## 5. Transpilation Design for `p.remaining()`

### TypeScript Input

```typescript
batchTransfer: ix({
  accounts: {
    authority: p.signer(),
    source: p.tokenAccount(),
    destinations: p.remaining(p.tokenAccount()), // dynamic list
  },
  args: { amounts: vec(u64) },
  run: ({ authority, source, destinations }, { amounts }, ctx) => {
    for (let i = 0; i < destinations.length; i++) {
      ctx.require(destinations[i].owner === authority.key, 'InvalidOwner')
      token.transfer({
        from: source,
        to: destinations[i],
        authority,
        amount: amounts[i],
      })
    }
  }
})
```

### Generated Anchor Rust

```rust
// ═══════════════════════════════════════════
// Account validation struct
// Note: destinations NOT in the struct — they're in remaining_accounts
// ═══════════════════════════════════════════

#[derive(Accounts)]
pub struct BatchTransfer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = source.mint == /* expected mint */,
        // Token account constraint generated from p.tokenAccount()
    )]
    pub source: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    // NOTE: No `destinations` field here!
    // Remaining accounts are accessed via ctx.remaining_accounts
}

// ═══════════════════════════════════════════
// Handler function
// ═══════════════════════════════════════════

pub fn batch_transfer(
    ctx: Context<BatchTransfer>,
    amounts: Vec<u64>,
) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let source = &ctx.accounts.source;
    let destinations = &ctx.remaining_accounts;

    // Validation: check count matches
    require!(
        destinations.len() == amounts.len(),
        ErrorCode::LengthMismatch
    );

    for i in 0..destinations.len() {
        let dest_account_info = &destinations[i];

        // --- Typed deserialization with validation ---
        let dest: Account<TokenAccount> = Account::try_from(dest_account_info)
            .map_err(|_| ErrorCode::InvalidTokenAccount)?;

        // --- Ownership validation (generated from ctx.require) ---
        require!(
            dest.owner == authority.key(),
            ErrorCode::InvalidOwner
        );

        // --- Token transfer CPI ---
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: source.to_account_info(),
                    to: dest_account_info.clone(),
                    authority: authority.to_account_info(),
                },
            ),
            amounts[i],
        )?;
    }

    Ok(())
}
```

### Transpilation Design Decisions

1. **`p.remaining(T)` means:**
   - Do NOT add a field to the `#[derive(Accounts)]` struct
   - Access via `ctx.remaining_accounts` in the handler
   - Generate typed deserialization + validation code in the handler body

2. **The transpiler generates:**
   - `Account::try_from()` calls for typed deserialization of each remaining account
   - Ownership/signer checks derived from `ctx.require()` calls
   - Length validation (`destinations.len() == amounts.len()`)

3. **Client-side generation:**
   ```typescript
   // Generated client method
   async batchTransfer(args: { amounts: bigint[] }, accounts: {
     authority: PublicKey,
     source: PublicKey,
     destinations: PublicKey[],  // Array!
   }) {
     const remainingAccounts = accounts.destinations.map(pubkey => ({
       pubkey,
       isSigner: false,
       isWritable: true,  // because token.transfer writes to destination
     }));

     return this.program.methods
       .batchTransfer(args.amounts.map(BN))
       .accounts({
         authority: accounts.authority,
         source: accounts.source,
       })
       .remainingAccounts(remainingAccounts)
       .rpc();
   }
   ```

4. **Multiple remaining account groups:**

   If there are multiple `p.remaining()` fields, the transpiler uses a pairing/interleaving strategy:

   ```typescript
   // Input:
   accounts: {
     multisig: p.signer(),
     owners: p.remaining(p.signer()),
     transactions: p.remaining(Transaction),
   }

   // Generated Rust uses chunking:
   let owners_count = ctx.remaining_accounts.len() / 2;
   let (owners_accounts, transactions_accounts) =
       ctx.remaining_accounts.split_at(owners_count);
   ```

   Or more commonly, the transpiler enforces a single `p.remaining()` per instruction and uses `args` to convey count information.

---

## 6. Typed Deserialization of Remaining Accounts

### Method 1: `Account<T>::try_from` (Recommended for Anchor accounts)

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

// Deserializes and validates:
// 1. Discriminator check (first 8 bytes match T::discriminator())
// 2. Owner check (account.owner == T::owner() which is the program ID)
// 3. Data deserialization (borsh)
let token_acct: Account<TokenAccount> = Account::try_from(&ctx.remaining_accounts[i])?;
```

This is the SAFEST method because `Account::try_from` calls `T::try_deserialize` which:
1. Checks discriminator
2. Checks owner == program ID
3. Deserializes data via borsh

### Method 2: `AccountLoader<T>::try_from` (For zero-copy accounts)

```rust
let loader: AccountLoader<OpenOrdersAccount> = AccountLoader::try_from(&ctx.remaining_accounts[i])?;
let account = loader.load_mut()?;
```

### Method 3: Manual deserialization from `AccountInfo`

```rust
let data = &ctx.remaining_accounts[i].data.borrow();
let account_data: MyAccount = AnchorDeserialize::deserialize(&mut &data[8..])?;

// Manual owner check
require!(
    *ctx.remaining_accounts[i].owner == my_program::ID,
    ErrorCode::InvalidOwner
);
```

### Method 4: Using `Vec<T>` in the Accounts Struct (Limited)

```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    pub authority: Signer<'info>,
    // Consumes remaining accounts as typed T
    pub items: Vec<Account<'info, MyAccount>>,
}
```

**Limitation:** As analyzed above, Anchor's `Vec<T>` implementation currently deserializes exactly ONE account. Production code prefers manual `ctx.remaining_accounts` handling.

### Method 5: Utility function pattern (Common in production)

```rust
// Helper to deserialize a slice of remaining accounts
fn deserialize_remaining<T: AccountDeserialize + Owner>(
    accounts: &[AccountInfo],
) -> Result<Vec<T>> {
    let mut result = Vec::new();
    for ai in accounts.iter() {
        // Owner check
        require!(*ai.owner == T::owner(), ErrorCode::InvalidOwner);
        // Discriminator + deserialization
        let data: T = T::try_deserialize(&mut &ai.data.borrow()[..])?;
        result.push(data);
    }
    Ok(result)
}
```

---

## 7. Security Concerns & Transpiler Enforcement

### The Core Security Problem

`remaining_accounts` is a `&[AccountInfo]` with **zero automatic validation**. Every security check must be manually implemented. This is the single most dangerous feature in Anchor.

### Security Checklist (What MUST Be Validated)

#### 1. Program Ownership Check

**Attack:** Attacker passes an account owned by a different program (e.g., a fake token account).

```rust
// MUST validate owner for every remaining account that you deserialize or read
require!(
    *ctx.remaining_accounts[i].owner == token_program::ID,
    ErrorCode::InvalidOwner
);
```

**Transpiler enforcement:** When `p.remaining(p.tokenAccount())` is declared, generate `Account::try_from()` which automatically checks ownership via the `Owner` trait. For `Account<TokenAccount>`, it verifies the account is owned by the Token program.

#### 2. Discriminator Check

**Attack:** Attacker passes a different account type from the same program (e.g., a Mint instead of a TokenAccount).

```rust
// Account::try_from does this automatically:
// Checks that data[0..8] == T::discriminator()
let token_acct: Account<TokenAccount> = Account::try_from(&ctx.remaining_accounts[i])?;
```

**Transpiler enforcement:** Use `Account::try_from()` for typed deserialization — discriminator check is automatic.

#### 3. Signer Check

**Attack:** Attacher passes a non-signed account where a signature was expected.

```rust
// If remaining accounts need to be signers
require!(
    ctx.remaining_accounts[i].is_signer,
    ErrorCode::NotSigner
);
```

**Transpiler enforcement:** If `p.remaining(p.signer())` is declared, generate signer check code.

#### 4. Writable Check

**Attack:** Transaction specifies an account as read-only, but the program writes to it (silent data loss).

```rust
// If you need to write to the account
require!(
    ctx.remaining_accounts[i].is_writable,
    ErrorCode::NotWritable
);
```

**Transpiler enforcement:** If the `run()` body writes to a remaining account (e.g., via `token.transfer` where it's the `to` field), mark it as writable in generated client code.

#### 5. Length/Count Validation

**Attack:** Attacker passes wrong number of accounts, causing out-of-bounds access.

```rust
require!(
    ctx.remaining_accounts.len() == expected_count,
    ErrorCode::InvalidAccountCount
);
```

**Transpiler enforcement:** Generate length assertions based on args. If `args.amounts` is a `Vec<u64>` and `destinations` is `p.remaining(p.tokenAccount())`, assert `remaining_accounts.len() == amounts.len()`.

#### 6. Duplicate Account Check

**Attack:** Same account passed twice as different remaining accounts, causing double-spend.

```rust
// Check for duplicates
let mut seen = std::collections::HashSet::new();
for ai in ctx.remaining_accounts.iter() {
    require!(seen.insert(*ai.key), ErrorCode::DuplicateAccount);
}
```

**Transpiler enforcement:** Generate duplicate checks when `p.remaining()` accounts receive funds.

#### 7. Re-initialization Attack

**Attack:** An account that was closed gets re-passed as a remaining account.

```rust
// For new accounts, check they don't already exist
require!(
    ctx.remaining_accounts[i].data.borrow().is_empty() || 
    /* discriminator check */,
    ErrorCode::AccountAlreadyInitialized
);
```

### Transpiler Security Generation Rules

| TS Declaration | Generated Rust Validation |
|---|---|
| `p.remaining(p.tokenAccount())` | `Account::<TokenAccount>::try_from(&remaining[i])?` (owner + discriminator + deserialization) |
| `p.remaining(p.signer())` | `require!(remaining[i].is_signer, Error::NotSigner)` |
| `p.remaining(p.mut(p.tokenAccount()))` | `Account::<TokenAccount>::try_from(remaining[i])?` + `require!(remaining[i].is_writable)` |
| `p.remaining(MyAccount)` | `Account::<MyAccount>::try_from(remaining[i])?` (checks owner == program_id + discriminator) |
| `ctx.require(dest.owner === authority, 'InvalidOwner')` | `require!(dest.owner == authority.key(), ErrorCode::InvalidOwner)` |

### Generated Validation Template

For the batchTransfer example, the transpiler should generate:

```rust
// 1. Length check
require!(
    ctx.remaining_accounts.len() == amounts.len(),
    ErrorCode::LengthMismatch
);

// 2. Per-account typed deserialization + validation
let destinations: Vec<Account<TokenAccount>> = ctx.remaining_accounts
    .iter()
    .map(|ai| {
        // Account::try_from checks: owner == token_program, discriminator, deserialization
        Account::<TokenAccount>::try_from(ai)
            .map_err(|_| ErrorCode::InvalidTokenAccount.into())
    })
    .collect::<Result<Vec<_>>>()?;

// 3. Custom validations from ctx.require() calls
for i in 0..destinations.len() {
    require!(
        destinations[i].owner == ctx.accounts.authority.key(),
        ErrorCode::InvalidOwner
    );
}

// 4. Business logic (token transfers)
for i in 0..destinations.len() {
    token::transfer(/* ... */)?;
}
```

---

## Summary: `p.remaining()` Transpilation Architecture

```
TypeScript                           Generated Rust
─────────────────────────────────    ─────────────────────────────────
p.remaining(p.tokenAccount())   →   ctx.remaining_accounts
                                      + Account::<TokenAccount>::try_from() per item

p.remaining(p.signer())         →   ctx.remaining_accounts
                                      + is_signer check per item

for (dest of destinations)      →   for i in 0..remaining.len() {
  ctx.require(dest.owner === X  →     require!(typed[i].owner == X.key(), Error);
  token.transfer(...)           →     token::transfer(cpi_ctx, amount)?;
}                                      }

Client .remainingAccounts([...]) →   accounts appended AFTER struct fields
                                      in TransactionInstruction.keys
```

The key design principle: **`p.remaining(T)` tells the transpiler to generate typed deserialization with full Anchor validation** (owner check, discriminator check, borsh deserialization) instead of leaving accounts as raw `AccountInfo`.
