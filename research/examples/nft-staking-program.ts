import {
  program, account,
  u64, u32, u8, bool, pubkey, vec,
  p,
} from 'better-sol/program'

const NftStake = account({
  authority: pubkey,
  stakedCount: u32,
  totalPoints: u64,
  isActive: bool,
  lastUpdateSlot: u64,
  delegate: pubkey,
  hasDelegate: bool,
  stakedMints: vec(pubkey),
  bump: u8,
}).derive((seed) => ["stake", seed.authority])

export const nftStaking = program({
  name: 'nft_staking',
  address: 'FcRr5uqM4tVX2kE2m2VjBZ6KkQnC3bFjC7hY5AhRdsQ',
  errors: {
  Unauthorized: 'Not the stake account authority',
  AlreadyStaked: 'This NFT is already staked',
  NotStaked: 'This NFT is not staked',
  StakingFull: 'Staking limit reached',
  StakeInactive: 'Stake account is not active',
  NoDelegate: 'No delegate set',
},
  }, ix => ({

    initStake: ix({
      accounts: {
        stake: p.create(NftStake),
        authority: p.signer(),
      },
      run: ({ stake, authority }) => {
        stake.authority = authority
        stake.stakedCount = 0
        stake.totalPoints = 0n
        stake.isActive = true
        stake.lastUpdateSlot = 0n
        stake.delegate = authority
        stake.hasDelegate = false
        stake.bump = 0
      },
    }),

    stakeNft: ix({
      accounts: {
        stake: p.mut(NftStake),
        authority: p.signer(),
      },
      args: { mint: pubkey, points: u64 },
      run: ({ stake, authority }, { mint, points }, ctx) => {
        ctx.require(authority === stake.authority, 'Unauthorized')
        ctx.require(stake.isActive, 'StakeInactive')
        ctx.require(stake.stakedCount < 10, 'StakingFull')

        for (let i = 0; i < stake.stakedCount; i++) {
          ctx.require(stake.stakedMints[i] !== mint, 'AlreadyStaked')
        }

        stake.stakedMints[stake.stakedCount] = mint
        stake.stakedCount += 1
        stake.totalPoints += points
      },
    }),

    unstakeNft: ix({
      accounts: {
        stake: p.mut(NftStake),
        authority: p.signer(),
      },
      args: { mint: pubkey },
      run: ({ stake, authority }, { mint }, ctx) => {
        ctx.require(authority === stake.authority, 'Unauthorized')
        ctx.require(stake.isActive, 'StakeInactive')
        ctx.require(stake.stakedCount > 0, 'NotStaked')

        for (let i = 0; i < stake.stakedCount; i++) {
          if (stake.stakedMints[i] === mint) {
            stake.stakedMints[i] = stake.stakedMints[stake.stakedCount - 1]
            stake.stakedCount -= 1
          }
        }
      },
    }),

    setDelegate: ix({
      accounts: {
        stake: p.mut(NftStake),
        authority: p.signer(),
      },
      args: { delegate: pubkey },
      run: ({ stake, authority }, { delegate }, ctx) => {
        ctx.require(authority === stake.authority, 'Unauthorized')
        stake.delegate = delegate
        stake.hasDelegate = true
      },
    }),

    clearDelegate: ix({
      accounts: {
        stake: p.mut(NftStake),
        authority: p.signer(),
      },
      run: ({ stake, authority }, ctx) => {
        ctx.require(authority === stake.authority, 'Unauthorized')
        ctx.require(stake.hasDelegate, 'NoDelegate')
        stake.hasDelegate = false
        stake.delegate = authority
      },
    }),

    closeStake: ix({
      accounts: {
        stake: p.close(NftStake, 'authority'),
        authority: p.signer(),
      },
      run: ({ stake, authority }, ctx) => {
        ctx.require(authority === stake.authority, 'Unauthorized')
        ctx.require(stake.stakedCount === 0, 'NotStaked')
      },
    }),

}))
