# Grant Application

Use this reference when applying for Solana ecosystem grants, Superteam grants, developer tooling grants, or hackathon prize tracks.

## Reviewer mindset

Grant reviewers evaluate hundreds of applications. They want to know:

1. **What will exist after the grant?** Not a vision, a concrete deliverable.
2. **Why does the ecosystem need it?** Who benefits and how.
3. **Why is this team likely to deliver?** Proof of ability, not promises.
4. **How will progress be verified?** Measurable milestones with acceptance criteria.
5. **Is the budget proportional?** Reasonable costs for the stated deliverables.
6. **What risks could block completion?** Honest assessment, not blind optimism.

## Required information

Collect these facts before writing the application:

| Field | What to include |
|---|---|
| Grant program name | Full name and URL |
| Deadline | Submission cutoff date |
| Eligibility | Requirements (location, team size, prior funding) |
| Project name | Short, memorable |
| One-line summary | What the product does, for whom, and why it matters |
| Current status | Repo link, demo URL, deployed program addresses |
| Team | Members, roles, relevant experience, GitHub profiles |
| What is already built | Specific features, tests, deployments |
| Requested amount | In USD or equivalent |
| Milestones | 3-5 with dates, deliverables, and payment percentages |
| Budget breakdown | Engineering, design, audit, infrastructure, documentation |

## Strong grant angles for Better Sol projects

Use only when true:

- Lowers Solana onboarding friction for TypeScript developers who are not Rust experts
- Produces reusable examples, templates, or libraries that other developers can use
- Demonstrates typed Solana program/client development as a new pattern
- Adds tests, documentation, or tooling that improves the developer ecosystem
- Integrates with existing Solana protocols in a safer or more maintainable way
- Enables a new category of developer (frontend, backend) to build on Solana

## Milestone quality

### Weak milestone

"Improve UX and add more features."

Problems: no specific deliverable, no acceptance criteria, no way to verify completion.

### Strong milestone

"Ship a wallet transaction preview for deposit/withdraw flows with devnet smoke tests, screenshots in the README, and a 2-minute demo video by March 15."

Every milestone must include:

- **Concrete deliverable**: what will exist (code, docs, demo, deployment)
- **Acceptance criteria**: how to verify it works (tests pass, demo live, docs published)
- **Verification method**: who checks and how (code review, live demo, test run)
- **Estimated completion date**: realistic timeline
- **Payment percentage**: what portion of the total grant this milestone unlocks
- **Dependencies or risks**: what could block this milestone

## Budget guidance

Tie budget to outputs, not time:

| Category | What to include | What to avoid |
|---|---|---|
| Engineering | X weeks for Y deliverable at Z rate | "Development" without specifying what |
| Design | Specific assets: brand system, component library, demo video | "Design" without deliverables |
| Audit | Named auditor with scope and estimated cost | "Security" without specifics |
| Infrastructure | RPC, indexer, hosting costs per month for N months | "Operations" without breakdown |
| Documentation | Specific docs: API reference, integration guide, tutorials | "Documentation" without listing what |
| Demo production | Video duration, format, platform cuts | "Marketing" without deliverables |

## Writing the application

### Problem statement

Start with a specific user and a specific pain:

Weak: "DeFi on Solana lacks good tools."

Strong: "TypeScript developers building DeFi dashboards spend 3+ days writing manual account decoders and transaction builders for each protocol they integrate. There is no typed client that works across protocols without code generation."

### Solution

Describe what will exist after the grant, not what you hope to achieve:

Weak: "We will revolutionize Solana development."

Strong: "A reusable Better Sol template for DeFi dashboard projects with pre-built typed clients for the top 5 Solana lending protocols, integration tests, and a deployment guide."

### Ecosystem benefit

Explain how this helps Solana, not just your project:

Weak: "This will help us grow our user base."

Strong: "This lowers the barrier for the 350K+ JavaScript developers to build on Solana by eliminating the need to learn Rust or maintain IDL-based codegen pipelines."

### Proof of capability

Show that the team can deliver:

- Link to previously shipped projects (GitHub repos, live demos)
- Show existing progress on this project (working prototype, passing tests)
- Highlight relevant experience (prior Solana work, open-source contributions)
- Include a technical spike that proves the riskiest component works

## Common weak answers

- "We will onboard the next billion users" without a specific first user
- No measurable deliverables or all deliverables are documentation-only
- No maintenance plan after the grant period ends
- No proof the team can build it (no repo, no demo, no prior work)
- Mainnet deployment promises without an audit or security plan
- Grant funds only discovery or research with no concrete output
- Vague budget categories ("operations", "miscellaneous")
- Unrealistic timeline (mainnet in 2 weeks with no prior work)

## Evidence checklist

Before submitting:

- [ ] Repository is public with clean README and setup instructions
- [ ] Live demo is accessible (not localhost)
- [ ] Screenshots show the product, not slides
- [ ] Transaction signatures are real and verifiable on explorer
- [ ] Devnet program addresses are included
- [ ] Tests pass and coverage is documented
- [ ] Budget is itemized and proportional to deliverables
- [ ] Every claim has supporting evidence or is appropriately hedged
- [ ] Team members are listed with relevant experience
- [ ] Maintenance plan covers post-grant period

## Review before submission

Check that every answer is:

- **Specific**: names a concrete thing, not a category
- **Verifiable**: can be checked by the reviewer
- **Free of hype**: no "revolutionizing", "next billion users", or "game-changing"
- **Proportional**: the ask matches the scope of the deliverables

## Related

- `submission-assets.md` for grant draft structure and proof points.
- `pitch-deck-design.md` for grant or demo-day slide structure.
- `go-to-market.md` for post-grant maintenance and distribution plans.
- `evaluation-frameworks.md` for scoring grant applications objectively.
