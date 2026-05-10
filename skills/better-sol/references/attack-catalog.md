# Solana and Better Sol Attack Catalog

## Missing signer or authority check

Risk: anyone can mutate protected state. In Better Sol, `bs.signer()` only proves the provided account signed; it does not automatically prove that signer is the stored authority.

Review for:

```ts
ctx.require(account.authority === authority, "Unauthorized")
```

## PDA sharing or seed confusion

Risk: two account types or flows derive the same PDA, or attacker controls seed material that aliases protected state.

Review for:

- static namespace seed per account type
- stable dynamic seeds
- no ambiguous concatenation
- client uses typed `.derive(...)`

## Reinitialization

Risk: `initIfNeeded` or missing initialized flags let an attacker reset authority or accounting.

Review for:

- initialization can only happen once for protected state
- authority is not overwritten after initialization
- default values cannot be abused

## Arbitrary CPI

Risk: attacker substitutes a malicious program or account set for a CPI.

Review for:

- explicit token program constraints
- Token vs Token-2022 variant is intentional
- CPI target cannot be user-supplied without validation
- no extra signer/writable privileges are passed unnecessarily

## Token account substitution

Risk: transfers/mints/burns affect attacker-controlled token accounts or wrong mints.

Review for:

- token account mint equals expected mint
- token account owner equals expected owner/authority
- mint matches state config
- checked transfer used where decimals matter

## Duplicate mutable accounts

Risk: passing the same account in two mutable roles breaks accounting assumptions.

Review for explicit inequality checks when two mutable accounts are expected to differ.

## Type cosplay / account confusion

Risk: data for one account type is interpreted as another type. Better Sol/Anchor discriminators mitigate typed accounts, but remaining accounts and external accounts still need scrutiny.

## Lamport griefing and pre-funded PDAs

Risk: attacker pre-funds or manipulates lamports around init/close logic. Review init and close assumptions, especially if rent refunds affect incentives.

## Close and realloc bugs

Risk: unauthorized close drains rent, or realloc truncates/grows state unsafely.

Review for authority checks, max size, invariant preservation, and refund recipient validation.

## Time/slot assumptions

Risk: timestamp/slot checks are too weak, too strict, or manipulable within expected validator bounds. Use tolerances and test boundary conditions.

## Client-side signing bugs

Risk: wrong wallet signs, stale signer retained, keypair bundled in frontend, or transaction preview mismatches sent transaction.

Review session scoping, wallet changes, cluster changes, and browser bundle imports.

## Related

- `security-checklist.md` for the full program safety checklist.
- `cross-chain-security.md` for attack patterns common across blockchains.
- `economic-security.md` for economic attacks that do not involve code bugs.
