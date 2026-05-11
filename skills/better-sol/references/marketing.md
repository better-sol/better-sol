# Marketing and Video

Use this reference when creating launch messaging, social content, video storyboards, or marketing assets for a crypto product.

## Tools

For code-driven video, use [Remotion](https://remotion.dev). Install the official Remotion agent skills:

```bash
npx skills add remotion-dev/skills
```

Key Remotion packages for production quality:
- `@remotion/transitions` for scene changes (fade, slide, wipe, clockWipe)
- `@remotion/light-leaks` for cinematic scene transitions as overlay effects
- `@remotion/google-fonts` for web fonts without bundling font files
- `@remotion/noise` for organic floating motion on resting elements (prevents static look)
- `@remotion/captions` for TikTok-style captions with per-word highlighting via `createTikTokStyleCaptions()`
- `@remotion/paths` for SVG draw-on effects (`evolvePath` for line-drawing reveals of logos, charts, diagrams)
- `@remotion/shapes` for animated geometric primitives (circles, stars, polygons)
- `@remotion/lottie` for complex vector animations (source animations from LottieFiles.com)
- `@remotion/media-utils` for audio/video metadata and duration calculation
- `@remotion/sfx` for built-in sound effects: whoosh, whip, ding, switch, shutter

For AI-generated video, use Renoise (`/renoise:director` for single entry point, `/renoise:renoise-gen` for text-to-video, image-to-video, video-to-video, and product design sheets).

For voiceover, use ElevenLabs TTS. Integrate in Remotion via `calculateMetadata` for dynamic duration based on audio length.

For royalty-free music, use the Remotion audio integration or source from free music libraries. Mix at -20dB below voiceover.

Render at production quality:

```bash
npx remotion render MyComposition out/video.mp4 --codec h264 --crf 18 --color-space bt709
```

Draft quality for fast iteration:

```bash
npx remotion render MyComposition out/draft.mp4 --codec h264 --crf 23
```

Multi-core render for faster builds:

```bash
npx remotion render MyComposition out/video.mp4 --concurrency 8 --crf 18
```

## Launch message

Every launch announcement follows this structure:

1. **Who it is for**: name the specific user, not "everyone"
2. **Pain it removes**: the specific cost in time, money, or risk
3. **What changed**: the concrete improvement or new capability
4. **Proof that it works**: demo, transaction signature, metric, or user quote
5. **Clear next action**: one thing the reader should do (try the demo, read the docs, join the waitlist)

### Launch post template (Twitter/X)

```
[Product] is live on [devnet/mainnet].

[Specific user] can now [core action] without [pain].

Here's what that looks like: [screenshot/video]

Proof: [explorer link or transaction signature]

Try it: [URL]

Thread on how we built it 🧵
```

### Launch post anti-patterns

- "Revolutionizing Web3" or "the future of decentralized [thing]"
- Generic blockchain benefits ("fast, cheap, secure") without proof
- No working demo or link
- Claiming traction without evidence
- Using "AI-powered" unless AI is the core differentiator
- Tagging 20 protocols you do not actually integrate with

## Video formats

Choose the format based on the goal and platform:

| Format | Goal | Duration | Structure |
|---|---|---|---|
| Hackathon demo | Prove it works to judges | 2-3 min | Hook → live flow → architecture → proof → CTA |
| Product promo | Generate interest | 30-60s | Hook → problem → solution → proof → CTA |
| Technical walkthrough | Explain architecture | 3-6 min | Architecture → code → flow → test → deploy |
| Social clip | Stop the scroll | 10-30s | One shocking metric or visual → product → CTA |
| Landing page loop | Convert visitors | 30-90s | Product in action, autoplay muted, loop-friendly |

## Storyboard template

Plan every video with a storyboard before building:

```markdown
## Scene 1 (0-3s): Hook
Goal: Stop the scroll with a surprising metric
Visual: Large animated number "$2.1M" on dark background
Caption: "settled in 30 days. zero bank accounts."
Voiceover: None
Proof shown: The number itself
Transition: Fade to scene 2

## Scene 2 (3-8s): Problem
Goal: Make the viewer feel the pain
Visual: Text reveals line by line on desaturated background
Caption: "AI agents can't pay each other without a human co-signer."
Voiceover: None
Proof shown: None
Transition: Slide right to scene 3

## Scene 3 (8-22s): Demo
Goal: Show the product solving the problem
Visual: Product screenshot slides in, animated arrows highlight key features
Caption: "Two clicks. Automated settlement."
Voiceover: Optional narration of the flow
Proof shown: Working product interface
Transition: Light leak to scene 4

## Scene 4 (22-27s): Proof
Goal: Prove it works with data
Visual: Three metric cards spring in with stagger
Caption: Each card shows a metric
Voiceover: None
Proof shown: Real metrics from devnet/mainnet
Transition: Fade to scene 5

## Scene 5 (27-30s): CTA
Goal: Drive the viewer to act
Visual: Product name, URL, QR code
Caption: "Try it now"
Voiceover: None
Proof shown: Devnet program address
Transition: End
```

## Platform optimization

| Platform | Format | Hook window | Audio | Text |
|---|---|---|---|---|
| Twitter/X | 16:9 or 1:1 | First 1.5s | Autoplay muted | Must carry without audio. Metrics in first 3s. |
| TikTok | 9:16 | First 1s | Sound on (trending audio helps) | Text overlays mandatory. Fast cuts every 2-3s. |
| YouTube | 16:9 | First 5s | Sound on | More detail allowed. Thumbnail is 50% of clicks. |
| YouTube Shorts | 9:16 | First 1s | Sound on | Same as TikTok. |
| Instagram Reels | 9:16 | First 1s | Sound on | Visual quality matters more than TikTok. |
| Instagram Feed | 1:1 | First 2s | Autoplay muted | Must look good as still image. First frame = thumbnail. |
| Landing page | 16:9 | Immediate | Autoplay muted | Loop-friendly. Must work without sound. |
| Hackathon demo | 16:9 | First 10s | Narrated | Focus on functionality. Show code + product. |
| Pitch meeting | 16:9 | First 5s | Narrated | Clean, professional. No memes. Real data. |

### Platform-specific mechanics

**Twitter/X**: Thread format works. Teaser video (15s) + link to full demo. Quote-tweet hook: "POV: You just shipped your first Solana dApp." Tag relevant protocols only if you actually integrate them.

**TikTok**: Pattern interrupt in first 0.5s (unexpected visual, loud text, surprising metric). "POV" or "Day in the life" framing. Leave space for duets/stitches. Text-to-speech narration over screen recording.

**YouTube**: Thumbnail: high contrast, 3-4 words max, face if possible. First 5s state what the viewer will learn. End screen with subscribe + related videos. Description: timestamps, links, keywords.

## Viral mechanics for crypto content

### Metrics that stop the scroll

Lead with a number. The most powerful hooks in crypto are:

- Dollar amounts: "$2.1M settled", "$500K TVL"
- Speed: "400ms finality", "10x faster than Ethereum"
- Scale: "50K transactions", "120 active agents"
- Cost: "100x cheaper", "$0.00025 per transaction"

Every number in the video must be current and verifiable. Outdated metrics are worse than no metrics.

### Research before producing

Before including any metric:

- Pull current TVL, volume, user counts from DefiLlama API
- Get latest ecosystem stats from CoinGecko
- Verify any numbers the user mentioned in the interview
- Check for recent hacks or exploits. Never reference hacked protocols positively.

### Content that performs

- Real on-chain data pulled live into Remotion compositions
- Terminal recordings of tests passing or deployments succeeding
- Explorer links showing real transactions
- Before/after comparisons with real numbers
- Speed demos showing actual transaction confirmation time

### Content that fails

- Stock footage of "blockchain" imagery (node networks, circuit boards)
- Videos longer than needed (30s social, 90s landing, 3min demo max)
- No captions (85% of social video is watched muted)
- Generic music that does not match the brand
- Just slides with no product shown

## Deliverables for video projects

For every video, produce:

1. **Video files** in `out/` (MP4, H.264, CRF 18, BT.709 color space)
2. **Source code** (Remotion project) for future edits
3. **Platform-specific cuts**: landscape (16:9), portrait (9:16), square (1:1)
4. **Thumbnails** for each platform (1280x720 YouTube, 1080x1080 Instagram)
5. **Caption file** (.srt) for accessibility
6. **Post copy**: suggested tweet/caption text for each platform

## Avoid

- Generic "revolutionizing Web3" claims
- Unexplained token jargon
- Fake or unverifiable metrics
- Product screenshots too small to read
- Demos that hide the signing or confirmation step
- Videos longer than the content warrants

## Related

- `motion-and-video.md` for Remotion techniques, Framer Motion patterns, and page animations.
- `pitch-and-video-craft.md` for frame composition, slide design, and proof visuals.
- `go-to-market.md` for launch phases and distribution channels.
- `pitch-deck-design.md` for pitch deck structure.
- `submission-assets.md` for demo script and hackathon submission content.
