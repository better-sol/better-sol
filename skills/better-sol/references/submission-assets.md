# Pitch, Grant, and Hackathon Assets

Use this reference when preparing pitch decks, grant applications, hackathon submissions, demo videos, or any document that presents a crypto product to an external audience.

## Pitch deck

### Slide sequence

A strong crypto pitch deck uses this order:

1. **Title**: product name, tagline, category. One line each.
2. **Problem**: specific user pain. Use a concrete scenario, not a general statement. "Alice runs a DAO treasury and spends 3 hours per week manually rebalancing across 4 protocols" beats "Treasury management is hard."
3. **Existing workaround**: what people do today and why it fails. Name specific tools or protocols they use.
4. **Solution**: what the product does, in one sentence. Follow with a visual (screenshot, flow diagram, or architecture).
5. **Product demo**: show the product working. Screenshots with callouts, not slides about the product.
6. **Why now**: market timing. New infrastructure, regulation change, user behavior shift, or protocol maturity that makes this possible now.
7. **Why Solana**: speed, cost, composability, mobile, payments, or developer ecosystem. Must be specific to the product, not generic Solana benefits.
8. **Architecture**: program, client, protocols, data flows. Show only what matters for understanding the product, not every file and package.
9. **Traction or validation**: users, waitlist, pilots, transactions, tests, integrations. Any real signal.
10. **Market**: user segment size, growth rate, or comparable product metrics. Cite sources.
11. **Competition**: positioned on a 2x2 grid or a feature comparison table. Show your wedge.
12. **Roadmap**: 3-5 milestones over 3-6 months. Each milestone has a concrete deliverable.
13. **Ask**: what you need and what it funds. Be specific: "$50K for 3 months of development to ship mainnet with audit."

### Slide craft rules

- One idea per slide. The slide title should state the conclusion, not the topic.
- Proof over adjectives. "400ms settlement" beats "lightning fast."
- Show the product early. The audience should see it working by slide 5.
- Use consistent visual rhythm: title, one visual, one takeaway.
- Text must be readable when projected (28pt minimum for body, 40pt for titles).
- No walls of text. Maximum 40 words per slide.

### Architecture slide

Show only the components that matter for understanding the product:

```
User Wallet → Frontend (Better Sol typed client) → [Your Program] → Protocol X
                                            ↓
                                      Indexer/Backend
```

Do not draw every file, package, and API endpoint.

### Better Sol proof points

Use when true:

- TypeScript program definition is the source of truth (no separate IDL)
- Same definition drives typed client calls (no codegen drift)
- LiteSVM tests run without a local validator
- Deploy flow reaches devnet/mainnet from CLI
- Working demo includes an on-chain state transition visible on explorer

## Hackathon submission

### Required fields

Most hackathons require:

- **Project name and tagline**: name + one-line description
- **Short description**: 2-3 sentences for the card/list view
- **Long description**: full pitch, 3-5 paragraphs. Cover problem, solution, how it works, what is on-chain, and why it matters.
- **Track/category**: select the most specific track that fits
- **Technical explanation**: how the program works, account structure, instruction flow, protocol integrations
- **What is on-chain**: list every program, account, and instruction that runs on Solana
- **Deployed URL**: live demo link (devnet or mainnet)
- **Repository**: public GitHub link with clean README
- **Demo video**: 2-3 minute walkthrough (see demo script below)
- **Devnet/mainnet addresses**: program IDs for judges to verify
- **Setup instructions**: how to run the project locally
- **Team**: members, roles, and relevant experience

### Demo script template

```
0:00 Hook: state the pain in one sentence
      "DAO treasuries lose yield because rebalancing is manual and error-prone."

0:15 Product: show what it does
      "Treasury Manager auto-rebalances across lending protocols based on risk thresholds."

0:35 Live flow: demonstrate the core action
      [Screen recording: connect wallet, set thresholds, execute rebalance]

1:20 On-chain proof: show the transaction
      [Show Solana Explorer with transaction signature, account state before/after]

1:45 Technical edge: explain the architecture
      "Built with Better Sol. One TypeScript definition drives both the on-chain program
       and the typed client. No IDL drift."

2:10 Impact: why it matters
      "Saves 3+ hours per week per DAO. Currently managing $X across Y test DAOs on devnet."

2:30 Close: what is next
      "Shipping mainnet with audit next month. Seeking pilot DAOs."
      [Show CTA: URL, QR code, contact]
```

### Demo production tips

- Record with a clean browser profile (no extensions, no bookmarks bar)
- Use devnet with funded wallets ready before recording
- Do a dry run before the final take
- Keep the recording under 3 minutes. Judges stop watching after 3 minutes.
- Show the explorer link for every on-chain action
- Narrate what you are doing; do not type silently
- If a transaction fails during recording, show the error and recovery, not a polished edit

## Grant draft structure

### Required sections

1. **Project summary**: name, one-line description, category, team
2. **Ecosystem benefit**: how this helps Solana developers or users. Must be specific, not "enriches the ecosystem."
3. **Current progress**: what is already built. Include links to repo, demo, and deployed programs.
4. **Deliverables**: concrete outputs. "Ship a working vault program with typed client, tests, and devnet deployment" not "improve DeFi UX."
5. **Milestones**: timeline with dates. Each milestone has deliverables, acceptance criteria, and verification method.
6. **Budget**: itemized. Engineering time, design, audit, infrastructure, documentation.
7. **Timeline**: realistic dates with dependencies noted.
8. **Risks**: what could block completion and how you will mitigate.
9. **Proof links**: repo, demo, transaction signatures, test output, deployed program addresses.

### Milestone quality bar

Weak: "Improve UX."

Strong: "Ship wallet transaction preview for deposit/withdraw flows with devnet smoke tests, screenshots in the README, and a 2-minute demo video by March 15."

Every milestone must have:

- Concrete deliverable (what will exist)
- Acceptance criteria (how to verify it works)
- Verification method (who checks and how)
- Estimated completion date
- Dependencies or risks

### Budget guidance

Tie budget to outputs, not time:

- Engineering: X weeks at market rate for Y deliverable
- Design: Z hours for specific assets (brand system, component library, demo video)
- Audit: named auditor with quote if possible
- Infrastructure: RPC, indexer, hosting costs per month
- Documentation: specific docs to write (API reference, integration guide, setup tutorial)

Avoid vague budget categories like "operations" or "miscellaneous" unless explained with line items.

### Common weak answers

- "We will onboard the next billion users" without a specific first user
- No measurable deliverables
- No maintenance plan after the grant period
- No proof the team can build it (no prior work, no repo, no demo)
- Mainnet promises without an audit or security plan
- Grant asks for discovery work only, with no concrete output

## Evidence checklist

Before any submission, confirm:

- [ ] Repository is public with clean README
- [ ] Demo is live and accessible (not localhost)
- [ ] Screenshots show the product, not slides about the product
- [ ] Transaction signatures are real and verifiable on explorer
- [ ] Devnet or mainnet program addresses are included
- [ ] Tests pass and are documented in the README
- [ ] Setup instructions work from a clean clone
- [ ] Team members and roles are listed
- [ ] Every claim has evidence or is softened to match the evidence

## Related

- `pitch-deck-design.md` for visual deck structure and slide design.
- `pitch-and-video-craft.md` for demo video frame composition and proof visuals.
- `grant-application.md` for grant-specific reviewer expectations.
- `marketing.md` for launch messaging and video formats.
