# Security Checklist

Use this reference when performing a program-level security review before devnet or mainnet deployment.

## Account validation

### For every account the program reads or writes

- [ ] Is the account owner verified? The program must check that every account it writes to is owned by itself. For accounts owned by other programs (System, Token), verify the expected program ID.
- [ ] Is the account initialized? Check that the account discriminator matches the expected type. Never read data from an account that might be uninitialized.
- [ ] Is the PDA derivation verified? If the account should be a PDA, derive it from the expected seeds and compare with the provided address. Never trust a PDA address passed as an argument.
- [ ] Is the writable flag correct? Mark accounts as mutable only when the instruction actually modifies them. Read-only accounts should be `bs.read()`, not `bs.mut()`.
- [ ] Is the signer flag correct? Every account that represents an authority must be a signer (`bs.signer()`). Never trust a public key without verifying the signature.

### Common account validation failures

| Missing check | Attack | Impact |
|---|---|---|
| Account owner not verified | Attacker passes an account they control | Arbitrary data read/write |
| PDA not verified | Attacker passes a different PDA | Access another user's data |
| Signer not checked | Anyone can call as any user | Complete authorization bypass |
| Account not initialized | Attacker passes empty account | Unexpected default values |
| Writable flag on read-only data | Attacker cannot exploit directly | Wastes compute budget |

## Instruction validation

### Input validation

- [ ] Are all numeric inputs range-checked? Verify amounts are > 0, do not overflow, and do not exceed expected bounds.
- [ ] Are all string inputs length-checked? Verify strings do not exceed the maximum account data size.
- [ ] Are all public key inputs validated? Verify that token mints, program IDs, and other addresses match expected values.
- [ ] Are enum inputs valid? Verify that enum variants match the defined set.

### State validation

- [ ] Does the instruction check preconditions? Verify the account is in the expected state before modification.
- [ ] Does the instruction handle all edge cases? Zero amounts, empty arrays, duplicate entries, maximum values.
- [ ] Does the instruction prevent double-execution? Use status flags or existence checks to prevent processing the same action twice.

## Authorization patterns

### Single authority

```ts
run: ({ counter, authority }, ctx) => {
  ctx.require(counter.authority === authority, "Unauthorized")
}
```

### Multi-role authority

```ts
run: ({ vault, authority }, ctx) => {
  const isAdmin = vault.admin === authority
  const isOperator = vault.operators.includes(authority)
  ctx.require(isAdmin || isOperator, "Unauthorized")
  if (isAdmin) {
    // admin-specific logic
  } else {
    ctx.require(isOperator, "NotOperator")
  }
}
```

### Time-based authority

```ts
run: ({ proposal }, ctx) => {
  const now = cpi.sol.timestamp()
  ctx.require(proposal.votingDeadline > now, "VotingEnded")
}
```

## Arithmetic safety

### Overflow and underflow

- Use `ctx.require()` to check before arithmetic operations on u64 and u128 values
- Never assume addition will not overflow. Check: `a + b <= MAX` before `a += b`
- Never assume subtraction will not underflow. Check: `a >= b` before `a -= b`

### Precision loss

- When dividing, check for truncation. `5n / 2n = 2n`, not 2.5.
- When multiplying then dividing, multiply first to preserve precision: `(a * b) / c` not `(a / c) * b`
- For percentage calculations, use basis points (10000 = 100%) to avoid floating point.

## CPI safety

- [ ] Is the CPI target program validated? Never call a program ID passed as an instruction argument. Hardcode expected program IDs or validate against a known allowlist.
- [ ] Are CPI account permissions correct? The called program receives the same account permissions. If you pass a mutable account to the CPI, the called program can modify it.
- [ ] Is the CPI return data validated? If the called program returns data, validate it before trusting it.
- [ ] Is re-entrancy prevented? Solana programs cannot be re-entered directly (the runtime prevents it), but be careful with CPI chains that could create unexpected state.

## Token safety

- [ ] Is the token mint validated? Always verify that the token account holds the expected mint, not an arbitrary token.
- [ ] Is the token account owner validated? Verify that the token account belongs to the expected wallet.
- [ ] Is the amount validated? Check that the transfer amount matches expectations.
- [ ] Are freeze and mint authorities checked? If the product relies on a token being non-freezable, verify that the freeze authority is null.

## Deployment security

### Devnet

- [ ] Program compiles and deploys without errors
- [ ] All instructions have LiteSVM tests
- [ ] Error handling returns named errors

### Mainnet

- [ ] Program upgrade authority is multisig (Sqeam, Squads, or SPL Governance) or timelock
- [ ] Program upgrade authority is NOT a single developer's keypair
- [ ] All Critical and High security findings are resolved
- [ ] Regression tests exist for every security finding
- [ ] Admin keys are separate from user keys
- [ ] No hardcoded private keys in any code
- [ ] `.gitignore` covers keypairs, `.env`, `.better-sol/`

## Security review process

### Step 1: Read the program definition

Read every account and instruction. For each instruction, identify:
- What accounts it accesses and how (read vs write)
- What authorization it requires
- What state changes it makes
- What could go wrong

### Step 2: Check every account validation

For every account in every instruction, verify:
- Owner check
- PDA derivation check (if PDA)
- Signer check (if authority)
- Initialization check

### Step 3: Check every constraint

For every constraint, verify:
- The condition is correct and complete
- The error name is descriptive
- No constraint can be bypassed

### Step 4: Check every arithmetic operation

For every `+=`, `-=`, `*=`, `/=`:
- Can it overflow or underflow?
- Can it lose precision?
- Is the result used correctly downstream?

### Step 5: Check every CPI

For every cross-program invocation:
- Is the target program validated?
- Are the accounts correctly permissioned?
- Is the return data trusted?

### Step 6: Write findings

For every issue found, produce a finding using the template in `risk-scoring.md`.

## Related

- `attack-catalog.md` for known attack classes to check against.
- `risk-scoring.md` for severity calibration and finding templates.
- `test-plan.md` for regression test design.
- `threat-model.md` for infrastructure and deployment security.
