# Motion and Video Craft

Use this reference when designing page entrance animations, micro-interactions, modal transitions, or producing marketing videos for crypto products.

## Tools

### Video production

For code-driven video production, use [Remotion](https://remotion.dev). Remotion renders React components to video, giving full programmatic control over timing, data, layout, and animation.

Install the official Remotion agent skills for 38 rule modules covering animations, transitions, text, charts, audio, 3D, captions, light leaks, and noise:

```bash
npx skills add remotion-dev/skills
```

Scaffold a Remotion project:

```bash
npx create-video@latest my-video
cd my-video
npx remotion add @remotion/transitions @remotion/light-leaks @remotion/google-fonts @remotion/noise @remotion/captions @remotion/media-utils @remotion/paths @remotion/shapes @remotion/lottie
```

Render at production quality:

```bash
npx remotion render MyComposition out/video.mp4 --codec h264 --crf 18 --color-space bt709
```

Preview in browser:

```bash
npx remotion studio
```

For AI-generated video, use Renoise (`/renoise:director` as single entry point, `/renoise:renoise-gen` for text-to-video or image-to-video). For voiceover, use ElevenLabs TTS.

For SVG icons in Remotion compositions, use `lucide-react`. All React icon libraries render natively in Remotion since compositions are React components.

### Page animations

For web page animations, use Framer Motion (`framer-motion`). Integrate with React components via `motion.div`, `AnimatePresence`, and `useSpring`.

Key Framer Motion patterns:

- `motion.div` with `initial`, `animate`, and `exit` for entrance/exit choreography
- `AnimatePresence` for exit animations on unmount
- `staggerChildren` in `variants` for list animations
- `useScroll` and `useTransform` for scroll-driven effects
- `layoutId` for shared layout animations (list to detail transitions)

## Page entrance choreography

### Principles

- Motion should explain state changes, not decorate everything.
- Respect `prefers-reduced-motion`. Use `useReducedMotion()` from Framer Motion to disable or simplify animations.
- Keep transaction state motion calm and trustworthy. Bouncing numbers during financial transactions cause anxiety.
- Use short staggered entrances for lists and dashboards (30-60ms between items).
- Entry takes longer than exit. Enter in 300-500ms, exit in 150-250ms.

### Patterns

#### Page entrance

```tsx
const pageVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
}
```

#### Staggered list

```tsx
const listVariants = {
  visible: {
    transition: { staggerChildren: 0.04 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
}
```

#### Modal

```tsx
const modalVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.15 },
  },
}
```

#### Dropdown

```tsx
const dropdownVariants = {
  hidden: { opacity: 0, y: -4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" },
  },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}
```

#### Success state

Brief checkmark or highlight, then settle to stable state:

```tsx
const successVariants = {
  idle: { scale: 1 },
  success: {
    scale: [1, 1.15, 1],
    transition: { duration: 0.3 },
  },
}
```

#### Error state

No shaking on financial controls. Use color change and clear copy instead:

```tsx
const errorVariants = {
  idle: { borderColor: "var(--border)" },
  error: {
    borderColor: "var(--destructive)",
    transition: { duration: 0.15 },
  },
}
```

### Anti-patterns

- Bounce animations on financial numbers (causes misreads)
- Shaking error states on transaction forms (causes anxiety about funds)
- Everything animating simultaneously (no hierarchy, feels chaotic)
- Linear timing functions without easing (feels mechanical)
- Animations that delay the user from completing an action

## Micro-interactions

### Hover

```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
/>
```

Keep hover effects subtle. 1.02 scale for buttons, slight brightness change for cards.

### Focus

```tsx
<motion.div
  animate={{
    boxShadow: isFocused
      ? "0 0 0 2px var(--ring)"
      : "0 0 0 0px var(--ring)",
  }}
  transition={{ duration: 0.15 }}
/>
```

### Toggle/switch

```tsx
<motion.div
  animate={{ x: isOn ? 20 : 0 }}
  transition={{ type: "spring", stiffness: 500, damping: 30 }}
/>
```

### Skeleton to loaded

```tsx
<motion.div
  animate={{ opacity: isLoading ? 0.5 : 1 }}
  transition={{ duration: 0.3 }}
/>
```

Cross-fade skeleton to content in 300-500ms. Show skeleton within 300ms of the loading action starting.

### Filter cross-fade

When filtering a list, cross-fade the content in 120ms and animate the list height change with a 350ms spring. Stagger new items by 40ms.

### Rolling numbers

For live-updating values (balances, prices), animate digit changes:

```tsx
function RollingNumber({ value }: { value: string }) {
  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="popLayout">
        {value.split("").map((char, i) => (
          <motion.span
            key={`${i}-${char}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >
            {char}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}
```

Animate in the direction of change: count up for increases, count down for decreases.

## Video frame checklist

When producing marketing videos or demo recordings:

### Per-frame rules

- One focal point per frame. The viewer should know where to look immediately.
- Product screenshots must be legible without zooming. Use device frames only when they help context, not when they shrink content to unreadable size.
- Captions should add context, not repeat the visual. Maximum 8 words per text block.
- Proof must be visible: transaction signature, explorer link, wallet balance, test passing, or live UI.
- CTA appears in the final frame only.
- No generic crypto clutter (blockchain cubes, random token logos) unless deliberately part of the brand.

### Scene composition

Use `useCurrentFrame()` and `interpolate()` for all Remotion animation. Never use CSS transitions or Tailwind `animate-*` classes in Remotion compositions.

Default spring config: `{ damping: 200 }`. No bounce. Bounce (`damping: 8`) is a deliberate creative choice, not a default.

Always use `extrapolateRight: "clamp"` on every `interpolate()` call.

Use `<Sequence premountFor={1 * fps}>` to preload content before it appears.

### Render settings by platform

| Platform | Dimensions | Duration | Hook window |
|---|---|---|---|
| Twitter/X | 1920x1080 | 15-60s | First 1.5s |
| TikTok | 1080x1920 | 15-60s | First 1s |
| YouTube | 1920x1080 | 1-5min | First 5s |
| Landing page | 1920x1080 | 30-90s | Immediate |
| Hackathon demo | 1920x1080 | 2-3min | First 10s |

Autoplay muted: Twitter, landing pages, Instagram. Text must carry without audio.

Mobile safe zones for vertical formats: 150px top, 170px bottom for system UI.

## Remotion key techniques

### Transitions

```tsx
import { TransitionSeries, fade, slide, wipe } from "@remotion/transitions"

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}>
    <Scene1 />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
  <TransitionSeries.Sequence durationInFrames={120}>
    <Scene2 />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

### Light leaks

```tsx
import { lightLeak } from "@remotion/light-leaks"

<TransitionSeries.Overlay
  presentation={lightLeak({ opacity: 0.8 })}
  timing={linearTiming({ durationInFrames: 20 })}
/>
```

### Text animation

Typewriter effect via string slicing (never per-character opacity):

```tsx
const visibleText = text.slice(0, Math.floor(interpolate(frame, [0, text.length * 2], [0, text.length], { extrapolateRight: "clamp" })))
```

Word-highlight for key phrases:

```tsx
const highlightedWordIndex = Math.floor(interpolate(frame, [start, end], [0, words.length], { extrapolateRight: "clamp" }))
```

### Charts

Animated bar chart with staggered spring entrance. Pie chart with `stroke-dashoffset` animation. Line chart with `evolvePath()` from `@remotion/paths`.

### Audio

Built-in SFX from `@remotion/sfx`: whoosh, whip, ding, switch, shutter. Layer SFX on transitions and metric reveals.

For background music, use royalty-free sources and mix at -20dB below voiceover.

### Noise

Use `@remotion/noise` for organic floating motion on resting elements. Prevents the "dead static" look where nothing moves between key animations.

### Color grading

Use `interpolateColors()` for dynamic background mood shifts across scenes. Map scene index to color to create a gradual mood progression.

## Solana brand palette for videos

When the product does not have its own brand:

- Primary: Purple `#9945FF`, Green `#14F195`
- Extended: Dark purple `#7B3FE4`, Light green `#19FB9B`, Dark gray `#19161C`
- Background: `#0a0a0f` to `#12101a` (never pure black `#000000`)
- Typography: Inter (primary), JetBrains Mono (code and numerals)
- Logo: download from solana.com/branding

## Related

- `pitch-and-video-craft.md` for product demo frame composition and end cards.
- `marketing.md` for launch video formats, storyboard templates, and platform optimization.
- `accessibility-evaluation.md` for reduced-motion requirements and WCAG compliance.
- `brand.md` for applying a custom brand palette to video compositions.
