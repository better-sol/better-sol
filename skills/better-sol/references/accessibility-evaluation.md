# Accessibility Evaluation

Use this reference when evaluating whether a crypto UI is usable and accessible enough to ship.

## Tools

- **Automated contrast checking**: `axe-core` integrates with Playwright, Vitest, and Storybook. Run as part of CI to catch contrast and ARIA violations.
- **Component-level a11y testing**: `@testing-library/jest-dom` matchers like `toBeVisible()`, `toHaveFocus()`, and `toHaveAccessibleName()`.
- **Full page audits**: Lighthouse (built into Chrome DevTools). Aim for Accessibility score 95+.
- **Manual spot checks**: browser DevTools color picker shows contrast ratios natively.
- **Screen reader testing**: VoiceOver (macOS), NVDA (Windows), TalkBack (Android). Test at least one before launch.

## WCAG 2.2 thresholds

Use these as mechanical checks where possible. They are not aspirational; they are minimums.

| Element type | Minimum ratio | Level |
|---|---|---|
| Normal text (< 18pt / 14pt bold) | 4.5:1 | AA |
| Large text (>= 18pt / 14pt bold) | 3:1 | AA |
| Enhanced normal text | 7:1 | AAA |
| Non-text UI components | 3:1 | AA |
| Focus indicator | 3:1 against adjacent colors | AA |
| Minimum target size | 24x24 CSS pixels | AA |

## Crypto-specific accessibility checks

These go beyond generic WCAG checks and address patterns unique to crypto applications.

### Wallet address display

- Abbreviated addresses must preserve enough characters to distinguish accounts: minimum 4 characters at start and end (`CoUn...1111`)
- Addresses must have a copy-to-clipboard action with a visible label (not only an icon)
- Screen readers should announce the full address when focused, not the abbreviation

### Financial changes

- Color must not be the only signal for positive/negative financial changes. Always include a sign (`+5.23%`, `-2.14%`) and/or an arrow or word ("up", "down").
- Token amounts must use stable formatting that does not shift width when values change (CSS `font-variant-numeric: tabular-nums` or monospace).
- Zero and near-zero balances must be distinguishable from each other.

### Transaction states

- Signing and confirming states must be announced to assistive technologies. Use `aria-live="polite"` for status updates.
- Success and failure states need text labels, not only icons or color changes.
- The "waiting for signature" state must indicate that the user needs to interact with their wallet extension.
- Transaction errors must announce what happened and whether funds moved.

### Motion

- All motion must respect `prefers-reduced-motion`. Use `useReducedMotion()` in Framer Motion or `prefers-reduced-motion` media query in CSS.
- Animated number counters must fall back to instant updates when reduced motion is preferred.
- Page entrance animations must be disabled or simplified (opacity only) for reduced motion.

### Token amounts

- Amounts need readable separators (commas or spaces for thousands).
- Precision must be stable: do not show 2 decimals sometimes and 4 decimals other times for the same token.
- Very small amounts must be displayed as something (even `< 0.000001`), not as "0" when funds exist.

## Contrast workflow

### Step 1: Identify pairs

List every foreground/background color pair in the theme:

- Body text on background
- Muted text on background
- Primary button text on primary color
- Danger text on background
- Success text on background
- Warning text on background
- Focus ring on background
- Focus ring on adjacent element colors

### Step 2: Measure

For each pair, compute the contrast ratio. Use the relative luminance formula from WCAG 2.2:

```
L = 0.0722 * (B/12.92 if B <= 0.04045 else ((B+0.055)/1.055)^2.4) +
    0.2126 * (R/12.92 if R <= 0.04045 else ((R+0.055)/1.055)^2.4) +
    0.7152 * (G/12.92 if G <= 0.04045 else ((G+0.055)/1.055)^2.4)

ratio = (L_light + 0.05) / (L_dark + 0.05)
```

Or use `axe-core`, Chrome DevTools, or online contrast checkers.

### Step 3: Fix

If any pair fails:

1. Adjust the foreground lightness (easier and less disruptive than changing the background)
2. If that breaks the design direction, adjust the background
3. Re-test the adjusted pair
4. Re-test adjacent pairs that might be affected by the change

### Step 4: Document

Record every pair, its ratio, and pass/fail status:

```
| Pair | Foreground | Background | Ratio | Required | Status |
|------|-----------|-----------|-------|----------|--------|
| Body text | #e4e4e7 | #0a0a0f | 14.2:1 | 4.5:1 | Pass |
| Muted text | #71717a | #0a0a0f | 4.8:1 | 4.5:1 | Pass |
| Primary btn | #ffffff | #14f195 | 3.1:1 | 4.5:1 | Fail |
```

## Keyboard navigation

### Focus management

- All interactive elements must be reachable by Tab
- Focus order must follow the visual layout (left to right, top to bottom)
- Modal dialogs must trap focus within the modal when open
- Focus must return to the triggering element when a modal closes
- Use `autoFocus` on the primary action in modals

### Focus indicator

- Every focusable element must have a visible focus indicator
- The indicator must have at least 3:1 contrast against adjacent colors
- Never use `outline: none` without providing an alternative focus style
- Use `:focus-visible` for keyboard-only focus indicators (not on click)

```css
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

## Evidence to report

For each accessibility finding, include:

- **Component or token name**: where the issue is
- **Foreground/background colors**: the exact values
- **Measured ratio**: the computed contrast ratio
- **Required threshold**: 4.5:1 for text, 3:1 for non-text
- **Fix recommendation**: the specific change that resolves the issue

## Common a11y failures in crypto UIs

- Muted text with contrast below 4.5:1 (very common in dark themes)
- Green/red-only indicators for price changes without a sign or label
- Wallet address copy button with no accessible name
- Transaction status indicated only by a spinning icon with no text
- Small touch targets on mobile (buttons under 44x44 CSS pixels)
- No focus indicator on interactive elements
- Images and icons without alt text or aria-labels
- Form fields without associated labels

## Related

- `brand.md` for accessible color token selection in the brand system.
- `transaction-ux.md` for accessible signing and confirmation states.
- `number-formatting.md` for readable token and fiat value display.
- `motion-and-video.md` for reduced-motion requirements.
