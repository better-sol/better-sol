# Number Formatting

Use this reference whenever a UI displays token amounts, prices, SOL balances, percentages, TVL, fees, or any numeric blockchain value.

## Principles

- Every number the user sees must be unambiguous. If a number could be misread as a different amount, the formatting is wrong.
- Precision must be preserved across conversion. Never lose significant digits during lamport-to-SOL or raw-to-decimal conversion.
- Zero and near-zero require special handling. A token balance of 0.00001 SOL is not zero, and displaying it as "0" is a bug if funds are at stake.

## Token amounts

### Display units

All token amounts are stored on-chain as raw integers (lamports for SOL, base units for SPL tokens). Convert to display units before rendering.

```
displayAmount = rawAmount / (10 ** decimals)
```

For SOL: decimals = 9. For USDC: decimals = 6. For custom tokens: read the `decimals` field from the mint account.

### Precision rules

- Show enough decimal places to distinguish non-zero balances from zero.
- Never show more decimal places than the token's decimals field allows.
- For balances under 1 display unit, show enough sub-zero digits to convey the actual value.

### Significant digit thresholds

| Balance range | Display format | Example |
|---|---|---|
| >= 1,000,000 | Compact with suffix | `1.23M` |
| >= 10,000 | 2 decimals, comma-separated | `12,345.67` |
| >= 1 | 4 decimals | `1.0000` |
| >= 0.0001 | 4 decimals | `0.0001` |
| >= 0.00000001 | Subscript or superscript notation | `0.0₅1` (five zeros then 1) |
| < smallest unit | Display as exact value or `< 0.00000001` | `< 0.00000001` |

### Subscript zero notation

For very small balances, use subscript digits to indicate how many zeros follow the decimal point before the first significant digit:

```
0.0₃1  →  0.0001
0.0₅42 →  0.0000042
0.0₈1  →  0.000000001
```

This avoids long strings of zeros while preserving precision.

### Implementation

```tsx
function formatTokenAmount(
  rawAmount: bigint,
  decimals: number,
  options?: {
    maximumSignificantDigits?: number
    compact?: boolean
  }
): string {
  const display = Number(rawAmount) / Math.pow(10, decimals)

  if (display === 0) return "0"

  if (options?.compact && display >= 1_000_000) {
    return formatCompact(display)
  }

  if (display >= 1) {
    return display.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }

  if (display >= 0.0001) {
    return display.toFixed(4)
  }

  return formatSubscriptZero(display)
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toFixed(2)
}

function formatSubscriptZero(value: number): string {
  const str = value.toFixed(20)
  const match = str.match(/0\.(0+)([1-9]\d*)/)
  if (!match) return str

  const zeroCount = match[1].length
  const subscriptDigits = "₀₁₂₃₄₅₆₇₈₉"
  const subscriptNum = String(zeroCount)
    .split("")
    .map((d) => subscriptDigits[parseInt(d)])
    .join("")

  return `0.0${subscriptNum}${match[2]}`
}
```

## SOL and lamports

SOL has 9 decimal places. 1 SOL = 1,000,000,000 lamports.

### Conversion

```tsx
function lamportsToSol(lamports: bigint): string {
  const sol = Number(lamports) / 1e9
  if (sol >= 1) {
    return sol.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }
  if (sol >= 0.001) return sol.toFixed(4)
  return formatSubscriptZero(sol)
}

function solToLamports(sol: string): bigint {
  const [whole, fractional = ""] = sol.split(".")
  const paddedFraction = fractional.padEnd(9, "0").slice(0, 9)
  return BigInt(whole + paddedFraction)
}
```

### Common display patterns

- Wallet balance: `1.2345 SOL`
- Transaction fee: `0.000005 SOL` or `5,000 lamports`
- Staking reward: `+0.0012 SOL`
- Rent exemption: `0.002039 SOL`

Always show the unit (`SOL`). Never show a raw lamport value to a user without labeling it.

## Prices

### Fiat-equivalent prices

When showing USD or other fiat equivalents:

- Always label the currency: `$1,234.56` or `€1,234.56`
- Use 2 decimal places for amounts >= $1
- Use 4-6 decimal places for amounts < $1
- Use subscript zero notation for amounts < $0.0001
- Never imply the fiat value is guaranteed or real-time unless the data source is explicitly live

### Token prices

- >= $1: 2 decimal places (`$42.50`)
- >= $0.01: 4 decimal places (`$0.1234`)
- >= $0.0001: 6 decimal places (`$0.001234`)
- < $0.0001: subscript notation (`$0.0₃42`)

### Price changes

Always show direction and magnitude:

- `+5.23%` (green) or `-2.14%` (red)
- Use 2 decimal places for percentages
- Never use color alone to indicate direction; always include the `+` or `-` sign
- For very small changes (< 0.01%), show `< 0.01%` rather than `0.00%`

## Percentages

- APY/APR: 2 decimal places (`5.23% APY`)
- Slippage: 1 decimal place (`0.5%`)
- Progress: 1 decimal place or integer (`67.3%` or `67%`)
- LTV ratio: 2 decimal places (`75.00%`)
- Concentration ranges: exact tick or price boundaries

Never display a percentage without a label that explains what it represents. "5.23%" is ambiguous. "5.23% APY" is clear.

## TVL and large values

- >= $1B: `$1.23B`
- >= $1M: `$1.23M`
- >= $1K: `$1,234.56`
- < $1K: `$123.45`

Always label: `TVL: $1.23B`, `24h Volume: $45.67M`, `Fees: $123.45`.

## Fees

Distinguish fee types clearly:

- Network fee / gas: the Solana base fee (5,000 lamports per signature)
- Priority fee: compute unit price
- Platform fee: protocol or app fee
- Slippage: the tolerance or actual price impact

Show each fee separately, not combined. A transaction that costs 0.000005 SOL in network fees and 0.01% slippage should not show "Fee: 0.01%".

## Time-sensitive values

For values that update frequently (prices, balances, APY):

- Show when the value was last updated: "Updated 3s ago" or a subtle timestamp
- Use animation to transition between values, not instant jumps
- Animate in the direction of change: count up for increases, count down for decreases
- Keep the animation duration under 500ms
- Respect `prefers-reduced-motion`

## Tables and dense displays

When numbers appear in lists or tables:

- Right-align numeric columns so decimal places line up
- Use monospace or tabular figures for numerals (CSS `font-variant-numeric: tabular-nums`)
- Keep consistent decimal places within a column; do not mix 2 and 4 decimal places in the same column
- Sort by the raw numeric value, not the formatted string

## Anti-patterns

- Displaying a tiny non-zero balance as "0" when funds exist
- Using `Number.toFixed()` without checking for floating point rounding errors (always convert from bigint)
- Showing more decimal places than the token supports (8 decimals for a 6-decimal token)
- Using color alone to indicate positive/negative without a sign
- Animated number counters that lag behind the real value
- Formatting that shifts width when values change (use fixed-width containers or tabular figures)
- Displaying raw lamports or base units to end users

## Related

- `transaction-ux.md` for formatting numbers in signing and confirmation flows.
- `brand.md` for monospace numeral font choices in the brand system.
- `accessibility-evaluation.md` for contrast and screen reader considerations with numeric displays.
