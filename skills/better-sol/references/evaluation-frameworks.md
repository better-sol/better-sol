# Evaluation Frameworks

Use this reference when prioritizing ideas, scoring product opportunities, making build-vs-integrate decisions, or evaluating whether a crypto product is ready for launch.

## Why scoring exists

Opinions about product quality are unreliable. A structured scoring framework forces explicit criteria, makes tradeoffs visible, and creates a record that can be reviewed and challenged.

Use these frameworks when:

- Comparing multiple product ideas to pick one
- Deciding whether to build a custom program or integrate an existing protocol
- Evaluating launch readiness before mainnet deployment
- Reviewing a product for investment, grant, or hackathon judging

## Idea scoring framework

### Dimensions and weights

| Dimension | Weight | What it measures |
|---|---|---|
| Problem clarity | 3x | Is the user pain specific, urgent, and verifiable? |
| Solana necessity | 3x | Does the product require Solana's properties, or is blockchain optional? |
| Technical feasibility | 2x | Can this be built with existing tools in a reasonable timeframe? |
| Distribution reach | 2x | Is there a clear channel to reach the target user? |
| Competitive wedge | 2x | Does the product have a defensible advantage over alternatives? |
| Team fit | 1x | Does the team have relevant experience and capacity? |
| Revenue potential | 1x | Is there a viable business model with realistic monetization? |

Each dimension scores 1-5. Multiply by weight. Maximum total: 70.

### Score interpretation

| Score | Decision |
|---|---|
| 50-70 | Strong signal. Proceed to build. |
| 35-49 | Moderate signal. Validate weakest dimensions before committing. |
| 20-34 | Weak signal. Major pivots needed. |
| < 20 | No signal. Do not build. |

### Dimension detail

**Problem clarity (3x)**
- 1: No specific user or pain identified
- 3: Specific user with a stated pain, but priority unclear
- 5: Urgent, frequent pain for a named user type, verified through interviews or data

**Solana necessity (3x)**
- 1: No on-chain state, no composability, no trust requirement
- 3: On-chain state adds benefit but is not strictly necessary
- 5: Product cannot exist without Solana's speed, cost, composability, or state model

**Technical feasibility (2x)**
- 1: Requires unproven primitives or protocol changes
- 3: Straightforward with Better Sol and existing protocols
- 5: Can ship an MVP in a weekend

**Distribution reach (2x)**
- 1: No clear channel to reach target users
- 3: Existing community or integration channel
- 5: Users are actively searching for this solution

**Competitive wedge (2x)**
- 1: Identical to existing solutions
- 3: Different UX, audience, or integration angle
- 5: No direct competitor; category is new or underserved

## Build vs integrate framework

### Decision matrix

| Condition | Decision |
|---|---|
| Product needs custom custody, settlement, or state transitions | Build a Better Sol program |
| Product wraps an existing protocol with better UX or automation | Integrate the protocol |
| Product needs both custom state and existing protocol features | Hybrid: Better Sol program + protocol CPI |
| Product only displays data from on-chain sources | Read-only client, no program needed |
| Product routes transactions across multiple protocols | Integration with routing logic |

### Build signal checklist

Build a custom program when:

- [ ] The product needs custom on-chain state that no existing protocol provides
- [ ] The product needs custom authorization logic (roles, permissions, time locks)
- [ ] The product needs to atomically compose multiple protocol interactions
- [ ] The product needs verifiable attestations, claims, or records
- [ ] The product needs custom token mechanics (vesting, rewards, distributions)

### Integrate signal checklist

Integrate existing protocols when:

- [ ] The product's core action is already handled by a trusted protocol
- [ ] The product's differentiation is UX, routing, automation, or analytics
- [ ] The product does not need custom custody or settlement
- [ ] The target protocol has a maintained SDK and clear integration docs
- [ ] The product benefits from the protocol's existing liquidity and security audits

## Launch readiness framework

### Minimum requirements for devnet

- [ ] Core program compiles and deploys without errors
- [ ] All instruction handlers have LiteSVM tests
- [ ] Typed client works for all operations
- [ ] Error handling returns named errors
- [ ] README with setup instructions

### Minimum requirements for mainnet

- [ ] All devnet requirements met
- [ ] Security review completed (see `security-checklist.md`)
- [ ] All Critical and High findings resolved and regression tests passing
- [ ] Program upgrade authority set to multisig
- [ ] Monitoring and alerting configured
- [ ] Incident response plan documented
- [ ] Load tested under expected transaction volume
- [ ] RPC provider redundancy (not dependent on a single endpoint)

### Quality gates

| Gate | Criteria | Who verifies |
|---|---|---|
| Code complete | All features implemented and passing tests | Developer |
| Security review | No Critical or High findings unresolved | Security reviewer |
| UX review | Core flow works end-to-end, error states handled | Product reviewer |
| Infrastructure | Monitoring, alerting, and incident response in place | DevOps |
| Final approval | All gates passed, team sign-off | Team lead |

## Evidence ladder

Not all evidence is equal. Use this hierarchy to evaluate the strength of claims:

| Level | Evidence | Strength |
|---|---|---|
| 6 | Live mainnet product with verified users and transactions | Strongest |
| 5 | Live devnet product with working demo and test transactions | Strong |
| 4 | Working prototype with passing tests and type-safe client | Moderate |
| 3 | Technical spike proving the riskiest component works | Moderate |
| 2 | Competitive analysis showing a gap in the market | Weak |
| 1 | User interviews confirming the pain exists | Weakest (necessary but not sufficient) |

A product at level 4 or above has enough evidence to justify building. Below level 3, invest in validation before implementation.

## Decision record template

For every major decision, write:

```
Date: YYYY-MM-DD
Decision: [what was decided]
Context: [what prompted the decision]
Options: [A, B, C]
Rationale: [why this option]
Risks: [what could go wrong]
Reversibility: [easy / hard / impossible to reverse]
```

Store decision records in the project repository or a shared document. Future sessions should read existing records before revisiting decisions.

## Related

- `strategy.md` for the idea scoring rubric and validation sprint.
- `idea-bank.md` for curated product starting points.
- `defillama-research.md` for DeFi-specific market evidence.
- `security-checklist.md` for the launch readiness security gate.
- `product-review.md` for product quality evaluation.
