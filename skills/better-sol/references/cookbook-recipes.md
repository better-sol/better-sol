# Better Sol Cookbook Recipes

Use this reference when the learner asks for examples or exercises.

## Counter

Concepts: account state, PDA, signer authority, typed client, tests.

Build:

- `Counter`: count, authority.
- `initialize`: set count and authority.
- `increment`: authority-only count increase.
- `decrement`: authority-only count decrease with underflow check.

Exercise: add `reset` that sets count to zero and emits an event.

## Profile

Concepts: PDA per user, strings, update authority.

Build:

- `Profile`: owner, displayName, bio.
- PDA seeds: `"profile"`, owner.
- `createProfile` and `updateProfile`.

Exercise: add a max length policy and test invalid input.

## Claim record

Concepts: one-shot action, anti-replay, eligibility.

Build:

- `ClaimRecord`: claimant, claimed, amount.
- `claim`: creates or mutates claim record and prevents duplicate claim.

Exercise: add admin pause and unauthorized admin test.

## Token rewards

Concepts: mint, token account, token CPI, reward state.

Build:

- `RewardState`: authority, mint, totalMinted.
- `mintReward`: validates authority, mint, amount, then mints to destination.

Exercise: add allocation cap and test cap exceeded.

## Escrow record

Concepts: custody, token transfer, release/cancel authority.

Build:

- `Escrow`: maker, taker, mint, amount, state.
- `createEscrow`, `releaseEscrow`, `cancelEscrow`.

Exercise: list every invariant before writing code.

## Indexer smoke test

Concepts: account fetching, events, monitoring.

Build:

- script derives known PDAs
- fetches accounts
- prints state summary
- optionally simulates an instruction and reads logs

Exercise: add alert if an account is missing or stale.

## Teaching progression

Use recipes in this order:

1. Counter.
2. Profile.
3. Claim record.
4. Token rewards.
5. Escrow or vault.
6. Indexer/monitor.

## Related

- `tracks.md` for choosing the right recipe based on learner background.
- `program-patterns.md` for turning each recipe into Better Sol accounts and instructions.
- `client-testing-deploy.md` for testing each recipe with LiteSVM.
