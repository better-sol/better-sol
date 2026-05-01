// ============================================================
// Token-2022 AMM — Complete Program
//
// Same as amm-program.ts but using Token-2022:
// - token.transferChecked() instead of token.transfer()
// - p.token2022Program() instead of p.tokenProgram()
// - Works with Token-2022 extensions (transfer fees, etc.)
//
// The transpiler generates anchor-spl::token_2022 imports
// and transfer_checked CPI calls automatically.
// ============================================================

import {
  program, account, ix, defineErrors, defineEvents,
  u64, u8, bool, pubkey,
  p, token, sol,
} from 'better-sol/program'


// ══════════════════════════════════════════
// ACCOUNTS
// ══════════════════════════════════════════

const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
}).seeds('config')

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  reserveA: pubkey,
  reserveB: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  createdAt: u64,
  admin: pubkey,
  isActive: bool,
  totalVolumeA: u64,
  totalVolumeB: u64,
  bump: u8,
}).seeds('pool', '{tokenAMint}', '{tokenBMint}')


// ══════════════════════════════════════════
// ERRORS & EVENTS
// ══════════════════════════════════════════

const errors = defineErrors({
  Unauthorized: 'Caller is not authorized',
  PoolInactive: 'Pool does not exist or is inactive',
  InvalidAmount: 'Amount must be greater than zero',
  InvalidFeeBps: 'Fee must be between 0 and 1000 basis points',
  SlippageExceeded: 'Output amount below minimum (slippage)',
  InvalidMint: 'Token mint does not match pool',
  InvalidReserve: 'Reserve account does not match pool',
})

const events = defineEvents({
  PoolCreated: {
    tokenA: pubkey,
    tokenB: pubkey,
    feeBps: u64,
  },
  SwapExecuted: {
    amountIn: u64,
    amountOut: u64,
    fee: u64,
    direction: u8,
  },
  LiquidityAdded: {
    amountA: u64,
    amountB: u64,
    lpTokens: u64,
  },
  LiquidityRemoved: {
    amountA: u64,
    amountB: u64,
    lpTokens: u64,
  },
  FeeUpdated: {
    newFeeBps: u64,
  },
})


// ══════════════════════════════════════════
// PROGRAM — Token-2022 AMM
// ══════════════════════════════════════════

export const t22Amm = program({
  name: 't22_amm',
  address: 'T22AMM11111111111111111111111111111111111111',
  errors,
  events,
  instructions: {

    // ── 1. Initialize global config ──
    initializeConfig: ix({
      accounts: {
        config: p.init(Config),
        admin: p.signer(),
      },
      run: ({ config, admin }) => {
        config.admin = admin
        config.totalPools = 0n
        config.feeBps = 30n
      },
    }),

    // ── 2. Create pool ──
    createPool: ix({
      accounts: {
        config: p.mut(Config),
        pool: p.init(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        lpMint: p.mint(),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        creator: p.signer(),
        token2022Program: p.token2022Program(),
      },
      args: { feeBps: u64 },
      run: ({ config, pool, tokenAMint, tokenBMint, reserveA, reserveB, creator }, { feeBps }, ctx) => {
        ctx.require(creator === config.admin, 'Unauthorized')
        ctx.require(feeBps <= 1000n, 'InvalidFeeBps')

        pool.tokenAMint = tokenAMint.key
        pool.tokenBMint = tokenBMint.key
        pool.reserveA = reserveA.key
        pool.reserveB = reserveB.key
        pool.lpSupply = 0n
        pool.feeBps = feeBps
        pool.createdAt = sol.timestamp()
        pool.admin = creator
        pool.isActive = true
        pool.totalVolumeA = 0n
        pool.totalVolumeB = 0n

        config.totalPools += 1n

        ctx.emit('PoolCreated', { tokenA: tokenAMint, tokenB: tokenBMint, feeBps })
      },
    }),

    // ── 3. Add liquidity ──
    addLiquidity: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        lpMint: p.mint().mut(),
        depositorTokenA: p.tokenAccount().mut(),
        depositorTokenB: p.tokenAccount().mut(),
        depositorLp: p.tokenAccount().mut(),
        depositor: p.signer(),
        token2022Program: p.token2022Program(),
      },
      args: { amountA: u64, amountB: u64, minLpTokens: u64 },
      run: ({ pool, tokenAMint, tokenBMint, reserveA, reserveB, lpMint, depositorTokenA, depositorTokenB, depositorLp, depositor }, { amountA, amountB, minLpTokens }, ctx) => {
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(amountA > 0n, 'InvalidAmount')
        ctx.require(amountB > 0n, 'InvalidAmount')

        // Validate mints
        ctx.require(reserveA.mint === tokenAMint.key, 'InvalidMint')
        ctx.require(reserveB.mint === tokenBMint.key, 'InvalidMint')
        ctx.require(depositorTokenA.mint === tokenAMint.key, 'InvalidMint')
        ctx.require(depositorTokenB.mint === tokenBMint.key, 'InvalidMint')
        ctx.require(depositorLp.mint === lpMint.key, 'InvalidMint')

        // Validate reserves belong to pool
        ctx.require(reserveA.owner === pool.key, 'InvalidReserve')
        ctx.require(reserveB.owner === pool.key, 'InvalidReserve')

        let lpTokens = 0n
        if (pool.lpSupply === 0n) {
          lpTokens = (amountA * amountB) / 1000000n
        } else {
          const lpFromA = (amountA * pool.lpSupply) / reserveA.amount
          const lpFromB = (amountB * pool.lpSupply) / reserveB.amount
          lpTokens = lpFromA < lpFromB ? lpFromA : lpFromB
        }
        ctx.require(lpTokens >= minLpTokens, 'SlippageExceeded')

        // Token-2022: transferChecked requires mint AccountInfo
        token.transferChecked({
          from: depositorTokenA,
          to: reserveA,
          authority: depositor,
          mint: tokenAMint,
          amount: amountA,
          decimals: 9,
        })

        token.transferChecked({
          from: depositorTokenB,
          to: reserveB,
          authority: depositor,
          mint: tokenBMint,
          amount: amountB,
          decimals: 9,
        })

        // Mint LP tokens (PDA-signed)
        token.mintTo({ mint: lpMint, to: depositorLp, authority: pool, amount: lpTokens })

        pool.lpSupply += lpTokens
        pool.totalVolumeA += amountA
        pool.totalVolumeB += amountB

        ctx.emit('LiquidityAdded', { amountA, amountB, lpTokens })
      },
    }),

    // ── 4. Swap A → B (Token-2022) ──
    swapAForB: ix({
      accounts: {
        pool: p.mut(Pool),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        traderTokenA: p.tokenAccount().mut(),
        traderTokenB: p.tokenAccount().mut(),
        trader: p.signer(),
        mintA: p.mint(),
        mintB: p.mint(),
        token2022Program: p.token2022Program(),
      },
      args: { amountIn: u64, minOut: u64 },
      run: ({ pool, reserveA, reserveB, traderTokenA, traderTokenB, trader, mintA, mintB }, { amountIn, minOut }, ctx) => {
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        ctx.require(traderTokenA.mint === mintA.key, 'InvalidMint')
        ctx.require(traderTokenB.mint === mintB.key, 'InvalidMint')
        ctx.require(reserveA.mint === mintA.key, 'InvalidMint')
        ctx.require(reserveB.mint === mintB.key, 'InvalidMint')

        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * reserveB.amount) / (reserveA.amount + netIn)
        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        // Token-2022: transferChecked required for Token-2022 tokens
        token.transferChecked({
          from: traderTokenA,
          to: reserveA,
          authority: trader,
          mint: mintA,
          amount: amountIn,
          decimals: 9,
        })

        // PDA-signed transfer out (pool authority)
        token.transferChecked({
          from: reserveB,
          to: traderTokenB,
          authority: pool,
          mint: mintB,
          amount: amountOut,
          decimals: 9,
        })

        pool.totalVolumeA += amountIn
        pool.totalVolumeB += amountOut

        ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 0 })
      },
    }),

    // ── 5. Swap B → A (Token-2022) ──
    swapBForA: ix({
      accounts: {
        pool: p.mut(Pool),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        traderTokenA: p.tokenAccount().mut(),
        traderTokenB: p.tokenAccount().mut(),
        trader: p.signer(),
        mintA: p.mint(),
        mintB: p.mint(),
        token2022Program: p.token2022Program(),
      },
      args: { amountIn: u64, minOut: u64 },
      run: ({ pool, reserveA, reserveB, traderTokenA, traderTokenB, trader, mintA, mintB }, { amountIn, minOut }, ctx) => {
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        ctx.require(traderTokenA.mint === mintA.key, 'InvalidMint')
        ctx.require(traderTokenB.mint === mintB.key, 'InvalidMint')
        ctx.require(reserveA.mint === mintA.key, 'InvalidMint')
        ctx.require(reserveB.mint === mintB.key, 'InvalidMint')

        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * reserveA.amount) / (reserveB.amount + netIn)
        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        token.transferChecked({
          from: traderTokenB,
          to: reserveB,
          authority: trader,
          mint: mintB,
          amount: amountIn,
          decimals: 9,
        })

        token.transferChecked({
          from: reserveA,
          to: traderTokenA,
          authority: pool,
          mint: mintA,
          amount: amountOut,
          decimals: 9,
        })

        pool.totalVolumeA += amountOut
        pool.totalVolumeB += amountIn

        ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 1 })
      },
    }),

    // ── 6. Remove liquidity ──
    removeLiquidity: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        reserveA: p.tokenAccount().mut(),
        reserveB: p.tokenAccount().mut(),
        lpMint: p.mint().mut(),
        withdrawerTokenA: p.tokenAccount().mut(),
        withdrawerTokenB: p.tokenAccount().mut(),
        withdrawerLp: p.tokenAccount().mut(),
        withdrawer: p.signer(),
        token2022Program: p.token2022Program(),
      },
      args: { lpTokens: u64, minAmountA: u64, minAmountB: u64 },
      run: ({ pool, tokenAMint, tokenBMint, reserveA, reserveB, lpMint, withdrawerTokenA, withdrawerTokenB, withdrawerLp, withdrawer }, { lpTokens, minAmountA, minAmountB }, ctx) => {
        ctx.require(pool.isActive, 'PoolInactive')
        ctx.require(lpTokens > 0n, 'InvalidAmount')
        ctx.require(pool.lpSupply > 0n, 'InvalidAmount')

        ctx.require(withdrawerLp.mint === lpMint.key, 'InvalidMint')
        ctx.require(reserveA.owner === pool.key, 'InvalidReserve')
        ctx.require(reserveB.owner === pool.key, 'InvalidReserve')

        const amountA = (lpTokens * reserveA.amount) / pool.lpSupply
        const amountB = (lpTokens * reserveB.amount) / pool.lpSupply

        ctx.require(amountA >= minAmountA, 'SlippageExceeded')
        ctx.require(amountB >= minAmountB, 'SlippageExceeded')

        token.burn({ from: withdrawerLp, mint: lpMint, authority: withdrawer, amount: lpTokens })

        token.transferChecked({
          from: reserveA,
          to: withdrawerTokenA,
          authority: pool,
          mint: tokenAMint,
          amount: amountA,
          decimals: 9,
        })

        token.transferChecked({
          from: reserveB,
          to: withdrawerTokenB,
          authority: pool,
          mint: tokenBMint,
          amount: amountB,
          decimals: 9,
        })

        pool.lpSupply -= lpTokens

        ctx.emit('LiquidityRemoved', { amountA, amountB, lpTokens })
      },
    }),

    // ── 7. Update fee (admin only) ──
    updateFee: ix({
      accounts: {
        pool: p.mut(Pool),
        admin: p.signer(),
      },
      args: { newFeeBps: u64 },
      run: ({ pool, admin }, { newFeeBps }, ctx) => {
        ctx.require(admin === pool.admin, 'Unauthorized')
        ctx.require(newFeeBps <= 1000n, 'InvalidFeeBps')

        pool.feeBps = newFeeBps

        ctx.emit('FeeUpdated', { newFeeBps })
        ctx.log('Fee updated to {}bps', newFeeBps)
      },
    }),
  },
})
