# Brand Preview Workflow

Use this reference when the user asks for brand colors, visual identity, theme selection, or wants the product to look less generic.

## Tools

Generate an HTML file with inline CSS and open it in the browser. Use `open` on macOS, `xdg-open` on Linux, `start` on Windows. No build tools or server needed.

For Tailwind + shadcn/ui projects, convert the chosen direction into semantic CSS custom properties under `:root` and `.dark` in `globals.css`. shadcn expects: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--destructive`.

Back up `globals.css` before writing tokens.

For typography, use `next/font/google` in Next.js projects. Wire the chosen pair as `--font-sans` and `--font-mono` CSS variables.

## Goal

Create a usable product brand system, not only a palette. The output should guide real UI implementation: colors, typography, surfaces, gradients, chart colors, state colors, and voice.

## Discovery questions

Ask only the questions needed:

- Who is the primary user?
- What category is this: DeFi, wallet, developer tool, consumer app, data product, marketplace, game?
- Should it feel safer, faster, more premium, more playful, or more technical?
- Which competitors should it not resemble?
- Is dark mode required?
- Does the UI show charts or financial numbers?

## Generate six directions

Create six distinct directions, not six small hue variations:

1. **Stark protocol**: monochrome, precise, technical. White/near-white background. Single accent color (cool blue or green). Monospace numerals. Thin borders. Generous whitespace. Inspired by Bloomberg Terminal, Linear.
2. **Warm trust**: warm neutrals, calm finance, approachable. Off-white background with warm undertone. Muted primary (amber, teal, or sage). Rounded corners. Soft shadows. Inspired by Stripe, Mercury.
3. **Trading terminal**: dense dark UI, mono numerals, high contrast deltas. Near-black background. Green/red or blue/orange for direction. Dense information layout. Compact spacing. Inspired by TradingView, Dune.
4. **Consumer wallet**: soft surfaces, rounded shapes, plain language. Light background. Bright but not neon primary (purple, blue, or coral). Large tap targets. Friendly icons. Inspired by Cash App, Venmo.
5. **Gradient trust**: restrained gradient accents, clean SaaS structure. White background with one gradient accent (primary to secondary). Clean grid. Professional typography. Inspired by Vercel, Raycast.
6. **Editorial gallery**: high whitespace, large type, strong screenshots. Near-white background. Minimal color. Large headings. Image-forward. Inspired by Apple, Linear marketing pages.

For each direction specify:

- `background`: main surface color
- `surface`: card and elevated surface color
- `text`: primary text color
- `muted`: secondary text color
- `primary`: main accent and CTA color
- `success`: positive states (green family)
- `warning`: caution states (amber family)
- `danger`: destructive and error states (red family)
- `border`: dividers and outlines
- `ring`: focus outlines for accessibility
- `chart`: array of 4-6 colors for data visualization
- `gradient`: optional primary-to-secondary gradient for hero sections
- `typography`: font family pairing and weight guidance
- `motion`: easing and duration direction (snappy, smooth, springy)
- `voice`: tone rules for copy (formal, casual, technical, friendly)

## Preview generation

### HTML preview file

The preview file should be a standalone HTML document with inline CSS that can be opened directly in a browser. Generate all six directions in one file, each in its own section.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brand Direction Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; }
    .direction { padding: 48px; border-bottom: 2px solid #eee; }
    .direction h2 { margin-bottom: 24px; font-size: 24px; }
    .swatches { display: flex; gap: 12px; margin-bottom: 24px; }
    .swatch { width: 64px; height: 64px; border-radius: 8px; }
    .sample-header { padding: 16px; border-radius: 12px; margin-bottom: 16px; }
    .sample-button { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; margin-right: 8px; }
    .sample-card { padding: 20px; border-radius: 12px; margin-bottom: 16px; }
    .sample-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; margin-right: 8px; }
    .sample-number { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
  </style>
</head>
<body>
  <!-- Direction 1: Stark Protocol -->
  <div class="direction" style="background: #fafafa;">
    <h2 style="color: #111;">1. Stark Protocol</h2>
    <div class="swatches">
      <div class="swatch" style="background: #fafafa; border: 1px solid #ddd;"></div>
      <div class="swatch" style="background: #ffffff; border: 1px solid #ddd;"></div>
      <div class="swatch" style="background: #111;"></div>
      <div class="swatch" style="background: #666;"></div>
      <div class="swatch" style="background: #2563eb;"></div>
      <div class="swatch" style="background: #16a34a;"></div>
      <div class="swatch" style="background: #dc2626;"></div>
    </div>
    <!-- header sample -->
    <div class="sample-header" style="background: #fff; border: 1px solid #e5e5e5;">
      <span style="font-weight: 600; color: #111;">Protocol</span>
      <span style="float: right; color: #666;">Connect Wallet</span>
    </div>
    <!-- button samples -->
    <button class="sample-button" style="background: #2563eb; color: #fff;">Primary</button>
    <button class="sample-button" style="background: transparent; color: #111; border: 1px solid #ddd;">Secondary</button>
    <!-- balance sample -->
    <div class="sample-number" style="color: #111;">1,423.50 SOL</div>
    <!-- badges -->
    <span class="sample-badge" style="background: #dcfce7; color: #16a34a;">Success</span>
    <span class="sample-badge" style="background: #fef9c3; color: #a16207;">Warning</span>
    <span class="sample-badge" style="background: #fee2e2; color: #dc2626;">Error</span>
    <!-- transaction card -->
    <div class="sample-card" style="background: #fff; border: 1px solid #e5e5e5;">
      <div style="color: #666; font-size: 12px; margin-bottom: 4px;">Sent SOL</div>
      <div style="color: #111; font-weight: 600;">-2.500 SOL</div>
      <div style="color: #666; font-size: 12px; margin-top: 4px;">to 7xKX...gAsU</div>
    </div>
  </div>
  <!-- Repeat for directions 2-6 -->
</body>
</html>
```

### Preview requirements

Each direction in the preview must show:

- App header with logo placeholder and navigation
- Primary button (filled)
- Secondary button (outlined)
- Transaction card (sent/received)
- Balance number (large numeric display)
- Success, warning, error badges
- Chart color swatches (if the product shows data)
- Empty state placeholder
- A section of body text (paragraph) for readability check

### What to look for when reviewing

- Is the primary button immediately obvious as the action target?
- Can you read the balance number at a glance? Is the numeral font clear?
- Are success/warning/error colors distinguishable for color-blind users? Use a contrast checker.
- Does the transaction card feel trustworthy or flimsy?
- Does the empty state feel intentional or broken?
- Is the muted text readable against the background (minimum 4.5:1 contrast ratio)?
- Does the overall tone match the product category?

## Selection criteria

Choose the direction that best supports:

- **Trust** for the asset at risk (more money at stake means more conservative design)
- **Clarity** for transaction flows (users must understand what they are signing)
- **Distinctiveness** from competitors (do not look like every other Solana dApp)
- **Readability** of numbers (financial data must be instantly parseable)
- **Fit** with the product category (DeFi tools look different from consumer wallets)
- **Implementation simplicity** (fewer custom tokens means faster development)

## Implementation: shadcn CSS variables

After selecting a direction, convert it to shadcn CSS variables:

```css
:root {
  --background: 0 0% 98%;
  --foreground: 0 0% 7%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 7%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 96%;
  --muted: 0 0% 96%;
  --muted-foreground: 0 0% 40%;
  --border: 0 0% 90%;
  --input: 0 0% 90%;
  --ring: 217 91% 60%;
  --destructive: 0 84% 60%;
}

.dark {
  --background: 0 0% 4%;
  --foreground: 0 0% 98%;
  --card: 0 0% 7%;
  --card-foreground: 0 0% 98%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 15%;
  --muted: 0 0% 15%;
  --muted-foreground: 0 0% 64%;
  --border: 0 0% 15%;
  --input: 0 0% 15%;
  --ring: 217 91% 60%;
  --destructive: 0 84% 60%;
}
```

Use HSL values (hue, saturation%, lightness%) for shadcn compatibility.

## Typography

Pair a sans-serif for body text with a monospace for numbers:

- **Body**: Inter, Geist, Plus Jakarta Sans
- **Numbers**: JetBrains Mono, Berkeley Mono, Geist Mono

Wire via `next/font/google`:

```ts
import { Inter, JetBrains_Mono } from "next/font/google"

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })
```

Apply to the HTML element:

```tsx
<html className={`${sans.variable} ${mono.variable}`}>
```

## Common mistakes

- Neon gradients everywhere. Use gradients as accents, not the primary surface.
- Low contrast muted text. Test against WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Brand color used for both primary action and positive financial change. They mean different things.
- Danger/success colors that are indistinguishable for color-blind users. Use pattern or icon differentiation.
- Too many accent colors. One primary accent is enough for most products.
- Palette does not include border, focus, disabled, and chart states. Define all semantic tokens upfront.

## Related

- `brand.md` for the final brand system template.
- `accessibility-evaluation.md` for contrast and target-size checks.
- `transaction-ux.md` for testing brand choices against real wallet actions.
- `number-formatting.md` for numeric display rules.
