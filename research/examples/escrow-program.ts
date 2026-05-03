import {
  program, account,
  u64, u8, bool, pubkey,
  p, token,
} from 'better-sol/program'

const Escrow = account({
  maker: pubkey,
  mintA: pubkey,
  mintB: pubkey,
  amountA: u64,
  amountB: u64,
  isCompleted: bool,
  bump: u8,
}).derive((seed) => ["escrow", seed.maker])

export const escrowProgram = program({
  name: 'escrow',
  address: 'EscRow1111111111111111111111111111111111111',
  errors: {
    Unauthorized: 'Only the escrow maker can perform this action',
    AlreadyCompleted: 'Escrow has already been completed',
    InvalidAmount: 'Amount must be greater than zero',
    InvalidMint: 'Token mint does not match the escrow',
    SlippageExceeded: 'Output amount below minimum',
  },
  events: {
    EscrowCreated: {
      maker: pubkey,
      mintA: pubkey,
      mintB: pubkey,
      amountA: u64,
      amountB: u64,
    },
    EscrowTaken: {
      maker: pubkey,
      taker: pubkey,
      amountA: u64,
      amountB: u64,
    },
    EscrowClosed: { maker: pubkey },
  },
  }, ix => ({

    createEscrow: ix({
      accounts: {
        escrow: p.create(Escrow),
        makerTokenA: p.tokenAccount().mut(),
        vaultTokenA: p.tokenAccount().mut(),
        maker: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { mintA: pubkey, mintB: pubkey, amountA: u64, amountB: u64 },
      run: ({ escrow, makerTokenA, vaultTokenA, maker }, { mintA, mintB, amountA, amountB }, ctx) => {
        ctx.require(amountA > 0n, 'InvalidAmount')
        ctx.require(amountB > 0n, 'InvalidAmount')
        ctx.require(makerTokenA.mint === mintA, 'InvalidMint')
        ctx.require(vaultTokenA.mint === mintA, 'InvalidMint')

        escrow.maker = maker
        escrow.mintA = mintA
        escrow.mintB = mintB
        escrow.amountA = amountA
        escrow.amountB = amountB
        escrow.isCompleted = false
        escrow.bump = 0

        token.transfer({
          from: makerTokenA,
          to: vaultTokenA,
          authority: maker,
          amount: amountA,
        })

        ctx.emit('EscrowCreated', { maker, mintA, mintB, amountA, amountB })
      },
    }),

    takeEscrow: ix({
      accounts: {
        escrow: p.mut(Escrow),
        vaultTokenA: p.tokenAccount().mut(),
        takerTokenB: p.tokenAccount().mut(),
        makerTokenB: p.tokenAccount().mut(),
        taker: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { minAmountA: u64 },
      run: ({ escrow, vaultTokenA, takerTokenB, makerTokenB, taker }, { minAmountA }, ctx) => {
        ctx.require(escrow.isCompleted === false, 'AlreadyCompleted')
        ctx.require(escrow.amountA >= minAmountA, 'SlippageExceeded')
        ctx.require(takerTokenB.mint === escrow.mintB, 'InvalidMint')
        ctx.require(makerTokenB.mint === escrow.mintB, 'InvalidMint')

        token.transfer({
          from: takerTokenB,
          to: makerTokenB,
          authority: taker,
          amount: escrow.amountB,
        })

        token.transfer({
          from: vaultTokenA,
          to: takerTokenB,
          authority: escrow,
          amount: escrow.amountA,
        })

        escrow.isCompleted = true

        ctx.emit('EscrowTaken', { maker: escrow.maker, taker, amountA: escrow.amountA, amountB: escrow.amountB })
      },
    }),

    closeEscrow: ix({
      accounts: {
        escrow: p.close(Escrow, 'maker'),
        maker: p.signer(),
      },
      run: ({ escrow, maker }, ctx) => {
        ctx.require(maker === escrow.maker, 'Unauthorized')
        ctx.require(escrow.isCompleted === false, 'AlreadyCompleted')
        ctx.emit('EscrowClosed', { maker })
      },
    }),

}))
