# Smart Contract Security Across Blockchains

Use this reference to understand attack patterns that exist across blockchains and how they manifest on Solana.

## Universal attack patterns

### Reentrancy

EVM: attacker re-enters a contract during state update before state is fully committed. Prevented with checks-effects-interactions pattern or reentrancy guards.

Solana/SVM: the runtime prevents cross-program reentrancy (a program cannot be called again while executing). However, self-reentrancy within the same instruction is possible if a program calls itself through CPI. Better Sol programs should complete state mutations before issuing CPIs.

### Integer overflow and underflow

EVM: Solidity <0.8.0 requires SafeMath. Solidity >=0.8.0 checks by default.

Solana/SVM: Rust checks overflow in debug mode but wraps in release mode by default. Better Sol programs handle this through the DSL, but custom math in run bodies should use checked arithmetic. Client-side: use `bigint` and validate bounds.

### Access control failures

EVM: missing or incorrect `msg.sender` checks, missing `onlyOwner` modifiers.

Solana/SVM: missing `ctx.require(authority === storedAuthority)`. A signer is not automatically an authority. The program must compare the signer to the stored authority field.

### Front-running and MEV

EVM: transaction ordering is visible in the mempool. Attackers can front-run, sandwich, or back-run user transactions.

Solana/SVM: no public mempool, but Jito bundles and leader schedule create priority ordering opportunities. Transaction privacy is higher than EVM but not guaranteed.

### Flash loan attacks

EVM: uncollateralized loans within a single transaction enable price manipulation, governance attacks, and arbitrage exploits.

Solana/SVM: flash loans exist but are less common. The same pattern applies: any protocol that uses spot prices within a single transaction must be resilient to atomic price manipulation.

### Oracle manipulation

EVM: attackers manipulate DEX spot prices or low-liquidity oracle feeds within a single transaction.

Solana/SVM: Pyth confidence intervals and Switchboard feed aggregation reduce risk. Programs should check oracle freshness and confidence bounds.

### Governance attacks

Cross-chain: flash-loan-enabled voting, whale dominance, proposal spam, and emergency execution before community review.

Mitigations: timelocks, flash loan guards, delegation delays, quorum requirements, and quadratic voting.

### Denial of service

EVM: gas limit exploitation, array iteration, unexpected reverts.

Solana/SVM: compute budget exhaustion, write-lock contention, account data size limits, remaining accounts abuse.

## Solana-specific attack patterns

### Account confusion

Passing the wrong account type or an account owned by a different program. Discriminators prevent type confusion within a program, but cross-program account validation must be explicit.

### PDA collision

Two different logical entities derive the same PDA. Prevent with unique namespace seeds and stable dynamic seeds.

### Duplicate mutable accounts

The same account passed in two mutable roles, breaking accounting assumptions.

### Token account substitution

Transfers to attacker-controlled token accounts or wrong mint. Always verify token account mint and owner.

### CPI authority abuse

Unnecessary signer or writable permissions passed through CPIs. Restrict to minimum required permissions.

### Seed manipulation

User-supplied seed material that creates collisions or allows unauthorized access. Never use arbitrary user input as the only seed for value-bearing accounts.

### Rent griefing

Pre-funding accounts to manipulate rent economics around init/close logic.

### Reinitialization

Re-creating an account that should only be initialized once. Use `bs.init` for first-time creation and guard `initIfNeeded` against authority overwrite.

## Economic attack patterns

### Rug pull

Creators retain mint or upgrade authority and drain value after building trust. Mitigate with revoked mint authority, multisig upgrade authority, and timelocks.

### Wash trading

Artificial volume to manipulate prices or rankings. Detect with trade pattern analysis and wallet clustering.

### vampire attack

Cloning a protocol and offering better incentives to drain liquidity. Address through community moats, brand trust, and unique technical features.

### Governance extraction

Using governance mechanisms to extract value from a protocol. Mitigate with timelocks, supermajority requirements, and constitutional limits.

## Defense-in-depth

Layer defenses rather than relying on a single check:

1. Program-level access control and invariant enforcement.
2. Account-level discriminator and ownership validation.
3. Transaction-level simulation and compute estimation.
4. Client-side input validation and transaction preview.
5. Backend monitoring for anomalous behavior.
6. Operational security for keys and upgrade authority.
7. External audits for high-value programs.

## Related

- `attack-catalog.md` for Solana-specific attack classes.
- `economic-security.md` for economic attack patterns not visible in code.
- `security-checklist.md` for program-level safety checks.
