import { bs, cpi } from "better-sol/program";

const Realm = bs.account({
  authority: bs.pubkey(),
  treasury: bs.pubkey(),
  councilMint: bs.pubkey(),
  proposalCount: bs.u64(),
  activeProposalCount: bs.u64(),
  quorumBps: bs.u64(),
  approvalThresholdBps: bs.u64(),
  minVotingPower: bs.u64(),
  votingPeriodSlots: bs.u64(),
  paused: bs.bool(),
  bump: bs.u8(),
}).derive((seed) => ["realm", seed.authority]);

const MemberRecord = bs.account({
  realm: bs.pubkey(),
  owner: bs.pubkey(),
  votingPower: bs.u64(),
  delegatedTo: bs.pubkey(),
  lockedUntil: bs.i64(),
  joinedAt: bs.i64(),
  active: bs.bool(),
  bump: bs.u8(),
}).derive((seed) => ["member", seed.realm, seed.owner]);

const Proposal = bs.account({
  realm: bs.pubkey(),
  proposer: bs.pubkey(),
  executor: bs.pubkey(),
  title: bs.string(),
  metadataHash: bs.bytes(),
  yesVotes: bs.u64(),
  noVotes: bs.u64(),
  abstainVotes: bs.u64(),
  startSlot: bs.u64(),
  endSlot: bs.u64(),
  createdAt: bs.i64(),
  executedAt: bs.i64(),
  state: bs.u8(),
  bump: bs.u8(),
}).derive((seed) => ["proposal", seed.realm, seed.proposer]);

const VoteReceipt = bs.account({
  proposal: bs.pubkey(),
  voter: bs.pubkey(),
  side: bs.u8(),
  votingPower: bs.u64(),
  timestamp: bs.i64(),
  revoked: bs.bool(),
}).derive((seed) => ["vote", seed.proposal, seed.voter]);

const ExecutionReceipt = bs.account({
  proposal: bs.pubkey(),
  executor: bs.pubkey(),
  executedAt: bs.i64(),
  instructionCount: bs.u32(),
  success: bs.bool(),
}).derive((seed) => ["execution", seed.proposal]);

;

const events = {
  RealmCreated: {
    realm: bs.pubkey(),
    authority: bs.pubkey(),
    quorumBps: bs.u64(),
    approvalThresholdBps: bs.u64(),
  },
  MemberJoined: { realm: bs.pubkey(), owner: bs.pubkey(), votingPower: bs.u64() },
  MemberDelegated: { realm: bs.pubkey(), owner: bs.pubkey(), delegatedTo: bs.pubkey() },
  ProposalCreated: {
    realm: bs.pubkey(),
    proposal: bs.pubkey(),
    proposer: bs.pubkey(),
    endSlot: bs.u64(),
  },
  VoteCast: { proposal: bs.pubkey(), voter: bs.pubkey(), side: bs.u8(), votingPower: bs.u64() },
  VotesAudited: {
    proposal: bs.pubkey(),
    receipts: bs.u64(),
    yesVotes: bs.u64(),
    noVotes: bs.u64(),
    abstainVotes: bs.u64(),
  },
  ProposalFinalized: {
    proposal: bs.pubkey(),
    state: bs.u8(),
    yesVotes: bs.u64(),
    noVotes: bs.u64(),
  },
  ProposalExecuted: {
    proposal: bs.pubkey(),
    executor: bs.pubkey(),
    instructionCount: bs.u32(),
    executedAt: bs.i64(),
  },
  ProposalClosed: { proposal: bs.pubkey(), proposer: bs.pubkey() },
}

export const daoGovernance = bs.program({
  name: "dao_governance",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  errors: {
    Unauthorized: "Not authorized",
    RealmPaused: "Realm is paused",
    InvalidVotingPower: "Invalid voting power",
    InvalidProposalState: "Invalid proposal state",
    InvalidVoteSide: "Invalid vote side",
    QuorumNotReached: "Quorum not reached",
    ProposalAlreadyExecuted: "Proposal already executed",
  },
  events,
}, ix => ({
    createRealm: ix({
      accounts: {
        realm: bs.init(Realm),
        authority: bs.signer(),
      },
      args: {
        treasury: bs.pubkey(),
        councilMint: bs.pubkey(),
        quorumBps: bs.u64(),
        approvalThresholdBps: bs.u64(),
        minVotingPower: bs.u64(),
        votingPeriodSlots: bs.u64(),
      },
      run: (
        { realm, authority },
        {
          treasury,
          councilMint,
          quorumBps,
          approvalThresholdBps,
          minVotingPower,
          votingPeriodSlots,
        },
        ctx,
      ) => {
        realm.authority = authority;
        realm.treasury = treasury;
        realm.councilMint = councilMint;
        realm.proposalCount = 0n;
        realm.activeProposalCount = 0n;
        realm.quorumBps = quorumBps;
        realm.approvalThresholdBps = approvalThresholdBps;
        realm.minVotingPower = minVotingPower;
        realm.votingPeriodSlots = votingPeriodSlots;
        realm.paused = false;
        realm.bump = 0;
        ctx.emit("RealmCreated", {
          realm: realm.key,
          authority,
          quorumBps,
          approvalThresholdBps,
        });
      },
    }),

    joinRealm: ix({
      accounts: {
        realm: bs.mut(Realm),
        member: bs.init(MemberRecord),
        owner: bs.signer(),
      },
      args: { votingPower: bs.u64() },
      run: ({ realm, member, owner }, { votingPower }, ctx) => {
        ctx.require(!realm.paused, "RealmPaused");
        ctx.require(votingPower >= realm.minVotingPower, "InvalidVotingPower");
        member.realm = realm.key;
        member.owner = owner;
        member.votingPower = votingPower;
        member.delegatedTo = owner;
        member.lockedUntil = 0n;
        member.joinedAt = cpi.sol.timestamp();
        member.active = true;
        member.bump = 0;
        ctx.emit("MemberJoined", { realm: realm.key, owner, votingPower });
      },
    }),

    delegateVotes: ix({
      accounts: {
        realm: bs.mut(Realm),
        member: bs.mut(MemberRecord),
        owner: bs.signer(),
      },
      args: { delegatedTo: bs.pubkey() },
      run: ({ realm, member, owner }, { delegatedTo }, ctx) => {
        ctx.require(owner === member.owner, "Unauthorized");
        ctx.require(member.active, "InvalidVotingPower");
        member.delegatedTo = delegatedTo;
        ctx.emit("MemberDelegated", { realm: realm.key, owner, delegatedTo });
      },
    }),

    createProposal: ix({
      accounts: {
        realm: bs.mut(Realm),
        member: bs.mut(MemberRecord),
        proposal: bs.init(Proposal),
        proposer: bs.signer(),
      },
      args: {
        executor: bs.pubkey(),
        title: bs.string(),
        metadataHash: bs.bytes(),
      },
      run: (
        { realm, member, proposal, proposer },
        { executor, title, metadataHash },
        ctx,
      ) => {
        ctx.require(!realm.paused, "RealmPaused");
        ctx.require(proposer === member.owner, "Unauthorized");
        ctx.require(
          member.votingPower >= realm.minVotingPower,
          "InvalidVotingPower",
        );
        proposal.realm = realm.key;
        proposal.proposer = proposer;
        proposal.executor = executor;
        proposal.title = title;
        proposal.metadataHash = metadataHash;
        proposal.yesVotes = 0n;
        proposal.noVotes = 0n;
        proposal.abstainVotes = 0n;
        proposal.startSlot = 0n;
        proposal.endSlot = realm.votingPeriodSlots;
        proposal.createdAt = cpi.sol.timestamp();
        proposal.executedAt = 0n;
        proposal.state = 0;
        proposal.bump = 0;
        realm.proposalCount += 1n;
        realm.activeProposalCount += 1n;
        ctx.emit("ProposalCreated", {
          realm: realm.key,
          proposal: proposal.key,
          proposer,
          endSlot: proposal.endSlot,
        });
      },
    }),

    castVote: ix({
      accounts: {
        realm: bs.mut(Realm),
        proposal: bs.mut(Proposal),
        member: bs.mut(MemberRecord),
        receipt: bs.init(VoteReceipt),
        voter: bs.signer(),
      },
      args: { side: bs.u8() },
      run: ({ realm, proposal, member, receipt, voter }, { side }, ctx) => {
        ctx.require(!realm.paused, "RealmPaused");
        ctx.require(proposal.state === 0, "InvalidProposalState");
        ctx.require(voter === member.owner, "Unauthorized");
        ctx.require(side <= 2, "InvalidVoteSide");
        if (side === 0) {
          proposal.yesVotes += member.votingPower;
        } else {
          if (side === 1) {
            proposal.noVotes += member.votingPower;
          } else {
            proposal.abstainVotes += member.votingPower;
          }
        }
        receipt.proposal = proposal.key;
        receipt.voter = voter;
        receipt.side = side;
        receipt.votingPower = member.votingPower;
        receipt.timestamp = cpi.sol.timestamp();
        receipt.revoked = false;
        ctx.emit("VoteCast", {
          proposal: proposal.key,
          voter,
          side,
          votingPower: member.votingPower,
        });
      },
    }),

    auditVotes: ix({
      accounts: {
        proposal: bs.mut(Proposal),
        receipts: bs.remaining(VoteReceipt),
        authority: bs.signer(),
      },
      args: { maxReceipts: bs.u64() },
      run: ({ proposal, receipts, authority }, { maxReceipts }, ctx) => {
        ctx.require(authority === proposal.proposer, "Unauthorized");
        let receiptCount = 0n;
        const limit =
          receipts.length < maxReceipts ? receipts.length : maxReceipts;
        for (let i = 0; i < limit; i++) {
          receipts[i]!.proposal = proposal.key;
          receipts[i]!.voter = authority;
          receipts[i]!.side = 2;
          receipts[i]!.votingPower = 0n;
          receipts[i]!.timestamp = cpi.sol.timestamp();
          receipts[i]!.revoked = true;
          receiptCount += 1n;
        }
        ctx.emit("VotesAudited", {
          proposal: proposal.key,
          receipts: receiptCount,
          yesVotes: proposal.yesVotes,
          noVotes: proposal.noVotes,
          abstainVotes: proposal.abstainVotes,
        });
      },
    }),

    finalizeProposal: ix({
      accounts: {
        realm: bs.mut(Realm),
        proposal: bs.mut(Proposal),
        authority: bs.signer(),
      },
      run: ({ realm, proposal, authority }, ctx) => {
        ctx.require(authority === realm.authority, "Unauthorized");
        ctx.require(proposal.state === 0, "InvalidProposalState");
        const totalVotes =
          proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
        const requiredQuorum =
          (realm.minVotingPower * realm.quorumBps) / 10000n;
        ctx.require(totalVotes >= requiredQuorum, "QuorumNotReached");
        const approvalBps = (proposal.yesVotes * 10000n) / totalVotes;
        if (approvalBps >= realm.approvalThresholdBps) {
          proposal.state = 1;
        } else {
          proposal.state = 2;
        }
        if (realm.activeProposalCount > 0n) {
          realm.activeProposalCount -= 1n;
        }
        ctx.emit("ProposalFinalized", {
          proposal: proposal.key,
          state: proposal.state,
          yesVotes: proposal.yesVotes,
          noVotes: proposal.noVotes,
        });
      },
    }),

    executeProposal: ix({
      accounts: {
        proposal: bs.mut(Proposal),
        execution: bs.init(ExecutionReceipt),
        executor: bs.signer(),
      },
      args: { instructionCount: bs.u32() },
      run: ({ proposal, execution, executor }, { instructionCount }, ctx) => {
        ctx.require(executor === proposal.executor, "Unauthorized");
        ctx.require(proposal.state === 1, "InvalidProposalState");
        ctx.require(proposal.executedAt === 0n, "ProposalAlreadyExecuted");
        proposal.executedAt = cpi.sol.timestamp();
        proposal.state = 3;
        execution.proposal = proposal.key;
        execution.executor = executor;
        execution.executedAt = proposal.executedAt;
        execution.instructionCount = instructionCount;
        execution.success = true;
        ctx.emit("ProposalExecuted", {
          proposal: proposal.key,
          executor,
          instructionCount,
          executedAt: proposal.executedAt,
        });
      },
    }),

    closeProposal: ix({
      accounts: {
        proposal: bs.close(Proposal, "proposer"),
        proposer: bs.signer(),
      },
      run: ({ proposal, proposer }, ctx) => {
        ctx.require(proposer === proposal.proposer, "Unauthorized");
        ctx.require(proposal.state >= 2, "InvalidProposalState");
        ctx.emit("ProposalClosed", { proposal: proposal.key, proposer });
      },
    }),
}));

