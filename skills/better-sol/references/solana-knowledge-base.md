# Solana Knowledge Base

Use this reference when explaining Solana fundamentals: accounts, programs, transactions, PDAs, CPIs, rent, compute budget, and how they compare to other blockchains.

## Core concepts

### Accounts

Everything on Solana is an account. Accounts store data, hold SOL, and are owned by programs.

An account has:
- **Address**: a 32-byte public key (displayed as base58 string)
- **Owner**: the program that can modify the account's data
- **Lamports**: the SOL balance (1 SOL = 1,000,000,000 lamports)
- **Data**: arbitrary bytes interpreted by the owning program
- **Executable**: whether this account is a program

Accounts that hold less than the rent-exempt minimum balance are garbage-collected. Most accounts are pre-funded with rent-exempt balance at creation time (approximately 0.002 SOL for a small account).

### Programs

Programs process instructions. They are stateless: all state lives in accounts, not in the program itself.

Key properties:
- Programs are also accounts (with the executable flag set)
- Programs cannot modify accounts they do not own (except through CPI)
- Programs cannot create arbitrary accounts (they use PDAs or init constraints)
- Programs are written in Rust, C, or TypeScript (via Better Sol) and compiled to BPF bytecode

### Transactions

A transaction is a set of instructions that execute atomically. All instructions succeed or all fail.

A transaction contains:
- **Signatures**: one or more ed25519 signatures
- **Message**: the list of instructions, account references, and a recent blockhash

Transaction limits:
- Maximum 1,232 bytes
- Maximum 1232 bytes total
- Maximum 64 additional signatures
- Maximum ~35 instructions (depends on account count)

### PDAs (Program Derived Addresses)

PDAs are addresses deterministically derived from seeds and a program ID. Only the program can sign for its PDAs.

```
PDA = SHA256(seeds + programId)
```

Properties:
- The private key for a PDA does not exist (it is off the ed25519 curve)
- Only the owning program can sign for the PDA via CPI
- Same seeds + program ID always produce the same address
- Different seeds produce different addresses

In Better Sol:

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority])
```

Client derivation:

```ts
const addr = await sol.counter.accounts.Counter.derive({ authority: walletAddress })
```

### CPIs (Cross-Program Invocations)

A program can call another program during instruction execution. This is a CPI.

Properties:
- The calling program can pass its PDA as a signer to the callee
- CPIs are limited to 4 levels deep
- The callee inherits the compute budget from the caller
- Failed CPIs cause the entire transaction to fail

In Better Sol:

```ts
import { cpi } from "better-sol/program"

cpi.token.mintTo({ mint, to: destination, authority, amount })
cpi.token.transfer({ from: source, to: destination, authority, amount })
```

### Rent

Every account on Solana pays rent in the form of a minimum SOL balance. The rent is calculated based on the account's data size.

- Accounts with balance above the rent-exempt minimum are never garbage-collected
- Accounts below the minimum are purged after a period of inactivity
- Rent-exempt minimum for a 0-byte account: ~0.00089088 SOL
- Rent-exempt minimum scales with data size: approximately 0.003645 SOL per 1 KB

In practice, all accounts are created with rent-exempt balance. The rent is a one-time deposit, not a recurring fee.

### Compute budget

Every transaction has a compute unit budget (default: 200,000 units, max: 1,400,000 units). Each instruction consumes compute units as it executes.

- Simple token transfer: ~400 compute units
- Complex DeFi instruction with CPIs: ~50,000-200,000 compute units
- If compute exceeds the budget, the transaction fails
- Priority fees can be added to pay more per compute unit for faster inclusion

In Better Sol:

```ts
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
  computeUnits: {
    computeUnitLimit: 400_000n,
    computeUnitPrice: 1000n,
  },
})
```

## How Solana differs from Ethereum

| Concept | Ethereum | Solana |
|---|---|---|
| Execution | Sequential EVM | Parallel SVM (Sealevel) |
| State model | Contracts hold state in storage | Accounts hold state, programs are stateless |
| Transaction cost | Variable gas fees (often $1-50) | Fixed low fees (~$0.00025) |
| Finality | 12-60 seconds | ~400 milliseconds |
| Throughput | ~15 TPS | ~65,000 TPS |
| Smart contracts | Solidity, Vyper | Rust, TypeScript, C |
| Token standard | ERC-20 (separate contract per token) | SPL Token (one program for all tokens) |
| Composability | Contract calls | CPIs + shared global state |
| Address model | Contract addresses via CREATE2 | PDAs derived from seeds |
| Account model | Implicit (storage vars) | Explicit (every account passed as argument) |
| Block structure | Single block producer | Multiple concurrent leaders (slots) |
| Consensus | Proof of Stake (Ethash deprecated) | Proof of History + Proof of Stake |

## Sealevel parallel execution

Solana's Sealevel runtime processes transactions in parallel when they touch different accounts. This is the key to Solana's throughput.

Implications for developers:
- Two transactions that modify the same account are serialized
- Two transactions that modify different accounts run in parallel
- Design programs to minimize account contention for maximum throughput
- Use separate accounts for separate users (PDAs per user) rather than a single global state account

## Programs vs smart contracts

The term "program" is used on Solana instead of "smart contract" because:

1. Programs are stateless. They do not store data internally. All data lives in separate accounts.
2. Programs are not contracts. There is no legal analogy. They are code that processes instructions.
3. Programs are upgradeable by default. The upgrade authority can deploy new code to the same address.

## Native programs

Solana has built-in programs that provide core functionality:

| Program | Address | Function |
|---|---|---|
| System Program | `11111111111111111111111111111111` | Create accounts, transfer SOL |
| SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | Fungible tokens |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | Extended token features |
| Associated Token | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efYPsKb7ZLao` | Derived token accounts |
| Compute Budget | `ComputeBudget111111111111111111111111111111` | Set compute limits and priority fees |
| BPF Loader | `BPFLoaderUpgradeab1e11111111111111111111111` | Deploy and upgrade programs |

## Confirmation levels

| Level | Description | Latency |
|---|---|---|
| `processed` | Node has processed the transaction | ~100ms |
| `confirmed` | Supermajority of validators have voted | ~1-2s |
| `finalized` | Block will not be reverted | ~12-15s |

Default in Better Sol: `"confirmed"`. Use `"finalized"` for high-value operations.

## Related

- `web3-fundamentals.md` for broader blockchain and cryptography concepts.
- `advanced-solana.md` for compute budget, ALTs, compression, and Token-2022.
- `program-patterns.md` for Better Sol program definition patterns.
- `sdk-reference.md` for the complete API reference.
