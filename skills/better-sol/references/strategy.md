# Strategy, Validation, and Landscape

Use this reference when validating a crypto product idea, mapping the competitive landscape, defining positioning, or deciding what to build next.

## Idea scoring rubric

Score each dimension 1-5. Total determines go/no-go.

### Problem clarity (weight: 3x)

1. No specific user or pain stated
2. Pain exists but affects a vague or unclear audience
3. Specific user with a real pain, but priority is uncertain
4. Clear user, clear pain, known priority
5. Urgent, expensive, or frequent pain for a specific user who is actively seeking solutions

### Solana necessity (weight: 3x)

1. No on-chain state, no composability need, no trust requirement
2. Blockchain adds novelty but not necessity
3. On-chain state or composability provides real benefit
4. Core value depends on trust-minimization, censorship resistance, or composability
5. Product cannot exist without Solana's properties (speed, cost, finality, or state model)

### Technical feasibility (weight: 2x)

1. Requires unproven primitives or major protocol changes
2. Complex but possible with existing tools
3. Straightforward with Better Sol and existing protocols
4. Well-understood patterns, audited protocols available
5. Can ship an MVP in a weekend

### Distribution (weight: 2x)

1. No clear channel to reach target users
2. Organic discovery possible but slow
3. Existing community, grant program, or integration channel
4. Built-in distribution through protocol integration or marketplace
5. Users are actively looking for this solution

### Differentiation (weight: 2x)

1. Identical to existing solutions
2. Incremental improvement on existing solutions
3. Different UX, audience, or integration angle
4. Novel combination of primitives or novel audience
5. No direct competitor; category is new or underserved

### Scoring guide

| Total (max 55) | Decision |
|---|---|
| 40-55 | Build. Strong signal across all dimensions. |
| 30-39 | Build with caution. Validate the weakest dimension first. |
| 20-29 | Pivot or refine. At least one critical dimension is weak. |
| < 20 | Do not build. Fundamentally misaligned. |

## Validation sprint

Run this sequence before committing to build:

### Day 1: Problem interview

Talk to 5 potential users. Ask:

- What is the last time you dealt with [problem area]?
- What did you do?
- What was frustrating about it?
- How much time or money does this cost you?
- Have you looked for a solution? What did you find?

Record whether the pain is real, frequent, and expensive. If 3 out of 5 people describe the same pain in their own words, you have signal.

### Day 2: Competitive map

Search for existing solutions:

- GitHub repositories with similar functionality
- DeFiLlama protocols in the same category
- Product mentions on Twitter/X, Discord, and forums
- Grant recipients building similar things

For each competitor, note: what they do, what they miss, who they serve, their tech stack, and their traction.

### Day 3: Technical spike

Build the riskiest or most uncertain part of the product:

- Can the Better Sol program express the required state and invariants?
- Can the typed client handle the transaction flows?
- Do the target protocols have usable SDKs and docs?
- Are there compute budget or account size constraints?

Time-box to 4 hours. If the spike fails, the idea needs rethinking.

### Day 4: Minimum credible evidence

Collect one piece of evidence per dimension:

- Problem: a user quote or support thread proving the pain
- Solana necessity: a specific on-chain state or composability requirement
- Feasibility: a working spike or passing test
- Distribution: a channel where target users congregate
- Differentiation: a gap in the competitive map

### Day 5: Decision

Review all evidence. If every dimension has at least weak evidence, proceed. If any dimension has no evidence, either run another validation cycle or pivot.

## Positioning

### Positioning template

Fill in every field. Ambiguity here means the product will feel generic.

```
Product: [name]
Category: [DeFi, infra, consumer, tooling, NFT, DAO, data, bridge, wallet, other]
User: [specific person, not "everyone"]
Pain: [specific cost in time, money, or risk]
Approach: [how the product solves it, in one sentence]
Proof: [working demo, test, transaction, metric, or user quote]
Wedge: [why this wins over existing solutions, in one sentence]
```

### Positioning mistakes

- "For everyone who uses Solana." Too broad. Pick one user.
- "We are the [Uber/Airbnb/Stripe] of crypto." The analogy is not positioning.
- "Decentralized [existing product]." Decentralization is a mechanism, not a user benefit.
- "AI-powered [product]." Unless AI is the core differentiator, it is a buzzword.
- "The first [category] on [chain]." First does not mean best or needed.

## Competitive landscape mapping

### Map structure

Create a grid with these axes:

- **X-axis**: degree of decentralization (custodial to fully on-chain)
- **Y-axis**: target user sophistication (beginner to expert)

Place each competitor on the grid. Identify clusters (crowded areas) and gaps (empty areas worth exploring).

### Per-competitor profile

For each competitor, collect:

- Product name and URL
- One-line description
- Target user
- On-chain vs off-chain components
- Solana integration depth (native, bridged, multi-chain)
- TVL, users, or other traction metric
- SDK/API maturity
- Recent incidents or exploits
- Funding and team credibility
- GitHub activity (last commit, open issues, PR merge rate)

### Gap patterns

Look for:

- **Underserved user**: a user type with a pain but no good solution
- **Missing primitive**: a building block that would enable multiple products
- **Poor UX wrapper**: an existing protocol with a bad interface that could be wrapped
- **Composability gap**: two protocols that should connect but do not
- **Chain-specific hole**: a product that exists on Ethereum but not Solana (or vice versa)

## Better Sol positioning angles

When the product uses Better Sol, these are legitimate differentiation points:

- TypeScript program definitions lower the barrier for web developers
- The typed client eliminates IDL drift and codegen maintenance
- LiteSVM tests run without a local validator
- One definition drives both deployment and runtime
- Faster iteration cycle from idea to deployed program

Only use these when they are relevant to the audience. Developers care about DX; investors care about speed and risk.

## Decision records

For every major decision (build vs integrate, feature priority, target chain), write a one-paragraph record:

```
Decision: [what was decided]
Context: [what situation prompted the decision]
Options considered: [A, B, C]
Rationale: [why this option was chosen]
Risk: [what could go wrong]
```

This creates a traceable history that future sessions can reference.

## Related

- `evaluation-frameworks.md` for structured scoring methods.
- `idea-bank.md` for curated starting points.
- `defillama-research.md` for DeFi-specific opportunity research.
- `go-to-market.md` for translating positioning into launch strategy.
