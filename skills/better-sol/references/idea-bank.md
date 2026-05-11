# Idea Bank

Use this reference when the user asks what to build, wants idea generation, or needs a sharper crypto product direction.

Treat every idea as a hypothesis. The purpose of an idea bank is not to pick something that sounds cool. It is to generate options, score them, and force validation before building.

## Research tools

- DefiLlama API (`https://api.llama.fi/protocols`) for protocol TVL, chain growth, fees, and categories.
- CoinGecko API (`https://api.coingecko.com/api/v3`) for token price and market data.
- GitHub search for existing tools, SDKs, and abandoned attempts.
- X/Twitter, Discord, governance forums, and protocol docs for user pain signals.
- Better Sol examples and references for implementation feasibility.

## Idea generation process

### Step 1: Choose a user wedge

Start from a user, not a technology.

| User | Typical pain |
|---|---|
| Solana developer | Boilerplate, testing, client drift, deployment mistakes |
| DeFi trader | Risk, routing, liquidation, slippage, fragmented positions |
| DAO operator | Treasury controls, voter apathy, proposal quality |
| Consumer user | Wallet friction, confusing signatures, scams |
| Protocol team | Integrations, analytics, incentives, monitoring |
| Mobile user | Signing interruptions, wallet switching, poor recovery |

If you cannot name the user, the idea is probably too vague.

### Step 2: Identify a painful workflow

Good crypto products usually compress a workflow:

```text
Before: user does 5 steps across 3 products with high risk
After: user does 1 reviewed action with clear state and recovery
```

Look for workflows with:

- Repeated manual work
- High transaction failure rate
- Poor visibility into risk
- Fragmented protocol state
- Strong need for verifiable records
- Expensive mistakes users already fear

### Step 3: Decide why on-chain is necessary

Use on-chain state only when it adds one of these:

| On-chain reason | Example |
|---|---|
| Custody | Escrow, vault, treasury, claim contract |
| Permission | Allowlist, token gate, human verification |
| Settlement | Atomic payment, swap, liquidation |
| Verifiability | Public rewards, claims, receipts, attestations |
| Composability | Other programs need to read or call it |

If the product is only a dashboard, do not force a custom program. Use an indexer and typed client.

## Idea scoring rubric

Score 1-5 in each category:

| Category | 1 | 5 |
|---|---|---|
| Problem clarity | Vague trend | Specific painful workflow |
| User access | No channel | Direct access to target users |
| Solana necessity | Could be normal SaaS | Needs low-cost, fast, composable settlement |
| Technical feasibility | Requires unsolved research | Buildable in weeks |
| Distribution wedge | No route to users | Built-in channel or partner |
| Defensibility | Easy clone | Data, integrations, trust, or network effects |
| Risk control | Can lose funds easily | Risk isolated and explainable |

Scores:

- **30+**: strong candidate. Build a prototype.
- **22-29**: validate weak dimension before building.
- **Below 22**: keep as inspiration, do not commit yet.

## Better Sol-native ideas

### Typed program template marketplace

A gallery of audited, tested Better Sol templates: escrow, rewards, claims, token gates, attestations, vault records, and payment links.

Why it works:

- Clear user: TypeScript developers building Solana programs.
- Clear pain: starting from blank files and unsafe examples.
- Better Sol advantage: one program definition powers accounts, instructions, errors, events, client, and tests.

Validation actions:

- Interview 10 TypeScript developers new to Solana.
- Ask them to build a claim contract from current docs.
- Measure time-to-first-test and where they get stuck.
- Offer three templates and track which they choose.

### Program-to-client drift detector

CI tool that checks a deployed program interface against the client definition and flags account or instruction drift.

Why it works:

- Drift bugs are common and painful.
- The buyer is a serious team with production risk.
- Strong distribution through GitHub Actions and CLI.

Validation actions:

- Search GitHub issues for Solana deserialization or IDL mismatch bugs.
- Ask teams if they have broken production clients after program upgrades.
- Build a CLI prototype that checks one program and one account.

### Typed security test generator

Given a Better Sol program definition, generate LiteSVM tests for authority checks, account substitution, duplicate claims, and numeric boundaries.

Why it works:

- Security testing is valuable and often skipped.
- Better Sol definitions expose instruction and account schemas.
- Output is concrete code, not a vague report.

Validation actions:

- Generate tests for `counter`, `token-rewards`, and `airdrop-claim` examples.
- Measure how many generated tests catch intentionally inserted bugs.
- Ask auditors which generated tests are useful versus noise.

## DeFi ideas

### Risk-aware deposit router

A safer deposit flow across lending and vault protocols. Shows health factor, oracle age, withdrawal liquidity, and worst-case liquidation price before signing.

Build shape:

- No custom custody at first.
- Indexer and client integrations for protocols.
- Optional Better Sol program later for user risk preferences and alerts.

Risk: protocol SDK changes and data accuracy. Keep action buttons disabled when data is stale.

### Treasury rebalancing assistant

DAO treasury tool that proposes stablecoin, SOL, and yield allocation changes, then creates multisig-ready transactions.

Build shape:

- Off-chain analytics for recommendations.
- Better Sol program only if treasury policy needs on-chain attestations or spending limits.

Risk: bad recommendations can lose funds. Start as read-only with human approval.

### Rewards layer for protocol campaigns

Better Sol program tracks eligible activity and distributes rewards based on verified protocol positions.

Build shape:

- App-owned `RewardPosition` account.
- External protocol position verification.
- Claim record to prevent double claims.

Risk: fake activity and sybil farming. Use humanity and anti-abuse scoring.

## Consumer ideas

### On-chain receipt and warranty system

Products are registered as NFTs or compressed NFTs. Warranty validity is verifiable and transferable with ownership.

Good for: high-value physical goods, collectibles, event equipment, warranties.

Risk: off-chain truth. The hardest part is merchant adoption and fraud resolution, not minting.

### Event ticketing with compressed NFTs

Compressed NFTs as tickets with wallet-based ownership, QR display, and anti-scalping rules.

Good for: crypto events, gated communities, small venues.

Risk: venue operations. The scanner and refund flow matter more than the mint.

### Group payments and revenue splits

A program where a group creates a payment pool and splits funds by predefined ratios.

Good for: creators, hackathon teams, small DAOs, event organizers.

Risk: disputes. Add clear withdrawal rules and immutable split terms.

## Infrastructure ideas

### Transaction simulator API

API that accepts a transaction, simulates it, decodes account changes, and returns human-readable risk summary.

Good for: wallets, dApps, security tools.

Risk: decoding coverage. Start with Better Sol programs and SPL Token before expanding.

### Program event webhook service

Reliable webhook delivery for Better Sol program events with retries, idempotency keys, and typed payloads.

Good for: app backends that need off-chain reactions to on-chain events.

Risk: competing with Helius/Triton. Win by being Better Sol-native and simpler.

### Multi-program account explorer

Developer tool that decodes any known program account and shows state, discriminator, owner, and recent changes.

Good for: debugging, audits, education.

Risk: broad protocol coverage. Start with Better Sol definitions and imported IDLs.

## Anti-ideas

Avoid these unless you have an unusual wedge:

- Another generic NFT marketplace without supply or demand.
- Another wallet with no clear custody, recovery, or distribution advantage.
- A token launch where the token has no necessary role.
- A DeFi protocol that only copies an existing primitive with incentives.
- A social app where on-chain state adds cost but no user benefit.
- A bridge, unless the team has deep security expertise and a serious reason to build one.

## Validation sprint

Run this before building for more than a few days:

1. Write the one-sentence user pain.
2. Identify 10 target users.
3. Ask how they solve it today.
4. Ask what happens if they do nothing.
5. Prototype only the riskiest workflow.
6. Measure time-to-value.
7. Ask for a commitment: waitlist, pilot, integration, or payment.

A good idea earns pull from users. A weak idea requires constant explanation.

## Related

- `strategy.md` for validation and positioning.
- `evaluation-frameworks.md` for structured scoring.
- `defillama-research.md` for DeFi opportunity research.
- `wallet-connection.md` for onboarding-sensitive consumer product decisions.
