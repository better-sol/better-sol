# Number Formatting

## Core rule

Use raw `bigint` for authoritative token/SOL values. Format for display at the UI edge. Never perform token accounting with JavaScript floating-point numbers.

## Display defaults

| Kind | Format |
|---|---|
| SOL balance | `1.23 SOL`, 2–4 decimals |
| Small SOL | `<0.0001 SOL` instead of `0 SOL` |
| Token amount | respect token decimals, cap display precision |
| Fiat | `$1,234.56`, `<$0.01` for tiny non-zero |
| Percent | `+1.23%` for deltas, `1.23%` for static |
| TVL/volume | `$12.4K`, `$8.2M`, `$1.1B` |
| Compute units | `123,456 CU` |
| Slots | integer with separators |

## Tiny values

- exact zero: `0`
- tiny non-zero token: `<0.000001 TOKEN`
- tiny non-zero fiat: `<$0.01`
- unknown: `—`, not `0`

## Rounding

- Round display values, never raw transaction amounts.
- Prefer floor/truncate for “available to spend”.
- Prefer explicit “approximately” for estimates.
- Preserve full precision in tooltip/detail views when useful.

## Tests

Test zero, one raw unit, tiny non-zero, huge balance, negative delta, null, undefined, high-decimal token, and wrong decimals metadata.

## Related

- `transaction-ux.md` for how formatted numbers appear in transaction previews.
- `dapp-state-management.md` for caching strategies around token balance display.
