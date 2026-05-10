# Troubleshooting

## Triage

1. Capture command, full error, cluster, program ID, signer, RPC provider, transaction signature, and relevant logs.
2. Classify: type error, parser/transpiler, cloud compile, deploy, account resolution, signer, runtime instruction, RPC, wallet, or test binary.
3. Reduce to the smallest failing program/client/test.
4. Fix one cause and rerun the exact failing command.
5. Add a regression test.

## Frequent issues

### Missing test binary

Error mentions compiled binary not found.

Fix:

```bash
bunx @better-sol/cli@alpha deploy --dry-run
```

Or pass explicit `binaries` to `createTestContext`.

### No signer configured

Scripts/server code needs `payer`:

```ts
betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs })
```

Browser code needs wallet scoping:

```ts
const signed = await readOnly.withSigner(walletSigner)
```

### PDA mismatch

Use typed client derivation. Compare the account definition `.derive(seed => [...])` against values passed to `.derive({...})`.

### Missing parsed error

Define the error in `errors` and use the exact same name in `ctx.require`.

### Token CPI failure

Check mint, token account mint, token account owner, token program variant, authority signer/PDA, decimals, and writability.

### Browser key leak

Remove `keypairFile`, `secretKey`, private key JSON imports, and env private keys from browser code.

### RPC flake

Retry with a known cluster URL or a provider RPC. Confirm WebSocket URL when subscriptions are used.

## Simulation

```ts
const result = await sol.counter.increment.simulate({ counter, amount: 1n })
console.log(result.logs)
console.log(result.unitsConsumed)
```

## Debug report

```markdown
## Root cause
[one precise cause]

## Evidence
- Command: `...`
- Log: `...`
- File: `...`

## Fix
[what changed]

## Regression
[command or test]
```

## Related

- `sdk-reference.md` for exact API names when debugging type or client issues.
- `client-testing-deploy.md` for LiteSVM and deployment workflows.
- `test-plan.md` for turning a bug fix into a regression test.
