# Product Review and Roast

Use this reference when reviewing a crypto product for quality, completeness, usability, and market readiness. Covers structured review, harsh critique (roast), and actionable improvement plans.

## Review dimensions

Grade each dimension A through F. An overall grade below B means the product is not ready for public launch.

### Onboarding (weight: 3x)

Can a new user go from zero to a successful first action without help?

- **A**: User arrives, connects wallet, completes the core action in under 60 seconds. No docs needed. Error states guide recovery.
- **B**: Core flow works but requires one moment of confusion or a help tooltip.
- **C**: User needs to read instructions or a README to complete the core flow.
- **D**: Core flow is broken, confusing, or requires external knowledge not provided.
- **F**: Cannot complete the core action at all.

Checklist:

- [ ] First screen explains what the product does in under 10 words
- [ ] Wallet connection is visible and labeled
- [ ] Network/cluster is clearly indicated (devnet vs mainnet)
- [ ] The primary action is the most prominent element on screen
- [ ] Error messages explain what happened and what to do
- [ ] No dead-end pages or empty states without guidance

### Core flow (weight: 3x)

Does the primary user journey work end-to-end?

- **A**: Every step works, every state is handled, transaction succeeds on first try.
- **B**: Flow works but has rough edges (slow loading, unclear states, minor visual glitches).
- **C**: Flow works in the happy path but breaks on edge cases (wrong wallet, insufficient balance, network issues).
- **D**: Core flow partially works but has blocking issues.
- **F**: Core flow does not work.

Checklist:

- [ ] Happy path: connect wallet, perform action, see confirmation
- [ ] Insufficient balance: clear error message with solution
- [ ] Wrong network: detect and prompt to switch
- [ ] Transaction rejected: explain that no funds moved and offer retry
- [ ] Transaction failed: show program error name in plain language
- [ ] Loading states: skeleton or spinner during data fetching
- [ ] Empty states: guidance for new users with no data

### Transaction UX (weight: 2x)

Is the signing and confirmation experience clear and trustworthy?

- **A**: Pre-sign review shows exact amounts, mints, fees, and consequences. Post-sign confirmation is immediate and clear.
- **B**: Signing works but review could be clearer (missing fee estimate, vague description).
- **C**: Wallet popup appears without a review screen or the confirmation state is unclear.
- **D**: User is unsure what they are signing or whether the transaction succeeded.
- **F**: No transaction feedback at all.

Checklist:

- [ ] Pre-sign screen shows every amount, token, and fee
- [ ] Signing state is visible while wallet popup is open
- [ ] Confirmation state with transaction signature and explorer link
- [ ] Error states explain whether funds moved
- [ ] Retry available on all failure states

### Visual design (weight: 2x)

Does the interface look intentional and professional, not like a default template?

- **A**: Distinctive visual identity. Typography, color, spacing, and motion are consistent and purposeful.
- **B**: Mostly consistent with minor inconsistencies (mixed icon styles, inconsistent spacing).
- **C**: Functional but generic. Looks like an unmodified shadcn template or default Tailwind theme.
- **D**: Inconsistent or visually cluttered. Multiple competing styles.
- **F**: Broken layout, unreadable text, or missing styles.

Checklist:

- [ ] Color palette is intentional and consistent (not default blue)
- [ ] Typography has clear hierarchy (headings, body, labels, mono numerals)
- [ ] Spacing is consistent (not arbitrary gaps)
- [ ] Icons are from a single icon set
- [ ] Dark mode works if present (not just inverted colors)
- [ ] Financial numbers use tabular numerals and consistent decimal places

### Error handling (weight: 2x)

Does every error state tell the user what happened and what to do?

- **A**: Every error has a specific, actionable message. No generic "Something went wrong."
- **B**: Most errors are specific. A few generic fallbacks exist.
- **C**: Some errors are specific, others are raw RPC messages or generic.
- **D**: Most errors are unhelpful.
- **F**: Errors crash the UI or show stack traces.

Checklist:

- [ ] Wallet errors (not found, rejected, disconnected) are handled
- [ ] RPC errors (rate limit, timeout, network) are handled
- [ ] Program errors map to human-readable names
- [ ] No raw error strings visible to the user
- [ ] Every error has a suggested action

### Technical architecture (weight: 1x)

Is the codebase maintainable and the deployment sound?

- **A**: Typed client, tested programs, clean separation of concerns, deployed on devnet with passing tests.
- **B**: Mostly clean but some technical debt or missing tests.
- **C**: Works but has architectural issues (tight coupling, no tests, hardcoded values).
- **D**: Fragile architecture with significant debt.
- **F**: No structure, no tests, not deployed.

Checklist:

- [ ] Program definitions use Better Sol (or Anchor with typed clients)
- [ ] Tests exist for core program logic
- [ ] Client code is typed, not using raw `@solana/web3.js` stringly-typed calls
- [ ] No private keys or secrets in frontend code
- [ ] Environment variables for cluster, RPC URL, program addresses
- [ ] Error handling at every layer (wallet, RPC, program)

## Roast format

A roast is deliberately harsh but constructive. The goal is to find every weakness before users do.

### Structure

For each dimension, give:

1. **Grade**: A through F
2. **What works**: the strongest aspect, one sentence
3. **What hurts**: the most damaging weakness, one sentence
4. **Evidence**: specific screenshots, flows, or code that prove the issue
5. **Fix**: the exact change that would move the grade up one level

### Overall assessment

After grading all dimensions:

1. **Bottom line**: one sentence verdict ("Works for a demo, not for users.")
2. **Top 3 blockers**: the three issues that must be fixed before any public launch
3. **Quick wins**: improvements that take under 1 hour each
4. **Investment needed**: rough estimate of work to reach launch quality

### Roast tone rules

- Be direct, not diplomatic. "The onboarding is broken" beats "The onboarding could be improved."
- Every criticism must include a specific fix. No complaints without solutions.
- Acknowledge what works. A roast is not only negative.
- Never attack the team. Critique the product.
- Prioritize by user impact, not by what is easiest to fix.

## Review checklist (comprehensive)

### Before opening the app

- [ ] README exists and explains setup
- [ ] Dependencies install without errors
- [ ] Dev server starts without warnings
- [ ] No console errors on first load
- [ ] No hardcoded mainnet addresses in dev mode

### First 30 seconds

- [ ] Clear what the product does
- [ ] Visible wallet connection
- [ ] Correct cluster indicator
- [ ] Page loads in under 3 seconds
- [ ] No layout shifts after load

### Core flow

- [ ] Connect wallet succeeds
- [ ] Primary action is discoverable
- [ ] Transaction review before signing
- [ ] Transaction succeeds on devnet
- [ ] State updates after confirmation
- [ ] Error recovery works

### Edge cases

- [ ] Disconnect and reconnect works
- [ ] Wrong cluster is detected
- [ ] Insufficient balance is handled
- [ ] Page refresh preserves state
- [ ] Mobile viewport is usable
- [ ] Slow network is handled gracefully

### Security

- [ ] No private keys in frontend code
- [ ] No uninitialized accounts
- [ ] No missing signer checks
- [ ] Program authority is properly scoped
- [ ] No arbitrary CPI targets

## Related

- `transaction-ux.md` for detailed signing and confirmation flow review.
- `accessibility-evaluation.md` for WCAG compliance checks.
- `security-checklist.md` for program-level security audit.
- `strategy.md` for positioning and competitive review.
