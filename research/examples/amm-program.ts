// ============================================================
// AMM (Automated Market Maker) — Complete Program
//
// Written in @solana-kit/program syntax
// This file defines the on-chain program AND serves as the
// typed client SDK — zero additional code needed.
//
// What this exercises:
// - Multiple accounts with PDA seeds
// - Complex arithmetic (constant product formula, fees)
// - Multiple CPI calls per instruction
// - User-signed and PDA-signed token transfers
// - Token minting and burning (LP tokens)
// - Events and logging
// - Sysvars (timestamp)
// - Access control with custom errors
// - 7 instructions that compose together
// ============================================================

import {
  program, account, ix,
  u64, u8, bool, pubkey,
  p, token, sol, emit, log, require,
} from '@solana-kit/program'


// ══════════════════════════════════════════
// ACCOUNTS — Like Zod schemas
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
}).seeds('pool', '{tokenAMint}', '{tokenBMint}')


// ══════════════════════════════════════════
// ERRORS
// ══════════════════════════════════════════

const errors = {
  Unauthorized: 'Caller is not authorized',
  PoolDoesNotExist: 'Pool does not exist or is inactive',
  InsufficientLiquidity: 'Not enough liquidity in the pool',
  SlippageExceeded: 'Output amount below minimum (slippage)',
  InvalidAmount: 'Amount must be greater than zero',
  InvalidFeeBps: 'Fee must be between 0 and 1000 basis points',
}


// ══════════════════════════════════════════
// PROGRAM — Flat instruction map
// ══════════════════════════════════════════

export const amm = program('amm', 'AMMxPooL11111111111111111111111111111111111', errors, {

  // ── 1. Initialize the global config ──
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

  // ── 2. Create a new trading pool ──
  createPool: ix({
    accounts: {
      config: Config,
      pool: p.init(Pool),
      tokenAMint: p.mint(),
      tokenBMint: p.mint(),
      creator: p.signer(),
    },
    args: { feeBps: u64 },
    run: ({ config, pool, tokenAMint, tokenBMint, creator }, { feeBps }) => {
      require(creator === config.admin, 'Unauthorized')
      require(feeBps <= 1000n, 'InvalidFeeBps')

      pool.tokenAMint = tokenAMint
      pool.tokenBMint = tokenBMint
      pool.lpSupply = 0n
      pool.feeBps = feeBps
      pool.createdAt = sol.timestamp()
      pool.admin = creator
      pool.isActive = true
      pool.totalVolumeA = 0n
      pool.totalVolumeB = 0n

      config.totalPools += 1n

      emit('PoolCreated', { pool, tokenA: tokenAMint, tokenB: tokenBMint })
    },
  }),

  // ── 3. Add liquidity to a pool ──
  addLiquidity: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount('tokenAMint').mut(),
      tokenBReserve: p.tokenAccount('tokenBMint').mut(),
      lpMint: p.mint().mut(),
      depositorTokenA: p.tokenAccount('tokenAMint').mut(),
      depositorTokenB: p.tokenAccount('tokenBMint').mut(),
      depositorLp: p.tokenAccount('lpMint').mut(),
      depositor: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { amountA: u64, amountB: u64, minLpTokens: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, lpMint, depositorTokenA, depositorTokenB, depositorLp, depositor }, { amountA, amountB, minLpTokens }) => {
      require(pool.isActive, 'PoolDoesNotExist')
      require(amountA > 0n, 'InvalidAmount')
      require(amountB > 0n, 'InvalidAmount')

      let lpTokens = 0n

      if (pool.lpSupply === 0n) {
        // First deposit: LP tokens = geometric mean
        lpTokens = (amountA * amountB) / 1000000n
        require(lpTokens > 0n, 'InvalidAmount')
      } else {
        // Subsequent deposits: proportional to existing liquidity
        const lpFromA = (amountA * pool.lpSupply) / tokenAReserve.amount
        const lpFromB = (amountB * pool.lpSupply) / tokenBReserve.amount
        lpTokens = lpFromA < lpFromB ? lpFromA : lpFromB
      }

      require(lpTokens >= minLpTokens, 'SlippageExceeded')

      // Transfer both tokens from depositor to pool reserves
      token.transfer({ from: depositorTokenA, to: tokenAReserve, authority: depositor, amount: amountA })
      token.transfer({ from: depositorTokenB, to: tokenBReserve, authority: depositor, amount: amountB })

      // Mint LP tokens to depositor (PDA-signed — pool is the authority)
      token.mintTo({ mint: lpMint, to: depositorLp, authority: pool, amount: lpTokens })

      pool.lpSupply += lpTokens
      pool.totalVolumeA += amountA
      pool.totalVolumeB += amountB

      emit('LiquidityAdded', { pool, amountA, amountB, lpTokens })
    },
  }),

  // ── 4. Remove liquidity from a pool ──
  removeLiquidity: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount('tokenAMint').mut(),
      tokenBReserve: p.tokenAccount('tokenBMint').mut(),
      lpMint: p.mint().mut(),
      withdrawerTokenA: p.tokenAccount('tokenAMint').mut(),
      withdrawerTokenB: p.tokenAccount('tokenBMint').mut(),
      withdrawerLp: p.tokenAccount('lpMint').mut(),
      withdrawer: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { lpTokens: u64, minAmountA: u64, minAmountB: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, lpMint, withdrawerTokenA, withdrawerTokenB, withdrawerLp, withdrawer }, { lpTokens, minAmountA, minAmountB }) => {
      require(pool.isActive, 'PoolDoesNotExist')
      require(lpTokens > 0n, 'InvalidAmount')
      require(pool.lpSupply > 0n, 'InsufficientLiquidity')

      // Calculate proportional withdrawal
      const amountA = (lpTokens * tokenAReserve.amount) / pool.lpSupply
      const amountB = (lpTokens * tokenBReserve.amount) / pool.lpSupply

      require(amountA >= minAmountA, 'SlippageExceeded')
      require(amountB >= minAmountB, 'SlippageExceeded')

      // Burn the LP tokens
      token.burn({ from: withdrawerLp, mint: lpMint, authority: withdrawer, amount: lpTokens })

      // Transfer proportional amounts back (PDA-signed)
      token.transfer({ from: tokenAReserve, to: withdrawerTokenA, authority: pool, amount: amountA })
      token.transfer({ from: tokenBReserve, to: withdrawerTokenB, authority: pool, amount: amountB })

      pool.lpSupply -= lpTokens

      emit('LiquidityRemoved', { pool, amountA, amountB, lpTokens })
    },
  }),

  // ── 5. Swap token A → token B ──
  swapAForB: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount('tokenAMint').mut(),
      tokenBReserve: p.tokenAccount('tokenBMint').mut(),
      traderTokenA: p.tokenAccount('tokenAMint').mut(),
      traderTokenB: p.tokenAccount('tokenBMint').mut(),
      trader: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { amountIn: u64, minOut: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, traderTokenA, traderTokenB, trader }, { amountIn, minOut }) => {
      require(pool.isActive, 'PoolDoesNotExist')
      require(amountIn > 0n, 'InvalidAmount')

      // Constant product formula: x * y = k
      const fee = (amountIn * pool.feeBps) / 10000n
      const netIn = amountIn - fee
      const amountOut = (netIn * tokenBReserve.amount) / (tokenAReserve.amount + netIn)

      require(amountOut >= minOut, 'SlippageExceeded')

      // Transfer A from trader to pool (user-signed)
      token.transfer({ from: traderTokenA, to: tokenAReserve, authority: trader, amount: amountIn })

      // Transfer B from pool to trader (PDA-signed)
      token.transfer({ from: tokenBReserve, to: traderTokenB, authority: pool, amount: amountOut })

      pool.totalVolumeA += amountIn
      pool.totalVolumeB += amountOut

      emit('SwapExecuted', { pool, amountIn, amountOut, fee, direction: 0 })
    },
  }),

  // ── 6. Swap token B → token A ──
  swapBForA: ix({
    accounts: {
      pool: p.mut(Pool),
      tokenAReserve: p.tokenAccount('tokenAMint').mut(),
      tokenBReserve: p.tokenAccount('tokenBMint').mut(),
      traderTokenA: p.tokenAccount('tokenAMint').mut(),
      traderTokenB: p.tokenAccount('tokenBMint').mut(),
      trader: p.signer(),
      tokenProgram: p.tokenProgram(),
    },
    args: { amountIn: u64, minOut: u64 },
    run: ({ pool, tokenAReserve, tokenBReserve, traderTokenA, traderTokenB, trader }, { amountIn, minOut }) => {
      require(pool.isActive, 'PoolDoesNotExist')
      require(amountIn > 0n, 'InvalidAmount')

      // Constant product formula (reversed reserves)
      const fee = (amountIn * pool.feeBps) / 10000n
      const netIn = amountIn - fee
      const amountOut = (netIn * tokenAReserve.amount) / (tokenBReserve.amount + netIn)

      require(amountOut >= minOut, 'SlippageExceeded')

      // Transfer B from trader to pool (user-signed)
      token.transfer({ from: traderTokenB, to: tokenBReserve, authority: trader, amount: amountIn })

      // Transfer A from pool to trader (PDA-signed)
      token.transfer({ from: tokenAReserve, to: traderTokenA, authority: pool, amount: amountOut })

      pool.totalVolumeA += amountOut
      pool.totalVolumeB += amountIn

      emit('SwapExecuted', { pool, amountIn, amountOut, fee, direction: 1 })
    },
  }),

  // ── 7. Update pool fee (admin only) ──
  updateFee: ix({
    accounts: {
      pool: p.mut(Pool),
      admin: p.signer(),
    },
    args: { newFeeBps: u64 },
    run: ({ pool, admin }, { newFeeBps }) => {
      require(admin === pool.admin, 'Unauthorized')
      require(newFeeBps <= 1000n, 'InvalidFeeBps')

      pool.feeBps = newFeeBps

      emit('FeeUpdated', { pool, newFeeBps })
      log('Fee updated to {}bps', newFeeBps)
    },
  }),
})
