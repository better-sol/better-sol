# Go-to-Market for Crypto Products

Use this reference when planning launch strategy, distribution channels, community building, and growth for a crypto product.

## Launch phases

### Phase 1: Pre-launch (weeks 1-8)

Build the foundation before the product is public:

- Define the core user and their specific pain. Write a one-sentence value proposition that a non-crypto person could understand.
- Build a waitlist or early access list. Collect emails or wallet addresses.
- Create technical documentation and setup guides that work on first try. A developer should be able to go from zero to working in under 15 minutes.
- Establish presence on relevant platforms: Twitter/X for announcements, Discord for community, GitHub for code.
- Ship to devnet with a working demo. The demo should be shareable via a single URL.
- Gather early feedback from 5 to 20 real users. Not friends, not investors. Actual target users.
- Document all feedback. Categorize into: bugs, UX friction, missing features, nice-to-haves.

### Phase 2: Launch (week 8-10)

The launch window is short. Have everything ready before announcing:

- Deploy to mainnet with monitoring in place (error tracking, balance alerts, uptime checks).
- Publish announcement with proof: real transaction link, working demo URL, deployed program address. Claims without links are ignored.
- Engage communities where target users are active. Post where they already are, do not expect them to find you.
- Submit to relevant directories, aggregators, and protocol integration lists. DefiLlama, CoinGecko, Solana ecosystem directories.
- Line up initial content: blog post explaining the product, technical walkthrough of the architecture, social thread with the story.
- Have a support channel ready. Response time in the first 48 hours sets the tone.

### Phase 3: Post-launch (weeks 10+)

Launch day is the start, not the finish:

- Monitor for failures, errors, and user confusion. Set up alerts for failed transactions, program errors, and unusual patterns.
- Respond to feedback publicly and ship fixes quickly. Visible responsiveness builds trust.
- Track key metrics: active wallets, transactions, retention. Set up a simple dashboard on day one.
- Iterate based on real usage data, not assumptions. Users will use the product differently than expected.
- Plan the next feature based on the most-requested user need, not the most interesting technical challenge.

## Distribution channels

### Developer adoption

Developers adopt tools that save them time and reduce risk:

- **Documentation**: must work on first try. Every code example should be copy-paste-runnable. Test all examples in CI.
- **GitHub presence**: clear README, contribution guidelines, responsive issue handling. Stars matter for visibility.
- **Integration guides**: write guides for popular frameworks (Next.js, React, Vite). Show exactly where the tool fits in an existing stack.
- **Developer grants and bounties**: fund external developers to build on the tool. Creates examples and advocacy.
- **Conference presence**: talks, workshops, and hackathons. In-person trust compounds over time.
- **Package ecosystems**: publish to npm with clear package names, TypeScript types, and semantic versioning.

### User adoption

Users adopt products that solve a problem they have:

- **Product-led growth**: the product sells itself through usage. New users come from existing users sharing it.
- **Content marketing**: tutorials, comparisons, and use case guides. SEO-optimized content targets specific search queries.
- **Community building**: Discord for real-time support, Twitter/X for announcements, Telegram for regional communities.
- **Referral programs**: genuine incentives for referring new users. The reward should be proportional to the value of the referred user.
- **Integrations**: partner with existing products that serve the same users. Be the better option for a specific workflow.
- **Press coverage**: announce milestones (launch, funding, major feature) to crypto media outlets.

### Protocol integrations

Building on established protocols provides distribution through their ecosystems:

- List on protocol dashboards, governance forums, and integration pages.
- Co-market with integration partners. Joint announcements reach both audiences.
- Contribute to protocol governance discussions. Visibility among protocol stakeholders creates awareness.
- Build integration guides that show how the product enhances the protocol's capabilities.

## Community building

### Principles

Community forms around shared interest and consistent value delivery, not around a token or marketing budget:

- **Consistency matters more than intensity**. Regular small updates beat sporadic big announcements.
- **Transparency builds trust**. Share progress, setbacks, and decisions openly.
- **Empower contributors**. Clear contribution guidelines and recognition create a virtuous cycle.
- **Quality over quantity**. 100 engaged users who provide feedback and advocate are worth more than 10,000 airdrop farmers.
- **Be present where the community is**. Do not force people to a new platform.

### Platforms and their roles

| Platform | Role | Content type |
|---|---|---|
| Discord | Real-time discussion, support, contributor coordination | Questions, feedback, feature requests |
| Twitter/X | Announcements, thought leadership, ecosystem engagement | Threads, demos, metrics, hot takes |
| GitHub | Code, issues, contributions, technical credibility | Code, docs, issue responses |
| Blog | Long-form content, technical deep dives, vision | Tutorials, architecture posts, retrospectives |
| Farcaster/Threads | Emerging crypto-native social | Short-form, community engagement |

### Contribution models

- **Open-source contributions**: clear CONTRIBUTING.md, responsive reviews, and recognition in release notes.
- **Bounty programs**: fund specific tasks (documentation, integration, testing) with clear scope and payment terms.
- **Grant programs**: fund ecosystem development. Define focus areas and evaluation criteria.
- **Ambassador programs**: empower community leaders to represent the project in their regions or communities.

## Growth metrics

### Technical metrics

| Metric | How to measure | Healthy range |
|---|---|---|
| Transactions/day | RPC getSignaturesForAddress | Depends on product type |
| Active wallets/month | Unique signers | Growing month over month |
| Program uptime | RPC health check | >99.9% |
| Failed transaction rate | Simulate before send | <2% |
| Avg transaction cost | Compute units used | Consistent, not spiking |

### Product metrics

| Metric | How to measure | Target |
|---|---|---|
| DAU/MAU ratio | Unique wallets per day / month | >20% (good retention) |
| Day-1 retention | Returned next day | >30% |
| Day-7 retention | Returned within 7 days | >10% |
| Time to first action | From connect to first tx | <2 minutes |
| Support ticket volume | Issues per 100 users | Decreasing trend |

### Financial metrics

| Metric | How to measure | Target |
|---|---|---|
| TVL or total transacted | On-chain data | Growing |
| Protocol revenue | Fees collected | Covering costs within 6 months |
| Token liquidity | DEX depth | Sufficient for user needs |
| CAC | Spend / new users | Decreasing over time |

## Positioning for different audiences

### Developers

Lead with technical architecture, developer experience, and code quality. Show working examples and tests. Emphasize type safety, speed of iteration, and maintainability. A developer should see the README and think "this looks well-built."

### End users

Lead with the problem solved and the experience of using the product. Avoid jargon. Show the product working, not the technology behind it. A user should see the landing page and think "this solves my problem."

### Investors and grant reviewers

Lead with market opportunity, team capability, and proof of progress. Show traction, validation, and a credible plan. Numbers and evidence over promises and projections.

### Judges at hackathons

Lead with working demo, on-chain proof, and clear differentiation. Show the product running in real time. A judge should see the demo and think "this actually works and it is novel."

## Common launch mistakes

- Launching with marketing before the product works reliably. Marketing amplifies whatever exists. If the product breaks, marketing amplifies the breakage.
- Targeting everyone instead of a specific user segment. "Anyone who uses crypto" is not a target user.
- Relying on a token launch to generate product interest. Tokens attract speculators, not users.
- Ignoring post-launch monitoring and support. The first 48 hours determine whether early adopters stay or leave.
- Overpromising features that are not built. Trust is hard to rebuild after overpromising.
- Focusing on vanity metrics (followers, airdrop signups) instead of usage metrics (active wallets, transactions).
- Launching on mainnet without devnet testing and security review. One exploit can destroy all trust.
- Not having a plan for what happens after launch day. The product needs sustained development, not a single announcement.

## Related

- `strategy.md` for positioning and competitive landscape.
- `tokenomics.md` for token launch strategies and emission schedules.
- `marketing.md` for launch messaging and content formats.
- `grant-application.md` for funding applications.
