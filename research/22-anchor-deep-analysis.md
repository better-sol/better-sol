# Anchor Framework Deep Analysis — Comparison with better-sol

Date: 2026-05-04
Source: https://github.com/solana-foundation/anchor (cloned + analyzed v1.0.2)
Analysis depth: Full source traversal of lang/, ts/, idl/, cli/, examples/tests/

---

## 1. Anchor Architecture Overview

Anchor is a full-stack Solana development framework with four major components:

### 1.1 `anchor-lang` — Rust eDSL (onchain)

The core onchain framework providing:
- **`#[program]`** — Defines the instruction module; generates a dispatch function that matches on instruction discriminators
- **`#[derive(Accounts)]`** — Derives account validation, serialization, and constraint logic
- **`#[account]`** / **`#[account(zero_copy)]`** — Defines onchain account data structures with Borsh serialization
- **`#[event]`** + `emit!()` — Structured event logging
- **`#[error_code]`** — Custom error types with numeric codes
- **`declare_id!()`** — Program ID constant
- **`declare_program!()`** (v1.0+) — Import external program definitions from IDL
- **Account types**: `Account<'info, T>`, `Signer<'info>`, `UncheckedAccount<'info>`, `SystemAccount<'info>`, `Program<'info, T>`, `Interface<'info, T>`, `InterfaceAccount<'info, T>`, `AccountLoader<'info, T>` (zero-copy)
- **Constraint attributes**: `#[account(mut, signer, init, close, seeds, bump, realloc, ...)]`
- **Instruction discriminators**: 8-byte SHA256 prefix, now customizable via `#[instruction(discriminator = ...)]`
- **CPI**: `CpiContext::new()` + `invoke()` / `invoke_signed()`
- **Traits**: `AccountSerialize`, `AccountDeserialize`, `Discriminator`, `Space`, `InitSpace`, `Owner`, `Key`, `Lamports`, `Close`

### 1.2 `anchor-syn` — Code Generation (proc-macro backend)

Internal crate that:
- Parses the `#[program]` module into an IR (`Program` struct with `ixs: Vec<Ix>`)
- Parses `#[derive(Accounts)]` structs into constraint IR
- Generates dispatch logic, account validation, CPI clients, and IDL

### 1.3 Anchor TypeScript SDK (`@anchor-lang/core`)

The official client SDK providing:
- **`Program<IDL>`** — Main client class
- **Namespaces**: `program.rpc.*` (deprecated), `program.instruction.*` (deprecated), `program.transaction.*` (deprecated), `program.account.*`, `program.simulate.*` (deprecated), `program.methods.*`, `program.views.*`
- **`MethodsBuilder`** — The current (non-deprecated) builder API:
  ```typescript
  await program.methods
    .initialize(udata, idata)          // instruction args
    .accounts({ data, authority })     // account addresses
    .accountsPartial({ data })         // partial account resolution
    .accountsStrict({ data, authority }) // no resolution
    .signers([signer])                 // extra signers
    .remainingAccounts([meta])         // remaining accounts
    .preInstructions([ix])             // prepended instructions
    .postInstructions([ix])            // appended instructions
    .rpc()                             // send + confirm
    .instruction()                     // return TransactionInstruction
    .transaction()                     // return Transaction
    .simulate()                        // simulate
    .prepare()                         // { instruction, signers, pubkeys }
    .pubkeys()                         // resolve account addresses
    .rpcAndKeys()                      // send + get pubkeys
  ```
- **BorshCoder** — Borsh encode/decode for accounts, instructions, events, types
- **Account resolution** — Automatic PDA derivation from IDL seeds
- **Provider** — Wallet + Connection abstraction
- **Workspace** — Auto-loads IDL + program from config
- **Event listener** — `program.addEventListener('EventName', callback)`

### 1.4 Anchor CLI (`anchor`)

Commands:
- `anchor init` / `anchor new` — Scaffold workspace
- `anchor build` — Compile Rust program to `.so`
- `anchor deploy` — Deploy to cluster
- `anchor test` — Run integration tests with local validator
- `anchor idl init` — Publish IDL to chain
- `anchor idl fetch` — Fetch IDL from chain
- `anchor idl upgrade` / `anchor idl close` — Manage IDL
- `anchor keys list` / `anchor keys sync` — Manage program keypairs

---

## 2. Anchor Instruction Dispatch Pattern

### 2.1 What Anchor generates from `#[program]`

Given:
```rust
#[program]
pub mod my_program {
    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> { ... }
    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> { ... }
}
```

Anchor generates:

**a) Instruction discriminator constants:**
```rust
pub mod instruction {
    pub mod Initialize {
        pub const DISCRIMINATOR: &[u8] = &[42, 135, ...]; // 8 bytes SHA256
    }
    pub mod Transfer {
        pub const DISCRIMINATOR: &[u8] = &[163, 96, ...];
    }
}
```

**b) Global dispatch function:**
```rust
pub fn entry(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.starts_with(instruction::Initialize::DISCRIMINATOR) {
        return __private::__global::initialize(program_id, accounts, &data[8..]);
    }
    if data.starts_with(instruction::Transfer::DISCRIMINATOR) {
        return __private::__global::transfer(program_id, accounts, &data[8..]);
    }
    Err(ProgramError::InvalidInstructionData.into())
}
```

**c) Raw instruction handler (in `__private::__global`):**
```rust
pub fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], ix_data: &[u8]) -> ProgramResult {
    let mut bumps = InitializeBumps { ... };
    let mut reallocs = BTreeSet::new();
    let mut remaining_accounts_iter = accounts.iter();
    let ctx = Context::new(program_id, &mut remaining_accounts_iter, accounts, ix_data, &mut bumps, &mut reallocs)?;
    let data = <u64 as AnchorDeserialize>::deserialize(&mut &ix_data[..])?;
    my_program::initialize(ctx, data)
}
```

**d) Context struct with account validation:**
```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub data: Account<'info, MyData>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

Generates `try_accounts()` which:
1. Iterates through `accounts` slice
2. Validates each account constraint (owner, discriminator, writable, signer, seeds, etc.)
3. Deserializes account data into typed wrapper
4. Returns `Result<Self>`

### 2.2 What better-sol generates (current)

Our transpiler generates almost identical Anchor Rust:
```rust
#[program]
pub mod my_program {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // transpiled body
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 40,
        seeds = [b"data", authority.key().as_ref()],
        bump
    )]
    pub data: Account<'info, MyData>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MyData {
    pub count: u64,
    pub bump: u8,
}
```

**This is correct.** Our generated Rust is valid Anchor Rust.

---

## 3. Comparison: better-sol vs Anchor

### 3.1 What better-sol does that Anchor CANNOT

| Capability | better-sol | Anchor |
|-----------|------------|--------|
| Write programs in TypeScript | ✅ TypeScript DSL → Rust | ❌ Rust only |
| Auto-generate typed client from program definition | ✅ Same TS definition → typed client | ❌ Separate IDL → client path |
| Zero-copy struct layout + decode | ✅ First-class in Client SDK | ❌ AccountLoader only (onchain) |
| Token-2022 first-class | ✅ `sol.token2022.*` | ❌ Manual CPI |
| @solana/kit v6.8.0 integration | ✅ Native | ❌ @solana/web3.js v1 only |
| Wallet adapter subpaths | ✅ Built-in | ❌ Roll your own |
| Single-file definition | ✅ One .ts file | ❌ lib.rs + context.rs + account.rs + Cargo.toml |

### 3.2 What Anchor does that better-sol CANNOT

| Capability | Anchor | better-sol |
|-----------|--------|------------|
| Full Rust eDSL | ✅ All Rust features | ❌ Subset of TypeScript |
| Event system | ✅ `#[event]` + `emit!()` | ❌ Not supported |
| Close accounts | ✅ `#[account(close = destination)]` | ❌ Not supported |
| Account reallocation | ✅ `#[account(realloc = ...)]` | ❌ Not supported |
| CPI type safety | ✅ `CpiContext::new()` + typed CPI | ❌ Manual invoke |
| Custom discriminators | ✅ `#[instruction(discriminator = ...)]` | ❌ Always SHA256 |
| `declare_program!` | ✅ Import external program IDL | ❌ Manual CPI |
| View functions | ✅ Returns values via simulation | ❌ Not supported |
| Init-if-needed | ✅ `#[account(init_if_needed)]` | ❌ Not generated |
| `InitSpace` derive | ✅ Auto-compute account space | ❌ Manual calculation |
| Anchor CLI | ✅ Full workspace management | ❌ CLI limited to generate/deploy |
| IDL on-chain publishing | ✅ `anchor idl init` | ❌ Not supported |
| Cargo build integration | ✅ `anchor build` via SBF | ❌ Compiler API service |
| Multi-file programs | ✅ Modules, separate files | ❌ Not supported (coming soon) |
| Event CPI | ✅ Self-CPI for event log | ❌ Not supported |

### 3.3 What better-sol DUPLICATES unnecessarily

| Duplication | better-sol | Anchor | Recommendation |
|------------|------------|--------|----------------|
| Borsh codec | `packages/better-sol/src/coder.ts` | `anchor/ts/packages/anchor/src/coder/borsh/` | **Keep** — we need @solana/kit integration, not web3.js |
| Account fetch/deserialize | `client.ts` fetchAccount | `program.account.*.fetch()` | **Keep** — we use @solana/kit types |
| Instruction building | `client.ts` buildInstruction | `program.instruction.*` | **Keep** — we use @solana/kit Instruction type |
| PDA derivation | `.derive()` in program.ts | `Pubkey.findProgramAddress()` | **Keep** — our derive() is more type-safe |
| IDL types | `packages/cli/src/ir/types.ts` (custom) | `anchor/idl/spec/src/lib.rs` (standard) | **PARTIALLY DUPLICATED** — we should align our IR IDL output with Anchor IDL spec |

### 3.4 What better-sol is DOING WRONG or INCONSISTENT with Anchor

**Issue 1: Anchor v1.0 breaking changes not reflected**

Anchor v1.0 removed/changed:
- ❌ `#[zero_copy]` standalone attribute → `#[account(zero_copy)]`
- ❌ Old `#[account]` with `#[derive(Default)]` → InitSpace derive
- ❌ Anchor 0.30 discriminator scheme → v1.0 custom discriminator support
- ❌ `anchor-spl` is now feature-gated

Our generator uses `#[account(zero_copy)]` correctly (good) but still generates `#[account]` without checking for v1.0 `.so` compatibility. Since we pin `anchor-lang = "=1.0.2"`, the generated Rust is compatible.

**Issue 2: Generated Context structs lack some Anchor features**

We generate `#[derive(Accounts)]` structs but don't support:
- `close = payer` constraint (account closing)
- `realloc` constraint (account resizing)
- `init_if_needed` (our init only does fresh init)
- `has_one`, `belongs_to` constraints (relation checks)
- `constraint = <expr>` (custom validation)
- Nested accounts via `#[account(..., seeds = [...])]`
- Associated token constraints: `associated_token::mint`, `associated_token::authority`

**Issue 3: TypeScript client API divergence**

Anchor's builder pattern (`program.methods.ix(args).accounts({}).rpc()`) is more composable than our single `.send()`:
```typescript
// Anchor (composable):
const ix = await program.methods.initialize(data)
  .accounts({ counter, authority })
  .remainingAccounts([tokenProgram])
  .instruction();
// Can compose with other instructions, add custom signers, use in any flow

// better-sol (monolithic):
await sol.counter.initialize({ args: { data }, accounts: { counter, authority } })
// Single call builds + signs + sends + confirms
```

We DO have `.instruction()` but it's not the primary API path. The user must know it exists on the return type.

**Issue 4: Our instruction method returns are proprietary**

Anchor returns standard `TransactionInstruction` (from `@solana/web3.js`). We return our custom `InstructionMethod` which wraps but doesn't directly return `@solana/kit`'s `Instruction` type.

**Issue 5: No event support in transpiler**

Anchor events are a standard Solana logging pattern — programs emit structured data via `emit!()`. Our transpiler doesn't support `event` or `emit`. This means generated programs can't emit events, which is needed for:
- Client-side event listeners
- Indexers
- Transaction explorers

**Issue 6: No close account support**

Anchor's close constraint is essential for Solana programs — it reclaims rent. Without it, users lose lamports.

**Issue 7: IDL format divergence**

We generate JSON IDL that's close to Anchor's format but with some differences in fields. For full compatibility with Anchor ecosystem tools (explorers, indexers, Anchor TS SDK), our IDL should match the `idl/spec` format exactly.

---

## 4. What better-sol Should Adopt from Anchor

### 4.1 Immediate (critical gaps)

**A. Close account support**
Our `ix` accounts need a `close?: string` field:
```typescript
const counterProgram = program({ name: "counter" }, (p) => ({
  accounts: {
    counter: p.account({
      fields: { count: "u64", bump: "u8" },
    }),
  },
  instructions: {
    close: p.ix({
      accounts: {
        counter: { account: "counter", mut: true, close: "authority" },
        authority: { signer: true, mut: true },
      },
    }),
  },
}));
```
Generates: `#[account(mut, close = authority)]`

**B. Event support**
```typescript
const myProgram = program({ name: "my_program" }, (p) => ({
  events: {
    TransferOccurred: p.event({
      fields: { from: "pubkey", to: "pubkey", amount: "u64" },
    }),
  },
  instructions: {
    transfer: p.ix({
      // ...
      body: ({ ctx, args }) => {
        ctx.emit("TransferOccurred", { from: ctx.accounts.from.key, ... });
      },
    }),
  },
}));
```

**C. Event CPI support**
Optional feature for self-CPI event logging.

### 4.2 Near-term (composability and interop)

**D. Pure instruction builder alongside convenience API**
```typescript
// Current:
const sig = await sol.counter.initialize({ args: {}, accounts: {...} });

// Add:
import { sequentialInstructionPlan } from '@solana/kit';
const ix = sol.counter.getInitializeInstruction({ args: {}, accounts: {...} });
// Returns: Instruction<...> & InstructionWithAccounts<...> & InstructionWithData<...>
// Can compose with official @solana-program/* instructions
const plan = sequentialInstructionPlan([ix, transferSolIx]);
```

**E. Anchor-compatible IDL output**
Our generated IDL should match the official `Idl` spec exactly:
```json
{
  "address": "...",
  "metadata": { "name": "...", "version": "...", "spec": "0.1.0" },
  "instructions": [{
    "name": "initialize",
    "discriminator": [42, 135, ...], // 8 bytes
    "accounts": [{ "name": "counter", "writable": true, ... }],
    "args": [{ "name": "data", "type": "u64" }]
  }],
  "accounts": [{ "name": "Counter", "type": { "kind": "struct", "fields": [...] } }],
  "errors": [...],
  "types": [...]
}
```

**F. Init-if-needed and realloc constraints**
For programs that need to update existing accounts.

### 4.3 Long-term (full Anchor parity)

**G. Account constraint expressions**
```typescript
authority: {
  signer: true,
  constraint: "authority.key() == counter.authority"
}
```

**H. Multi-file TypeScript programs**
Allow splitting program definitions across multiple `.ts` files (Anchor supports modules).

---

## 5. What to Keep from Our Current Design

### 5.1 Keep These — They're Better Than Anchor

| Feature | Why Keep |
|---------|----------|
| TypeScript-first program definition | Unique value proposition; no equivalent |
| `@solana/kit` v6.8.0 integration | Forward-looking; Anchor stuck on web3.js v1 |
| `.derive()` with type-safe seeds | Better ergonomics than manual PDA + validation |
| `sol.token2022.*` first class | Anchor requires manual token-2022 CPI |
| Zero-copy client decode | Anchor has no equivalent client side |
| Wallet adapter subpaths | Anchor requires manual integration |
| `sol.steps()` sequential plan | Simpler than Anchor's builder for multi-step |
| Automatic account role detection | Anchor requires explicit attribute annotations |
| Single-file → Rust + Client + DB schema | Anchor requires separate codebases |

### 5.2 Don't Change These — They're Different by Design

| Design Choice | Rationale |
|--------------|-----------|
| `program(config, ix => ({}))` API | Deliberately simpler than Anchor's Rust eDSL |
| Transpile to Anchor Rust (not raw solana-program) | Anchor is the de facto standard; best interop |
| TypeScript body transpiler | Core value prop; writing logic in TS |
| `fromIdl()` for IDL interop | Allows using existing Anchor programs |
| `betterSol()` client factory | Simpler than Anchor's Provider + Program setup |

---

## 6. Detailed Feature Gap Matrix

### 6.1 Onchain (Rust-side) Features

| Feature | Anchor | better-sol generated | Priority |
|---------|--------|---------------------|----------|
| `#[program]` dispatch | ✅ | ✅ | SHIP |
| `#[derive(Accounts)]` | ✅ | ✅ | SHIP |
| `#[account]` | ✅ | ✅ | SHIP |
| `#[account(zero_copy)]` | ✅ | ✅ | SHIP |
| `#[event]` + `emit!()` | ✅ | ❌ | HIGH |
| `#[error_code]` | ✅ | ✅ | SHIP |
| `init` constraint | ✅ | ✅ | SHIP |
| `close` constraint | ✅ | ❌ | HIGH |
| `realloc` constraint | ✅ | ❌ | MEDIUM |
| `init_if_needed` | ✅ | ❌ | MEDIUM |
| `has_one` / `belongs_to` | ✅ | ❌ | LOW |
| `constraint = <expr>` | ✅ | ❌ | LOW |
| `seeds` + `bump` | ✅ | ✅ | SHIP |
| `associated_token::mint` etc. | ✅ | ❌ | LOW |
| Custom discriminators | ✅ (v1.0+) | ❌ | LOW |
| `declare_program!()` | ✅ (v1.0+) | ❌ | MEDIUM |
| View functions | ✅ | ❌ | LOW |
| Event CPI | ✅ (feature) | ❌ | LOW |

### 6.2 Client-side (TypeScript) Features

| Feature | Anchor TS | better-sol | Priority |
|---------|-----------|------------|----------|
| IDL-based client | ✅ Program<IDL> | ✅ betterSol() | SHIP |
| Typed instruction building | ✅ .methods.ix().instruction() | ⚠️ Mixed with send | HIGH |
| Account fetch/deserialize | ✅ .account.name.fetch() | ✅ sol.programName.account.name.fetch() | SHIP |
| Account fetch all | ✅ .account.name.all() | ❌ | MEDIUM |
| Event listener | ✅ .addEventListener() | ❌ | HIGH |
| Borsh codec | ✅ BorshCoder | ✅ Custom Borsh | SHIP |
| Transaction builder | ✅ .methods.ix().transaction() | ❌ (only .send()) | HIGH |
| Simulation | ✅ .methods.ix().simulate() | ❌ | MEDIUM |
| PDA resolution | ✅ Automatic from IDL seeds | ✅ .derive() | SHIP |
| Remaining accounts | ✅ .remainingAccounts() | ❌ | MEDIUM |
| Pre/post instructions | ✅ .preInstructions() / .postInstructions() | ❌ | LOW |
| Account resolver override | ✅ .accountsPartial() / .accountsStrict() | ❌ | LOW |
| `@solana/kit` integration | ❌ (uses web3.js v1) | ✅ Native | SHIP |
| Wallet adapter | ❌ Roll your own | ✅ Built-in subpaths | SHIP |
| Token-2022 convenience | ❌ Manual | ✅ First-class | SHIP |
| Zero-copy decode | ❌ No equivalent | ✅ Built-in | SHIP |
| Multi-cluster config | ❌ Manual | ✅ Cluster enum | SHIP |
| `sol.steps()` | ❌ No equivalent | ✅ Sequential plan | SHIP |
| DB schema generation | ❌ | ✅ generate db | SHIP |

---

## 7. Anchor v1.0 Breaking Changes — Impact on better-sol

### 7.1 What changed in Anchor v1.0 (from v0.30)

1. **`declare_program!` macro** — New way to import external programs from IDL
2. **Custom discriminator length** — No longer fixed at 8 bytes (but default is still 8)
3. **`InitSpace` derive** — Replaces manual `impl Space` with `#[derive(InitSpace)]`
4. **Account discriminator changes** — Discriminator is now variable-length (0..n bytes)
5. **`anchor-spl`** — Now feature-gated (token, associated_token, token_2022, etc.)
6. **Deprecated removals** — Many old patterns removed
7. **IDL spec version** — Now versioned (0.1.0)

### 7.2 Are we compatible?

**Yes** — We generate `anchor-lang = "=1.0.2"` Rust with:
- ✅ 8-byte discriminators (still the default)
- ✅ `#[account]` and `#[account(zero_copy)]` (correct attributes)
- ✅ Feature-gated `anchor-spl` dependencies
- ✅ Valid `#[derive(Accounts)]` structs

**Not yet adopted**:
- ❌ `declare_program!` for CPI (we generate manual CPI)
- ❌ `InitSpace` derive (we calculate space manually)
- ❌ Custom discriminators (not needed for typical programs)

---

## 8. Anchor TypeScript SDK Deep Dive — What We Can Learn

### 8.1 The MethodsBuilder Pattern

Anchor's `MethodsBuilder` is the gold standard for instruction building:

```typescript
const builder = program.methods.transfer(amount)
  .accounts({ from, to, authority })
  .accountsPartial({ from })     // resolve others from IDL
  .accountsStrict({ from, to })  // no resolution
  .signers([extraSigner])
  .remainingAccounts([{ pubkey, isSigner, isWritable }])
  .preInstructions([memoIx])
  .postInstructions([closeIx]);

// Multiple terminal methods:
await builder.rpc();              // send + confirm
const ix = await builder.instruction();  // just the instruction
const tx = await builder.transaction(); // full transaction
const sim = await builder.simulate();   // simulate
const { instruction, signers, pubkeys } = await builder.prepare();
const pubkeys = await builder.pubkeys(); // resolve addresses
const { signature, pubkeys } = await builder.rpcAndKeys();
```

### 8.2 What we should adopt from MethodsBuilder

Our `sol.counter.initialize({ args, accounts })` should return an object with similar terminal methods:
```typescript
const op = sol.counter.initialize({ args: { data: 42n }, accounts: { counter, authority } });

// Convenience:
const sig = await op.send(); // equivalent to current .send()

// Composability:
const ix = op.instruction(); // returns @solana/kit Instruction
const plan = op.plan();      // returns InstructionPlan

// Inspection:
const metas = op.accountMetas(); // returns typed AccountMeta[]
```

### 8.3 What we should NOT adopt

- **`@solana/web3.js` Transaction type** — We should use `@solana/kit`'s `TransactionMessage` + `sendAndConfirmTransactionFactory`
- **Anchor's Provider** — We have `betterSol()` which is simpler
- **Anchor's account resolver** — We resolve accounts at type-check time via the program definition
- **Deprecated namespaces** — Anchor has `.rpc.*`, `.instruction.*`, `.transaction.*` all marked deprecated; we should have ONE pattern

---

## 9. Transpiler Correctness Assessment

### 9.1 Does our transpiler output correct Anchor Rust?

**YES** — Verified against:
- Anchor v1.0.2 crate source in our cargo cache
- Official Anchor test programs (misc, declare-program, etc.)
- Anchor documentation and examples

Our generated Rust:
- Uses correct `#[program]`, `#[derive(Accounts)]`, `#[account]` attributes
- Generates correct `Context<Name>` parameter types
- Uses correct `anchor_spl::token` / `anchor_spl::token_interface` imports
- Generates correct discriminator-based instruction dispatch
- Validates against Anchor's `anchor build` (compiles without warnings)

### 9.2 Does our transpiler output correct IDL?

**MOSTLY** — We output IDL that's close to Anchor's format but has minor differences. For full interop with Anchor ecosystem tools (explorers, indexers), we should match the `idl/spec/src/lib.rs` types exactly.

### 9.3 Missing transpiler features that block production use

1. **Close accounts** — Essential for Solana programs (reclaim rent)
2. **Events** — Needed for client-side indexing and UIs
3. **Account reallocation** — Needed for programs that grow account data
4. **Init-if-needed** — Needed for idempotent initialization

---

## 10. Summary of Recommendations

### 10.1 What better-sol is doing RIGHT
- TypeScript-first program definition (unique, innovative)
- Anchor Rust output (correct target, good interop)
- `@solana/kit` v6.8.0 integration (forward-looking)
- `.derive()` with type-safe seeds
- Zero-copy client decode
- Token-2022 first class
- Wallet adapter subpaths
- Automatic account role detection
- Strong type safety throughout

### 10.2 What better-sol needs to ADD
1. **Close account support** in DSL + transpiler — HIGH
2. **Event support** in DSL + transpiler + client listener — HIGH
3. **Pure instruction builder** alongside send — HIGH
4. **Transaction builder** method (not just send) — HIGH
5. **Simulation support** — MEDIUM
6. **Realloc support** — MEDIUM
7. **Init-if-needed** — MEDIUM
8. **`declare_program!`** for CPI interop — MEDIUM
9. **Account fetch all / filter** — MEDIUM
10. **Remaining accounts support** — LOW

### 10.3 What better-sol should CHANGE
1. **Instruction methods should return a builder** (like Anchor's MethodsBuilder) with `.send()`, `.instruction()`, `.transaction()`, `.simulate()` — instead of a single `.send()`
2. **Generated IDL should match Anchor spec exactly** for ecosystem interop
3. **`sol.steps()` should return InstructionPlan** from `@solana/kit`, not a custom StepChain type

### 10.4 What better-sol should KEEP
- TypeScript-first DSL (unique value prop)
- `@solana/kit` over `@solana/web3.js` (correct choice)
- `fromIdl()` for IDL interop
- `program(config, ix => ({}))` API shape
- `.derive()` with type-safe seeds
- Zero-copy account support
- Token-2022 first class
- Wallet adapter subpaths
- DB schema generation
- Single-file program definition
