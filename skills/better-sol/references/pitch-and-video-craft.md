# Pitch and Video Visual Craft

Use this reference when designing pitch deck visuals, demo video frames, product screenshots, end cards, or launch visuals.

## Tools

Build videos with [Remotion](https://remotion.dev). Install the official Remotion agent skills for 38 rule modules:

```bash
npx skills add remotion-dev/skills
```

Key Remotion packages:
- `@remotion/transitions` for scene changes (fade, slide, wipe, clockWipe)
- `@remotion/light-leaks` for cinematic scene transitions
- `@remotion/google-fonts` for web fonts without bundling
- `@remotion/noise` for organic floating motion
- `@remotion/captions` for TikTok-style captions with per-word highlighting
- `@remotion/paths` for SVG draw-on effects (`evolvePath`)
- `@remotion/shapes` for animated geometric primitives
- `@remotion/lottie` for complex vector animations (source from LottieFiles.com)
- `@remotion/media-utils` for audio/video metadata

For AI-generated content, use Renoise. For voiceover, use ElevenLabs.

For SVG icons in compositions, use `lucide-react` (Zap, Shield, Wallet, ArrowRight, QrCode, etc.). All React icon libraries render natively in Remotion.

## Frame principles

### Core rules

1. **One focal point per frame.** The viewer should know where to look in under 0.5 seconds.
2. **Product must be readable without zooming.** If a screenshot is too small to read, either zoom in on the relevant section or use a callout.
3. **Captions add context, not repeat the visual.** Maximum 8 words per text block.
4. **Use callouts for proof.** Highlight transaction signatures, account state changes, wallet actions, and before/after values.
5. **Proof beats decoration.** A real explorer link is worth more than any animated gradient.

### Focal point hierarchy

```
Frame layout:
┌──────────────────────────────────┐
│ Title (6 words max)              │
│                                  │
│     ┌────────────────────┐       │
│     │                    │       │
│     │   PRIMARY VISUAL   │       │
│     │   (screenshot or   │       │
│     │    data visual)    │       │
│     │                    │       │
│     └────────────────────┘       │
│                                  │
│ Caption or metric (1 line)       │
└──────────────────────────────────┘
```

Never have more than 3 elements competing for attention: title, visual, caption.

## Product screenshot treatment

### When to use device frames

Use a device frame or browser frame when it helps context. Avoid frames that shrink the product until text is unreadable.

Good screenshot frame includes:
- Title bar or device context (phone, laptop, browser)
- Clean background (solid or subtle gradient, no stock photos)
- One highlighted area (red box, arrow, or glow)
- Short caption (under 10 words)
- Optional proof badge (transaction signature, verified checkmark)

### When to crop

Crop to the relevant section when:
- The full page has too much content to read at video resolution
- The key information is in one card, panel, or widget
- You want to show a detail (a button, a value, a state change)

### Screenshot checklist

- [ ] Resolution is at least 2x the video frame (3840px wide for 1920px video)
- [ ] No personal data visible (real wallet addresses with real balances)
- [ ] Dark mode screenshots on dark backgrounds, light mode on light
- [ ] Consistent device frame style throughout the video
- [ ] Cursor or touch indicator if showing an interactive flow

## Pitch slide visual hierarchy

Every slide follows this structure:

1. **Title states the takeaway.** "400ms settlement" not "Speed."
2. **Main visual proves the takeaway.** Chart, screenshot, metric, or diagram.
3. **One supporting sentence adds detail.** Max 15 words.
4. **Footer can hold proof.** Program address, link, source citation.

### Slide types and their layouts

#### Metric slide

Large animated number with context line. Number takes 60% of the frame.

```
┌──────────────────────────────────┐
│                                  │
│         $2.1M                    │
│   settled in 30 days             │
│   zero bank accounts required    │
│                                  │
└──────────────────────────────────┘
```

#### Problem slide

Desaturated or red-tinted. Text reveals line by line. No product shown.

```
┌──────────────────────────────────┐
│ The Problem                      │
│                                  │
│ "AI agents can't pay each other  │
│  without a human co-signer."     │
│                                  │
│                                  │
└──────────────────────────────────┘
```

#### Demo slide

Product screenshot with animated arrows and step labels.

```
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ │     [Product Screenshot]     │ │
│ │                              │ │
│ │   ← Step 1: Connect wallet  │ │
│ │        ← Step 2: Set amount │ │
│ └──────────────────────────────┘ │
│ Caption: "Two clicks. Done."     │
└──────────────────────────────────┘
```

#### Comparison slide

Before/after or us vs them. Split screen.

```
┌──────────────────────────────────┐
│ Before          │ After          │
│ ┌──────────────┐│┌──────────────┐│
│ │ Manual       │││ Automated    ││
│ │ 3 hours/day  │││ 0 hours/day  ││
│ │ Error-prone  │││ Auditable    ││
│ └──────────────┘│└──────────────┘│
└──────────────────────────────────┘
```

#### Architecture slide

Simplified flow diagram. Max 5 nodes.

```
User → Wallet → [Your Program] → Protocol X
                 ↓
           Indexer
```

## Demo end card

Include all of these:

- Product name and logo
- One-line value proposition (under 10 words)
- URL or repo link
- QR code if presenting live or for mobile audience
- Devnet/mainnet program address or explorer link
- Contact or CTA

### End card layout

```
┌──────────────────────────────────┐
│                                  │
│   [Logo]  Product Name           │
│   One-line value proposition     │
│                                  │
│   product.com    [QR Code]       │
│                                  │
│   Devnet: CoUnT...1111           │
│   Try it now →                   │
└──────────────────────────────────┘
```

## Crypto-specific proof visuals

These elements add credibility specific to blockchain products:

- **Transaction signature** with explorer label and link
- **Account before/after values** showing the state change
- **Program ID** displayed as truncated address with copy button visual
- **Test passing summary** (green checkmarks, test count)
- **Wallet signing state** showing the approval screen
- **Protocol integration logos** only when actually used (do not display logos for protocols you do not integrate)

### Proof badge design

```tsx
<div className="inline-flex items-center gap-2 bg-green/10 text-green rounded-full px-3 py-1">
  <CheckCircle size={14} />
  <span className="text-sm font-mono">4F8x...9k2m</span>
  <ExternalLink size={12} />
</div>
```

## Avoid in all visuals

- Tiny full-page screenshots where nothing is readable
- Generic blockchain cubes, node networks, or circuit board imagery
- Random token logos for tokens you do not use
- Unverified partner or protocol logos
- Charts with no axis labels, no source, and no time period
- "AI x crypto" visuals that do not explain what the product actually does
- Stock footage of people pointing at screens
- Gradient text on dark backgrounds (unreadable in video compression)

## Video composition recipes

### 30-second social clip (Hook-Proof-CTA)

```
Scene 1 (0-3s):   HOOK - large animated metric or bold claim
Scene 2 (3-8s):   PROBLEM - text reveal, desaturated
Scene 3 (8-22s):  DEMO - product screenshot with animated callouts
Scene 4 (22-27s): PROOF - 2-3 metric cards with stagger entrance
Scene 5 (27-30s): CTA - product name, URL, QR code
```

### 2-minute hackathon demo

```
Scene 1 (0-10s):   Hook - pain statement
Scene 2 (10-30s):  Product - what it does
Scene 3 (30-90s):  Live flow - core action with explorer proof
Scene 4 (90-110s): Architecture - how it works
Scene 5 (110-120s): Close - CTA with link
```

### 60-second landing page video

```
Scene 1 (0-5s):   Hero - product name, tagline, key visual
Scene 2 (5-20s):  Problem - who suffers and how
Scene 3 (20-40s): Solution - product in action
Scene 4 (40-55s): Proof - metrics, testimonials, transactions
Scene 5 (55-60s): CTA - try it now
```

## Remotion composition setup

```tsx
import { Composition } from "remotion"
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring } from "remotion"

export const ProductDemo = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  const titleY = interpolate(frame, [0, 15], [20, 0], {
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        <h1>400ms settlement</h1>
        <p>Zero bank accounts required</p>
      </div>
    </AbsoluteFill>
  )
}
```

## Related

- `pitch-deck-design.md` for deck structure and slide sequence.
- `marketing.md` for launch video formats, storyboard templates, and platform optimization.
- `motion-and-video.md` for page animation patterns and Framer Motion recipes.
- `brand.md` for applying brand colors and typography to video compositions.
