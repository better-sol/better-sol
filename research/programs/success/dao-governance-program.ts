import { program,
  account,
  bool,
  bytes,
  i64,
  p,
  pubkey,
  sol,
  string,
  u8,
  u32,
  u64,
} from "../../../packages/better-sol/src/program";

const Realm = account({
  authority: pubkey,
  treasury: pubkey,
  councilMint: pubkey,
  proposalCount: u64,
  activeProposalCount: u64,
  quorumBps: u64,
  approvalThresholdBps: u64,
  minVotingPower: u64,
  votingPeriodSlots: u64,
  paused: bool,
  bump: u8,
}).derive((seed) => ["realm", seed.authority]);

const MemberRecord = account({
  realm: pubkey,
  owner: pubkey,
  votingPower: u64,
  delegatedTo: pubkey,
  lockedUntil: i64,
  joinedAt: i64,
  active: bool,
  bump: u8,
}).derive((seed) => ["member", seed.realm, seed.owner]);

const Proposal = account({
  realm: pubkey,
  proposer: pubkey,
  executor: pubkey,
  title: string,
  metadataHash: bytes,
  yesVotes: u64,
  noVotes: u64,
  abstainVotes: u64,
  startSlot: u64,
  endSlot: u64,
  createdAt: i64,
  executedAt: i64,
  state: u8,
  bump: u8,
}).derive((seed) => ["proposal", seed.realm, seed.proposer]);

const VoteReceipt = account({
  proposal: pubkey,
  voter: pubkey,
  side: u8,
  votingPower: u64,
  timestamp: i64,
  revoked: bool,
}).derive((seed) => ["vote", seed.proposal, seed.voter]);

const ExecutionReceipt = account({
  proposal: pubkey,
  executor: pubkey,
  executedAt: i64,
  instructionCount: u32,
  success: bool,
}).derive((seed) => ["execution", seed.proposal]);

;

const events = {
  RealmCreated: {
    realm: pubkey,
    authority: pubkey,
    quorumBps: u64,
    approvalThresholdBps: u64,
  },
  MemberJoined: { realm: pubkey, owner: pubkey, votingPower: u64 },
  MemberDelegated: { realm: pubkey, owner: pubkey, delegatedTo: pubkey },
  ProposalCreated: {
    realm: pubkey,
    proposal: pubkey,
    proposer: pubkey,
    endSlot: u64,
  },
  VoteCast: { proposal: pubkey, voter: pubkey, side: u8, votingPower: u64 },
  VotesAudited: {
    proposal: pubkey,
    receipts: u64,
    yesVotes: u64,
    noVotes: u64,
    abstainVotes: u64,
  },
  ProposalFinalized: {
    proposal: pubkey,
    state: u8,
    yesVotes: u64,
    noVotes: u64,
  },
  ProposalExecuted: {
    proposal: pubkey,
    executor: pubkey,
    instructionCount: u32,
    executedAt: i64,
  },
  ProposalClosed: { proposal: pubkey, proposer: pubkey },
}

export const daoGovernance = program({
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
        realm: p.create(Realm),
        authority: p.signer(),
      },
      args: {
        treasury: pubkey,
        councilMint: pubkey,
        quorumBps: u64,
        approvalThresholdBps: u64,
        minVotingPower: u64,
        votingPeriodSlots: u64,
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
        realm: p.mut(Realm),
        member: p.create(MemberRecord),
        owner: p.signer(),
      },
      args: { votingPower: u64 },
      run: ({ realm, member, owner }, { votingPower }, ctx) => {
        ctx.require(!realm.paused, "RealmPaused");
        ctx.require(votingPower >= realm.minVotingPower, "InvalidVotingPower");
        member.realm = realm.key;
        member.owner = owner;
        member.votingPower = votingPower;
        member.delegatedTo = owner;
        member.lockedUntil = 0n;
        member.joinedAt = sol.timestamp();
        member.active = true;
        member.bump = 0;
        ctx.emit("MemberJoined", { realm: realm.key, owner, votingPower });
      },
    }),

    delegateVotes: ix({
      accounts: {
        realm: p.mut(Realm),
        member: p.mut(MemberRecord),
        owner: p.signer(),
      },
      args: { delegatedTo: pubkey },
      run: ({ realm, member, owner }, { delegatedTo }, ctx) => {
        ctx.require(owner === member.owner, "Unauthorized");
        ctx.require(member.active, "InvalidVotingPower");
        member.delegatedTo = delegatedTo;
        ctx.emit("MemberDelegated", { realm: realm.key, owner, delegatedTo });
      },
    }),

    createProposal: ix({
      accounts: {
        realm: p.mut(Realm),
        member: p.mut(MemberRecord),
        proposal: p.create(Proposal),
        proposer: p.signer(),
      },
      args: {
        executor: pubkey,
        title: string,
        metadataHash: bytes,
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
        proposal.createdAt = sol.timestamp();
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
        realm: p.mut(Realm),
        proposal: p.mut(Proposal),
        member: p.mut(MemberRecord),
        receipt: p.create(VoteReceipt),
        voter: p.signer(),
      },
      args: { side: u8 },
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
        receipt.timestamp = sol.timestamp();
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
        proposal: p.mut(Proposal),
        receipts: p.remaining(VoteReceipt),
        authority: p.signer(),
      },
      args: { maxReceipts: u64 },
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
          receipts[i]!.timestamp = sol.timestamp();
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
        realm: p.mut(Realm),
        proposal: p.mut(Proposal),
        authority: p.signer(),
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
        proposal: p.mut(Proposal),
        execution: p.create(ExecutionReceipt),
        executor: p.signer(),
      },
      args: { instructionCount: u32 },
      run: ({ proposal, execution, executor }, { instructionCount }, ctx) => {
        ctx.require(executor === proposal.executor, "Unauthorized");
        ctx.require(proposal.state === 1, "InvalidProposalState");
        ctx.require(proposal.executedAt === 0n, "ProposalAlreadyExecuted");
        proposal.executedAt = sol.timestamp();
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
        proposal: p.close(Proposal, "proposer"),
        proposer: p.signer(),
      },
      run: ({ proposal, proposer }, ctx) => {
        ctx.require(proposer === proposal.proposer, "Unauthorized");
        ctx.require(proposal.state >= 2, "InvalidProposalState");
        ctx.emit("ProposalClosed", { proposal: proposal.key, proposer });
      },
    }),
}));

