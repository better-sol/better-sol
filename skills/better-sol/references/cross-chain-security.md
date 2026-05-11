# Smart Contract Security Across Blockchains

Use this reference to understand attack patterns that exist across blockchains and how they manifest on Solana.

## Universal attack patterns

### Reentrancy

**EVM**: attacker re-enters a contract during state update before state is fully committed. The classic DAO hack. Prevented with checks-effects-interactions pattern or `nonReentrant` modifier.

**Solana/SVM**: the runtime prevents cross-program reentrancy (a program cannot be called again while executing). However, self-reentrancy within the same instruction is possible if a program calls itself through CPI.

**Better Sol defense**: complete all state mutations in `run()` before issuing CPIs. The DSL encourages this by making state assignments explicit:

```ts
run: ({ vault }, args, ctx) => {
  vault.balance -= args.amount
  cpi.token.transfer({ from: vault, to: args.recipient, amount: args.amount })
}
```

### Integer overflow and underflow

**EVM**: Solidity <0.8.0 requires SafeMath. Solidity >=0.8.0 checks by default but uses more gas.

**Solana/SVM**: Rust checks overflow in debug mode but wraps silently in release mode. The Better Sol DSL handles serialization, but custom math in `run()` bodies should use checked arithmetic:

```ts
run: ({ counter }, { amount }, ctx) => {
  const newCount = counter.count + amount
  ctx.require(newCount >= counter.count, "Overflow")
  counter.count = newCount
}
```

### Access control failures

**EVM**: missing or incorrect `msg.sender` checks. Missing `onlyOwner` modifiers. Anyone can call admin functions.

**Solana/SVM**: missing `ctx.require(signer === storedAuthority)`. A signer is not automatically an authority. The program must explicitly compare:

```ts
run: ({ config, authority }, ctx) => {
  ctx.require(authority === config.admin, "Unauthorized")
}
```

### Front-running and MEV

**EVM**: transaction ordering is visible in the mempool. Attackers front-run, sandwich, or back-run user transactions for profit.

**Solana/SVM**: no public mempool by default. Jito bundles and leader schedule create priority ordering opportunities. Transaction privacy is higher than EVM but not guaranteed.

**Mitigation**: set slippage tolerance on swaps. Use Jito tips for priority inclusion. Design programs to minimize MEV extraction opportunities (batch auctions, commit-reveal schemes).

### Flash loan attacks

**EVM**: uncollateralized loans within a single transaction enable price manipulation, governance attacks, and arbitrage exploits. Borrow $10M, manipulate price, extract value, repay loan, all atomically.

**Solana/SVM**: flash loans exist but are less common. The same pattern applies: any protocol that uses spot prices within a single transaction must be resilient to atomic price manipulation.

**Mitigation**: use TWAP over multiple blocks. Use oracle confidence intervals. Add multi-block delays for critical operations.

### Oracle manipulation

**EVM**: attackers manipulate DEX spot prices or low-liquidity oracle feeds within a single transaction.

**Solana/SVM**: Pyth confidence intervals and Switchboard feed aggregation reduce risk. Programs should check oracle freshness and confidence bounds.

**Mitigation**:
```ts
ctx.require(currentSlot - oracle.lastUpdatedSlot < 25n, "StaleOracle")
ctx.require(oracle.confidence < price / 10n, "OracleUncertain")
```

### Governance attacks

**Cross-chain**: flash-loan-enabled voting, whale dominance, proposal spam, and emergency execution before community review.

**Mitigations**: timelocks on proposal execution (48-72 hours). Flash loan guards (tokens must be held before snapshot). Delegation delays. Quorum requirements. Quadratic voting.

## Solana-specific attack patterns

### Account confusion

Passing the wrong account type or an account owned by a different program. Discriminators prevent type confusion within a program, but cross-program account validation must be explicit.

**Mitigation**: always verify account ownership and discriminator. Better Sol's typed accounts handle this through the DSL, but programs accepting arbitrary accounts must validate manually.

### PDA collision

Two different logical entities derive the same PDA address. This can happen when seeds are not sufficiently unique.

**Mitigation**: use unique namespace seeds. Include the authority or user pubkey in seeds. Never use only user-supplied strings as seeds for value-bearing accounts.

### Duplicate mutable accounts

The same account passed in two mutable roles in a single transaction. The runtime deduplicates the account, which breaks accounting assumptions.

**Mitigation**: the SVM runtime checks for this and rejects transactions with duplicate writable accounts. However, programs should not assume distinct accounts are different addresses.

### Token account substitution

Transfers to attacker-controlled token accounts or wrong mint. The program expects a USDC token account but receives one for a different token.

**Mitigation**: always verify the token account's mint and owner match expectations. Never accept token accounts from user input without validation.

### CPI authority abuse

Unnecessary signer or writable permissions passed through CPIs. A program calls another program with more permissions than needed.

**Mitigation**: restrict CPI calls to minimum required permissions. Only mark accounts as signer or writable if the callee needs it.

### Seed manipulation

User-supplied seed material that creates collisions or allows unauthorized access to existing PDAs.

**Mitigation**: never use arbitrary user input as the only seed for value-bearing accounts. Combine user input with a namespace or authority:

```ts
.derive((seed) => ["vault", seed.authority, seed.mint])
```

### Rent griefing

Pre-funding accounts to manipulate rent economics around init/close logic. An attacker creates an account before the program's init instruction, causing the init to fail.

**Mitigation**: use `bs.init()` which handles account creation from scratch. Check that the account does not already exist when it should be new.

### Reinitialization

Re-creating an account that should only be initialized once. An attacker calls initialize again to reset state.

**Mitigation**: `bs.init()` handles this. For manual checks, verify the account's discriminator is zero (uninitialized) before writing.

## Economic attack patterns

### Rug pull

Creators retain mint or upgrade authority and drain value after building trust.

**Mitigation**: revoked mint authority after initial distribution. Multisig upgrade authority (3-of-5 or higher). Timelocks on all admin operations. Verified source code with no admin backdoors.

### Wash trading

Artificial volume to manipulate prices or rankings.

**Detection**: analyze trade patterns for circular flows. Cluster wallets by funding source. Check for repetitive amounts and timing patterns.

### Vampire attack

Cloning a protocol and offering better incentives to drain liquidity.

**Defense**: community moats, brand trust, unique technical features, and deep liquidity that is expensive to replicate.

### Governance extraction

Using governance mechanisms to extract value from a protocol.

**Mitigation**: timelocks, supermajority requirements, constitutional limits on what governance can change, and economic exposure requirements for voters.

## Defense-in-depth

Layer defenses rather than relying on a single check:

1. **Program-level**: access control and invariant enforcement in `ctx.require()`
2. **Account-level**: discriminator and ownership validation via the DSL
3. **Transaction-level**: simulation and compute estimation before sending
4. **Client-level**: input validation and transaction preview
5. **Backend-level**: monitoring for anomalous behavior
6. **Operational**: multisig keys, timelocks, upgrade authority governance
7. **External**: audits for high-value programs, bug bounties

## Related

- `attack-catalog.md` for Solana-specific attack classes with exploit code examples.
- `economic-security.md` for economic attack patterns not visible in code.
- `security-checklist.md` for program-level safety checks.
- `threat-model.md` for structured threat modeling methodology.
