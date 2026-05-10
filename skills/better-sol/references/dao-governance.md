# DAO and Governance Patterns

Use this reference when building DAOs, voting mechanisms, proposal systems, treasury management, or decentralized decision-making on Solana.

## Governance primitives

- Token-weighted voting: one token equals one vote. Simple but favors large holders.
- Quadratic voting: vote cost increases quadratically. Reduces whale dominance.
- One-person-one-vote: requires identity verification. Prevents sybil attacks.
- Multisig voting: N-of-M signers required. Common for small teams and protocol councils.
- Conviction voting: votes gain weight over time. Rewards long-term commitment.

## On-chain governance components

```text
GovernanceConfig: vote threshold, quorum, timelock, proposal period
Proposal: proposer, description, creation slot, state, vote counts
VoteRecord: voter, proposal, vote direction, weight, timestamp
Treasury: authority, allowed operations, spending limits
InstructionDelegate: encoded operations to execute on proposal passage
```

## Proposal lifecycle

1. Creation: proposer submits proposal with description and executable instructions.
2. Active: voting opens. Voters cast yes/no/abstain with token weight.
3. Quorum check: minimum participation threshold met.
4. Threshold check: yes votes exceed required percentage.
5. Timelock: delay between passage and execution for security review.
6. Execution: queued instructions are executed on-chain.
7. Completion or veto.

## SPL Governance

The SPL Governance program provides a framework for on-chain governance:

- Realm: governance namespace with community and council token.
- Governance: rules for a specific governed account or program.
- Proposal: individual governance action.
- TokenOwnerRecord: tracks governance power per token holder.
- VoteRecord: individual vote with weight.

## Treasury management

- Cold storage: multisig-controlled vault with limited operations.
- Programmatic spending: governance-approved instructions with amount and destination limits.
- Stream payments: continuous token streams for contributor payments (Sablier-style).
- Vesting: time-locked token releases with cliff periods.

## Best practices

- Separate governance token from utility token when incentives diverge.
- Use timelocks for high-impact decisions.
- Delegate authority to sub-committees for routine operations.
- Record all governance actions as events for transparency.
- Test edge cases: tie votes, quorum failure, proposal expiry, veto authority misuse.

## Better Sol implementation

Use Better Sol programs for custom governance logic: weighted voting with domain-specific rules, proposal escrow, time-locked execution with custom conditions, or treasury policies that go beyond SPL Governance defaults.

For standard token-weighted governance, integrate SPL Governance directly rather than rebuilding.

## Related

- `tokenomics.md` for governance token design, voting power, and supply mechanics.
- `economic-security.md` for governance attack patterns and incentive alignment.
