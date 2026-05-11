# Security Test Plan

Use this reference when designing tests to verify security fixes, prevent regressions, and validate exploit resistance for Solana programs.

## Tools

- **`@better-sol/test`**: typed LiteSVM integration for Better Sol programs.
- **LiteSVM**: in-process Solana VM, deterministic and fast.
- **`bun test`**: TypeScript test runner.
- **`fast-check`**: property-based testing for random input generation.

## Test philosophy

Security tests are not only coverage. They are executable threat models. Every high-risk behavior should have a test that proves the program rejects the attack or preserves its invariant.

A good security test has four parts:

1. **Setup**: create the exact accounts and state required.
2. **Attack**: attempt the invalid action as an untrusted signer.
3. **Assertion**: verify the transaction fails or state remains unchanged.
4. **Traceability**: link the test name to a finding, invariant, or threat class.

## Minimal Better Sol test setup

```ts
import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { counter } from "./counter"

describe("counter", () => {
  test("authority can increment", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const counterAddress = await ctx.counter.accounts.Counter.derive({
      authority: ctx.payer,
    })

    await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
    await ctx.counter.increment({ counter: counterAddress, amount: 5n })

    const account = await ctx.counter.accounts.Counter.fetch(counterAddress)
    expect(account?.count).toBe(5n)
  })
})
```

Real `@better-sol/test` helpers:

| Helper | Use |
|---|---|
| `ctx.newSigner(fundSol?)` | Create a funded signer |
| `ctx.as(signer)` | Create a scoped client with a different signer |
| `ctx.warp(seconds)` | Advance clock by relative seconds |
| `ctx.setClock(timestamp)` | Set exact unix timestamp |
| `ctx.setBalance(address, sol)` | Set SOL balance |
| `ctx.createMint(decimals)` | Create SPL token mint |
| `ctx.mintTokens(params)` | Mint tokens to an owner |
| `ctx.profile(fn)` | Run and capture profiling result |

## Exploit regression tests

Every security finding must produce a regression test. Use a stable ID in the test name:

```ts
test("rejects wrong authority [SEC-001]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const counterAddress = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })
  await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })

  const attacker = await ctx.newSigner()
  const attackerCtx = await ctx.as(attacker)

  await expect(
    attackerCtx.counter.increment({ counter: counterAddress, amount: 1n }),
  ).rejects.toThrow()
})
```

Do not pass fake second argument overrides to instruction methods. Change signer context with `ctx.as(signer)`.

## Test categories

### Account validation

For every writable account, test wrong account, missing account, wrong owner, and already-closed state when applicable.

```ts
test("rejects random account as counter [SEC-002]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const randomSigner = await ctx.newSigner()

  await expect(
    ctx.counter.increment({ counter: randomSigner.address, amount: 1n }),
  ).rejects.toThrow()
})
```

### Authorization

For every authority field, test the correct signer and at least one incorrect signer.

```ts
test("only stored authority can update state [SEC-003]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const counterAddress = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })
  await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })

  const attacker = await ctx.newSigner()
  const attackerCtx = await ctx.as(attacker)

  await expect(
    attackerCtx.counter.decrement({ counter: counterAddress, amount: 1n }),
  ).rejects.toThrow()
})
```

### Arithmetic and bounds

Test zero, maximum values, underflow, overflow, and rounding. For unsigned counters, the most important test is underflow rejection.

```ts
test("rejects counter underflow [SEC-004]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const counterAddress = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })
  await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })

  await expect(
    ctx.counter.decrement({ counter: counterAddress, amount: 1n }),
  ).rejects.toThrow()
})
```

### PDA uniqueness

Every PDA namespace should be tested for uniqueness across meaningful seed dimensions.

```ts
test("derives unique counters for different authorities [SEC-005]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const userA = await ctx.newSigner()
  const userB = await ctx.newSigner()

  const addressA = await ctx.counter.accounts.Counter.derive({ authority: userA.address })
  const addressB = await ctx.counter.accounts.Counter.derive({ authority: userB.address })

  expect(addressA).not.toBe(addressB)
})
```

### Reinitialization

Any account initialized once must reject second initialization.

```ts
test("rejects counter reinitialization [SEC-006]", async () => {
  const ctx = await createTestContext({ programs: { counter } })
  const counterAddress = await ctx.counter.accounts.Counter.derive({
    authority: ctx.payer,
  })

  await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
  await expect(
    ctx.counter.initialize({ counter: counterAddress, initialValue: 10n }),
  ).rejects.toThrow()
})
```

### Token flows

For token programs, test wrong mint, wrong token owner, insufficient balance, duplicate claim, and replay.

```ts
test("cannot claim rewards twice [SEC-007]", async () => {
  const ctx = await createTestContext({ programs: { airdropClaim } })
  const recipient = await ctx.newSigner()
  const recipientCtx = await ctx.as(recipient)

  const claimAddress = await ctx.airdropClaim.accounts.ClaimRecord.derive({
    recipient: recipient.address,
  })

  await ctx.airdropClaim.createClaim({
    claim: claimAddress,
    recipient: recipient.address,
    amount: 100n,
  })

  await recipientCtx.airdropClaim.redeemClaim({
    claim: claimAddress,
    treasury: treasuryTokenAccount,
    destination: recipientTokenAccount,
  })

  await expect(
    recipientCtx.airdropClaim.redeemClaim({
      claim: claimAddress,
      treasury: treasuryTokenAccount,
      destination: recipientTokenAccount,
    }),
  ).rejects.toThrow()
})
```

## Invariant tests

Write invariants as plain statements first:

- Total claimed amount never exceeds total allocated amount.
- Vault shares map monotonically to underlying assets.
- A user cannot reduce another user's balance.
- Proposal execution cannot occur before voting deadline.
- Token mint in state must match token mint used in CPI.

Then turn each invariant into at least one test.

## Property-based testing

Use `fast-check` when input space is large:

```ts
import fc from "fast-check"

test("increment preserves monotonicity", async () => {
  await fc.assert(
    fc.asyncProperty(fc.bigUintN(32), async (amount) => {
      const ctx = await createTestContext({ programs: { counter } })
      const counterAddress = await ctx.counter.accounts.Counter.derive({
        authority: ctx.payer,
      })
      await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
      await ctx.counter.increment({ counter: counterAddress, amount })
      const account = await ctx.counter.accounts.Counter.fetch(counterAddress)
      expect(account?.count).toBe(amount)
    }),
  )
})
```

Keep property tests focused. If each run creates expensive state, reduce cases or isolate pure arithmetic into separate utility tests.

## Severity-based coverage

| Severity | Required tests |
|---|---|
| Critical | Exploit regression, invariant test, negative authorization test, replay test |
| High | Exploit regression and one adjacent edge case |
| Medium | One regression test or expanded existing test |
| Low | Optional test if behavior is user-visible |

## CI policy

- Run `bun test` on every pull request.
- Run LiteSVM tests before deploy.
- Keep exploit regression tests permanently.
- Add a test before fixing a confirmed vulnerability when possible.
- Fail CI on skipped security tests unless explicitly marked with an issue link.

## Related

- `security-checklist.md` for what to test.
- `attack-catalog.md` for attack classes.
- `risk-scoring.md` for severity and confidence calibration.
- `client-testing-deploy.md` for test context setup and deploy flow.
