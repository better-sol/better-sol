# Brand System

Use this reference when designing a brand identity for a crypto product: palette, typography, motion, and voice.

## Tools

For Tailwind + shadcn/ui projects, brand tokens map directly to CSS custom properties under `:root` and `.dark` in `globals.css`. shadcn generates these from a 5-seed palette (background, foreground, primary, primary-foreground, muted).

For non-Tailwind projects, write a `brand.md` and map the tokens to CSS custom properties or design token files manually.

For typography, use `next/font/google` in Next.js projects. Wire the chosen pair as `--font-sans` and `--font-mono` CSS variables in `globals.css`. For Tailwind v4, use the `@theme` block; for v3, extend `theme.fontFamily` in the config.

Define all color seeds in OKLCH. Convert to hex for display. Light and dark modes must derive from the same seeds, not be chosen independently.

## Brand interview

Ask for:

- User segment: who is the primary user?
- Category: DeFi, wallet, developer tool, consumer app, data product, marketplace, game?
- Desired emotion: safe, fast, premium, playful, technical, or calm?
- Competitors to avoid resembling: which products should it NOT look like?
- Conservative vs experimental direction: enterprise-grade or bold and distinctive?
- Dark/light requirements: dark-only, light-only, or both?

## Palette requirements

A crypto product palette needs these semantic tokens:

- **Background**: the page surface
- **Elevated surface**: cards, panels, modals (slightly lighter or different tone from background)
- **Primary text**: the main content color
- **Muted text**: secondary content, timestamps, labels
- **Primary action**: buttons, links, active states
- **Success**: confirmed transactions, positive changes, healthy states
- **Warning**: pending states, approaching limits
- **Danger**: errors, negative changes, destructive actions
- **Border**: card borders, dividers, input outlines
- **Focus ring**: keyboard focus indicator
- **Chart colors**: 5-8 distinct colors for data visualization (if dashboard exists)

### Contrast rules

Every foreground/background pair must pass WCAG AA: 4.5:1 for body text, 3:1 for large text and icons. Auto-adjust lightness until it passes. If it cannot pass, drop the palette.

Verify contrast pairs:
- Primary text on background
- Muted text on background
- Primary action text on primary action color
- Danger text on background
- Success text on background
- Warning text on background
- Focus ring on background

## Brand directions

### Stark protocol

Black/white, thin borders, high contrast, precise copy, low motion. Monospace accents for addresses and numbers. Minimal color usage. Good for developer tools, serious protocols, and infrastructure.

Palette seeds: near-black background, white text, one cold accent (blue or violet), gray borders.

### Warm trust

Charcoal base, warm neutrals (sand, cream), amber accent, soft panels with subtle shadows, human copy. Rounded corners. Good for consumer finance, onboarding flows, and wallet apps.

Palette seeds: charcoal background, warm gray surfaces, amber or gold accent, cream text.

### Trading terminal

Dark base (#0a0a0f), dense layout, green/red deltas, monospace numerals, minimal decoration. Information-dense tables. Good for analytics, DeFi dashboards, perps, and trading interfaces.

Palette seeds: very dark background, slightly elevated surfaces, green for positive, red for negative, muted blue for neutral.

### Soft wallet

Light surfaces, rounded controls (8-12px radius), friendly accent (blue, teal, or purple), plain language. Generous whitespace. Good for consumer wallet flows, onboarding, and simple DeFi interactions.

Palette seeds: off-white background, light gray surfaces, single friendly accent, dark text.

### Gradient trust

Dark base with restrained gradient accents (2-color gradients on hero sections, CTAs). Clean SaaS structure underneath. Good for growth-stage products that need to feel premium without being intimidating.

Palette seeds: dark background, subtle gradient from primary to accent, clean white text.

### Editorial gallery

High whitespace, large serif or display typeface, strong product screenshots, minimal UI chrome. Content-first layout. Good for NFT galleries, portfolio products, and editorial content platforms.

Palette seeds: white or very light background, dark text, one strong accent for links and CTAs.

## Typography

### Font pairing rules

- **Display + body**: use a distinct display font for headlines (Inter, Geist, Satoshi) paired with a clean body font
- **Body + mono**: every crypto product needs a monospace font for addresses, numbers, and code (JetBrains Mono, Fira Code, Berkeley Mono)
- **Maximum 2 families**: one proportional, one monospace. Three at absolute maximum (add a serif only for editorial products).

### Default pair

Inter (body) + JetBrains Mono (code, addresses, numerals). Available on Google Fonts, free, excellent readability.

### Weight hierarchy

Use at most 3 weights:
- **Regular (400)**: body text, labels
- **Medium (500)**: emphasis, buttons, nav
- **Bold (700)**: headlines, key metrics

Never use more than 3 weights. Four or more weights signals undisciplined typography.

### Size hierarchy

| Element | Size | Weight |
|---|---|---|
| Page title | 36-48px | Bold |
| Section heading | 24-32px | Bold |
| Card title | 18-20px | Medium |
| Body text | 14-16px | Regular |
| Caption/label | 12-13px | Regular |
| Mono numerals | Same as surrounding text | Use tabular-nums |

## Motion rules

- Motion should explain state changes, not decorate everything
- Respect `prefers-reduced-motion`
- Keep transaction state motion calm and trustworthy
- Entry takes longer than exit (300-500ms in, 150-250ms out)
- Use short staggered entrances for lists (30-60ms between items)

Choose one motion personality:
- **Calm**: subtle opacity changes, no movement, cross-fades only
- **Energetic**: spring-based entrances, staggered lists, number rolling
- **Minimal**: no motion except state transitions (loading → loaded)

## Voice and copy

### Tone by product type

| Product type | Tone | Example |
|---|---|---|
| Protocol/infra | Precise, technical, minimal | "Deposit confirmed. Tx: 4F8x...9k2m" |
| Consumer wallet | Friendly, plain language | "Your SOL is staked and earning rewards." |
| Trading terminal | Dense, data-first | "SOL/USDT +2.4% $178.42 Vol: $1.2B" |
| Developer tool | Direct, no filler | "Program deployed to devnet." |

### Copy rules for all products

- Use active voice: "Transaction confirmed" not "The transaction has been confirmed"
- Be specific: "0.05 SOL" not "a small amount"
- No exclamation marks in error or financial contexts
- No jargon without definition in consumer products
- Address the user directly: "Your balance" not "The user's balance"

## `brand.md` template

```markdown
# Brand

## Position
[who it is for and what it should feel like]

## Colors
- Background:
- Surface:
- Text:
- Muted:
- Primary:
- Success:
- Warning:
- Danger:
- Border:
- Focus:

## Typography
- Display: [font family, weight range]
- Body: [font family, weight range]
- Mono: [font family, for numerals, addresses, code]

## Motion
[calm / energetic / minimal]

## Voice
[tone rules and copy examples]
```

Write `brand.md` to the project root. Other skills and future sessions read it to maintain consistency.

## Preview rendering

Generate an HTML file with each direction rendered as a contextual mini-UI. Choose the mini-UI template based on product category:

| Category | Mini-UI template |
|---|---|
| Wallet | Balance + send/receive buttons |
| DeFi/swap | Token in → token out flow |
| Staking/yield | Supplied amount + APR |
| NFT | Floor price + buy button |
| Dashboard | KPI card with metric |
| Social | Post card with content |

Open the HTML file in the browser using `open` (macOS), `xdg-open` (Linux), or `start` (Windows). The user picks one visually.

## Implementation

For shadcn projects, convert the chosen direction to CSS custom properties:

```css
:root {
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...);
  --primary-foreground: oklch(...);
  --muted: oklch(...);
  --muted-foreground: oklch(...);
  --border: oklch(...);
  --ring: oklch(...);
  --destructive: oklch(...);
}

.dark {
  --background: oklch(...);
  /* same seeds, adjusted lightness */
}
```

Back up `globals.css` before writing. Verify contrast on the final values.

## Related

- `brand-preview-workflow.md` for generating and comparing complete visual directions.
- `accessibility-evaluation.md` for contrast and focus requirements.
- `number-formatting.md` for mono numerals and financial display decisions.
- `motion-and-video.md` for motion patterns aligned with the brand personality.
