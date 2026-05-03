// ============================================================
// AMM (Automated Market Maker) — Complete Program
//
// Written in better-sol/program syntax
// This file defines the on-chain program AND serves as the
// typed client SDK — zero additional code needed.
//
// What this exercises:
// - Multiple accounts with PDA seeds (type-checked field refs)
// - Complex arithmetic (constant product formula, fees)
// - Multiple CPI calls per instruction
// - User-signed and PDA-signed token transfers
// - Token minting and burning (LP tokens)
// - Type-safe errors via ctx.require()
// - Type-safe events via ctx.emit() — names AND data shapes
// - Structured logging via ctx.log()
// - Sysvars (timestamp)
// - Access control with custom errors
// - 7 instructions that compose together
//
// Type safety (all compile-time checked):
// - ctx.require(cond, 'ErrorName') — validated by transpiler
// - ctx.emit('EventName', { data }) — validated by transpiler
// - ctx.require(tokenAReserve.mint === pool.tokenAMint) — strongly-typed account fields
// - seeds('{field}') — validated against account pubkey fields
// ============================================================

import {
  program, account,
  u64, u8, bool, pubkey,
  p, token, sol,
} from 'better-sol/program'

// ══════════════════════════════════════════
// ACCOUNTS — Like Zod schemas
// ══════════════════════════════════════════

const Config = account({
  admin: pubkey,
  totalPools: u64,
  feeBps: u64,
  bump: u8,
}).derive(() => ["config"])

const Pool = account({
  tokenAMint: pubkey,
  tokenBMint: pubkey,
  tokenAReserve: pubkey,
  tokenBReserve: pubkey,
  lpMint: pubkey,
  lpSupply: u64,
  feeBps: u64,
  createdAt: u64,
  admin: pubkey,
  isActive: bool,
  totalVolumeA: u64,
  totalVolumeB: u64,
  bump: u8,
}).derive((seed) => ["pool", seed.tokenAMint, seed.tokenBMint])
//              ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^ compile-time checked pubkey fields

// ══════════════════════════════════════════
// ERRORS — Typed registry for ctx.require()
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// EVENTS — Typed registry for ctx.emit()
// Event names autocomplete, data shapes validated
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// PROGRAM — Named params, ctx carries types
// ══════════════════════════════════════════

export const amm = program({
  name: 'amm',
  address: '2u8vhuKF7oRyRUuQ4d8v2ZqKBmtEYieufyb9vGsFLrQY',
  accounts: { Config, Pool },
  errors: {
  Unauthorized: 'Caller is not authorized',
  PoolDoesNotExist: 'Pool does not exist or is inactive',
  InsufficientLiquidity: 'Not enough liquidity in the pool',
  SlippageExceeded: 'Output amount below minimum (slippage)',
  InvalidAmount: 'Amount must be greater than zero',
  InvalidFeeBps: 'Fee must be between 0 and 1000 basis points',
},
  events: {
  PoolCreated: {
    tokenA: pubkey,
    tokenB: pubkey,
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
  SwapExecuted: {
    amountIn: u64,
    amountOut: u64,
    fee: u64,
    direction: u8,
  },
  FeeUpdated: {
    newFeeBps: u64,
  },
},
  }, ix => ({

    // ── 1. Initialize the global config ──
    initializeConfig: ix({
      accounts: {
        config: p.create(Config),
        admin: p.signer(),
      },
      run: ({ config, admin }) => {
        config.admin = admin
        config.totalPools = 0n
        config.feeBps = 30n
      },
    }),

    // ── 2. Create a new trading pool ──
    createPool: ix({
      accounts: {
        config: p.mut(Config),
        pool: p.create(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        creator: p.signer(),
      },
      args: { feeBps: u64 },
      run: ({ config, pool, tokenAMint, tokenBMint, creator }, { feeBps }, ctx) => {
        ctx.require(creator === config.admin, 'Unauthorized')
        ctx.require(feeBps <= 1000n, 'InvalidFeeBps')

        pool.tokenAMint = tokenAMint.key
        pool.tokenBMint = tokenBMint.key
        pool.lpSupply = 0n
        pool.feeBps = feeBps
        pool.createdAt = sol.timestamp()
        pool.admin = creator
        pool.isActive = true
        pool.totalVolumeA = 0n
        pool.totalVolumeB = 0n

        config.totalPools += 1n

        ctx.emit('PoolCreated', { tokenA: tokenAMint, tokenB: tokenBMint })
      },
    }),

    // ── 3. Add liquidity to a pool ──
    addLiquidity: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        lpMint: p.mint().mut(),
        depositorTokenA: p.tokenAccount().mut(),
        depositorTokenB: p.tokenAccount().mut(),
        depositorLp: p.tokenAccount().mut(),
        depositor: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amountA: u64, amountB: u64, minLpTokens: u64 },
      run: ({ pool, tokenAReserve, tokenBReserve, lpMint, depositorTokenA, depositorTokenB, depositorLp, depositor }, { amountA, amountB, minLpTokens }, ctx) => {
        ctx.require(pool.isActive, 'PoolDoesNotExist')
        ctx.require(amountA > 0n, 'InvalidAmount')
        ctx.require(amountB > 0n, 'InvalidAmount')
        
        ctx.require(tokenAReserve.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(tokenBReserve.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(tokenAReserve.owner === pool.key, 'Unauthorized')
        ctx.require(tokenBReserve.owner === pool.key, 'Unauthorized')
        
        ctx.require(depositorTokenA.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(depositorTokenB.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(depositorLp.mint === lpMint.key, 'Unauthorized')

        let lpTokens = 0n

        if (pool.lpSupply === 0n) {
          lpTokens = (amountA * amountB) / 1000000n
          ctx.require(lpTokens > 0n, 'InvalidAmount')
        } else {
          const lpFromA = (amountA * pool.lpSupply) / tokenAReserve.amount
          const lpFromB = (amountB * pool.lpSupply) / tokenBReserve.amount
          lpTokens = lpFromA < lpFromB ? lpFromA : lpFromB
        }

        ctx.require(lpTokens >= minLpTokens, 'SlippageExceeded')

        token.transfer({ from: depositorTokenA, to: tokenAReserve, authority: depositor, amount: amountA })
        token.transfer({ from: depositorTokenB, to: tokenBReserve, authority: depositor, amount: amountB })
        token.mintTo({ mint: lpMint, to: depositorLp, authority: pool, amount: lpTokens })

        pool.lpSupply += lpTokens
        pool.totalVolumeA += amountA
        pool.totalVolumeB += amountB

        ctx.emit('LiquidityAdded', { amountA, amountB, lpTokens })
      },
    }),

    // ── 4. Remove liquidity from a pool ──
    removeLiquidity: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        lpMint: p.mint().mut(),
        withdrawerTokenA: p.tokenAccount().mut(),
        withdrawerTokenB: p.tokenAccount().mut(),
        withdrawerLp: p.tokenAccount().mut(),
        withdrawer: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { lpTokens: u64, minAmountA: u64, minAmountB: u64 },
      run: ({ pool, tokenAReserve, tokenBReserve, lpMint, withdrawerTokenA, withdrawerTokenB, withdrawerLp, withdrawer }, { lpTokens, minAmountA, minAmountB }, ctx) => {
        ctx.require(pool.isActive, 'PoolDoesNotExist')
        ctx.require(lpTokens > 0n, 'InvalidAmount')
        ctx.require(pool.lpSupply > 0n, 'InsufficientLiquidity')

        ctx.require(tokenAReserve.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(tokenBReserve.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(tokenAReserve.owner === pool.key, 'Unauthorized')
        ctx.require(tokenBReserve.owner === pool.key, 'Unauthorized')
        
        ctx.require(withdrawerTokenA.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(withdrawerTokenB.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(withdrawerLp.mint === lpMint.key, 'Unauthorized')

        const amountA = (lpTokens * tokenAReserve.amount) / pool.lpSupply
        const amountB = (lpTokens * tokenBReserve.amount) / pool.lpSupply

        ctx.require(amountA >= minAmountA, 'SlippageExceeded')
        ctx.require(amountB >= minAmountB, 'SlippageExceeded')

        token.burn({ from: withdrawerLp, mint: lpMint, authority: withdrawer, amount: lpTokens })
        token.transfer({ from: tokenAReserve, to: withdrawerTokenA, authority: pool, amount: amountA })
        token.transfer({ from: tokenBReserve, to: withdrawerTokenB, authority: pool, amount: amountB })

        pool.lpSupply -= lpTokens

        ctx.emit('LiquidityRemoved', { amountA, amountB, lpTokens })
      },
    }),

    // ── 5. Swap token A → token B ──
    swapAForB: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        traderTokenA: p.tokenAccount().mut(),
        traderTokenB: p.tokenAccount().mut(),
        trader: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amountIn: u64, minOut: u64 },
      run: ({ pool, tokenAReserve, tokenBReserve, traderTokenA, traderTokenB, trader }, { amountIn, minOut }, ctx) => {
        ctx.require(pool.isActive, 'PoolDoesNotExist')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        ctx.require(tokenAReserve.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(tokenBReserve.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(traderTokenA.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(traderTokenB.mint === pool.tokenBMint, 'Unauthorized')

        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * tokenBReserve.amount) / (tokenAReserve.amount + netIn)

        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        token.transfer({ from: traderTokenA, to: tokenAReserve, authority: trader, amount: amountIn })
        token.transfer({ from: tokenBReserve, to: traderTokenB, authority: pool, amount: amountOut })

        pool.totalVolumeA += amountIn
        pool.totalVolumeB += amountOut

        ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 0 })
      },
    }),

    // ── 6. Swap token B → token A ──
    swapBForA: ix({
      accounts: {
        pool: p.mut(Pool),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        traderTokenA: p.tokenAccount().mut(),
        traderTokenB: p.tokenAccount().mut(),
        trader: p.signer(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amountIn: u64, minOut: u64 },
      run: ({ pool, tokenAReserve, tokenBReserve, traderTokenA, traderTokenB, trader }, { amountIn, minOut }, ctx) => {
        ctx.require(pool.isActive, 'PoolDoesNotExist')
        ctx.require(amountIn > 0n, 'InvalidAmount')

        ctx.require(tokenAReserve.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(tokenBReserve.mint === pool.tokenBMint, 'Unauthorized')
        ctx.require(traderTokenA.mint === pool.tokenAMint, 'Unauthorized')
        ctx.require(traderTokenB.mint === pool.tokenBMint, 'Unauthorized')

        const fee = (amountIn * pool.feeBps) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * tokenAReserve.amount) / (tokenBReserve.amount + netIn)

        ctx.require(amountOut >= minOut, 'SlippageExceeded')

        token.transfer({ from: traderTokenB, to: tokenBReserve, authority: trader, amount: amountIn })
        token.transfer({ from: tokenAReserve, to: traderTokenA, authority: pool, amount: amountOut })

        pool.totalVolumeA += amountOut
        pool.totalVolumeB += amountIn

        ctx.emit('SwapExecuted', { amountIn, amountOut, fee, direction: 1 })
      },
    }),

    // ── 7. Update pool fee (admin only) ──
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
}))
