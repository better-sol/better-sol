# Attack Catalog

Use this reference when reviewing a Solana program for known vulnerability classes. Every class includes the attack pattern, impact, detection method, and fix.

## Account validation attacks

### Missing owner check

**Pattern**: The program reads from or writes to an account without verifying that the account is owned by the expected program.

**Attack**: An attacker creates an account with arbitrary data owned by the System Program and passes it as an argument. The program reads attacker-controlled data as if it were a legitimate program account.

**Detection**: For every account the program reads, check that `account.owner === expected_program_id`.

**Fix**: Use Better Sol's typed accounts which validate ownership automatically. For raw account access, always check `account.owner`.

### Uninitialized account

**Pattern**: The program processes an account that has not been properly initialized.

**Attack**: An attacker passes a zeroed-out account (all zeros, owned by the System Program). The program reads default values (all zeros) as legitimate state.

**Detection**: Check the account discriminator (first 8 bytes) matches the expected account type.

**Fix**: Better Sol checks discriminators automatically. For manual checks, verify the discriminator before reading account data.

### PDA collision

**Pattern**: PDA seeds can produce the same address for different logical entities.

**Attack**: If PDA seeds are not unique enough (e.g., using only a user public key when multiple accounts per user should exist), an attacker can create a collision that overwrites another user's data.

**Detection**: Verify that PDA seed combinations are globally unique. Add additional seeds (market, nonce, category) when a user can have multiple accounts of the same type.

**Fix**: Use compound seeds: `["position", user, market]` instead of `["position", user]`.

## Authorization attacks

### Missing signer check

**Pattern**: An instruction performs a privileged action without verifying that the authority account signed the transaction.

**Attack**: Anyone can call the instruction, bypassing authorization entirely.

**Detection**: For every account used as an authority, verify it is marked as `bs.signer()` in the instruction definition.

**Fix**: Always use `bs.signer()` for authority accounts. Never trust a public key without a signature.

### Wrong authority

**Pattern**: The instruction checks for a signer but does not verify that the signer matches the expected authority stored in the account.

**Attack**: Any signer can call the instruction, not just the designated authority.

**Detection**: Compare the signer's public key with the authority field stored in the account.

**Fix**: Use `ctx.require(counter.authority === authority, "Unauthorized")` inside the `run` function.

### Authority escalation

**Pattern**: An instruction allows a lower-privilege role to perform a higher-privilege action.

**Attack**: A regular user calls an admin-only instruction because the role check is missing or incorrect.

**Detection**: For every instruction, identify the minimum required role and verify the check exists.

**Fix**: Use explicit role checks in constraints. Never assume a signer is authorized based on instruction context alone.

## Arithmetic attacks

### Integer overflow

**Pattern**: Addition or multiplication exceeds the maximum value of the integer type.

**Attack**: An attacker provides an amount that causes overflow, wrapping around to a small or zero value. This can bypass balance checks.

**Detection**: For every `a + b`, check `a + b <= MAX`. For every `a * b`, check `a * b <= MAX`.

**Fix**: Add constraints that check before arithmetic operations. Better Sol does not auto-protect against overflow in instruction logic.

### Integer underflow

**Pattern**: Subtraction results in a negative value that wraps to a large positive value.

**Attack**: An attacker withdraws more than their balance, causing the balance to wrap to a huge number.

**Detection**: For every `a - b`, check `a >= b` before subtraction.

**Fix**: Add balance checks in constraints before any subtraction.

### Precision loss in division

**Pattern**: Integer division truncates, losing precision. This can be exploited to round in the attacker's favor.

**Attack**: An attacker crafts amounts that cause rounding down on debits and rounding up on credits, slowly extracting value.

**Detection**: For every division operation, verify the rounding direction is consistent and favors the protocol, not the user.

**Fix**: Use basis points (10000 = 100%) for percentages. Round fees up and user payouts down.

## Token attacks

### Token substitution

**Pattern**: The program accepts a token account without verifying the mint.

**Attack**: An attacker creates a fake token with the same decimals but controlled supply, and uses it instead of the legitimate token.

**Detection**: For every token account, verify `tokenAccount.mint === expected_mint_address`.

**Fix**: Add the expected mint address as a constraint. Use `bs.tokenAccount()` with mint validation.

### Fake ATA

**Pattern**: The program assumes a token account belongs to a specific owner without checking.

**Attack**: An attacker creates a token account for their own wallet but passes someone else's token account as the destination.

**Detection**: Verify `tokenAccount.owner === expected_owner` for every token account.

**Fix**: Check the owner field on every token account, not just the mint.

## CPI attacks

### Arbitrary CPI target

**Pattern**: The program performs a CPI to an address provided as an instruction argument.

**Attack**: An attacker passes a malicious program ID, causing the program to call arbitrary code.

**Detection**: For every CPI, verify the target program ID is hardcoded or validated against an allowlist.

**Fix**: Never use program IDs from instruction arguments. Hardcode expected program IDs in the program definition.

### CPI return data manipulation

**Pattern**: The program trusts return data from a CPI without validation.

**Attack**: If the called program is attacker-controlled (via arbitrary CPI), it can return arbitrary data.

**Detection**: Validate CPI return data against expected formats and ranges.

**Fix**: Do not trust CPI return data. Validate it independently.

## Economic attacks

### Flash loan exploitation

**Pattern**: The protocol checks balances or prices at a single point in time without considering flash loans.

**Attack**: An attacker borrows a large amount via flash loan, manipulates the price or balance check, profits, and repays the loan in the same transaction.

**Detection**: Identify any check that relies on a single-transaction snapshot of price, balance, or state.

**Fix**: Use time-weighted averages (TWAP) for prices. Use cumulative data over multiple blocks for balance checks.

### Sandwhich attack (MEV)

**Pattern**: The protocol executes trades at a fixed price without slippage protection.

**Attack**: A front-runner sees the pending transaction, buys before it (raising the price), lets the victim trade at the worse price, then sells.

**Detection**: Check if the protocol sets slippage limits on swaps and trades.

**Fix**: Always set maximum slippage tolerance. Use priority fees. Consider using Jupiter's limit orders for large trades.

## Reinitialization attack

**Pattern**: The program allows an account to be initialized more than once.

**Attack**: An attacker reinitializes an existing account, overwriting the authority with their own address.

**Detection**: Check that the initialize instruction fails when called on an account that already has data.

**Fix**: Better Sol checks account discriminators automatically. For manual implementations, verify the account discriminator before writing.

## Related

- `security-checklist.md` for the full program safety checklist.
- `risk-scoring.md` for severity calibration.
- `test-plan.md` for regression tests for each attack class.
- `economic-security.md` for game theory and incentive design.
