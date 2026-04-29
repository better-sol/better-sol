# The Transpiler Question: Can We Cover Most Solana Programs?

## What Do Solana Programs Actually Do?

I audited the operations in the most common Solana program types:

| Program Type | Examples | Core Operations |
|---|---|---|
| **Token/NFT** | SPL Token, Metaplex | Mint, transfer, burn, approve, freeze |
| **Escrow/Swap** | Jupiter, Raydium limit orders | Conditional token transfer, CPI |
| **AMM** | Raydium, Orca | Math (swap calc), CPI to token |
| **Lending** | MarginFi, Kamino | Math, CPI, state transitions |
| **Governance** | Squads, Realms | Voting, threshold checks, execution |
| **Staking** | Marinade, Jito | Deposit, withdraw, rewards calc |
| **Multisig** | Squads | Proposal, approve, execute |
| **Marketplace** | Tensor, Magic Eden | Listing, purchase, royalties |

### The 10 Operations That Cover ~80% of Programs

1. **Account field read/write** — Every program does this
2. **Arithmetic** — `+`, `-`, `*`, `/`, `%` on integers
3. **Comparisons** — `==`, `!=`, `>`, `<`, `>=`, `<=`
4. **Boolean logic** — `&&`, `||`, `!`
5. **Access control** — Check signer == authority
6. **PDA derivation** — Find program addresses
7. **CPI: Token Program** — transfer, mint, burn, approve, set authority
8. **CPI: System Program** — create account, transfer SOL
9. **CPI: Associated Token** — create ATA
10. **Conditional logic** — if/else branches

That's it. These 10 things cover token programs, escrows, NFT mints, staking,
governance, multisig, marketplaces, and most DeFi primitives.

What's NOT covered:
- Complex math (AMM curves, yield calculations) — need custom Rust
- Compression (Merkle trees, state compression) — need custom Rust
- Advanced cryptography (zero-knowledge proofs) — need custom Rust
- Low-level memory manipulation — need custom Rust

But for 80% of programs that most developers write, the 10 operations above
are sufficient.

---

## What Existing Transpilers Prove

| Project | Source → Target | Approach | Coverage | Status |
|---|---|---|---|---|
| **Seahorse** | Python → Anchor | Full compiler (Python AST → Rust AST → code) | Good (classes, methods, CPI) | Abandoned (last commit 2023) |
| **Poseidon** | TypeScript → Anchor | AST transpiler with class-based API | Basic (accounts, transfers) | Active, limited |
| **Solang** | Solidity → Solana BPF | Full LLVM-based compiler | Comprehensive | Active, Solana Foundation |
| **sBPF SDK** | Assembly → BPF | Direct assembler | Complete (but assembly) | Active |

Seahorse proves a higher-level-language-to-Anchor transpiler is achievable.
Poseidon proves TypeScript-to-Anchor is achievable but limited.
Solang proves a full language compiler is possible but is a massive effort.

The sweet spot: **Poseidon's idea, Seahorse's ambition, TypeScript's ergonomics.**

---

## Is It Worth Building? My Honest Assessment

### Arguments FOR building a transpiler

1. **Massive DX improvement** — Writing TypeScript instead of Rust for simple programs is transformative
2. **Genuinely novel** — Nobody has done this well for TypeScript (Poseidon is basic, Seahorse was Python)
3. **Judges will love it** — Developer tooling wins hackathons. A live demo where you write TS and deploy to devnet without Rust is jaw-dropping
4. **The same definition is dual-use** — Client SDK + program compiler from one source of truth
5. **The scope is bounded** — Solana programs can only do ~30 things. We're not transpiling all of TypeScript. We're transpiling a DOMAIN-SPECIFIC subset

### Arguments AGAINST

1. **2 weeks is tight** — A transpiler is a compiler. Even a simple one is significant engineering
2. **CPI handling is complex** — Token program CPIs need careful handling of accounts, seeds, signers
3. **Edge cases will bite** — Account sizing, discriminator generation, rent exemption
4. **Bug surface** — Generated Rust that compiles but behaves incorrectly is worse than no tool

### My verdict: DO IT, but scope ruthlessly

The transpiler is the hero feature. It's what makes this project stand out.
But it doesn't need to cover every edge case for the hackathon.

---

## The Scoping Decision: What To Build In 2 Weeks

### MUST HAVE (ships in the demo)
- Account schemas with typed fields
- Instruction definitions with accounts + args
- Inline logic: assignments, arithmetic, comparisons
- `require()` for access control checks
- if/else conditionals
- Token Program CPI: transfer, mint
- System Program CPI: create account, transfer SOL
- Transpiler: TypeScript AST → Anchor Rust source
- Cloud compiler: Rust source → .so bytecode
- 3 working demos: counter, escrow, token sale
- Same definitions work as typed client in SDK

### NICE TO HAVE (if time allows)
- Associated Token Program CPI (create ATA)
- Token Program CPI: burn, approve, set authority
- Error definitions with custom error codes
- Event logging
- Test mode: interpret the logic in JS without compilation

### EXPLICITLY OUT OF SCOPE (post-hackathon)
- Complex math (AMM curves)
- State compression / Merkle trees
- Zero-knowledge proofs
- Custom CPI to arbitrary programs
- Advanced Rust features (zero-copy accounts, etc.)

---

## Proposed Architecture

```
programs/counter.ts
       │
       ▼
┌──────────────────┐
│  TypeScript AST  │  ← @babel/parser or ts-morph
│  Parser          │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Program IR      │  ← Our intermediate representation
│  (Typed, validated)
└──────────────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│  Rust Code   │    │  JS Client SDK   │
│  Generator   │    │  (runtime types, │
│              │    │   PDA derive,    │
└──────────────┘    │   account decode)│
       │            └──────────────────┘
       ▼
┌──────────────┐
│  Cloud       │
│  Compiler    │  ← POST Rust source → get .so
│  Service     │
└──────────────┘
       │
       ▼
  counter.so  →  deploy to devnet
```

The Program IR is the key. Both the Rust generator and the JS client derive
from the same intermediate representation. One source of truth.
