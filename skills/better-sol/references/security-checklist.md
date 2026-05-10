# Better Sol Security Checklist

## Program definition

- [ ] Program `address` matches intended deployment.
- [ ] Every account type has a unique static PDA namespace seed when derived.
- [ ] Authority fields are set during initialization and checked before privileged mutation.
- [ ] `ctx.require` checks precede mutation and CPI.
- [ ] Error names used in `ctx.require` exist in `errors`.
- [ ] Events exist for important state transitions.
- [ ] `run` body does not rely on client-only assumptions.

## Account constraints

- [ ] `bs.init` is used for first creation only.
- [ ] `bs.initIfNeeded` has explicit guards against reinitialization.
- [ ] `bs.mut` is used only where mutation is needed.
- [ ] `bs.close` validates authority and refund target.
- [ ] `bs.realloc` validates authority, max size, and preserved fields.
- [ ] `bs.remaining` accounts are validated or non-critical.
- [ ] Token/mint constraints are writable only when mutation is needed.

## PDA checks

- [ ] Seeds include a static namespace.
- [ ] Dynamic seeds are canonical and stable.
- [ ] Account type cannot collide with another account type.
- [ ] Client derives PDAs from the typed account helper.
- [ ] Tests include wrong PDA/account failures.

## Token and CPI checks

- [ ] Mint address is checked against config/state.
- [ ] Token account mint is checked.
- [ ] Token account owner is checked.
- [ ] Token program variant is explicit.
- [ ] Decimals are checked for checked transfers.
- [ ] No arbitrary CPI target is possible.
- [ ] No extra writable/signer privileges are passed.

## Arithmetic and accounting

- [ ] Amounts use `bigint` on the client.
- [ ] Zero amount behavior is intentional.
- [ ] Max amount behavior is tested.
- [ ] Underflow/overflow boundaries are tested.
- [ ] Fee, share, or reward math conserves assets.
- [ ] Rounding direction is explicit.

## Client and wallet

- [ ] Browser code does not load `keypairFile`, `secretKey`, keypair JSON, seed phrases, or private keys.
- [ ] Signer-scoped clients are not reused across users.
- [ ] Wrong cluster is detected.
- [ ] Transaction previews match submitted instructions.
- [ ] Errors are parsed without leaking secrets.

## Deployment

- [ ] Devnet smoke test exists.
- [ ] Upgrade authority policy is explicit.
- [ ] Mainnet payer/key custody is documented.
- [ ] CI cannot leak deploy credentials to untrusted PRs.
- [ ] Monitoring covers critical events and failed transactions.

## Related

- `attack-catalog.md` for specific attack classes to check for.
- `test-plan.md` for the minimum test suite that validates checklist items.
- `threat-model.md` for STRIDE-based threat modeling.
