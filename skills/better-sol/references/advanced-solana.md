# Advanced Solana Patterns

Use this reference when the task involves advanced Solana runtime behavior, transaction optimization, account management, or performance tuning.

## Compute budget

Every transaction has a compute unit budget. The default is 200,000 CU per instruction, capped at 1.4M CU per transaction. Programs that exceed the budget fail.

Patterns:

- Simulate the transaction first to measure CU consumption. Add a safety margin of 10–20%.
- Set compute unit limit explicitly with `ComputeBudgetInstruction.setComputeUnitLimit`.
- Set compute unit price with `ComputeBudgetInstruction.setComputeUnitPrice` for priority during congestion.
- Heavy CPI chains, cryptographic verification, and large account iteration consume more CU.

## Address Lookup Tables

ALTs store up to 256 addresses in a single on-chain table. Transactions reference the table index instead of the full 32-byte address, saving space and allowing more accounts per transaction.

When to use:

- More than ~20 accounts per transaction.
- Reusable sets of addresses (common mints, program IDs, system accounts).
- DeFi operations that touch multiple programs and token accounts.

## Versioned transactions

Versioned transactions (v0) support ALTs. Legacy transactions (v0 not set) do not. Most wallets now support v0. Use versioned transactions when ALTs are needed.

## Account compression

Solana state compression (concurrent merkle trees) allows storing large datasets on-chain at minimal cost. Used for compressed NFTs, compressed tokens, and large allowlists.

The compression program stores only the merkle root on-chain. Leaf data is stored off-chain (indexer or local cache) but can be proven against the root.

When to use:

- Large collections of NFTs.
- Massive airdrop allowlists.
- Data that must be verifiable but not individually queryable on-chain.

## Token-2022 extensions

Token-2022 (Token Extensions program) adds programmable token behavior:

- Transfer fees: automatic fee deduction on transfers.
- Confidential transfers: encrypted balances and transfer amounts.
- CPI guard: prevent CPIs from transferring tokens without explicit permission.
- Default account state: force new accounts to be frozen until initialized.
- Immutable ownership: prevent ownership transfer after creation.
- Mint close authority: allow closing mint accounts.
- Permanent delegate: mint or burn from any account. Use with extreme caution.
- Transfer hook: custom program logic on every transfer.

Each extension changes security assumptions. Review extension behavior in isolation and in combination.

## PDA internals

PDAs are derived from seeds and a program ID using SHA-256 with a bump seed. The `findProgramAddressSync` function tries bump values from 255 downward until it finds a valid off-curve point.

Implications:

- PDA derivation is deterministic and verifiable.
- Different seed combinations with the same program ID can produce different addresses.
- The bump seed must be stored or derivable to sign CPIs correctly.
- PDA collisions between account types are prevented by using unique namespace seeds.

## Cross-Program Invocation (CPI) depth

CPI calls have a maximum depth of 4 levels. Each level inherits the compute budget of the parent. CPI signers are auto-derived from the calling program's PDAs.

Edge cases:

- A CPI can invoke another CPI (up to depth 4).
- Token program CPIs require correct account ordering and writability.
- CPI errors bubble up and fail the entire transaction.
- Remaining accounts in the parent are accessible in CPIs if passed.

## Rent and space calculation

Account space is allocated in multiples of 8 bytes (discriminator) plus field sizes. Rent exemption requires a minimum balance proportional to space plus overhead.

Calculate space requirements:

- pubkey: 32 bytes
- u64/u128: 8/16 bytes
- bool: 1 byte
- string: 4 + UTF-8 length
- vec: 4 + element count * element size
- optional: 1 + inner size (when present)
- fixed array: count * element size

Use zero-copy for fixed-size high-throughput accounts. Zero-copy accounts skip serialization overhead.

## Epochs and schedule behavior

Solana operates in epochs (currently ~2 days). Staking rewards, rent collection, leader schedule changes, and feature activations happen at epoch boundaries.

Implications for programs:

- Clock-based logic (staking periods, lockups, epochs) must handle epoch transitions.
- Feature gates may change runtime behavior at epoch boundaries.
- Large state changes should consider leader schedule and congestion.

## Slot timing

Slots target ~400ms. A slot may be skipped if the leader does not produce a block. Finality requires confirmation from supermajority of stake.

Transaction status progression:

1. processed: included in a block
2. confirmed: voted on by supermajority
3. finalized: permanently committed

Use `commitment: "confirmed"` for most UI operations. Use `commitment: "finalized"` for irreversible financial operations.

## Transaction signing

Ed25519 is the native signature scheme. Programs can verify Ed25519 signatures through built-in sysvar instructions. Secp256k1 verification is available for Ethereum-compatible flows.

Multi-signature:

- Squads multisig for program authority management.
- Timelock for delayed execution.
- SPL Token multisig for token account authority.

## Write-lock contention

Only one transaction can write-lock an account per slot. High-frequency programs with shared writable accounts become bottlenecks. Design state to minimize write-lock contention:

- Per-user accounts instead of global state.
- Separate read and write paths.
- Event-driven updates instead of synchronous writes.

## Performance decision framework

### Diagnose before optimizing

Optimize only after identifying the bottleneck:

| Symptom | Likely bottleneck | First response |
|---|---|---|
| Transaction too large | Account list or instruction data | Use ALTs, split transaction, reduce accounts |
| Compute exceeded | CPI depth or heavy verification | Profile logs, reduce CPIs, raise compute budget only if justified |
| High failure during traffic spikes | Write-lock contention | Shard state by user, market, or epoch |
| RPC slow reads | Too many account fetches | Batch with `getMultipleAccounts`, cache, index |
| Mobile signing unreliable | Transaction assembly latency | Preload accounts, simulate before wallet handoff |

### Architectural tradeoffs

| Technique | Benefit | Cost |
|---|---|---|
| Address Lookup Tables | More accounts per transaction | Extra setup, lifecycle management |
| Compression | Massive scale at lower cost | Indexer dependency, harder composability |
| Token-2022 extensions | Rich token behavior | Larger account size, wallet compatibility checks |
| Zero-copy accounts | Faster deserialization | Stricter layout constraints |
| Priority fees | Better inclusion probability | Higher user cost, fee estimation complexity |

The best optimization is usually state layout, not a compute budget increase. If many users write the same account, no amount of compute optimization fixes the throughput bottleneck.

## Related

- `web3-dapp-architecture.md` for dApp architecture patterns that use these runtime features.
- `program-patterns.md` for Better Sol patterns that map to these Solana concepts.
