# Brand Preview Workflow

Use this reference when the user asks for brand colors, visual identity, theme selection, or wants the product to look less generic.

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

1. Stark protocol: monochrome, precise, technical.
2. Warm trust: warm neutrals, calm finance, approachable.
3. Trading terminal: dense dark UI, mono numerals, high contrast deltas.
4. Consumer wallet: soft surfaces, rounded shapes, plain language.
5. Gradient trust: restrained gradient accents, clean SaaS structure.
6. Editorial gallery: high whitespace, large type, strong screenshots.

For each direction specify:

- background
- surface
- text
- muted text
- primary
- success
- warning
- danger
- border
- focus ring
- chart colors if needed
- typography direction
- motion feel
- voice rules

## Preview requirements

If generating a preview file, show each direction with:

- app header
- primary button
- secondary button
- transaction card
- balance number
- success/warning/error badges
- chart swatches if relevant
- sample empty state

## Selection criteria

Choose the direction that best supports:

- trust for the asset at risk
- clarity for transaction flows
- distinctiveness from competitors
- readability of numbers
- fit with the product category
- implementation simplicity

## Implementation notes

For Tailwind/shadcn projects, convert the chosen direction into semantic tokens rather than hard-coded component colors:

- background
- foreground
- card
- card-foreground
- primary
- primary-foreground
- secondary
- muted
- muted-foreground
- border
- input
- ring
- destructive

## Common mistakes

- Neon gradients everywhere.
- Low contrast muted text.
- Brand color used for both primary action and positive financial change.
- Danger/success colors that are indistinguishable for color-blind users.
- Too many accent colors.
- Palette does not include border, focus, disabled, and chart states.

## Related

- `brand.md` for the final brand system template.
- `accessibility-evaluation.md` for contrast and target-size checks.
- `transaction-ux.md` for testing brand choices against real wallet actions.
