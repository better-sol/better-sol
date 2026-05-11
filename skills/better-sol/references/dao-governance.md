# DAO and Governance Patterns

Use this reference when building DAOs, voting mechanisms, proposal systems, treasury management, or decentralized decision-making on Solana.

## Tools

- **SPL Governance** (`@solana/spl-governance`): full-featured on-chain DAO framework with proposals, voting, treasury, and multi-signer support. The most widely used governance standard on Solana.
- **Realms** (app.realm.today): no-code interface for creating and managing SPL Governance DAOs. Set up a DAO in minutes without writing code.
- **Tribeca** (`@tribecahq/tribeca-sdk`): governor-style DAO with locked voter tokens and veToken mechanics. Inspired by Curve's governance model.
- **Helium** (`@helium/sdk`): sub-DAO governance with delegation, rewards distribution, and on-chain registry.
- **Marinade Governor**: vote-by-locked-token patterns for liquid staking governance.
- **Civic Pass** (`@civic/common-gatekeeper`): for gating DAO participation by identity verification.

When integrating an external governance program that exposes an Anchor-compatible IDL, import it with `fromIdl(idl)` from `better-sol` for typed proposal and voting operations.

## Governance primitives

### Proposal lifecycle

```
Draft → Active (voting open) → Succeeded / Defeated → Executing → Executed / Failed
```

States:
- **Draft**: author is editing the proposal. Not visible to voters.
- **Active**: voting is open. Members can vote yes, no, or abstain.
- **Succeeded**: yes votes exceed the threshold. Ready for execution.
- **Defeated**: no votes exceed the threshold or quorum not met.
- **Executing**: the on-chain instructions are being carried out.
- **Executed**: all instructions succeeded. The proposal is complete.
- **Failed**: execution failed. May be retryable depending on the governance configuration.

### Voting mechanisms

| Mechanism | How votes are counted | Best for |
|---|---|---|
| Token-weighted | 1 token = 1 vote | Token-governed protocols |
| Quadratic | sqrt(tokens) = vote weight | Community-biased governance |
| One-person-one-vote | 1 identity = 1 vote | Sybil-resistant DAOs |
| Multi-signature | N of M signers approve | Small teams, treasury ops |
| Conviction voting | votes gain weight over time | Long-term aligned decisions |

### Treasury management

DAO treasuries hold SOL, tokens, and NFTs. Governance controls how treasury funds are spent:

- **Proposal-based spending**: any member proposes a transfer, the DAO votes on it
- **Recurring payments**: scheduled transfers for ongoing expenses (salaries, infrastructure)
- **Delegated spending**: a sub-committee or multisig has a spending allowance
- **Investment**: treasury deploys funds into DeFi protocols for yield

Implementation patterns:

```ts
const TreasuryProposal = bs.account({
  dao: bs.pubkey(),
  proposer: bs.pubkey(),
  title: bs.string(),
  description: bs.string(),
  amount: bs.u64(),
  mint: bs.pubkey(),
  recipient: bs.pubkey(),
  yesVotes: bs.u64(),
  noVotes: bs.u64(),
  deadline: bs.u64(),
  status: bs.u8(),
}).derive((seed) => ["proposal", seed.dao, seed.proposer])

const VoteRecord = bs.account({
  proposal: bs.pubkey(),
  voter: bs.pubkey(),
  vote: bs.u8(),
  weight: bs.u64(),
}).derive((seed) => ["vote", seed.proposal, seed.voter])
```

## Sybil resistance for DAOs

### Problem

Token-weighted voting is vulnerable to whale dominance and sybil attacks. One entity with many wallets can accumulate disproportionate voting power.

### Solutions

- **Proof of Humanity**: verify unique humans before granting vote weight (see `humanity.md`)
- **Conviction voting**: votes gain weight the longer they are held, discouraging flash-loan voting
- **Token lock-up**: require tokens to be locked for a minimum period before voting
- **Delegation**: allow voters to delegate to trusted representatives
- **Quorum requirements**: set minimum participation thresholds

## DAO program patterns

### Create proposal

```ts
createProposal: ix({
  accounts: {
    proposal: bs.init(TreasuryProposal),
    dao: bs.mut(DAOConfig),
    proposer: bs.signer(),
  },
  args: { title: bs.string(), description: bs.string(), amount: bs.u64(), recipient: bs.pubkey() },
  run: ({ proposal, dao }, args, ctx) => {
    ctx.require(dao.members.includes(proposal.proposer), "NotMember")
    proposal.dao = dao.key
    proposal.proposer = proposal.proposer
    proposal.title = args.title
    proposal.description = args.description
    proposal.amount = args.amount
    proposal.recipient = args.recipient
    proposal.yesVotes = 0n
    proposal.noVotes = 0n
    proposal.deadline = cpi.sol.timestamp() + dao.votingPeriod
    proposal.status = 1
  },
}),
```

### Vote on proposal

```ts
vote: ix({
  accounts: {
    proposal: bs.mut(TreasuryProposal),
    voteRecord: bs.init(VoteRecord),
    voter: bs.signer(),
  },
  args: { vote: bs.u8() },
  run: ({ proposal, voteRecord, voter }, { vote }, ctx) => {
    ctx.require(proposal.status === 1, "NotActive")
    ctx.require(cpi.sol.timestamp() < proposal.deadline, "VotingEnded")
    voteRecord.proposal = proposal.key
    voteRecord.voter = voter
    voteRecord.vote = vote
    voteRecord.weight = 0n
    if (vote === 0) proposal.yesVotes += voteRecord.weight
    if (vote === 1) proposal.noVotes += voteRecord.weight
  },
}),
```

### Execute proposal

```ts
executeProposal: ix({
  accounts: {
    proposal: bs.mut(TreasuryProposal),
    dao: bs.mut(DAOConfig),
    treasury: bs.tokenAccount().writable(),
    recipient: bs.tokenAccount().writable(),
    mint: bs.mint(),
    tokenProgram: bs.tokenProgram(),
  },
  run: ({ proposal, treasury, recipient, mint }, ctx) => {
    ctx.require(proposal.status === 2, "NotSucceeded")
    ctx.require(cpi.sol.timestamp() >= proposal.deadline, "VotingNotEnded")
    ctx.require(proposal.yesVotes > proposal.noVotes, "Defeated")
    cpi.token.transfer({ from: treasury, to: recipient, authority: treasury, amount: proposal.amount })
    proposal.status = 4
  },
}),
```

## Common governance attacks

| Attack | Description | Mitigation |
|---|---|---|
| Flash loan voting | Borrow tokens, vote, return in same tx | Require tokens to be locked before voting period starts |
| Sybil voting | Create many wallets to accumulate votes | Proof of Humanity, one-person-one-vote |
| Whale dominance | Single large holder controls all decisions | Quadratic voting, conviction voting, delegation |
| Governance spam | Flood with proposals to waste voter attention | Proposal deposits, minimum token holdings |
| Front-running execution | MEV on proposal execution | Commit-reveal schemes, timelocks |

## Governance design theory

### Governance is a control system

A DAO is not only a voting interface. It is a control system over assets, parameters, upgrades, and reputation. Good governance balances three forces:

| Force | Too little | Too much |
|---|---|---|
| Participation | Apathy, capture by insiders | Voter fatigue, low-quality decisions |
| Speed | Protocol cannot react to emergencies | Hasty decisions and governance attacks |
| Power concentration | No one can coordinate | Whales or delegates control everything |

Design for the decisions the DAO actually needs to make. Treasury spending, parameter changes, and program upgrades should not share the same approval threshold.

### Proposal classification

| Proposal type | Risk | Recommended controls |
|---|---|---|
| Social signal | Low | Simple majority, short voting period |
| Treasury spend | Medium | Quorum, budget cap, execution delay |
| Parameter change | High | Simulation, quorum, timelock |
| Program upgrade | Critical | Supermajority, multisig review, long timelock |
| Emergency pause | Critical | Limited multisig, narrow scope, mandatory postmortem |

### Voter incentives

Governance fails when rational voters do not participate. Improve participation with delegation, clear proposal summaries, reminders, and focused voting calendars. Do not overuse token rewards for voting, because they can incentivize low-quality participation.

### Treasury safety

- Split treasury into hot, warm, and cold wallets.
- Cap per-proposal spend unless a supermajority approves.
- Use streaming payments for grants and contractor work.
- Require milestone-based releases for large grants.
- Publish treasury runway and monthly spend.

## Related

- `tokens.md` for governance token creation and distribution.
- `humanity.md` for sybil resistance and voter verification.
- `defi-deep-dive.md` for economic security in governance design.
- `security-checklist.md` for program-level security review.
