# How Solana Works — A Complete Guide

This document explains everything you need to know about Solana to understand
what we're building and why. No prior blockchain experience required.

---

## The Big Picture

**Solana is a computer in the cloud that anyone can use, but nobody owns.**

Think of it like AWS — you deploy code, it runs, people interact with it. But instead of Amazon running the servers, thousands of independent computers (called **validators**) all run the same code and agree on the results. No single entity can shut it down, censor it, or change the rules.

```
Traditional web app:          Solana:
─────────────────────         ─────────────────
You write a server            You write a program
You deploy to AWS             You deploy to Solana
Users hit your API            Users send transactions
Your database stores state    Accounts store state
You pay AWS                   Users pay fees (in SOL)
```

The key difference: on Solana, **every transaction is public, verified by thousands of computers, and can never be changed after the fact.**

---

## Accounts — Where Data Lives

Solana doesn't have a database. It has **accounts**.

An account is a slot in the blockchain's memory. Every account has:
- An **address** (a public key, like a bank account number)
- An **owner** (which program is allowed to modify this account)
- **Data** (the actual bytes stored — could be a number, a string, a complex object)
- **Lamports** (the SOL balance, like rent money)

```
Account {
  address:  "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  owner:    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"  ← Token Program
  data:     [0, 0, 0, 0, 0, 0, 0, 100]                     ← 8 bytes, value = 100
  lamports: 500_000_000                                      ← 0.5 SOL
}
```

**Think of accounts like rows in a database table**, but:
- There's no table — each account is independent
- The "owner" field controls WHO can modify the data (like a foreign key to a program)
- You pay rent (in SOL) for the space your data takes up
- If an account has enough SOL, it's "rent-exempt" and lives forever

### Creating Accounts

Accounts don't spring into existence. Someone has to:
1. Generate a new address
2. Pay SOL to allocate the space
3. Assign ownership to a program

This is why instructions that create accounts always have a **payer** — someone
funding the account creation.

---

## Keypairs — Who Controls What

Every account on Solana has an address. But how do you **prove** you own that address?

**Keypairs.**

A keypair is a pair of cryptographic keys:

```
Keypair {
  publicKey:  "CoUnTeR11111111111111111111111111111111111"  ← the address (everyone can see it)
  privateKey: [4, 52, 178, ...64 secret bytes]                    ← the signing key (only you know it)
}
```

Think of it like a bank account:
- **Public key** = your account number. You can share it with anyone. "Send money here."
- **Private key** = your PIN code. Only you know it. You use it to authorize transactions.

When someone sends a transaction, Solana checks:
> "Was this signed by the private key that matches this public key?"

If yes — the transaction is authorized. If no — rejected.

### Why Solana Needs So Many Keypairs

On Ethereum, you have one wallet address and that's it. On Solana, you need keypairs for **different things**:

| What | Why a keypair? | Example |
|---|---|---|
| **Your wallet** | To sign transactions (send SOL, approve transfers) | `solana-keygen new` → your personal wallet |
| **Program deploy** | The program's identity on-chain (its address) | The `counter` program lives at `CoUnTeR...` because that's the public key of its keypair |
| **PDA seeds** | Deterministic addresses derived from program ID + seeds | NOT a keypair — PDAs have no private key |
| **Token accounts** | Each SPL token account has its own address | Associated Token Accounts are PDAs, not keypairs |

The important distinction:

- **Keypair addresses** (like your wallet, or a program address): Someone holds the private key.
  They can **sign** transactions from that address.
- **PDA addresses** (like `counter` accounts): No private key exists. Only the **program** can
  sign for PDAs, and only during a transaction that invokes that program.

### The Program Keypair

When you deploy a program, Solana needs to know:
1. **Where** the program lives on-chain (its address)
2. **Who** can upgrade it (the upgrade authority)

The address is the **public key** of a keypair. When you first deploy, you generate
a new keypair and use its public key as the program's address.

```bash
# Solana CLI (traditional way)
solana-keygen new --outfile counter-keypair.json
# → Public key: CoUnTeR11111111111111111111111111111111111
# → Saved to counter-keypair.json
```

The private key in that file is used:
- **At deploy time**: to sign the `deploy` transaction ("I authorize putting this code at this address")
- **At upgrade time**: to sign the `upgrade` transaction ("I authorize replacing this code")
- **At runtime**: NEVER. The program's private key is never used during execution.

In traditional Solana development, this keypair file stays on the developer's machine.
It's referenced in ` Anchor.toml` or passed to `solana program deploy`.

### How better-sol Handles This

In better-sol, the developer **never thinks about keypairs**.

```bash
npx @better-sol/cli deploy
# → Generating keypair: CoUnTeR...
# → Saved .better-sol/counter.json (private, gitignored)
# → (the address is the public key, the file also contains the private key for deploys)
```

The keypair file is stored in `.better-sol/{program-name}.json`:
- `create` generates it when scaffolding a new program
- `deploy` generates it on first deploy if it doesn't exist
- `deploy` reads it on subsequent deploys (for upgrading)
- The **full keypair** stays in `.better-sol/{program-name}.json` (private, gitignored)

At runtime, the client reads the address from the program definition —
it's the named `address` parameter of `program()`. The private key stays in
`.better-sol/` and is only used during `deploy` to sign deploy transactions.

```
.better-sol/
  counter.json      ← program keypair (gitignored, shared across all clusters)
```

This means PDA addresses are identical on every cluster. Your client
code doesn't change between devnet and mainnet.

### The Wallet Keypair (Payer)

There's one more keypair you need: **your wallet**. This pays for:
- Transaction fees (every transaction costs a small amount of SOL)
- Account rent (creating accounts costs SOL)
- Deploy fees (uploading program code costs SOL)

```typescript
const sol = await betterSol({
  cluster: 'devnet',
  payer: './keypair.json',  // your wallet keypair
  programs: { counter },
})
```

On devnet, you can get free SOL from the faucet:
```bash
solana airdrop 2 <your-address> --url devnet
```

On mainnet, you need real SOL.

**Summary:** You have two types of keypairs:
1. **Program keypairs** — the program's identity (address). Auto-managed by better-sol.
2. **Wallet keypair** — pays for everything. You provide this.

---

## Programs — Where Logic Lives

Programs are the "smart contracts" of Solana. They're **code deployed on-chain**
that processes instructions.

A program is:
- **Stateless** — the program itself holds no data. It reads from and writes to accounts.
- **Permissioned** — a program can only modify accounts it owns.
- **Immutable** — once deployed, the code cannot be changed (unless you set an upgrade authority).

### Why Rust?

Solana programs run inside a **virtual machine** called **sBPF** (Solana Berkeley Packet Filter).
sBPF is:
- A **register-based VM** (like a simplified CPU)
- Designed for **fast, deterministic execution**
- Originally from the Linux kernel (for network packet filtering — hence the name)

sBPF doesn't understand Rust. It only understands **sBPF bytecode** (a binary format, like `.wasm` for WebAssembly).

The reason Rust is used is simple: **LLVM can compile Rust to sBPF bytecode.**

```
Rust source code
     ↓  (Rust compiler + LLVM)
sBPF bytecode (.so file)
     ↓  (deployed to Solana)
Runs inside the sBPF VM on every validator
```

The `.so` file is the compiled sBPF bytecode. It's called `.so` (shared object) because
sBPF's binary format happens to be **ELF** — the same format Linux uses for shared libraries.
It's NOT a Linux shared library. It just uses the same file format.

You could theoretically write Solana programs in C or any language LLVM can target.
But Rust is preferred because:
1. **Memory safety** — no buffer overflows, use-after-free, etc. Critical when handling money.
2. **Zero-cost abstractions** — you get high-level ergonomics without runtime overhead.
3. **The Anchor framework** — a Rust framework that handles boilerplate (like React for Solana programs).

### Why Not JavaScript/TypeScript?

JavaScript can't compile to sBPF. There's no sBPF backend for V8 or any JS engine.
JavaScript is also not deterministic (floating point, garbage collection pauses, JIT compilation)
which is a requirement for blockchain — every validator must get the exact same result.

**This is exactly why we're building what we're building:**
we let you WRITE in TypeScript, but we TRANSLATE it to Rust, which then compiles to sBPF.
You never see the Rust. You never compile it. Our cloud service handles that.

---

## Instructions — How You Interact

An instruction is a single operation: "Hey program, do this thing with these accounts."

```
Instruction {
  program_id:  "CouNTeR11111111111111111111111111111111111"  ← which program to call
  accounts:    [                                            ← which accounts to touch
    { address: "7xKX...1", writable: true,  signer: true },
    { address: "9yKX...2", writable: true,  signer: false },
  ]
  data:        [0, 0, 0, 0, 0, 0, 0, 10]                   ← instruction-specific data (amount = 10)
}
```

The `data` field is just raw bytes. The program interprets those bytes however it wants.
Usually the first 8 bytes identify WHICH instruction to run (a discriminator),
and the rest are the arguments.

**The program checks:**
1. Are all the required accounts provided?
2. Are the signers correct? (Who authorized this?)
3. Are the account relationships valid? (e.g., does this token account actually hold this mint?)
4. Are the business rules satisfied? (e.g., does the user have enough balance?)
5. If everything passes → modify the account data

---

## Transactions — Wrapping Instructions

A **transaction** wraps one or more instructions together:

```
Transaction {
  signatures: [signature1, signature2]    ← who approved this
  instructions: [
    { program: System,   "create account for counter" },
    { program: Counter,  "initialize counter to 42" },
  ]
  recent_blockhash: "GHtX..."            ← anti-replay protection
}
```

Key properties:
- **Atomic** — either ALL instructions succeed, or ALL fail. No partial state.
- **Ordered** — instructions run in sequence. Later ones see state from earlier ones.
- **Single-block** — all instructions must fit in one block (~1.2M compute units).
- **Signed** — every account that's marked as `signer` must provide a cryptographic signature.

### The Blockhash Problem

Transactions include a "recent blockhash" — a fingerprint of a recent block.
This prevents replay attacks (someone resubmitting an old transaction).
Blockhashes expire after ~150 blocks (~60 seconds).
If your transaction is old, it gets rejected.

**This is a pain point our SDK handles automatically.**
The developer just calls `sol.counter.increment({...})` and we handle
blockhashes, signing, serialization, and sending.

---

## PDAs — Program Derived Addresses

Most accounts have random addresses (generated from a keypair). But programs
often need **deterministic addresses** — addresses that can be derived from
known inputs without needing a private key.

**PDA = Program Derived Address.**

```
PDA = hash(program_id + seeds)
```

Seeds are arbitrary bytes that you choose. For example, a counter account
might use `seeds = ["counter", authority_pubkey]`. This means:
- There's exactly ONE counter per authority
- Anyone can calculate the address (no secrets needed)
- Only the program can sign for this address (no private key exists)

```typescript
// In our API:
const Counter = account({
  count: u64,
  authority: pubkey,
}).derive((seed) => ["counter", seed.authority])

// Derive the address:
const addr = Counter.derive({ authority: payer })
// → Always the same address for the same authority
```

**Why PDAs matter:**
- They let programs "own" accounts (the program is the only signer)
- They enable deterministic address lookup (no need to store addresses)
- They're the backbone of DeFi (pool addresses, escrow accounts, etc.)

When our transpiler sees `authority: pool` in a CPI call, and `pool` is a PDA,
it automatically generates `CpiContext::new_with_signer` — the PDA-signed version.
The developer doesn't need to know this distinction.

---

## SOL and Lamports

**SOL** is Solana's native token. It's used for:
- **Transaction fees** — every transaction costs a small amount of SOL
- **Rent** — accounts pay SOL for the space they use
- **Staking** — validators stake SOL to participate in consensus

**1 SOL = 1,000,000,000 lamports** (1 billion lamports).

Internally, everything is in lamports (integers). No floating point.
Our API uses `bigint` for all numeric values (amounts, balances, etc.).

---

## What is an IDL?

**IDL = Interface Description Language.**

When you write an Anchor program in Rust, the Anchor framework generates an IDL —
a JSON file that describes the program's interface in exact binary detail:

```json
{
  "name": "counter",
  "address": "CouNTeR11111111111111111111111111111111111",

  "instructions": [
    {
      "name": "increment",
      "discriminator": [11, 234, 145, 67, 89, 201, 34, 156],
      "accounts": [
        {
          "name": "counter", "writable": true,
          "pda": { "seeds": [
            { "kind": "const", "value": [99,111,117,110,116,101,114] },
            { "kind": "account", "path": "authority" }
          ]}
        },
        { "name": "authority", "signer": true }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    }
  ],

  "accounts": [
    {
      "name": "Counter",
      "discriminator": [83, 11, 183, 252, 74, 141, 85, 149],
      "structure": {
        "fields": [
          { "name": "count",     "type": "u64",      "offset": 8,  "size": 8 },
          { "name": "authority", "type": "publicKey", "offset": 16, "size": 32 },
          { "name": "isActive",  "type": "bool",     "offset": 48, "size": 1 }
        ],
        "totalSize": 49
      }
    }
  ],

  "errors": [
    { "code": 6000, "name": "Unauthorized", "msg": "Not the authority" },
    { "code": 6001, "name": "NotActive",    "msg": "Counter is not active" }
  ]
}
```

**The IDL contains things our TypeScript doesn't (and doesn't need to):**
- **Discriminators** — 8-byte identifiers computed as `sha256("global:name")[0..8]`. Used to identify instruction/account types in binary.
- **Byte offsets and sizes** — exact binary layout for serialization. `{ count: u64 }` means "8 bytes at offset 8".
- **Numeric error codes** — Anchor assigns 6000, 6001, 6002... to each error.

These are all **deterministic computations** from the schema. Anchor computes them from Rust.
We compute them from TypeScript at runtime. Same results.

**The IDL is the bridge between on-chain and off-chain:**
- The **client SDK** reads the IDL to know how to encode instruction data and decode account data
- Tools like **Codama** generate TypeScript clients from IDLs
- **Explorers** use IDLs to show human-readable transaction data

### The Problem with IDLs

Today's Solana workflow is:
1. Write program in Rust
2. Compile and deploy
3. The compiler generates an IDL
4. Run a separate tool (Codama) to generate a TypeScript client from the IDL
5. Use that generated client in your app

**Five steps. Three different languages. Two separate codebases.**

### What We Do Instead

Our approach replaces the IDL for our users, but auto-publishes one for everyone else:

```
TypeScript program definition
     ↓
     ├──→ Transpiler generates Rust → compiles to .so → deploys + publishes IDL
     └──→ Same definition IS the client SDK (no generation needed for our users)
```

The TypeScript definition *is* the schema. It tells the client how to encode/decode.
It tells the transpiler how to generate Rust. One file, dual purpose.

But we also auto-generate and publish a standard Anchor IDL alongside the deployment.
This means anyone using Codama, Anchor TS, `@solana/kit`, or any other tool can still
interact with programs built with our library. Full ecosystem compatibility.

**Our users never touch the IDL. Everyone else can still use it.**

### How Program Upgrades Work

When you `deploy` again after changing your program:

- **Same program ID, same address** — the program is upgraded in place
- **Account data is preserved** — all existing accounts (balances, state) remain untouched
- **Only the code changes** — the new `.so` bytecode replaces the old one
- **Takes effect immediately** — next transaction uses the new code

This is different from smart contracts on Ethereum, which are immutable and require
a new address for any change. Solana programs are upgradeable by default.

**Caveat for account layout changes:** If you add a field to an account, existing
accounts still have the old (smaller) layout. You need a migration instruction to
resize them. This is true regardless of whether you use Rust directly or our library.

---

## Anchor — The Rust Framework

Anchor is a Rust framework for writing Solana programs. It handles boilerplate:
- Account validation (checking that accounts are the right type, owned by the right program)
- Serialization/deserialization (converting between Rust structs and binary data)
- Error handling (custom error enums instead of raw error codes)
- Event emission (logging structured data)
- Security checks (common vulnerability patterns)

**Our transpiler generates Anchor code**, not raw Solana Rust. This is important because:
- Anchor handles all the boilerplate (account sizing, discriminators, etc.)
- Anchor's patterns are well-tested and secure
- The generated code is readable and auditable

An Anchor program looks like this:

```rust
#[program]
pub mod counter {
    pub fn increment(ctx: Context<Increment>, amount: u64) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.counter.authority, ErrorCode::Unauthorized);
        ctx.accounts.counter.count += amount;
        Ok(())
    }
}

#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}
```

That's ~25 lines of Rust for what our API does in ~10 lines of TypeScript.
And the developer writes none of it — our transpiler generates it all.

---

## The Solana Runtime — How Execution Works

When a transaction arrives at a validator:

```
1. Check signatures — are all required signers present?
2. Check accounts — do accounts exist? Are they owned by the right programs?
3. Load account data — read the current state from the blockchain
4. Run the program — execute the sBPF bytecode with the loaded data
5. Check results — did the program return success or error?
6. If success → write the modified account data back to the blockchain
7. If error → discard all changes, return the error
```

### Compute Units

Every instruction has a **compute budget** (default: 200,000 compute units).
Operations consume compute units:
- A simple `+=` costs ~1 CU
- A CPI call costs ~5,000 CU
- Logging costs ~100 CU per byte

If you exceed the budget, the transaction fails. This prevents infinite loops
and ensures fair resource usage.

### CPI — Cross-Program Invocations

A program can call another program during execution. This is called **CPI**
(Cross-Program Invocation), and it's how Solana programs compose:

```
Your program calls Token Program → transfer tokens
Your program calls System Program → create an account
Your program calls Associated Token Program → create a token account
```

In our API:
```typescript
token.transfer({ from: sender, to: receiver, authority: signer, amount: 100n })
```

The transpiler generates the correct Anchor CPI call with all the right accounts and seeds.

---

## Token Program — The DeFi Building Block

The **SPL Token Program** is Solana's standard for fungible tokens and NFTs.
It's deployed at a fixed address (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`).

It manages two types of accounts:

### Mint Account
```
Mint {
  supply: 1_000_000_000n     ← total tokens in existence
  decimals: 9                ← 9 decimal places (like cents for dollars)
  mint_authority: pubkey     ← who can mint more
  freeze_authority: pubkey   ← who can freeze accounts
}
```

### Token Account
```
TokenAccount {
  mint: pubkey               ← which token this account holds
  owner: pubkey              ← who controls this account
  amount: 500n               ← balance
}
```

**Every token balance is a separate account on-chain.**
If you hold 5 different SPL tokens, you have 5 token accounts.

### Associated Token Accounts (ATAs)

Token accounts need to be created before you can receive tokens.
**ATAs** are deterministic addresses derived from `(owner, mint)`:
```
ATA_address = hash(owner, mint, token_program_id)
```
This way, anyone can calculate "Alice's USDC account address" without asking Alice.

---

## Clusters — The Networks

Solana has several networks:

| Network | Purpose | SOL Value |
|---|---|---|
| **mainnet-beta** | Production. Real money. | Real SOL (~$150) |
| **devnet** | Testing with fake SOL | Free (airdropped) |
| **testnet** | Stress testing, validator testing | Free |
| **localnet** | Runs on your machine | Free |

For development, you use devnet. You get free SOL from a faucet.
Our SDK defaults to devnet.

---

## Key Takeaways for What We're Building

| Concept | Traditional Solana | Our Approach |
|---|---|---|
| Write programs in | Rust | **TypeScript** |
| Compile with | `cargo build-sbf` locally | **Cloud compilation** (developer never installs Rust) |
| Deploy with | `solana program deploy` | **`npx @better-sol/cli deploy`** |
| Client SDK | Generate from IDL with Codama | **Same TS file is the client** (IDL auto-published for others) |
| Type safety | None (raw bytes) | **Full compile-time checking** |
| Testing | bankrun/LocalValidator | **`createTestSol()` with LiteSVM** |
| Error messages | Numeric codes | **Named, autocomplete-checked errors** |
| Events | Raw logs, parsed manually | **Typed event registry** |

Our entire value proposition: **You write TypeScript. We handle the Rust. The same code works on-chain and off-chain.**
