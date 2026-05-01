# Zero-Copy Account Transpilation: Exhaustive Reference

## Table of Contents
1. [What is Zero-Copy in Anchor?](#1-what-is-zero-copy-in-anchor)
2. [Rust Code Anchor Generates](#2-rust-code-anchor-generates)
3. [Type Constraints — What Goes in a Zero-Copy Struct](#3-type-constraints)
4. [Fixed Arrays](#4-fixed-arrays)
5. [Space Calculation](#5-space-calculation)
6. [Initialization — init vs zero vs realloc](#6-initialization)
7. [Field Access Patterns](#7-field-access-patterns)
8. [TypeScript-to-Zero-Copy Mapping](#8-typescript-to-zero-copy-mapping)
9. [Transpiler Code Generation](#9-transpiler-code-generation)
10. [Limitations and Gotchas](#10-limitations-and-gotchas)

---

## 1. What is Zero-Copy in Anchor?

Zero-copy deserialization reinterprets raw account bytes as a Rust struct **without copying or allocating**. Instead of deserializing with Borsh (which copies the entire account into a new data structure), the raw `&[u8]` bytes are cast directly to a `&T` reference via `bytemuck::from_bytes()`.

**Why it exists:**
- Solana BPF VM has a max stack size of ~4KB and max heap of ~32KB per instruction
- Borsh deserialization copies the entire account, so large accounts (>4KB) can blow the stack
- Zero-copy avoids this entirely — no copy, no allocation, no stack/heap limits
- Used by real-world programs: OpenBook v2 orderbooks, Phoenix, Drift

**The trade-off:**
- All fields must be plain old data (POD) — no `String`, `Vec`, `Option<non-Pod>`, etc.
- Access goes through `Ref<T>` / `RefMut<T>` instead of direct ownership
- C struct layout with potential padding

---

## 2. Rust Code Anchor Generates

### Input (what the developer writes):
```rust
#[account(zero_copy)]
pub struct Orderbook {
    pub authority: Pubkey,
    pub coin_lot_size: u64,
    pub pc_lot_size: u64,
    pub bids: [u64; 128],
    pub asks: [u64; 128],
    pub bump: u8,
}
```

### What `#[account(zero_copy)]` expands to:

```rust
// Step 1: Apply the #[zero_copy] attribute, which expands to:
#[derive(anchor_lang::__private::ZeroCopyAccessor, Copy, Clone)]
#[repr(C)]
#[derive(::bytemuck::Pod)]
#[derive(::bytemuck::Zeroable)]
pub struct Orderbook {
    pub authority: Pubkey,
    pub coin_lot_size: u64,
    pub pc_lot_size: u64,
    pub bids: [u64; 128],
    pub asks: [u64; 128],
    pub bump: u8,
}

// Step 2: Implement the ZeroCopy trait
impl anchor_lang::ZeroCopy for Orderbook {}

// Step 3: Implement the Discriminator trait
// Discriminator = sha256("account:Orderbook")[0..8]
impl anchor_lang::Discriminator for Orderbook {
    const DISCRIMINATOR: &'static [u8] = /* first 8 bytes of sha256("account:Orderbook") */;
}

// Step 4: Implement AccountDeserialize (for client-side deserialization)
impl anchor_lang::AccountDeserialize for Orderbook {
    fn try_deserialize(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        // Check discriminator
        if buf.len() < DISCRIMINATOR.len() {
            return Err(ErrorCode::AccountDiscriminatorNotFound.into());
        }
        if DISCRIMINATOR != &buf[..DISCRIMINATOR.len()] {
            return Err(ErrorCode::AccountDiscriminatorMismatch.into());
        }
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        let data: &[u8] = &buf[DISCRIMINATOR.len()..];
        let account = anchor_lang::__private::bytemuck::from_bytes(data);
        Ok(*account)  // Copy out for client-side use
    }
}

// Step 5: Implement Owner trait
impl anchor_lang::Owner for Orderbook {
    fn owner() -> Pubkey {
        crate::ID  // The program's ID
    }
}
```

### The `#[zero_copy]` attribute alone (for nested structs):
```rust
// Input:
#[zero_copy]
pub struct OrderNode {
    pub price: u64,
    pub size: u64,
    pub next: u64,
}

// Expands to:
#[derive(anchor_lang::__private::ZeroCopyAccessor, Copy, Clone)]
#[repr(C)]
#[derive(::bytemuck::Pod)]
#[derive(::bytemuck::Zeroable)]
pub struct OrderNode {
    pub price: u64,
    pub size: u64,
    pub next: u64,
}
```

### The `#[zero_copy(unsafe)]` variant:
```rust
// Input:
#[account(zero_copy(unsafe))]
pub struct Foo {
    pub data: [u8; 256],
}

// Expands to:
#[derive(anchor_lang::__private::ZeroCopyAccessor, Copy, Clone)]
#[repr(Rust, packed)]    // packed, NOT #[repr(C)]
// NO bytemuck derives — manually unsafe impl
pub struct Foo {
    pub data: [u8; 256],
}

// Plus manual unsafe impls:
unsafe impl anchor_lang::__private::bytemuck::Pod for Foo {}
unsafe impl anchor_lang::__private::bytemuck::Zeroable for Foo {}
```

**The `unsafe` variant uses `#[repr(packed)]` instead of `#[repr(C)]`. This eliminates padding but is unsafe because packed references can be unaligned, causing UB. Use it only when you need to eliminate every byte of padding (e.g., orderbooks where every byte matters).**

---

## 3. Type Constraints

### The ZeroCopy trait definition:
```rust
// From anchor-lang/src/lib.rs
pub trait ZeroCopy: Discriminator + Copy + Clone + Zeroable + Pod {}
```

### The Pod trait requirements (from bytemuck):
A type `T` is `Pod` ("plain old data") if and only if:
1. **No invalid bit patterns** — every possible byte combination is a valid `T`
2. **No padding bytes** — every byte in `sizeof::<T>()` is part of a field
3. **All fields are also Pod** — recursively
4. **`repr(C)` or `repr(transparent)`** — not `repr(Rust)` (unless packed with unsafe)
5. **No pointers, Cell, UnsafeCell, atomics** — no interior mutability
6. **Must be Copy + 'static** — no lifetimes

### Allowed primitive types (all implement Pod):

| Rust Type | Size (bytes) | TypeScript Equivalent |
|-----------|-------------|----------------------|
| `u8`      | 1           | `u8` / `number`      |
| `i8`      | 1           | `i8`                 |
| `u16`     | 2           | `u16`                |
| `i16`     | 2           | `i16`                |
| `u32`     | 4           | `u32`                |
| `i32`     | 4           | `i32`                |
| `u64`     | 8           | `u64` / `bigint`     |
| `i64`     | 8           | `i64`                |
| `u128`    | 16          | `u128` / `bigint`    |
| `i128`    | 16          | `i128`               |
| `f32`     | 4           | `number`             |
| `f64`     | 8           | `number`             |
| `bool`    | 1           | `bool` (**NOT actually Pod!**) |
| `[T; N]`  | N * sizeof(T) | `bytes(N)` / fixed array |
| `Pubkey`  | 32 (= `[u8; 32]`) | `pubkey`       |

### NOT allowed in zero-copy structs:

| Type | Why | Workaround |
|------|-----|-----------|
| **`bool`** | **NOT Pod** — has invalid bit patterns (0x02..0xFF) | Use `u8` instead (0 = false, 1 = true) |
| `String` | Heap-allocated, not Pod | `[[u8; 32]; N]` (array of char buffers) |
| `Vec<T>` | Heap-allocated, not Pod | `[T; N]` (fixed-size array) |
| `Option<T>` where T: !Pod | `Option<Pubkey>` is 33 bytes (padding) | Manual sentinel value |
| `Box<T>` | Heap pointer | N/A — inline the struct |
| `&T`, `&mut T` | Pointer | N/A |
| `HashMap`, `BTreeMap` | Heap-allocated | Fixed arrays |
| Tuples `(T1, T2)` | Not repr(C) | Use a named struct |

### CRITICAL: `bool` is NOT Pod

Bytemuck's `Pod` trait requires that **every possible bit pattern** is valid for the type.
`bool` only accepts `0x00` and `0x01` — any other byte value is invalid in Rust.
Therefore `bool` does **NOT** implement `Pod`, and `#[derive(bytemuck::Pod)]` will fail
at compile time for any struct containing `bool`.

Bytemuck provides a separate trait `CheckedBitPattern` for types like `bool` where you
must validate the bit pattern, but Anchor's zero-copy uses `Pod`, not `CheckedBitPattern`.

**This means:**
- With `#[account(zero_copy)]` (safe mode): `bool` is **not allowed**. Use `u8`.
- With `#[account(zero_copy(unsafe))]`: `bool` will compile (bypasses Pod derive), but reading
  a non-0/1 byte as `bool` is **undefined behavior** in Rust. Extremely dangerous.

**Our transpiler should:** Map `bool` → `u8` in zero-copy mode, and provide an accessor
that interprets 0 as false and non-zero as true.

### The `Pubkey` handling — CRITICAL DETAIL:

`Pubkey` is NOT Pod by default. Anchor handles this with `#[repr(C)]` and bytemuck derive. But in zero-copy structs, `Pubkey` is stored as `[u8; 32]` under the hood, and the `ZeroCopyAccessor` trait converts between them:

```rust
// In anchor-lang/src/lib.rs
impl ZeroCopyAccessor<Pubkey> for [u8; 32] {
    fn get(&self) -> Pubkey {
        Pubkey::from(*self)
    }
    fn set(input: &Pubkey) -> [u8; 32] {
        input.to_bytes()
    }
}
```

The `#[derive(ZeroCopyAccessor)]` auto-generates getter/setter methods:
```rust
// For a field:
//   #[accessor(Pubkey)]
//   pub authority: [u8; 32],
// Generates:
pub fn get_authority(&self) -> Pubkey {
    anchor_lang::__private::ZeroCopyAccessor::get(&self.authority)
}
pub fn set_authority(&mut self, input: &Pubkey) {
    self.authority = anchor_lang::__private::ZeroCopyAccessor::set(input);
}
```

**In practice**, Anchor developers just use `Pubkey` directly in zero-copy structs because the `ZeroCopyAccessor` derive handles the conversion. But the underlying storage is `[u8; 32]`.

### Nested zero-copy structs:

A zero-copy struct can contain other `#[zero_copy]` structs as fields:

```rust
#[zero_copy]
pub struct Price {
    pub value: u64,
    pub timestamp: u64,
}

#[account(zero_copy)]
pub struct Market {
    pub authority: Pubkey,
    pub best_bid: Price,     // Nested — Price must also be zero_copy
    pub best_ask: Price,
}
```

---

## 4. Fixed Arrays

### Syntax and Rules:

```rust
[T; N]  // T must be Pod, N is a const usize
```

- **T must be `Pod`** — any Pod type works: `u8`, `u64`, `Pubkey`, nested `#[zero_copy]` structs
- **N is a compile-time constant** — must be known at compile time
- **No max size limit from bytemuck** — the limit is Solana's max account size (10MB)
- **With `min_const_generics` feature** (required by Anchor): any N works

### Array examples:

```rust
#[account(zero_copy)]
pub struct Orderbook {
    pub bids: [u64; 128],           // 128 * 8 = 1024 bytes
    pub asks: [u64; 128],           // 128 * 8 = 1024 bytes
    pub market: Pubkey,              // 32 bytes
    pub padding: [u8; 7],           // Explicit padding to align next field
}
```

```rust
#[account(zero_copy)]
pub struct NodeList {
    pub nodes: [NodeHeader; 1024],  // 1024 * sizeof(NodeHeader)
    pub count: u32,
}
```

### Padding and Alignment (repr(C)):

With `#[repr(C)]`, Rust uses C layout rules:
- Fields are laid out in declaration order
- Each field is aligned to its natural alignment
- Padding bytes are inserted between fields if needed

**Common padding scenarios:**

```rust
#[account(zero_copy)]
#[repr(C)]
pub struct Example {
    pub flag: u8,        // offset 0, size 1
    // 7 bytes padding    // u64 must be 8-byte aligned
    pub value: u64,      // offset 8, size 8
    pub flag2: u8,       // offset 16, size 1
    // 1 byte padding     // u16 must be 2-byte aligned
    pub id: u16,         // offset 18, size 2
}
// Total: 20 bytes
```

**Mitigation: Order fields largest-first to minimize padding:**

```rust
#[account(zero_copy)]
#[repr(C)]
pub struct Optimized {
    pub value: u64,      // offset 0, size 8
    pub id: u16,         // offset 8, size 2
    pub flag: u8,        // offset 10, size 1
    pub flag2: u8,       // offset 11, size 1
}
// Total: 12 bytes (no padding!)
```

**Our transpiler SHOULD sort fields largest-first by default** to eliminate padding waste.

---

## 5. Space Calculation

### The formula:

```
Total account space = 8 (discriminator) + sizeof::<T>() (struct size with repr(C) padding)
```

### Key differences from Borsh accounts:

| Aspect | Borsh (normal `#[account]`) | Zero-Copy (`#[account(zero_copy)]`) |
|--------|---------------------------|-------------------------------------|
| Discriminator | 8 bytes | 8 bytes |
| String field | 4 (length) + N (bytes) | N/A — not allowed |
| Vec<T> field | 4 (length) + N * sizeof(T) | N/A — not allowed |
| `[T; N]` array | N * sizeof(T) | N * sizeof(T) |
| Padding | None (Borsh is packed) | **Yes** (repr(C) alignment) |
| Option<T> | 1 + sizeof(T) | N/A (not Pod unless T is Pod and you handle it manually) |

### InitSpace derive for zero-copy:

From the Anchor test (anchor-lang/tests/space.rs):
```rust
#[account(zero_copy)]
#[derive(InitSpace)]
pub struct TestZeroCopyStruct {
    pub test_array: [u8; 8],
    pub test_u32: u32,
}

#[test]
fn test_zero_copy_struct() {
    assert_eq!(TestZeroCopyStruct::INIT_SPACE, 8 + 4)
    // Note: this does NOT include the 8-byte discriminator
    // The full account size would be 8 + 8 + 4 = 20 bytes
}
```

**Important:** `InitSpace::INIT_SPACE` does NOT include padding. It uses Borsh-like arithmetic (just field sizes summed). But the actual `sizeof::<T>()` with `repr(C)` may include padding. You must use `std::mem::size_of::<T>()` or calculate manually with alignment rules.

### Manual space calculation with repr(C):

```rust
#[account(zero_copy)]
#[repr(C)]
pub struct Pool {
    pub authority: Pubkey,    // 32 bytes, align 1
    pub amount: u64,          // 8 bytes, align 8
    pub is_active: u8,       // 1 byte, align 1 (bool -> u8 for zero-copy)
    pub fee_bps: u16,         // 2 bytes, align 2
    pub bump: u8,             // 1 byte, align 1
}
// Manual calculation:
// authority: offset 0, size 32
// amount: offset 32 (already 8-aligned), size 8
// is_active: offset 40, size 1
// fee_bps: needs 2-align, so padding 1 byte, offset 42, size 2
// bump: offset 44, size 1
// Total struct: 45 bytes
// With trailing padding to align to 8: 48 bytes
// Full account: 8 (disc) + 48 = 56 bytes
```

### In Anchor's init constraint:

```rust
#[derive(Accounts)]
pub struct CreateOrderbook<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Orderbook>(),  // or hardcode the number
    )]
    pub orderbook: AccountLoader<'info, Orderbook>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

**For our transpiler:** We should calculate `sizeof::<T>()` at transpile time by simulating `repr(C)` layout. This is deterministic and can be done in TypeScript.

---

## 6. Initialization — init vs zero vs realloc

### Method 1: `init` constraint (standard)

The account is created fresh via a CPI to the system program. Space must be specified.

```rust
#[derive(Accounts)]
pub struct CreateBar<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Bar>()  // 8 for discriminator + struct size
    )]
    pub bar: AccountLoader<'info, Bar>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// In the instruction handler:
pub fn create_bar(ctx: Context<CreateBar>, data: u64) -> Result<()> {
    let bar = &mut ctx.accounts.bar.load_init()?;  // MUST use load_init()
    bar.authority = ctx.accounts.authority.key();
    bar.data = data;
    Ok(())
}
```

**Key point:** When using `init` with `AccountLoader`, you MUST call `load_init()` (not `load()` or `load_mut()`). This is because the discriminator hasn't been written yet during initialization — the account data is all zeros. `load_init()` checks that the discriminator IS all zeros (i.e., truly uninitialized) and returns a `RefMut<T>`.

After the instruction completes, `AccountsExit::exit()` writes the discriminator:
```rust
// From AccountLoader's exit impl:
fn exit(&self, program_id: &Pubkey) -> Result<()> {
    let mut data = self.acc_info.try_borrow_mut_data()?;
    let mut writer = BpfWriter::new(&mut data);
    writer.write_all(T::DISCRIMINATOR).unwrap();  // Write discriminator
}
```

### Method 2: `zero` constraint (deferred init)

The `zero` constraint is used when you want to initialize a zero-copy account without paying rent for it upfront (e.g., it was created by another program). It checks that the discriminator is all zeros.

```rust
#[derive(Accounts)]
pub struct ZeroBar<'info> {
    #[account(zero)]
    pub bar: AccountLoader<'info, Bar>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

// Handler uses load_init() same as init
pub fn zero_bar(ctx: Context<ZeroBar>) -> Result<()> {
    let bar = &mut ctx.accounts.bar.load_init()?;
    bar.authority = ctx.accounts.authority.key();
    Ok(())
}
```

The generated code for `zero` constraint:
```rust
// Checks that the discriminator bytes are all zeros
let mut __data: &[u8] = &bar.try_borrow_data()?;
let __disc = &__data[..DISCRIMINATOR.len()];
let __has_disc = __disc.iter().any(|b| *b != 0);
if __has_disc {
    return Err(ErrorCode::ConstraintZero.into());
}
```

### Method 3: `realloc` constraint

Realloc works on `AccountLoader` accounts just like on `Account` accounts:

```rust
#[derive(Accounts)]
pub struct ResizeBar<'info> {
    #[account(
        mut,
        realloc = 8 + new_size,
        realloc::payer = payer,
        realloc::zero = false,
    )]
    pub bar: AccountLoader<'info, Bar>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

**Realloc rules:**
- Can grow by max 10,240 bytes per instruction (Solana limit)
- Can shrink by any amount
- If growing, lamports are transferred from payer to the account for rent
- If shrinking, excess lamports are transferred back to payer
- `realloc::zero = false` is fine for zero-copy (the discriminator is already set)
- The `new_size` must include the 8-byte discriminator

---

## 7. Field Access Patterns

### Reading fields (immutable):

```rust
pub fn read_bar(ctx: Context<ReadBar>) -> Result<()> {
    let bar = ctx.accounts.bar.load()?;  // Returns Ref<Bar>
    let data = bar.data;                  // Access field via Ref
    let authority = bar.authority;        // Access Pubkey field
    Ok(())
}
```

### Writing fields (mutable):

```rust
pub fn update_bar(ctx: Context<UpdateBar>, new_data: u64) -> Result<()> {
    // Option 1: dereference and write
    (*ctx.accounts.bar.load_mut()?).data = new_data;

    // Option 2: bind to a variable
    let bar = &mut ctx.accounts.bar.load_mut()?;
    bar.data = new_data;
    bar.authority = ctx.accounts.authority.key();

    Ok(())
}
```

### Accessor methods for Pubkey fields:

The `ZeroCopyAccessor` derive generates `get_<field>()` and `set_<field>()` methods:

```rust
#[account(zero_copy)]
pub struct Bar {
    #[accessor(Pubkey)]     // Optional — Pubkey is auto-handled
    pub authority: [u8; 32],  // Stored as [u8; 32]
    pub data: u64,
}

// Generated methods:
impl Bar {
    pub fn get_authority(&self) -> Pubkey {
        anchor_lang::__private::ZeroCopyAccessor::get(&self.authority)
    }
    pub fn set_authority(&mut self, input: &Pubkey) {
        self.authority = anchor_lang::__private::ZeroCopyAccessor::set(input);
    }
}

// Usage:
let bar = ctx.accounts.bar.load()?;
let auth: Pubkey = bar.get_authority();  // Converts [u8; 32] -> Pubkey
```

**But in practice, most developers just use `Pubkey` directly** in the struct and Anchor's derive handles it. The `#[accessor]` attribute is for custom types that need conversion.

### The RefCell pattern — IMPORTANT:

`load()`, `load_mut()`, and `load_init()` all borrow from a `RefCell<&mut [u8]>`. You **cannot** hold two mutable borrows at the same time. This is a common source of panics:

```rust
// WRONG — will panic at runtime:
let bar1 = ctx.accounts.bar.load_mut()?;
let bar2 = ctx.accounts.bar.load_mut()?;  // PANIC: already borrowed mutably

// CORRECT — drop the first borrow before borrowing again:
{
    let mut bar = ctx.accounts.bar.load_mut()?;
    bar.data = 42;
}  // RefMut dropped here
{
    let bar = ctx.accounts.bar.load()?;  // OK now
    msg!("data: {}", bar.data);
}

// CORRECT — use braces inline:
(*ctx.accounts.bar.load_mut()?).data = 42;
msg!("data: {}", ctx.accounts.bar.load()?.data);
```

---

## 8. TypeScript-to-Zero-Copy Mapping

### Our TypeScript types and their zero-copy equivalents:

| TypeScript Type | Rust Zero-Copy Type | Size (bytes) | Pod? |
|----------------|---------------------|-------------|------|
| `pubkey`       | `Pubkey` (= `[u8; 32]`) | 32     | Yes (via ZeroCopyAccessor) |
| `u8`           | `u8`                | 1           | Yes  |
| `i8`           | `i8`                | 1           | Yes  |
| `u16`          | `u16`               | 2           | Yes  |
| `i16`          | `i16`               | 2           | Yes  |
| `u32`          | `u32`               | 4           | Yes  |
| `i32`          | `i32`               | 4           | Yes  |
| `u64`          | `u64`               | 8           | Yes  |
| `i64`          | `i64`               | 8           | Yes  |
| `u128`         | `u128`              | 16          | Yes  |
| `i128`         | `i128`              | 16          | Yes  |
| `bool`         | `u8` (NOT `bool`!)  | 1           | Yes (bool is NOT Pod!) |
| `bytes(N)`     | `[u8; N]`           | N           | Yes  |
| `f64`          | `f64`               | 8           | Yes  |

### Types we need to ADD for zero-copy support:

| New TypeScript Type | Rust Equivalent | Purpose |
|--------------------|----------------|---------|
| `bytes(N)`         | `[u8; N]`      | Fixed-size byte arrays (already in our type system) |
| `u8.array(N)` or `[u8, N]` | `[u8; N]` | Fixed-size typed arrays |
| `u64.array(N)`     | `[u64; N]`     | Fixed-size u64 arrays |
| `pubkey.array(N)`  | `[Pubkey; N]`  | Fixed-size pubkey arrays |

### Proposed TypeScript syntax:

```typescript
import { program, account, ix, u64, u8, u16, u32, pubkey, bool, bytes, p } from 'better-sol/program'

// Zero-copy account — new API
const Orderbook = account({
  authority: pubkey,
  coinLotSize: u64,
  pcLotSize: u64,
  feeBps: u16,
  bids: bytes(1024),         // [u8; 1024] — raw bytes
  asks: bytes(1024),         // [u8; 1024] — raw bytes
  bidCount: u32,
  askCount: u32,
  bump: u8,
}).zeroCopy()                // <-- NEW: marks this as zero_copy
  .seeds('orderbook', '{authority}')
```

**Alternative: typed fixed arrays**

```typescript
const Orderbook = account({
  authority: pubkey,
  coinLotSize: u64,
  pcLotSize: u64,
  bids: u64.array(128),      // [u64; 128] — typed fixed array
  asks: u64.array(128),      // [u64; 128] — typed fixed array
  bump: u8,
}).zeroCopy()
```

### What's NOT supported in zero-copy (and what to tell users):

| TypeScript Feature | Zero-Copy? | Alternative |
|-------------------|------------|-------------|
| `string`          | No         | `bytes(32)` + manual encoding |
| `Vec<u8>` / dynamic arrays | No | `bytes(N)` / `u64.array(N)` |
| `Option<pubkey>`  | No         | Sentinel value (`Pubkey::default()`) |
| Dynamic `realloc` on data | No (fixed layout) | Pre-allocate max size |
| Nested `account()` refs | No (different discriminator) | Use `#[zero_copy]` nested structs |

---

## 9. Transpiler Code Generation

### Complete Example: TypeScript → Anchor Rust Zero-Copy

#### TypeScript Input:

```typescript
import { program, account, ix, u64, u32, u16, u8, pubkey, bool, bytes, p } from 'better-sol/program'

const Orderbook = account({
  authority: pubkey,          // 32 bytes
  coinLotSize: u64,           // 8 bytes
  pcLotSize: u64,             // 8 bytes
  feeBps: u16,                // 2 bytes
  bids: u64.array(128),       // 1024 bytes
  asks: u64.array(128),       // 1024 bytes
  bidCount: u32,              // 4 bytes
  askCount: u32,              // 4 bytes
  isActive: bool,             // TypeScript bool → Rust u8 (zero-copy)
  bump: u8,                   // 1 byte
}).zeroCopy()
  .seeds('orderbook', '{authority}')

const errors = defineErrors({
  Unauthorized: 'Not the authority',
  InvalidOrder: 'Invalid order',
  OrderbookFull: 'Orderbook is full',
})

export const orderbook_program = program({
  name: 'orderbook',
  address: 'OrDeRbOoK1111111111111111111111111111111111',
  errors,
  instructions: {
    initialize: ix({
      accounts: {
        orderbook: p.init(Orderbook),
        authority: p.signer(),
      },
      args: { coinLotSize: u64, pcLotSize: u64, feeBps: u16 },
      run: ({ orderbook, authority }, { coinLotSize, pcLotSize, feeBps }) => {
        orderbook.authority = authority
        orderbook.coinLotSize = coinLotSize
        orderbook.pcLotSize = pcLotSize
        orderbook.feeBps = feeBps
        orderbook.bidCount = 0
        orderbook.askCount = 0
        orderbook.isActive = true
      },
    }),

    placeBid: ix({
      accounts: {
        orderbook: p.mut(Orderbook),
        authority: p.signer(),
      },
      args: { price: u64, size: u64 },
      run: ({ orderbook, authority }, { price, size }, ctx) => {
        ctx.require(authority === orderbook.authority, 'Unauthorized')
        ctx.require(orderbook.isActive, 'InvalidOrder')
        ctx.require(orderbook.bidCount < 128, 'OrderbookFull')

        // In a real orderbook, you'd insert sorted. This is simplified.
        const idx = orderbook.bidCount
        orderbook.bids[idx * 2] = price
        orderbook.bids[idx * 2 + 1] = size
        orderbook.bidCount += 1
      },
    }),

    updateFee: ix({
      accounts: {
        orderbook: p.mut(Orderbook),
        authority: p.signer(),
      },
      args: { newFeeBps: u16 },
      run: ({ orderbook, authority }, { newFeeBps }, ctx) => {
        ctx.require(authority === orderbook.authority, 'Unauthorized')
        orderbook.feeBps = newFeeBps
      },
    }),
  },
})
```

#### Generated Anchor Rust:

```rust
use anchor_lang::prelude::*;

declare_id!("OrDeRbOoK1111111111111111111111111111111111");

// ── Error codes ──

#[error_code]
pub enum OrderbookError {
    #[msg("Not the authority")]
    Unauthorized,
    #[msg("Invalid order")]
    InvalidOrder,
    #[msg("Orderbook is full")]
    OrderbookFull,
}

// ── Account structs ──

// Fields reordered largest-first to minimize repr(C) padding.
// Original order: authority, coinLotSize, pcLotSize, feeBps, bids, asks, bidCount, askCount, isActive, bump
// Reordered: bids, asks, authority, coinLotSize, pcLotSize, bidCount, askCount, feeBps, isActive, bump
#[account(zero_copy)]
#[repr(C)]
pub struct Orderbook {
    // 1024 bytes, align 8
    pub bids: [u64; 128],
    // 1024 bytes, align 8
    pub asks: [u64; 128],
    // 32 bytes, align 1
    pub authority: Pubkey,
    // 8 bytes, align 8
    pub coin_lot_size: u64,
    // 8 bytes, align 8
    pub pc_lot_size: u64,
    // 4 bytes, align 4
    pub bid_count: u32,
    // 4 bytes, align 4
    pub ask_count: u32,
    // 2 bytes, align 2
    pub fee_bps: u16,
    // 1 byte, align 1
    pub is_active: u8,  // bool maps to u8 in zero-copy (bool is NOT Pod)
    // 1 byte, align 1
    pub bump: u8,
}
// Total: 1024 + 1024 + 32 + 8 + 8 + 4 + 4 + 2 + 1 + 1 = 2108 bytes
// Full account: 8 (disc) + 2108 = 2116 bytes

// ── Instruction accounts ──

#[derive(Accounts)]
#[instruction(coin_lot_size: u64, pc_lot_size: u64, fee_bps: u16)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Orderbook>(),
        seeds = [b"orderbook".as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub orderbook: AccountLoader<'info, Orderbook>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"orderbook".as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub orderbook: AccountLoader<'info, Orderbook>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"orderbook".as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub orderbook: AccountLoader<'info, Orderbook>,
    pub authority: Signer<'info>,
}

// ── Program ──

#[program]
pub mod orderbook_program {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        coin_lot_size: u64,
        pc_lot_size: u64,
        fee_bps: u16,
    ) -> Result<()> {
        let orderbook = &mut ctx.accounts.orderbook.load_init()?;
        orderbook.authority = ctx.accounts.authority.key();
        orderbook.coin_lot_size = coin_lot_size;
        orderbook.pc_lot_size = pc_lot_size;
        orderbook.fee_bps = fee_bps;
        orderbook.bid_count = 0;
        orderbook.ask_count = 0;
        orderbook.is_active = 1;  // bool maps to u8 in zero-copy
        Ok(())
    }

    pub fn place_bid(
        ctx: Context<PlaceBid>,
        price: u64,
        size: u64,
    ) -> Result<()> {
        let authority = &ctx.accounts.authority;
        let orderbook = &mut ctx.accounts.orderbook.load_mut()?;

        require!(orderbook.authority == authority.key(), OrderbookError::Unauthorized);
        require!(orderbook.is_active != 0, OrderbookError::InvalidOrder);  // u8 bool check
        require!(orderbook.bid_count < 128, OrderbookError::OrderbookFull);

        let idx = orderbook.bid_count;
        orderbook.bids[idx as usize * 2] = price;
        orderbook.bids[idx as usize * 2 + 1] = size;
        orderbook.bid_count += 1;
        Ok(())
    }

    pub fn update_fee(
        ctx: Context<UpdateFee>,
        new_fee_bps: u16,
    ) -> Result<()> {
        let authority = &ctx.accounts.authority;
        let orderbook = &mut ctx.accounts.orderbook.load_mut()?;

        require!(orderbook.authority == authority.key(), OrderbookError::Unauthorized);
        orderbook.fee_bps = new_fee_bps;
        Ok(())
    }
}
```

### Transpiler Rules Summary:

1. **Account struct:**
   - Add `#[account(zero_copy)]` and `#[repr(C)]`
   - Reorder fields largest-first to minimize padding (optimization)
   - Convert `camelCase` → `snake_case`
   - Map TypeScript types to Rust types
   - `bool` → `u8` (bool is NOT Pod; zero-copy uses u8 with 0/1 semantics)
   - `bytes(N)` → `[u8; N]`
   - `u64.array(N)` → `[u64; N]`

2. **Account validation struct:**
   - Use `AccountLoader<'info, T>` instead of `Account<'info, T>`
   - `init` constraint requires `space = 8 + std::mem::size_of::<T>()`
   - `zero` constraint for deferred initialization

3. **Instruction handler:**
   - Use `.load_init()?` for init instructions → returns `RefMut<T>`
   - Use `.load_mut()?` for mutable instructions → returns `RefMut<T>`
   - Use `.load()?` for read-only instructions → returns `Ref<T>`
   - Access fields through the Ref: `bar.load_mut()?.field`
   - Pubkey assignment: `bar.authority = authority.key()` (note the `.key()`)

4. **Field access in instruction body:**
   - Same as normal accounts for reads: `orderbook.bid_count`
   - For writes, the RefMut is already dereferenced by the `let ... = &mut ...load_mut()?` binding
   - Array indexing: `orderbook.bids[idx as usize * 2]`

---

## 10. Limitations and Gotchas

### Padding is a silent killer

With `#[repr(C)]`, padding bytes are between fields. If the TypeScript user specifies:
```typescript
const Foo = account({ flag: u8, value: u64 }).zeroCopy()
```
The actual struct size is **16 bytes** (1 + 7 padding + 8), not 9 bytes.

**Our transpiler must:**
- Calculate exact `sizeof::<T>()` including padding
- OR sort fields largest-first (recommended)
- Document the padding behavior clearly

### bool is NOT allowed in safe zero-copy

In Borsh, `bool` is 1 byte. In zero-copy, `bool` is **not Pod** (bytemuck rejects it because
not all bit patterns are valid: 0x02 is UB for `bool`). Use `u8` instead:
- `0` = false
- `1` = true
- Our transpiler maps TypeScript `bool` → Rust `u8` in zero-copy mode
- Accessor: `orderbook.is_active != 0` for truthiness check

### No dynamic sizing

Zero-copy accounts are fixed-size. You cannot grow them dynamically (no `Vec::push`). If you need variable-length data, you must:
1. Pre-allocate the max size with fixed arrays
2. Track the logical length with a counter field
3. Use `realloc` to resize the entire account (rare)

### Discriminator is separate from the struct

The 8-byte discriminator lives at bytes `[0..8]` of the account data. The struct data starts at bytes `[8..]`. When calculating `std::mem::size_of::<T>()`, the discriminator is NOT included. The `AccountLoader` handles this offset internally:

```rust
// From load_mut():
bytemuck::from_bytes_mut(&mut data[disc.len()..mem::size_of::<T>() + disc.len()])
```

### Cross-program invocation (CPI) gotcha

If you pass a zero-copy account through CPI, the RefCell borrow can cause panics. You must drop all `Ref`/`RefMut` before making CPI calls:

```rust
// WRONG:
let bar = ctx.accounts.bar.load_mut()?;
bar.data = 42;
token::transfer(cpi_ctx, amount)?;  // PANIC: bar's RefMut still held

// CORRECT:
{
    let mut bar = ctx.accounts.bar.load_mut()?;
    bar.data = 42;
}  // RefMut dropped
token::transfer(cpi_ctx, amount)?;  // OK
```

### Our transpiler must handle this

When the transpiler sees a CPI call (`token.transfer(...)`) and there are active zero-copy borrows, it should emit a scope block to drop them:

```typescript
// TypeScript:
orderbook.bidCount += 1
token.transfer({ from, to, authority, amount })

// Generated Rust:
{
    let orderbook = &mut ctx.accounts.orderbook.load_mut()?;
    orderbook.bid_count += 1;
}  // Drop RefMut before CPI
token::transfer(cpi_ctx, amount)?;
```

---

## Summary: What Our Transpiler Needs

### Type mapping table for zero-copy mode:

```typescript
// Type definitions to add to better-sol/program:
type ZeroCopyType =
  | typeof pubkey        // → Pubkey (32 bytes)
  | typeof u8            // → u8 (1 byte)
  | typeof i8            // → i8 (1 byte)
  | typeof u16           // → u16 (2 bytes)
  | typeof i16           // → i16 (2 bytes)
  | typeof u32           // → u32 (4 bytes)
  | typeof i32           // → i32 (4 bytes)
  | typeof u64           // → u64 (8 bytes)
  | typeof i64           // → i64 (8 bytes)
  | typeof u128          // → u128 (16 bytes)
  | typeof i128          // → i128 (16 bytes)
  | typeof bool          // → u8 (1 byte) — bool is NOT Pod, mapped to u8
  | typeof f64           // → f64 (8 bytes)
  | ReturnType<typeof bytes>   // → [u8; N] (N bytes)
  | ReturnType<typeof u64.array> // → [u64; N] (N*8 bytes)
  // etc for each primitive.array()
```

### Code generation changes for zero-copy:

| Aspect | Normal Account | Zero-Copy Account |
|--------|---------------|-------------------|
| Account derive | `#[account]` | `#[account(zero_copy)]` |
| Container type | `Account<'info, T>` | `AccountLoader<'info, T>` |
| Init access | Direct field access | `.load_init()?` |
| Mut access | Direct field access | `.load_mut()?` |
| Read access | Direct field access | `.load()?` |
| Space | `8 + T::INIT_SPACE` | `8 + std::mem::size_of::<T>()` |
| Pubkey assign | `account.authority = auth.key()` | `account.authority = auth.key()` (same, but through RefMut) |
| CPI safety | N/A | Must drop RefMut before CPI |
| Field ordering | Any order (Borsh is packed) | Largest-first recommended (minimizes padding) |
| Allowed types | Any Borsh-serializable | Pod only (no String, Vec, Option) |
| Escape hatch | `rust\`...\`` | Same |

### Space calculation algorithm for the transpiler:

```typescript
function calculateZeroCopySize(fields: Field[]): number {
  // Sort fields by alignment (largest first) to minimize padding
  const sorted = [...fields].sort((a, b) => b.alignment - a.alignment);

  let offset = 0;
  for (const field of sorted) {
    // Align offset to field's alignment
    const padding = (field.alignment - (offset % field.alignment)) % field.alignment;
    offset += padding + field.size;
  }

  // Add trailing padding to align struct to largest field's alignment
  const maxAlign = Math.max(...fields.map(f => f.alignment));
  const trailingPadding = (maxAlign - (offset % maxAlign)) % maxAlign;
  offset += trailingPadding;

  return offset;
}

// Type sizes and alignments:
const TYPE_INFO = {
  u8:    { size: 1,  alignment: 1 },
  i8:    { size: 1,  alignment: 1 },
  u16:   { size: 2,  alignment: 2 },
  i16:   { size: 2,  alignment: 2 },
  u32:   { size: 4,  alignment: 4 },
  i32:   { size: 4,  alignment: 4 },
  u64:   { size: 8,  alignment: 8 },
  i64:   { size: 8,  alignment: 8 },
  u128:  { size: 16, alignment: 8 },  // alignment is 8 on 64-bit targets
  i128:  { size: 16, alignment: 8 },
  f32:   { size: 4,  alignment: 4 },
  f64:   { size: 8,  alignment: 8 },
  bool:  { size: 1,  alignment: 1 },  // maps to u8 in zero-copy (bool is NOT Pod)
  pubkey: { size: 32, alignment: 1 },  // [u8; 32] has alignment 1 (element alignment)
  // arrays: alignment = alignment of element type, size = N * sizeof(element)
};
```
