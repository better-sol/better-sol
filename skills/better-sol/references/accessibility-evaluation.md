# Accessibility Evaluation

Use this reference when evaluating whether a crypto UI is usable and accessible enough to ship.

## Grounded criteria

This reference uses WCAG 2.2 thresholds as mechanical checks where possible:

- Normal text contrast: at least 4.5:1.
- Large text contrast: at least 3:1.
- Enhanced normal text contrast: at least 7:1.
- Non-text UI component contrast: at least 3:1.
- Focus indicator contrast: at least 3:1 against adjacent colors.
- Minimum target size: 24 by 24 CSS pixels unless an exception applies.

## Crypto-specific accessibility checks

- Wallet address abbreviations must preserve enough characters to distinguish accounts.
- Color must not be the only signal for positive/negative financial changes.
- Error and success states need text labels, not only icons.
- Signing and confirming states must be announced visually and should be accessible to assistive technologies.
- Motion should respect reduced-motion preferences.
- Token amounts need readable separators and stable precision.

## Contrast workflow

1. Identify foreground/background pairs: body text, muted text, primary button, danger text, success text, warning badge, focus ring.
2. Run the contrast script for each pair.
3. Treat failures as blockers for production UI unless the text is decorative or a logo.
4. Re-test after changing palette tokens.

## Evidence to report

For each accessibility finding, include:

- component or token name
- foreground/background colors
- measured ratio
- required threshold
- fix recommendation

## Related

- `brand.md` for accessible color token selection.
- `transaction-ux.md` for accessible signing, confirming, success, and error states.
- `number-formatting.md` for readable token and fiat values.
