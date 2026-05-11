import { bs, cpi } from "better-sol/program"

const ClaimRecord = bs.account({
  recipient: bs.pubkey(),
  amount: bs.u64(),
  claimed: bs.bool(),
}).derive((seed) => ["claim", seed.recipient])

export const airdropClaim = bs.program({
  name: "airdrop_claim",
  address: "PROGRAM_ID",
  accounts: { ClaimRecord },
  errors: {
    Unauthorized: "Only the claim recipient can claim",
    AlreadyClaimed: "This claim has already been claimed",
    InvalidAmount: "Claim amount must be greater than zero",
  },
  events: {
    ClaimCreated: { recipient: bs.pubkey(), amount: bs.u64() },
    ClaimRedeemed: { recipient: bs.pubkey(), amount: bs.u64() },
  },
}, (ix) => ({
  createClaim: ix({
    accounts: {
      claim: bs.init(ClaimRecord),
      authority: bs.signer(),
    },
    args: {
      recipient: bs.pubkey(),
      amount: bs.u64(),
    },
    run: ({ claim }, { recipient, amount }, ctx) => {
      ctx.require(amount > 0n, "InvalidAmount")
      claim.recipient = recipient
      claim.amount = amount
      claim.claimed = false
      ctx.emit("ClaimCreated", { recipient, amount })
    },
  }),
  redeemClaim: ix({
    accounts: {
      claim: bs.mut(ClaimRecord),
      recipient: bs.signer(),
      treasury: bs.tokenAccount().writable(),
      destination: bs.tokenAccount().writable(),
      authority: bs.signer(),
      tokenProgram: bs.tokenProgram(),
    },
    run: ({ claim, recipient, treasury, destination, authority }, ctx) => {
      ctx.require(claim.recipient === recipient, "Unauthorized")
      ctx.require(!claim.claimed, "AlreadyClaimed")
      cpi.token.transfer({
        from: treasury,
        to: destination,
        authority,
        amount: claim.amount,
      })
      claim.claimed = true
      ctx.emit("ClaimRedeemed", { recipient, amount: claim.amount })
    },
  }),
}))
