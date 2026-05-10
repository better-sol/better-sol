# Security Test Plan

## Minimum Better Sol test suite

For every state-changing instruction:

- happy path succeeds
- unauthorized signer fails
- wrong PDA fails
- wrong authority field fails
- duplicate initialization fails or is explicitly safe
- zero amount fails or is intentionally allowed
- max amount behaves safely
- event is emitted or logs are parseable

## Token-specific tests

- wrong mint fails
- wrong token account owner fails
- wrong token program variant fails
- insufficient balance fails safely
- decimals mismatch fails when checked transfers are used
- duplicate mutable accounts fail if roles must differ

## Lifecycle tests

- close by authority succeeds
- close by attacker fails
- refund recipient is correct
- realloc preserves required fields
- realloc above max fails

## Client tests

- read-only client cannot send
- wallet signer flow scopes to active wallet
- cluster mismatch is handled
- transaction simulation returns understandable logs

## Regression test template

```ts
test("attacker cannot [action]", async () => {
  const ctx = await createTestContext({ programs: { program } })
  const attacker = await ctx.newSigner()
  const attackerClient = await ctx.as(attacker)

  await expect(attackerClient.program.instruction(params)).rejects.toThrow()
})
```

## Related

- `security-checklist.md` for the full checklist that these tests validate.
- `attack-catalog.md` for attack classes to build regression tests against.
- `client-testing-deploy.md` for LiteSVM setup and test helpers.
