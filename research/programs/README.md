# Research Program Fixtures

Stress-test programs for the `better-sol/program` SDK, CLI parser, and Rust body transpiler.

## Success Programs

| File | Instructions | Coverage |
|---|---|---|
| `lending-market-program.ts` | 10 | Multi-account DeFi, PDA authorities, all token CPI, single callback API path |
| `perpetuals-clearing-program.ts` | 9 | Zero-copy order book, remaining accounts, PDA vault, signed funding indexes |
| `dao-governance-program.ts` | 9 | Governance realm, string/bytes fields, close, remaining accounts, typed events |

All three generate warning-free Anchor Rust via `cargo check --quiet`.

## Failure Programs

18 fixtures, each containing one intentional unsupported pattern:

| File | Expected diagnostic |
|---|---|
| `unsupported-await-program.ts` | `await expressions` |
| `unsupported-while-loop-program.ts` | `while/do loops` |
| `unsupported-switch-program.ts` | `switch statements` |
| `unsupported-try-catch-program.ts` | `try/catch/finally` |
| `unsupported-return-program.ts` | `return statements` |
| `unsupported-math-call-program.ts` | `function call 'Math.max'` |
| `unsupported-template-string-program.ts` | `template string expressions` |
| `unsupported-object-spread-program.ts` | `object spread` |
| `unsupported-destructuring-program.ts` | `destructuring variable declarations` |
| `unsupported-external-constant-program.ts` | `identifier 'DefaultAmount'` |
| `unsupported-mutable-conditional-alias-program.ts` | `mutable conditional alias 'selected'` |
| `unsupported-for-of-program.ts` | `for...of/for...in loops` |
| `unsupported-nested-function-program.ts` | `nested functions` |
| `unsupported-unknown-error-program.ts` | `unknown error 'MissingError'` |
| `unsupported-unknown-event-program.ts` | `unknown event 'MissingEvent'` |
| `unsupported-unknown-field-program.ts` | `unknown field 'missingField'` |
| `unsupported-missing-event-field-program.ts` | `without required field 'authority'` |
| `unsupported-extra-event-field-program.ts` | `unknown field 'extra'` |

## Validation

```bash
bun run check && bun run lint && bun run test
```

The `packages/cli/test/research-fixtures.test.ts` file validates all success/failure fixtures.

## Transpiler Alignment Fixes

These fixtures exposed and fixed several integration gaps:

1. Remaining account arrays are typed as indexed collections
2. Fixed-array account fields are mutable indexed collections
3. Non-null indexed access assertions are stripped by the transpiler
4. Unknown errors and event payload mismatches fail during transpilation
5. Deferred local initialization avoids possibly-uninitialized Rust bindings
6. Zero-copy account bindings avoid mutable borrows unless the body mutates the account
7. `msg!()` format placeholders are correctly generated for `ctx.log()`
8. `p.token2022Program()` is resolved correctly regardless of variable name
