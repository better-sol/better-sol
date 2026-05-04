# Token-2022 CPI in Anchor — Exhaustive Reference

Deep-dive reference: anchor-spl Token-2022 modules, CPI functions, feature flags. Verified against source. For internal use only — informs transpiler CPI generation.

---

Source: `anchor-spl v1.0.1`, `spl-token-2022` actual crate source code.

---

## 1. anchor-spl Token-2022 Modules

anchor-spl exposes **5 modules** relevant to Token-2022, gated by Cargo features:

| Module | Feature Flag | What It Provides |
|--------|-------------|-----------------|
| `token` | `token` | SPL Token (classic) CPI wrappers: `transfer`, `mint_to`, `burn`, `approve`, `initialize_account`, `close_account`, `freeze_account`, `thaw_account`, `initialize_mint`, `set_authority`, `sync_native`. Account types: `TokenAccount`, `Mint`. Program ID struct: `Token`. |
| `token_2022` | `token_2022` | SPL Token-2022 CPI wrappers: all of the above PLUS `transfer_checked`, `mint_to_checked`, `burn_checked`, `approve_checked`, `initialize_mint2`, `initialize_mint_close_authority`, `initialize_immutable_owner`, `get_account_data_size`, `amount_to_ui_amount`, `ui_amount_to_amount`. Account types: none (uses raw `AccountInfo`). Program ID struct: `Token2022`. |
| `token_2022_extensions` | `token_2022_extensions` | Extension-specific CPI: `transfer_fee_initialize`, `transfer_checked_with_fee`, `harvest_withheld_tokens_to_mint`, `withdraw_withheld_tokens_from_mint`, `withdraw_withheld_tokens_from_accounts`, `cpi_guard_enable`, `cpi_guard_disable`, `default_account_state_initialize`, `default_account_state_update`, `memo_transfer_initialize`, `memo_transfer_disable`, `interest_bearing_mint_initialize`, `interest_bearing_mint_update_rate`, `non_transferable_mint_initialize`, `permanent_delegate_initialize`, `transfer_hook_initialize`, `transfer_hook_update`, `mint_close_authority_initialize`, `immutable_owner_initialize`, and more (group, metadata, confidential). |
| `token_interface` | `token_2022` | **Unified interface** that works with BOTH Token and Token-2022. Re-exports all functions from `token_2022` and `token_2022_extensions`. Provides `TokenAccount` and `Mint` types that accept either program as owner. Provides `TokenInterface` program ID struct. Helper functions: `find_mint_account_size`, `get_mint_extension_data`. |
| `associated_token` | `associated_token` | ATA creation CPI: `create`, `create_idempotent`. Both accept a `token_program` account so they work with either Token or Token-2022. |

### Feature Dependencies

```toml
# Cargo.toml — minimum for Token-2022 support
[dependencies]
anchor-spl = { version = "1.0.1", features = [
    "token",           # classic Token (optional, for backward compat)
    "token_2022",      # Token-2022 core + token_interface
    "token_2022_extensions",  # extension CPI calls
    "associated_token",  # ATA creation
    "mint",            # well-known mint addresses
] }
```

**Default features** already include: `associated_token`, `mint`, `token`, `token_2022`, `token_2022_extensions`.

---

## 2. Token vs Token-2022 CPI — Side-by-Side

### Key Difference: Program ID handling

```rust
// === token (classic) ===
// Hardcodes &spl_token::ID in every instruction
let ix = spl_token::instruction::transfer(
    &spl_token::ID,       // ← HARDCODED
    ctx.accounts.from.key,
    ...
);

// === token_2022 ===
// Uses ctx.program.key (dynamic — comes from CpiContext)
let ix = spl_token_2022::instruction::transfer(
    ctx.program.key,       // ← DYNAMIC (passed in via CpiContext)
    ctx.accounts.from.key,
    ...
);
```

This is the **critical design difference**: `token_2022` module uses `CpiContext.program` as the token program ID, while `token` hardcodes `spl_token::ID`.

### Transfer Comparison

```rust
// ═══════════════════════════════════════════════════
// token::transfer — Classic SPL Token
// ═══════════════════════════════════════════════════
use anchor_spl::token::{self, Token, Transfer};

// Accounts struct for Transfer: { from, to, authority }
// No mint account needed
// Uses invoke_signed (supports PDA signers)
token::transfer(
    CpiContext::new(token_program.to_account_info(), Transfer {
        from: from_account.to_account_info(),
        to: to_account.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,  // u64
)?;

// ═══════════════════════════════════════════════════
// token_2022::transfer — Token-2022 (DEPRECATED)
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022::{self, Token2022, Transfer};

// Same accounts: { from, to, authority }
// DEPRECATED since 0.28.0 — use transfer_checked instead
#[allow(deprecated)]
token_2022::transfer(
    CpiContext::new(token_program.to_account_info(), Transfer {
        from: from_account.to_account_info(),
        to: to_account.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,  // u64
)?;
// WARNING: Does NOT work with transfer fee or transfer hook mints!
// Will fail with TokenError::MintRequiredForTransfer

// ═══════════════════════════════════════════════════
// token_2022::transfer_checked — Token-2022 (RECOMMENDED)
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022::{self, Token2022, TransferChecked};

// Accounts struct for TransferChecked: { from, mint, to, authority }
// REQUIRES mint account and decimals
token_2022::transfer_checked(
    CpiContext::new(token_program.to_account_info(), TransferChecked {
        from: from_account.to_account_info(),
        mint: mint.to_account_info(),
        to: to_account.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,   // u64
    decimals, // u8
)?;
// Works with ALL extensions: transfer fee, transfer hook, etc.
// The Token-2022 processor uses the mint to look up extensions.
```

### Why transfer_checked is Required for Token-2022

From the spl-token-2022 processor source (processor.rs):

1. **Transfer fee**: The processor reads the `TransferFeeConfig` extension from the mint to calculate the fee. Without the mint, it can't calculate fees and returns `TokenError::MintRequiredForTransfer`.

2. **Transfer hook**: The processor reads the `TransferHook` extension from the mint to find the hook program, then does a CPI to that program's `execute` instruction. Without the mint, it can't find the hook and returns `TokenError::MintRequiredForTransfer`.

3. **Permanent delegate**: The processor reads the `PermanentDelegate` extension from the mint. The delegate can sign for any transfer/burn from any account.

4. **CPI Guard**: Checked on source account. If `lock_cpi` is true and authority is the owner and `in_cpi()` is true, the transfer is blocked.

### transfer_checked with Fee

```rust
// ═══════════════════════════════════════════════════
// transfer_fee::transfer_checked_with_fee — Transfer with explicit fee
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022_extensions::transfer_fee::{
    self, TransferCheckedWithFee,
};

transfer_fee::transfer_checked_with_fee(
    CpiContext::new(token_program.to_account_info(), TransferCheckedWithFee {
        token_program_id: token_program.to_account_info(),
        source: from_account.to_account_info(),
        mint: mint.to_account_info(),
        destination: to_account.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,   // u64 — pre-fee amount
    decimals, // u8
    fee,      // u64 — expected fee (must match calculated fee)
)?;
// If fee doesn't match the calculated fee, returns TokenError::FeeMismatch
// Destination receives (amount - fee)
```

### token_interface — Unified Transfer (works with both programs)

```rust
use anchor_spl::token_interface::{self, TokenInterface, TransferChecked};

// token_interface re-exports token_2022::transfer_checked
// It's the SAME function — uses CpiContext.program dynamically
token_interface::transfer_checked(
    CpiContext::new(token_program.to_account_info(), TransferChecked {
        from: from_account.to_account_info(),
        mint: mint.to_account_info(),
        to: to_account.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
    decimals,
)?;

// token_program can be EITHER spl_token::ID or spl_token_2022::ID
// If it's classic Token, the mint+decimals are validated but extensions are ignored
// If it's Token-2022, extensions are processed
```

---

## 3. Token-2022 Extension CPI Calls — Complete Reference

### 3a. Transfer Fee

```rust
use anchor_spl::token_2022_extensions::transfer_fee::{
    transfer_fee_initialize, TransferFeeInitialize,
    transfer_fee_set, TransferFeeSetTransferFee,
    transfer_checked_with_fee, TransferCheckedWithFee,
    harvest_withheld_tokens_to_mint, HarvestWithheldTokensToMint,
    withdraw_withheld_tokens_from_mint, WithdrawWithheldTokensFromMint,
    withdraw_withheld_tokens_from_accounts, WithdrawWithheldTokensFromAccounts,
};

// ─── Initialize transfer fee config on mint ───
// Must be called BEFORE initialize_mint2
transfer_fee_initialize(
    CpiContext::new(token_program.to_account_info(), TransferFeeInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    Some(&transfer_fee_authority_pubkey),  // Option<&Pubkey>
    Some(&withdraw_withheld_authority_pubkey),  // Option<&Pubkey>
    100,    // transfer_fee_basis_points: u16 (e.g., 100 = 1%)
    5000,   // maximum_fee: u64 (max fee in lamports)
)?;

// ─── Update transfer fee ───
transfer_fee_set(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferFeeSetTransferFee {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            authority: authority.to_account_info(),
        },
        &[&[b"mint-authority", &[bump]]],
    ),
    200,    // new fee basis points
    10000,  // new maximum fee
)?;

// ─── Transfer with fee ───
transfer_checked_with_fee(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferCheckedWithFee {
            token_program_id: token_program.to_account_info(),
            source: source.to_account_info(),
            mint: mint.to_account_info(),
            destination: destination.to_account_info(),
            authority: authority.to_account_info(),
        },
        &[&[b"authority", &[bump]]],
    ),
    1000,   // amount
    9,      // decimals
    10,     // expected fee (must match calculated fee)
)?;

// ─── Harvest withheld tokens to mint ───
// Collects withheld fees from accounts into the mint
harvest_withheld_tokens_to_mint(
    CpiContext::new(token_program.to_account_info(), HarvestWithheldTokensToMint {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    vec![account1.to_account_info(), account2.to_account_info()], // sources
)?;

// ─── Withdraw withheld tokens from mint ───
// Authority withdraws accumulated fees from the mint to a destination account
withdraw_withheld_tokens_from_mint(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        WithdrawWithheldTokensFromMint {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            destination: destination.to_account_info(),
            authority: authority.to_account_info(),
        },
        &[&[b"withdraw-authority", &[bump]]],
    ),
)?;

// ─── Withdraw withheld tokens from accounts ───
// Withdraws withheld fees directly from token accounts
withdraw_withheld_tokens_from_accounts(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        WithdrawWithheldTokensFromAccounts {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            destination: destination.to_account_info(),
            authority: authority.to_account_info(),
        },
        &[&[b"withdraw-authority", &[bump]]],
    ),
    vec![account1.to_account_info(), account2.to_account_info()], // sources
)?;
```

### 3b. Close Authority

```rust
use anchor_spl::token_2022_extensions::mint_close_authority::{
    mint_close_authority_initialize, MintCloseAuthorityInitialize,
};

// ─── Initialize mint close authority ───
// Must be called BEFORE initialize_mint2
// Allows the mint account itself to be closed (lamports reclaimed)
mint_close_authority_initialize(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        MintCloseAuthorityInitialize {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
        },
        &[&[b"mint", &[mint_bump]]],
    ),
    Some(&close_authority_pubkey),  // Option<&Pubkey> — who can close the mint
)?;

// After this + initialize_mint2, the close authority can call:
// token_2022::close_account() on the MINT itself
```

### 3c. CPI Guard

```rust
use anchor_spl::token_2022_extensions::cpi_guard::{
    cpi_guard_enable, cpi_guard_disable, CpiGuard,
};

// ─── Enable CPI Guard ───
// When enabled, blocks token transfers where the owner is the authority
// during CPI calls. Prevents malicious programs from stealing tokens.
cpi_guard_enable(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        CpiGuard {
            token_program_id: token_program.to_account_info(),
            account: token_account.to_account_info(),
            owner: owner.to_account_info(),
        },
        &[&[b"owner", &[bump]]],
    ),
)?;

// ─── Disable CPI Guard ───
cpi_guard_disable(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        CpiGuard {
            token_program_id: token_program.to_account_info(),
            account: token_account.to_account_info(),
            owner: owner.to_account_info(),
        },
        &[&[b"owner", &[bump]]],
    ),
)?;
```

**CPI Guard Behavior During Transfers** (from processor.rs):
```rust
// In the Token-2022 processor, during any transfer:
if let Ok(cpi_guard) = source_account.get_extension::<CpiGuard>() {
    if *authority_info.key == source_account.base.owner   // authority is the owner
        && cpi_guard.lock_cpi.into()                       // guard is enabled
        && in_cpi()                                        // we're in a CPI
    {
        return Err(TokenError::CpiGuardTransferBlocked.into());
    }
}
```
This means: if CPI Guard is enabled on a token account, the **owner** cannot
transfer tokens via CPI. Only **delegates** (including permanent delegate) can
transfer. This is the key security feature.

### 3d. Default Account State

```rust
use anchor_spl::token_2022_extensions::default_account_state::{
    default_account_state_initialize, DefaultAccountStateInitialize,
    default_account_state_update, DefaultAccountStateUpdate,
};
use spl_token_2022::state::AccountState;

// ─── Initialize default account state ───
// All new token accounts for this mint will start in this state
// Must be called BEFORE initialize_mint2
default_account_state_initialize(
    CpiContext::new(token_program.to_account_info(), DefaultAccountStateInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    &AccountState::Frozen,  // or AccountState::Initialized
)?;
// Use case: set default to Frozen so users must go through KYC to unfreeze

// ─── Update default account state ───
// Requires freeze_authority
default_account_state_update(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        DefaultAccountStateUpdate {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            freeze_authority: freeze_authority.to_account_info(),
        },
        &[&[b"freeze-authority", &[bump]]],
    ),
    &AccountState::Initialized,  // change default to unfrozen
)?;
```

### 3e. Memo Required (Required Transfer Memos)

```rust
use anchor_spl::token_2022_extensions::memo_transfer::{
    memo_transfer_initialize, memo_transfer_disable, MemoTransfer,
};

// ─── Enable required transfer memos ───
// All incoming transfers to this account must include a memo instruction
memo_transfer_initialize(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        MemoTransfer {
            token_program_id: token_program.to_account_info(),
            account: token_account.to_account_info(),
            owner: owner.to_account_info(),
        },
        &[&[b"owner", &[bump]]],
    ),
)?;

// ─── Disable required transfer memos ───
memo_transfer_disable(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        MemoTransfer {
            token_program_id: token_program.to_account_info(),
            account: token_account.to_account_info(),
            owner: owner.to_account_info(),
        },
        &[&[b"owner", &[bump]]],
    ),
)?;

// To transfer TO a memo-required account, include a memo instruction first:
use anchor_spl::memo;
// The memo instruction must precede the transfer instruction in the same transaction
```

### 3f. Interest-Bearing Mint

```rust
use anchor_spl::token_2022_extensions::interest_bearing_mint::{
    interest_bearing_mint_initialize, InterestBearingMintInitialize,
    interest_bearing_mint_update_rate, InterestBearingMintUpdateRate,
};

// ─── Initialize interest-bearing mint ───
// Must be called BEFORE initialize_mint2
interest_bearing_mint_initialize(
    CpiContext::new(token_program.to_account_info(), InterestBearingMintInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    Some(rate_authority_pubkey),  // Option<Pubkey> — who can update rate
    1000,   // rate: i16 — basis points per year (100 = 1%, -100 = -1%)
            // stored as i16, range: -32768 to 32767
)?;

// ─── Update interest rate ───
interest_bearing_mint_update_rate(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        InterestBearingMintUpdateRate {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            rate_authority: rate_authority.to_account_info(),
        },
        &[&[b"rate-authority", &[bump]]],
    ),
    1500,   // new rate
)?;
```

### 3g. Non-Transferable Mint

```rust
use anchor_spl::token_2022_extensions::non_transferable::{
    non_transferable_mint_initialize, NonTransferableMintInitialize,
};

// ─── Initialize non-transferable mint ───
// Tokens cannot be transferred between accounts
// Use case: soul-bound tokens, badges, credentials
// Must be called BEFORE initialize_mint2
non_transferable_mint_initialize(
    CpiContext::new(token_program.to_account_info(), NonTransferableMintInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    },
))?;
// NOTE: no signer seeds needed — the mint account itself must be a signer
// (it's being created, so the PDA signer is implicit)
```

### 3h. Permanent Delegate

```rust
use anchor_spl::token_2022_extensions::permanent_delegate::{
    permanent_delegate_initialize, PermanentDelegateInitialize,
};

// ─── Initialize permanent delegate ───
// The delegate can transfer/burn tokens from ANY account for this mint
// Must be called BEFORE initialize_mint2
permanent_delegate_initialize(
    CpiContext::new(token_program.to_account_info(), PermanentDelegateInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    &delegate_pubkey,  // &Pubkey — the permanent delegate
)?;

// ─── How permanent delegate affects transfers ───
// When a transfer's authority matches the permanent delegate:
// 1. The delegate is treated as having authority over the source account
// 2. Balance checks are bypassed (can transfer more than balance?)
//    NO — the source still must have sufficient balance
// 3. The delegate doesn't need to be the owner of the account
//
// In the processor (processor.rs):
//   match (source_account.base.delegate, maybe_permanent_delegate) {
//       (_, Some(ref delegate)) if authority_info.key == delegate => {
//           Self::validate_owner(...)  // delegate signs for the transfer
//       }
//       ...
//   }
//
// To use as CPI:
token_2022::transfer_checked(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferChecked {
            from: any_source_account.to_account_info(),
            mint: mint.to_account_info(),
            to: any_destination.to_account_info(),
            authority: permanent_delegate.to_account_info(),
        },
        &[&[b"permanent-delegate", &[bump]]],
    ),
    amount,
    decimals,
)?;
```

### 3i. Transfer Hook

```rust
use anchor_spl::token_2022_extensions::transfer_hook::{
    transfer_hook_initialize, TransferHookInitialize,
    transfer_hook_update, TransferHookUpdate,
};

// ─── Initialize transfer hook ───
// Must be called BEFORE initialize_mint2
transfer_hook_initialize(
    CpiContext::new(token_program.to_account_info(), TransferHookInitialize {
        token_program_id: token_program.to_account_info(),
        mint: mint.to_account_info(),
    }),
    Some(authority_pubkey),           // Option<Pubkey> — who can update hook
    Some(transfer_hook_program_id),   // Option<Pubkey> — the hook program
)?;

// ─── Update transfer hook program ───
transfer_hook_update(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferHookUpdate {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
            authority: hook_authority.to_account_info(),
        },
        &[&[b"hook-authority", &[bump]]],
    ),
    Some(new_hook_program_id),  // Option<Pubkey>
)?;

// ─── How transfer hook affects transfers ───
// From the Token-2022 processor (processor.rs):
//
// During transfer_checked:
// 1. Set `transferring = true` on BOTH source and destination accounts
// 2. CPI to the hook program's `execute` instruction:
//    - Accounts: source, mint, destination, authority, + extra accounts
//    - Data: amount
// 3. Set `transferring = false` on both accounts
//
// The hook program can:
// - Enforce custom transfer rules (whitelist, KYC, limits)
// - Emit events or update external state
// - Fail the transfer by returning an error
// - Access additional accounts passed after the standard transfer accounts
//
// IMPORTANT for CPI:
// - transfer_checked works — the processor automatically invokes the hook
// - transfer (deprecated) will FAIL with MintRequiredForTransfer
// - Extra accounts for the hook can be passed in the remaining account infos
// - The hook program's `execute` instruction signature:
//     fn execute(source, mint, destination, authority, ...extra_accounts, amount)
```

---

## 4. Account Type Differences

### token::TokenAccount vs token_interface::TokenAccount

```rust
// ═══════════════════════════════════════════════════
// token::TokenAccount — Only accepts spl_token::ID as owner
// ═══════════════════════════════════════════════════
use anchor_spl::token::TokenAccount;

// Source: uses spl_token::state::Account::unpack (no extensions)
impl anchor_lang::AccountDeserialize for TokenAccount {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        spl_token::state::Account::unpack(buf)  // ← No extension support
            .map(TokenAccount)
            .map_err(Into::into)
    }
}

impl anchor_lang::Owner for TokenAccount {
    fn owner() -> Pubkey {
        ID  // ← Only spl_token::ID (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
    }
}
// Usage in Account struct:
//   #[account(
//       token::mint = mint,
//       token::authority = authority,
//   )]
//   pub my_token_account: Account<'info, TokenAccount>,
// FAILS if account is owned by Token-2022 program!


// ═══════════════════════════════════════════════════
// token_interface::TokenAccount — Accepts BOTH programs as owner
// ═══════════════════════════════════════════════════
use anchor_spl::token_interface::TokenAccount;

// Source: uses StateWithExtensions::<spl_token_2022::state::Account>::unpack
impl anchor_lang::AccountDeserialize for TokenAccount {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Account>::unpack(buf)
            .map(|t| TokenAccount(t.base))  // ← Unpacks extensions, returns base
            .map_err(Into::into)
    }
}

// Uses Owners trait (plural) instead of Owner
impl anchor_lang::Owners for TokenAccount {
    fn owners() -> &'static [Pubkey] {
        &IDS  // ← [spl_token::ID, spl_token_2022::ID]
    }
}
// Usage in Account struct:
//   #[account(
//       token::mint = mint,
//       token::authority = authority,
//   )]
//   pub my_token_account: Account<'info, token_interface::TokenAccount>,
// Works with EITHER Token or Token-2022!


// ═══════════════════════════════════════════════════
// token_interface::Mint — Also accepts both programs
// ═══════════════════════════════════════════════════
use anchor_spl::token_interface::Mint;

// Same pattern: StateWithExtensions unpacking, Owners trait with both IDs
impl anchor_lang::Owners for Mint {
    fn owners() -> &'static [Pubkey] {
        &IDS  // [spl_token::ID, spl_token_2022::ID]
    }
}
```

### Program ID Structs

```rust
// For Account constraints like `constraint = token_program.key() == &token::ID`
use anchor_spl::token::Token;       // impl Id: fn id() -> spl_token::ID
use anchor_spl::token_2022::Token2022;  // impl Id: fn id() -> spl_token_2022::ID
use anchor_spl::token_interface::TokenInterface;  // impl Ids: fn ids() -> &[spl_token::ID, spl_token_2022::ID]
use anchor_spl::associated_token::AssociatedToken;  // impl Id: fn id() -> spl_associated_token_account::ID
```

### When to Use Which

| Scenario | Account Type | Program ID |
|----------|-------------|------------|
| Program only uses classic Token | `token::TokenAccount` | `Token` |
| Program only uses Token-2022 | `token_interface::TokenAccount` | `Token2022` |
| **Program works with both** | `token_interface::TokenAccount` | `TokenInterface` |
| Need to read extension data | Manual `StateWithExtensions` unpacking | — |

### Reading Extension Data

```rust
use anchor_spl::token_interface::get_mint_extension_data;
use spl_token_2022::extension::transfer_fee::TransferFeeConfig;

// Read transfer fee config from a mint account
let fee_config: TransferFeeConfig = get_mint_extension_data::<TransferFeeConfig>(
    &ctx.accounts.mint.to_account_info(),
)?;

// Calculate mint account size with extensions
use anchor_spl::token_interface::{find_mint_account_size, ExtensionsVec};
use spl_token_2022::extension::ExtensionType;

let extensions: ExtensionsVec = vec![
    ExtensionType::TransferFeeConfig,
    ExtensionType::MintCloseAuthority,
    ExtensionType::TransferHook,
];
let mint_size = find_mint_account_size(Some(&extensions))?;
// Use this size when creating the mint account via system_program::create_account
```

---

## 5. Token-2022 CPI with PDA Signers

### Basic Pattern (Same as classic Token)

```rust
use anchor_spl::token_2022::{self, Token2022, TransferChecked};

// PDA-signed transfer
let seeds = &[b"vault", mint.as_ref(), &[vault_bump]];
let signer_seeds = &[&seeds[..]];

token_2022::transfer_checked(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferChecked {
            from: vault_token_account.to_account_info(),
            mint: mint.to_account_info(),
            to: destination.to_account_info(),
            authority: vault.to_account_info(),  // ← PDA is the authority
        },
        signer_seeds,  // ← PDA seeds
    ),
    amount,
    decimals,
)?;
```

### CPI Guard + PDA Signers

When CPI Guard is enabled on an account:
- The **owner** cannot be the signing authority during CPI
- But a **delegate** (including close delegate, permanent delegate) CAN sign
- PDA signers still work as delegates

```rust
// This WILL FAIL if CPI Guard is enabled and authority == owner:
// token_2022::transfer_checked(
//     CpiContext::new_with_signer(token_program, TransferChecked {
//         from: guarded_account, mint, to, authority: owner  // ← BLOCKED
//     }, signer_seeds),
//     amount, decimals,
// )?;

// Workaround: use a delegate
// 1. First approve a delegate:
token_2022::approve_checked(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        ApproveChecked {
            to: guarded_account.to_account_info(),
            mint: mint.to_account_info(),
            delegate: delegate_pda.to_account_info(),
            authority: owner.to_account_info(),
        },
        &[&[b"owner", &[bump]]],
    ),
    amount,
    decimals,
)?;

// 2. Transfer using the delegate as authority (NOT in CPI — must be top-level or non-CPI context)
// OR use permanent delegate which bypasses CPI guard
```

### Extension CPI with PDA Signers

All extension CPI calls follow the same `CpiContext::new_with_signer` pattern:

```rust
// Extension CPIs have a `token_program_id` account that must be included
// Example: transfer_fee_initialize with PDA signing for the mint
let seeds = &[b"mint", &[mint_bump]];

transfer_fee_initialize(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferFeeInitialize {
            token_program_id: token_program.to_account_info(),  // ← Always first
            mint: mint.to_account_info(),
        },
        &[seeds],
    ),
    Some(&fee_authority),
    Some(&withdraw_authority),
    100,   // basis_points
    5000,  // max_fee,
)?;
```

---

## 6. Transpilation Mapping — TypeScript to Anchor Rust

### Full Mint Creation with Extensions (Token-2022)

```typescript
// ═══════════════════════════════════════════════════
// TypeScript Input
// ═══════════════════════════════════════════════════
token.initializeMint({
  mint,
  decimals: 9,
  authority: mintAuthority,
  freezeAuthority: freezeAuth,
  extensions: [
    { type: 'transferFee', feeAuthority, withdrawAuthority, basisPoints: 100, maxFee: 5000 },
    { type: 'closeAuthority', authority: closeAuth },
    { type: 'transferHook', authority: hookAuth, programId: hookProgram },
    { type: 'nonTransferable' },
    { type: 'permanentDelegate', delegate: delegatePubkey },
    { type: 'interestBearing', rateAuthority, rate: 1000 },
    { type: 'defaultAccountState', state: 'frozen' },
  ]
})
```

```rust
// ═══════════════════════════════════════════════════
// Transpiled Anchor Rust
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022::{self, Token2022, InitializeMint2};
use anchor_spl::token_2022_extensions::transfer_fee::{
    transfer_fee_initialize, TransferFeeInitialize,
};
use anchor_spl::token_2022_extensions::mint_close_authority::{
    mint_close_authority_initialize, MintCloseAuthorityInitialize,
};
use anchor_spl::token_2022_extensions::transfer_hook::{
    transfer_hook_initialize, TransferHookInitialize,
};
use anchor_spl::token_2022_extensions::non_transferable::{
    non_transferable_mint_initialize, NonTransferableMintInitialize,
};
use anchor_spl::token_2022_extensions::permanent_delegate::{
    permanent_delegate_initialize, PermanentDelegateInitialize,
};
use anchor_spl::token_2022_extensions::interest_bearing_mint::{
    interest_bearing_mint_initialize, InterestBearingMintInitialize,
};
use anchor_spl::token_2022_extensions::default_account_state::{
    default_account_state_initialize, DefaultAccountStateInitialize,
};
use anchor_spl::token_interface::{find_mint_account_size, ExtensionsVec};
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::state::AccountState;

pub fn create_token_2022_mint(ctx: Context<CreateToken2022Mint>, decimals: u8) -> Result<()> {
    let token_program = ctx.accounts.token_program.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let seeds = &[b"mint", &[ctx.bumps.mint]];

    // Calculate account size for all extensions
    let extensions: ExtensionsVec = vec![
        ExtensionType::TransferFeeConfig,
        ExtensionType::MintCloseAuthority,
        ExtensionType::TransferHook,
        ExtensionType::NonTransferable,
        ExtensionType::PermanentDelegate,
        ExtensionType::InterestBearingConfig,
        ExtensionType::DefaultAccountState,
    ];
    let mint_size = find_mint_account_size(Some(&extensions))?;

    // Create mint account with enough space
    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.payer.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: mint.clone(),
            },
            &[seeds],
        ),
        Rent::get()?.minimum_balance(mint_size),
        mint_size as u64,
        token_program.key,
    )?;

    // ─── Initialize extensions (BEFORE initialize_mint2) ───

    // Transfer fee
    transfer_fee_initialize(
        CpiContext::new_with_signer(token_program.clone(), TransferFeeInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        Some(&ctx.accounts.fee_authority.key()),
        Some(&ctx.accounts.withdraw_authority.key()),
        100,   // basis_points
        5000,  // max_fee
    )?;

    // Close authority
    mint_close_authority_initialize(
        CpiContext::new_with_signer(token_program.clone(), MintCloseAuthorityInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        Some(&ctx.accounts.close_authority.key()),
    )?;

    // Transfer hook
    transfer_hook_initialize(
        CpiContext::new_with_signer(token_program.clone(), TransferHookInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        Some(ctx.accounts.hook_authority.key()),
        Some(ctx.accounts.hook_program.key()),
    )?;

    // Non-transferable
    non_transferable_mint_initialize(
        CpiContext::new_with_signer(token_program.clone(), NonTransferableMintInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
    )?;

    // Permanent delegate
    permanent_delegate_initialize(
        CpiContext::new_with_signer(token_program.clone(), PermanentDelegateInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        &ctx.accounts.delegate.key(),
    )?;

    // Interest-bearing
    interest_bearing_mint_initialize(
        CpiContext::new_with_signer(token_program.clone(), InterestBearingMintInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        Some(ctx.accounts.rate_authority.key()),
        1000,  // rate
    )?;

    // Default account state
    default_account_state_initialize(
        CpiContext::new_with_signer(token_program.clone(), DefaultAccountStateInitialize {
            token_program_id: token_program.clone(),
            mint: mint.clone(),
        }, &[seeds]),
        &AccountState::Frozen,
    )?;

    // ─── Initialize the mint (AFTER all extensions) ───
    token_2022::initialize_mint2(
        CpiContext::new_with_signer(token_program.clone(), InitializeMint2 {
            mint: mint.clone(),
        }, &[seeds]),
        decimals,
        &ctx.accounts.mint_authority.key(),
        Some(&ctx.accounts.freeze_authority.key()),
    )?;

    Ok(())
}
```

### Transfer Transpilation

```typescript
// ═══════════════════════════════════════════════════
// TypeScript — Standard transfer (works with both Token and Token-2022)
// ═══════════════════════════════════════════════════
token.transfer({ from, to, authority, amount })
```

```rust
// ═══════════════════════════════════════════════════
// Transpiled Rust — detect which token program
// ═══════════════════════════════════════════════════

// If token_program == spl_token::ID (classic Token):
use anchor_spl::token::{self, Token, Transfer};
token::transfer(
    CpiContext::new(token_program.to_account_info(), Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
)?;

// If token_program == spl_token_2022::ID (Token-2022):
// MUST use transfer_checked, NOT transfer (deprecated for Token-2022)
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
token_2022::transfer_checked(
    CpiContext::new(token_program.to_account_info(), TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),  // ← REQUIRED for Token-2022
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
    decimals,  // ← REQUIRED for Token-2022
)?;

// UNIFIED (works with either):
use anchor_spl::token_interface::{self, TokenInterface, TransferChecked};
// Same as token_2022::transfer_checked — CpiContext.program determines behavior
token_interface::transfer_checked(
    CpiContext::new(token_program.to_account_info(), TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
    decimals,
)?;
```

```typescript
// ═══════════════════════════════════════════════════
// TypeScript — Token-2022 specific
// ═══════════════════════════════════════════════════
token.transferChecked({ from, to, authority, mint, amount, decimals })
```

```rust
// ═══════════════════════════════════════════════════
// Transpiled Rust
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022::{self, Token2022, TransferChecked};

token_2022::transfer_checked(
    CpiContext::new(token_program.to_account_info(), TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
    decimals,
)?;
```

```typescript
// ═══════════════════════════════════════════════════
// TypeScript — Transfer with fee
// ═══════════════════════════════════════════════════
token.transferCheckedWithFee({ from, to, authority, mint, amount, decimals, fee })
```

```rust
// ═══════════════════════════════════════════════════
// Transpiled Rust
// ═══════════════════════════════════════════════════
use anchor_spl::token_2022_extensions::transfer_fee::{
    transfer_checked_with_fee, TransferCheckedWithFee,
};

transfer_checked_with_fee(
    CpiContext::new(token_program.to_account_info(), TransferCheckedWithFee {
        token_program_id: token_program.to_account_info(),
        source: from.to_account_info(),
        mint: mint.to_account_info(),
        destination: to.to_account_info(),
        authority: authority.to_account_info(),
    }),
    amount,
    decimals,
    fee,
)?;
```

```typescript
// ═══════════════════════════════════════════════════
// TypeScript — Initialize mint with extensions
// ═══════════════════════════════════════════════════
token.initializeMint({
  mint,
  decimals: 9,
  authority: mintAuthority,
  freezeAuthority: freezeAuth,
  extensions: [
    { type: 'transferFee', feeAuthority, withdrawAuthority, basisPoints: 100, maxFee: 5000 },
    { type: 'closeAuthority', authority: closeAuth },
  ]
})
```

```rust
// ═══════════════════════════════════════════════════
// Transpiled Rust — see full example in section above
// ═══════════════════════════════════════════════════
// 1. Calculate mint size with ExtensionType list
// 2. Create account with system_program
// 3. Initialize each extension (BEFORE initialize_mint2)
// 4. Call initialize_mint2
```

### Extension Type to ExtensionType Mapping

```typescript
// TypeScript extension type string → Rust ExtensionType enum
const EXTENSION_TYPE_MAP = {
  'transferFee':           'ExtensionType::TransferFeeConfig',
  'closeAuthority':        'ExtensionType::MintCloseAuthority',
  'transferHook':          'ExtensionType::TransferHook',
  'nonTransferable':       'ExtensionType::NonTransferable',
  'permanentDelegate':     'ExtensionType::PermanentDelegate',
  'interestBearing':       'ExtensionType::InterestBearingConfig',
  'defaultAccountState':   'ExtensionType::DefaultAccountState',
  'cpiGuard':              'ExtensionType::CpiGuard',
  'memoRequired':          'ExtensionType::MemoTransfer',  // on accounts, not mints
  'immutableOwner':        'ExtensionType::ImmutableOwner',
  'confidentialTransfer':  'ExtensionType::ConfidentialTransferMint',
  'metadataPointer':       'ExtensionType::MetadataPointer',
  'groupPointer':          'ExtensionType::GroupPointer',
  'groupMemberPointer':    'ExtensionType::GroupMemberPointer',
  'tokenMetadata':         null,  // uses TokenMetadata extension, not a direct ExtensionType
};
```

---

## 7. Program ID Handling

### How Programs Know Which Token Program to Use

Every instruction that interacts with Token-2022 must pass the token program as an account:

```rust
// ═══════════════════════════════════════════════════
// Anchor Account Struct
// ═══════════════════════════════════════════════════
#[derive(Accounts)]
pub struct TransferTokens<'info> {
    pub from: Account<'info, token_interface::TokenAccount>,
    pub to: Account<'info, token_interface::TokenAccount>,
    pub mint: Account<'info, token_interface::Mint>,
    pub authority: Signer<'info>,

    // The token program — can be either Token or Token-2022
    pub token_program: Program<'info, TokenInterface>,
    // For classic Token only:   Program<'info, Token>
    // For Token-2022 only:      Program<'info, Token2022>
    // For either:               Program<'info, TokenInterface>
}

// In the instruction handler:
pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64, decimals: u8) -> Result<()> {
    // CpiContext::new takes the program account info
    // The token_2022 module uses ctx.program.key as the program ID in instructions
    // This is how the same CPI function works with either program

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        amount,
        decimals,
    )
}
```

### How CpiContext Conveys the Program

```rust
// CpiContext is the key abstraction:
pub struct CpiContext<'a, 'b, 'c, 'info, T> {
    pub program: AccountInfo<'info>,   // ← The program being called
    pub accounts: T,                    // ← Account structs (Transfer, TransferChecked, etc.)
    pub signer_seeds: &'a [&'b [&'c [u8]]],  // ← PDA signer seeds
}

// CpiContext::new — for user-signed CPIs
let cpi_ctx = CpiContext::new(token_program.to_account_info(), accounts);

// CpiContext::new_with_signer — for PDA-signed CPIs
let cpi_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    accounts,
    &[&[b"vault", &[bump]]],
);

// Inside token_2022::transfer_checked:
// ctx.program.key → used as the first arg to spl_token_2022::instruction::transfer_checked
// ctx.program     → included in the account_infos array for invoke_signed

// Contrast with token::transfer:
// &spl_token::ID  → hardcoded, ctx.program is NOT used for the program ID
//                   but IS included in account_infos
```

### ATA Creation with Dynamic Token Program

```rust
use anchor_spl::associated_token::{self, AssociatedToken, Create};

// ATA create CPI accepts token_program as an account
associated_token::create(
    CpiContext::new_with_signer(
        ctx.accounts.payer.to_account_info(),  // ← This is the payer, not token_program
        Create {
            payer: ctx.accounts.payer.to_account_info(),
            associated_token: ata.to_account_info(),
            authority: owner.to_account_info(),
            mint: mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),  // ← Dynamic!
        },
        &[seeds],
    ),
)?;
// The ATA instruction itself includes the token_program_id as data
// So ATAs work with either Token or Token-2022
```

### Program ID Constants

```rust
// Classic Token Program
pub const TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6,221,236,225,117,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
]);
// TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

// Token-2022 Program
pub const TOKEN_2022_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6,187,95,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
]);
// TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb

// Associated Token Program
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    140,79,175,15,71,132,157,190,179,208,240,82,212,6,196,115,138,107,200,44,
    236,57,206,56,174,207,215,124,234,228,199,186,
]);
// ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
```

---

## 8. Complete CPI Function Reference Table

### Core Token Operations

| TS Method | Rust Module | Rust Function | Accounts Struct | Extra Params |
|-----------|------------|---------------|-----------------|-------------|
| `token.transfer(...)` | `token` | `token::transfer` | `Transfer { from, to, authority }` | `amount: u64` |
| `token.transferChecked(...)` | `token_2022` | `token_2022::transfer_checked` | `TransferChecked { from, mint, to, authority }` | `amount: u64, decimals: u8` |
| `token.mintTo(...)` | `token` / `token_2022` | `token::mint_to` / `token_2022::mint_to` | `MintTo { mint, to, authority }` | `amount: u64` |
| `token.mintToChecked(...)` | `token_2022` | `token_2022::mint_to_checked` | `MintToChecked { mint, to, authority }` | `amount: u64, decimals: u8` |
| `token.burn(...)` | `token` / `token_2022` | `token::burn` / `token_2022::burn` | `Burn { mint, from, authority }` | `amount: u64` |
| `token.burnChecked(...)` | `token_2022` | `token_2022::burn_checked` | `BurnChecked { mint, from, authority }` | `amount: u64, decimals: u8` |
| `token.approve(...)` | `token` / `token_2022` | `token::approve` / `token_2022::approve` | `Approve { to, delegate, authority }` | `amount: u64` |
| `token.approveChecked(...)` | `token` / `token_2022` | `token::approve_checked` / `token_2022::approve_checked` | `ApproveChecked { to, mint, delegate, authority }` | `amount: u64, decimals: u8` |
| `token.revoke(...)` | `token` / `token_2022` | `token::revoke` / `token_2022::revoke` | `Revoke { source, authority }` | — |
| `token.initializeAccount(...)` | `token` / `token_2022` | `token::initialize_account` / `token_2022::initialize_account` | `InitializeAccount { account, mint, authority, rent }` | — |
| `token.closeAccount(...)` | `token` / `token_2022` | `token::close_account` / `token_2022::close_account` | `CloseAccount { account, destination, authority }` | — |
| `token.freezeAccount(...)` | `token` / `token_2022` | `token::freeze_account` / `token_2022::freeze_account` | `FreezeAccount { account, mint, authority }` | — |
| `token.thawAccount(...)` | `token` / `token_2022` | `token::thaw_account` / `token_2022::thaw_account` | `ThawAccount { account, mint, authority }` | — |
| `token.initializeMint(...)` | `token` / `token_2022` | `token::initialize_mint` / `token_2022::initialize_mint` | `InitializeMint { mint, rent }` | `decimals, authority, freeze_authority` |
| `token.initializeMint2(...)` | `token` / `token_2022` | `token::initialize_mint2` / `token_2022::initialize_mint2` | `InitializeMint2 { mint }` | `decimals, authority, freeze_authority` |
| `token.setAuthority(...)` | `token` / `token_2022` | `token::set_authority` / `token_2022::set_authority` | `SetAuthority { current_authority, account_or_mint }` | `authority_type, new_authority` |

### Token-2022 Extension Operations

| TS Extension Method | Rust Function | Accounts Struct | Params |
|--------------------|---------------|-----------------|----|
| `token.extensions.transferFee.initialize(...)` | `transfer_fee_initialize` | `TransferFeeInitialize { token_program_id, mint }` | `fee_auth, withdraw_auth, bps, max_fee` |
| `token.extensions.transferFee.set(...)` | `transfer_fee_set` | `TransferFeeSetTransferFee { token_program_id, mint, authority }` | `bps, max_fee` |
| `token.extensions.transferFee.transferCheckedWithFee(...)` | `transfer_checked_with_fee` | `TransferCheckedWithFee { token_program_id, source, mint, destination, authority }` | `amount, decimals, fee` |
| `token.extensions.transferFee.harvest(...)` | `harvest_withheld_tokens_to_mint` | `HarvestWithheldTokensToMint { token_program_id, mint }` | `sources: Vec<AccountInfo>` |
| `token.extensions.transferFee.withdrawFromMint(...)` | `withdraw_withheld_tokens_from_mint` | `WithdrawWithheldTokensFromMint { token_program_id, mint, destination, authority }` | — |
| `token.extensions.transferFee.withdrawFromAccounts(...)` | `withdraw_withheld_tokens_from_accounts` | `WithdrawWithheldTokensFromAccounts { token_program_id, mint, destination, authority }` | `sources: Vec<AccountInfo>` |
| `token.extensions.closeAuthority.initialize(...)` | `mint_close_authority_initialize` | `MintCloseAuthorityInitialize { token_program_id, mint }` | `authority: Option<&Pubkey>` |
| `token.extensions.cpiGuard.enable(...)` | `cpi_guard_enable` | `CpiGuard { token_program_id, account, owner }` | — |
| `token.extensions.cpiGuard.disable(...)` | `cpi_guard_disable` | `CpiGuard { token_program_id, account, owner }` | — |
| `token.extensions.defaultAccountState.initialize(...)` | `default_account_state_initialize` | `DefaultAccountStateInitialize { token_program_id, mint }` | `state: &AccountState` |
| `token.extensions.defaultAccountState.update(...)` | `default_account_state_update` | `DefaultAccountStateUpdate { token_program_id, mint, freeze_authority }` | `state: &AccountState` |
| `token.extensions.memoRequired.enable(...)` | `memo_transfer_initialize` | `MemoTransfer { token_program_id, account, owner }` | — |
| `token.extensions.memoRequired.disable(...)` | `memo_transfer_disable` | `MemoTransfer { token_program_id, account, owner }` | — |
| `token.extensions.interestBearing.initialize(...)` | `interest_bearing_mint_initialize` | `InterestBearingMintInitialize { token_program_id, mint }` | `rate_auth: Option<Pubkey>, rate: i16` |
| `token.extensions.interestBearing.updateRate(...)` | `interest_bearing_mint_update_rate` | `InterestBearingMintUpdateRate { token_program_id, mint, rate_authority }` | `rate: i16` |
| `token.extensions.nonTransferable.initialize(...)` | `non_transferable_mint_initialize` | `NonTransferableMintInitialize { token_program_id, mint }` | — |
| `token.extensions.permanentDelegate.initialize(...)` | `permanent_delegate_initialize` | `PermanentDelegateInitialize { token_program_id, mint }` | `delegate: &Pubkey` |
| `token.extensions.transferHook.initialize(...)` | `transfer_hook_initialize` | `TransferHookInitialize { token_program_id, mint }` | `auth: Option<Pubkey>, program_id: Option<Pubkey>` |
| `token.extensions.transferHook.update(...)` | `transfer_hook_update` | `TransferHookUpdate { token_program_id, mint, authority }` | `program_id: Option<Pubkey>` |
| `token.extensions.immutableOwner.initialize(...)` | `immutable_owner_initialize` | `ImmutableOwnerInitialize { token_program_id, token_account }` | — |

### Token-2022 Unique Operations (not in classic Token)

| Function | Description |
|----------|-------------|
| `get_account_data_size` | Returns account size needed for given extensions |
| `initialize_immutable_owner` | Prevents owner change on token account |
| `initialize_mint_close_authority` | Allows mint account to be closed |
| `amount_to_ui_amount` | Convert raw amount to UI string (respects interest) |
| `ui_amount_to_amount` | Convert UI string to raw amount |
| `mint_to_checked` | Mint with decimal verification |
| `burn_checked` | Burn with decimal verification |

---

## 9. Key Patterns for the Transpiler

### Pattern: Detect Token Program

```typescript
// In TypeScript, the user declares which token program in the accounts:
// accounts: {
//   tokenProgram: { type: 'program', id: 'Token2022' }
// }
// OR
// accounts: {
//   tokenProgram: { type: 'program', id: 'Token' }
// }
```

```rust
// The transpiler should generate:
// 1. If Token → use anchor_spl::token::{self, Token}
// 2. If Token2022 → use anchor_spl::token_2022::{self, Token2022}
// 3. If generic → use anchor_spl::token_interface::{self, TokenInterface}
// For transfers:
// - Token → token::transfer (no mint needed)
// - Token2022 → token_2022::transfer_checked (mint + decimals required)
// - Generic → token_interface::transfer_checked (mint + decimals required)
```

### Pattern: Extension CPI Accounts

All extension CPI functions include a `token_program_id: AccountInfo` field as the FIRST account. This is always set to `token_program.to_account_info()`.

### Pattern: Mint Creation Flow

```
1. Calculate size: find_mint_account_size(extensions)
2. Create account: system_program::create_account(size)
3. For each extension:
   - extension_initialize(CpiContext, extension_params)
4. initialize_mint2(CpiContext, decimals, authority, freeze_authority)
```

### Pattern: Transfer Flow Decision Tree

```
Is it Token or Token-2022?
├── Token (classic)
│   └── token::transfer(CpiContext, amount)
│       - No mint needed
│       - No decimals needed
│       - No extension processing
│
└── Token-2022
    ├── Has transfer fee extension?
    │   ├── YES + caller knows fee
    │   │   └── transfer_checked_with_fee(CpiContext, amount, decimals, fee)
    │   └── YES + caller doesn't know fee
    │       └── transfer_checked(CpiContext, amount, decimals)
    │           (fee is auto-deducted from destination)
    │
    ├── Has transfer hook extension?
    │   └── MUST use transfer_checked
    │       (processor auto-invokes hook program)
    │       Extra accounts for hook passed as remaining accounts
    │
    ├── Has CPI guard on source?
    │   └── Authority must NOT be owner
    │       Must use delegate or permanent delegate
    │
    ├── Is non-transferable?
    │   └── TRANSFER WILL FAIL
    │
    └── Has permanent delegate?
        └── Delegate can sign for any transfer
```
