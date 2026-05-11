# Pitch Deck Design

Use this reference when designing pitch deck visuals, slide sequences, and presentation materials for investors, grant reviewers, hackathon judges, or demo-day audiences.

## Core principle

A pitch deck is not a document. It is a sequence of beliefs you want the audience to adopt.

A strong deck moves the audience through this chain:

```text
This problem is real → this user cares → this product works → this team can win → the ask is credible
```

Every slide should advance one belief. If a slide does not change what the audience believes, remove it.

## Deck principles

- One idea per slide.
- Slide title states the conclusion, not the topic.
- Proof over adjectives. "400ms settlement" beats "lightning fast."
- Show the product early. The audience should see it working by slide 5.
- Use consistent visual rhythm: title, one visual, one takeaway.
- Text must be readable when projected: 28pt minimum body, 40pt titles.
- Maximum 40 words per slide. If more is needed, split the slide.
- Crypto claims need proof: transaction, program ID, user quote, metric, benchmark, or integration.

## Audience decision model

Different audiences reward different proof.

| Audience | Main question | Best proof |
|---|---|---|
| Investor | Can this become a large business? | Market wedge, traction, team, distribution |
| Grant reviewer | Does this benefit the ecosystem? | Open-source deliverables, milestones, credible budget |
| Hackathon judge | Does it work and is it novel? | Live demo, transaction proof, technical clarity |
| Protocol partner | Does this increase usage safely? | Integration quality, risk controls, shared users |
| User community | Why should I care now? | Pain, demo, trust, simple call to action |

Design the deck for one primary audience. A generic deck satisfies none of them.

## Slide sequence

A strong crypto pitch deck usually follows this order:

1. **Title**: product name, category, one-line promise.
2. **Problem**: specific user pain, not a broad market trend.
3. **Current workaround**: what users do today and why it fails.
4. **Solution**: one sentence describing the product.
5. **Product demo**: screenshot or live flow with callouts.
6. **Why now**: infrastructure, regulation, market, or behavior shift.
7. **Why Solana**: concrete reason: speed, cost, composability, mobile, liquidity, or developer experience.
8. **Architecture**: program, client, protocols, data flow, max 5 nodes.
9. **Proof**: users, waitlist, transactions, tests, pilots, integrations.
10. **Market**: specific segment, not inflated TAM.
11. **Competition**: wedge against alternatives.
12. **Roadmap**: concrete milestones over 3-6 months.
13. **Ask**: money, grant, users, partner, or next step.

## Narrative structure

### Problem slide

Bad:

```text
DeFi UX is broken.
```

Good:

```text
DAO treasurers need 6 tools and 25 minutes to rebalance stablecoin yield safely.
```

The problem should name the user, workflow, cost, and frustration.

### Solution slide

Bad:

```text
An AI-powered decentralized treasury protocol.
```

Good:

```text
A transaction-safe treasury rebalancer that simulates yield moves, prepares multisig transactions, and records policy compliance on-chain.
```

The solution should be concrete enough that the audience can imagine using it.

### Why Solana slide

Do not say "fast and cheap" unless you connect it to the product.

Better:

- Low fees make small recurring rebalances economical.
- Fast confirmation keeps mobile payment UX tolerable.
- Account model makes per-user claim records cheap and verifiable.
- Composability lets the product route through existing liquidity and lending protocols.

## Visual directions by audience

### Investor deck

Clean, professional, metric-heavy. Conservative palette. Data charts with sources. Architecture diagram proves technical depth without overwhelming.

Best visuals:

- Market map
- Product screenshot
- Traction chart
- Competitive wedge
- Roadmap and ask

### Hackathon demo deck

High proof density: screenshots, transaction signatures, devnet program address, test output, architecture diagram.

Best visuals:

- Live product screenshot
- Explorer transaction with callouts
- Passing tests
- Architecture diagram
- Before/after workflow compression

### Grant deck

Emphasize ecosystem benefit, deliverables, public goods, maintenance plan, and budget.

Best visuals:

- Milestone table
- Budget table
- Open-source deliverables
- Ecosystem impact map
- Timeline

### Demo-day deck

5-7 slides maximum. Each slide must convey its point in 3 seconds.

1. Title + tagline
2. Problem + one proof point
3. Product screenshot
4. Demo flow
5. Proof metric or transaction
6. Team credibility
7. Ask

## Architecture slide

Show only components that explain the product:

```text
User → Frontend → Better Sol Program → Protocol X
                  ↓
               Indexer
```

Rules:

- Maximum 5 nodes.
- Label arrows with what flows through them.
- Show user on the left and chain on the right.
- Separate on-chain and off-chain visually.
- Do not show every package, file, RPC endpoint, or database table.

## Proof slides

### Transaction proof

Show:

- Transaction signature
- Explorer link
- Program ID
- Confirmation status
- Before/after account state
- What the transaction proves

### Test proof

Show:

- Passing test output
- Number of tests
- One meaningful security test name
- LiteSVM or CI context

### User proof

Show:

- User quote with role
- Pilot or waitlist count
- Repeated usage metric
- Retention, not only signups

### Market proof

Show:

- Specific segment
- Source attribution
- Comparable protocol or market behavior
- Why the segment is reachable by this team

## Visual system

### Typography

- Title: 40-56pt, bold.
- Body: 20-28pt, regular.
- Captions: 14-18pt, muted.
- Code and addresses: 16-20pt, monospace.

### Color

Dark backgrounds often work well for crypto demos:

- Background: `#0a0a0f` to `#12101a`
- Text: `#ffffff` to `#e4e4e7`
- Accent: one brand color
- Success/data: muted green
- Danger/risk: muted red

Light backgrounds work better for investor and grant decks when readability and professionalism matter more than atmosphere.

### Screenshots

- Use real product UI, not mockups unless clearly labeled.
- Crop to the relevant workflow.
- Add callouts to the exact action or proof.
- Blur private keys, emails, irrelevant wallet balances, and internal IDs.
- Use 2x resolution minimum.

## Common deck mistakes

- Leading with technology before pain.
- Saying "decentralized" without explaining user benefit.
- Showing architecture before product.
- Using fake traction.
- No clear ask.
- Text too small for projection.
- Too many screenshots without callouts.
- Overusing gradients, chains, coins, and vague AI visuals.
- Claiming security without tests, audits, or threat model.

## Asset checklist

- [ ] Logo or wordmark in SVG.
- [ ] Product screenshots at 2x resolution.
- [ ] Transaction signature with explorer link.
- [ ] Architecture diagram as SVG.
- [ ] Traction/proof numbers with sources.
- [ ] Team photos and relevant credentials.
- [ ] Roadmap milestones with dates.
- [ ] CTA or contact information on final slide.
- [ ] Backup appendix for technical questions.

## Review rubric

Score each slide 1-5:

| Dimension | Question |
|---|---|
| Clarity | Can the audience understand it in 3 seconds? |
| Proof | Does it show evidence or only claims? |
| Specificity | Does it name user, workflow, or metric? |
| Visual focus | Is there one dominant visual hierarchy? |
| Relevance | Does it move the audience toward the ask? |

Delete or rewrite any slide scoring below 3 in relevance or clarity.

## Related

- `submission-assets.md` for pitch, grant, and demo content structure.
- `pitch-and-video-craft.md` for product screenshot and proof visual treatment.
- `strategy.md` for positioning and competitive wedge.
- `marketing.md` for launch messaging.
