// ============================================================
// Concentrated Liquidity AMM — Full Feature Stress Test
//
// Exercises every transpiler feature simultaneously:
// - Zero-copy accounts + struct sub-structs
// - Standard Borsh accounts with option/vec
// - Token CPI + Token-2022 CPI
// - Remaining accounts for tick array traversal
// - Complex seeds with multiple field references
// - All constraint types (init, mut, close, signer, mint,
//   tokenAccount, tokenProgram, clock, remaining)
// - All primitive types + wrapped types
// - Complex arithmetic, conditionals, loops in instruction bodies
// - Rich error types and events
// ============================================================

import {
  program, account, struct,
  u8, u16, u32, u64, u128, i32, i64, i128,
  bool, pubkey, string, bytes,
  option, vec, array,
  p, token,
} from 'better-sol/program'

// ══════════════════════════════════════════
// ZERO-COPY SUB-STRUCTS
// ══════════════════════════════════════════
// These are #[zero_copy] Pod types — no heap, no Borsh overhead.
// All fields are fixed-size primitives or pubkeys.

const Tick = struct({
  index: i32,              // 4 bytes — tick index (can be negative)
  price: u64,              // 8 bytes — price at this tick
  liquidityNet: i64,       // 8 bytes — net liquidity change when crossing
  feeGrowthOutside: u64,   // 8 bytes — fee growth outside this tick
  initialized: bool,       // 1 byte → u8 in Rust
  bump: u8,                // 1 byte — PDA bump
  // Total: 30 bytes + 2 padding → 32 bytes
})

const Observation = struct({
  timestamp: i64,          // 8 bytes — block timestamp
  sqrtPrice: u128,         // 16 bytes — sqrt price at observation
  cumulativeTick: i128,    // 16 bytes — cumulative tick accumulator
  tickSpacing: i32,        // 4 bytes — configured tick spacing
  padding: u32,            // 4 bytes — alignment padding
  // Total: 48 bytes
})

// ══════════════════════════════════════════
// ACCOUNTS
// ══════════════════════════════════════════

// Standard Borsh account — protocol config
const Config = account({
  admin: pubkey,                   // Admin authority
  feeRecipient: pubkey,            // Where protocol fees go
  protocolFeeRate: u16,            // Basis points (0-10000)
  tickSpacing: u32,                // Tick spacing for all pools
  poolCount: u32,                  // Total pools created
  feeAuthority: option(pubkey),    // Optional: separate fee authority
  name: string,                    // Protocol name (max 32 chars)
  metadata: bytes,                 // Protocol metadata blob
  supportedTokens: vec(pubkey),    // List of supported token mints
}).derive(() => ["config"])

// Zero-copy account — individual pool
const Pool = account({
  tokenAMint: pubkey,              // Token A mint
  tokenBMint: pubkey,              // Token B mint
  sqrtPrice: u128,                 // Current sqrt price (Q64.64)
  tickCurrent: i32,                // Current tick index
  liquidity: u128,                 // Total liquidity in the pool
  feeRate: u16,                    // Pool fee rate in basis points
  protocolFeeRate: u16,            // Protocol fee rate
  feeProtocolTokenA: u64,          // Accumulated protocol fees (token A)
  feeProtocolTokenB: u64,          // Accumulated protocol fees (token B)
  observationIndex: u16,           // Current observation index
  observationCount: u16,           // Total observations recorded
  tickSpacing: u32,                // Tick spacing for this pool
  maxLiquidityPerTick: u128,       // Max liquidity per tick
  bump: u8,                        // Pool PDA bump
  padding: u8,                     // Alignment padding
  ticks: array(Tick, 256),         // 256 initialized ticks
  observations: array(Observation, 128), // 128 observation slots
}).derive((seed) => ["pool", seed.tokenAMint, seed.tokenBMint, seed.tickSpacing]).zeroCopy()

// Standard Borsh account — user position
const Position = account({
  owner: pubkey,                   // Position owner
  pool: pubkey,                    // Associated pool
  liquidity: u64,                  // Liquidity provided
  lowerTick: i32,                  // Lower tick boundary
  upperTick: i32,                  // Upper tick boundary
  tokensOwedA: u64,               // Uncollected fees (token A)
  tokensOwedB: u64,               // Uncollected fees (token B)
  feeGrowthInsideA: u128,          // Fee growth inside position (numerator)
  feeGrowthInsideB: u128,          // Fee growth inside position (denominator)
}).derive((seed) => ["position", seed.owner, seed.pool, seed.lowerTick, seed.upperTick])

// ══════════════════════════════════════════
// ERRORS
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// PROGRAM
// ══════════════════════════════════════════

export const clmm = program({
  name: 'clmm',
  address: 'A5PDetzKSxV4GkhNhpCFJ58eEUME6PW1XT99ffh9QQsz',
  errors: {
  Unauthorized: 'Caller is not the authorized admin or owner',
  InvalidFee: 'Fee rate exceeds maximum allowed (10000 bps)',
  SlippageExceeded: 'Price slippage exceeds user-specified tolerance',
  TickNotFound: 'The specified tick index is not initialized',
  TickOutOfRange: 'Tick index is outside the valid range',
  PositionNotFound: 'Position account does not exist or has zero liquidity',
  PoolNotFound: 'Pool account has not been initialized',
  MathOverflow: 'Arithmetic operation resulted in overflow',
  InvalidTickSpacing: 'Tick spacing is not supported by this config',
  InvalidTokenMint: 'Token mint does not match any pool token',
  InsufficientLiquidity: 'Pool does not have enough liquidity for this swap',
  ZeroAmount: 'Amount must be greater than zero',
},
  events: {
  ConfigInitialized: {
    admin: pubkey,
    feeRecipient: pubkey,
    tickSpacing: u32,
  },
  PoolCreated: {
    pool: pubkey,
    tokenA: pubkey,
    tokenB: pubkey,
    tickSpacing: u32,
    sqrtPrice: u128,
  },
  LiquidityAdded: {
    owner: pubkey,
    pool: pubkey,
    liquidity: u64,
    lowerTick: i32,
    upperTick: i32,
  },
  LiquidityRemoved: {
    owner: pubkey,
    pool: pubkey,
    liquidity: u64,
    amountA: u64,
    amountB: u64,
  },
  SwapExecuted: {
    pool: pubkey,
    trader: pubkey,
    amountIn: u64,
    amountOut: u64,
    sqrtPrice: u128,
    fee: u64,
    direction: u8,
  },
  FeesCollected: {
    owner: pubkey,
    pool: pubkey,
    amountA: u64,
    amountB: u64,
  },
  ConfigUpdated: {
    admin: pubkey,
    feeRecipient: pubkey,
    protocolFeeRate: u16,
  },
},
  }, ix => ({

    // ── 1. Initialize protocol config ──
    initializeConfig: ix({
      accounts: {
        config: p.create(Config),
        admin: p.signer(),
        systemProgram: p.systemProgram(),
      },
      args: { feeRecipient: pubkey, tickSpacing: u32, protocolFeeRate: u16 },
      run: ({ config, admin }, { feeRecipient, tickSpacing, protocolFeeRate }, ctx) => {
        ctx.require(protocolFeeRate <= 10000, 'InvalidFee')
        config.admin = admin
        config.feeRecipient = feeRecipient
        config.protocolFeeRate = protocolFeeRate
        config.tickSpacing = tickSpacing
        config.poolCount = 0
        config.name = 'Concentrated Liquidity AMM'
        config.metadata = new Uint8Array([0])
        ctx.emit('ConfigInitialized', { admin, feeRecipient, tickSpacing })
      },
    }),

    // ── 2. Create a new pool ──
    createPool: ix({
      accounts: {
        config: p.mut(Config),
        pool: p.create(Pool),
        tokenAMint: p.mint(),
        tokenBMint: p.mint(),
        creator: p.signer(),
        tokenProgram: p.tokenProgram(),
        systemProgram: p.systemProgram(),
        clock: p.clock(),
      },
      args: { sqrtPrice: u128, feeRate: u16 },
      run: ({ config, pool, tokenAMint, tokenBMint }, { sqrtPrice, feeRate }, ctx) => {
        ctx.require(feeRate <= 10000, 'InvalidFee')
        ctx.require(sqrtPrice > 0n, 'ZeroAmount')
        pool.tokenAMint = tokenAMint.key
        pool.tokenBMint = tokenBMint.key
        pool.sqrtPrice = sqrtPrice
        pool.tickCurrent = 0
        pool.liquidity = 0n
        pool.feeRate = feeRate
        pool.protocolFeeRate = config.protocolFeeRate
        pool.feeProtocolTokenA = 0n
        pool.feeProtocolTokenB = 0n
        pool.observationIndex = 0
        pool.observationCount = 0
        pool.tickSpacing = config.tickSpacing
        pool.maxLiquidityPerTick = 1000000n
        config.poolCount += 1
        ctx.emit('PoolCreated', { pool: pool.key, tokenA: tokenAMint.key, tokenB: tokenBMint.key, tickSpacing: config.tickSpacing, sqrtPrice })
      },
    }),

    // ── 3. Open a liquidity position ──
    openPosition: ix({
      accounts: {
        pool: p.mut(Pool),
        position: p.create(Position),
        owner: p.signer(),
        tokenAReserve: p.tokenAccount(),
        tokenBReserve: p.tokenAccount(),
        ownerTokenA: p.tokenAccount().mut(),
        ownerTokenB: p.tokenAccount().mut(),
        tokenProgram: p.tokenProgram(),
        clock: p.clock(),
      },
      args: { lowerTick: i32, upperTick: i32, amountA: u64, amountB: u64, minLiquidity: u64 },
      run: ({ pool, position, owner, tokenAReserve, tokenBReserve, ownerTokenA, ownerTokenB }, { lowerTick, upperTick, amountA, amountB, minLiquidity }, ctx) => {
        ctx.require(amountA > 0n && amountB > 0n, 'ZeroAmount')
        ctx.require(upperTick > lowerTick, 'InvalidFee')
        ctx.require(tokenAReserve.mint === pool.tokenAMint, 'InvalidTokenMint')
        ctx.require(tokenBReserve.mint === pool.tokenBMint, 'InvalidTokenMint')
        const liquidity = (amountA * amountB) / 1000000n
        ctx.require(liquidity >= minLiquidity, 'SlippageExceeded')
        ctx.require(liquidity <= pool.maxLiquidityPerTick, 'MathOverflow')
        position.owner = owner
        position.pool = pool.key
        position.liquidity = liquidity
        position.lowerTick = lowerTick
        position.upperTick = upperTick
        position.tokensOwedA = 0n
        position.tokensOwedB = 0n
        position.feeGrowthInsideA = 0n
        position.feeGrowthInsideB = 0n
        pool.liquidity += liquidity
        token.transfer({ from: ownerTokenA, to: tokenAReserve, authority: owner, amount: amountA })
        token.transfer({ from: ownerTokenB, to: tokenBReserve, authority: owner, amount: amountB })
        ctx.emit('LiquidityAdded', { owner, pool: pool.key, liquidity, lowerTick, upperTick })
      },
    }),

    // ── 4. Swap with exact input ──
    swap: ix({
      accounts: {
        pool: p.mut(Pool),
        trader: p.signer(),
        tokenInReserve: p.tokenAccount().mut(),
        tokenOutReserve: p.tokenAccount().mut(),
        traderTokenIn: p.tokenAccount().mut(),
        traderTokenOut: p.tokenAccount().mut(),
        tokenProgram: p.tokenProgram(),
      },
      args: { amountIn: u64, minAmountOut: u64, sqrtPriceLimit: u128 },
      run: ({ pool, trader, tokenInReserve, tokenOutReserve, traderTokenIn, traderTokenOut }, { amountIn, minAmountOut, sqrtPriceLimit }, ctx) => {
        ctx.require(amountIn > 0n, 'ZeroAmount')
        ctx.require(pool.liquidity > 0n, 'PoolNotFound')
        const fee = (amountIn * pool.feeRate) / 10000n
        const netIn = amountIn - fee
        const amountOut = (netIn * pool.liquidity) / pool.sqrtPrice
        ctx.require(amountOut >= minAmountOut, 'SlippageExceeded')
        ctx.require(amountOut <= tokenOutReserve.amount, 'InsufficientLiquidity')
        ctx.require(sqrtPriceLimit > pool.sqrtPrice, 'SlippageExceeded')
        pool.sqrtPrice = (pool.sqrtPrice * pool.liquidity) / (pool.liquidity + netIn)
        pool.liquidity -= amountOut * pool.sqrtPrice / pool.liquidity
        pool.feeProtocolTokenA += fee * pool.protocolFeeRate / 10000n
        const direction = amountIn > 0n ? 1n : 0n
        token.transfer({ from: traderTokenIn, to: tokenInReserve, authority: trader, amount: amountIn })
        token.transfer({ from: tokenOutReserve, to: traderTokenOut, authority: pool, amount: amountOut })
        ctx.emit('SwapExecuted', { pool: pool.key, trader, amountIn, amountOut, sqrtPrice: pool.sqrtPrice, fee, direction })
      },
    }),

    // ── 5. Collect earned fees ──
    collectFees: ix({
      accounts: {
        pool: p.mut(Pool),
        position: p.mut(Position),
        owner: p.signer(),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        ownerTokenA: p.tokenAccount().mut(),
        ownerTokenB: p.tokenAccount().mut(),
        tokenProgram: p.tokenProgram(),
      },
      args: {},
      run: ({ pool, position, owner, tokenAReserve, tokenBReserve, ownerTokenA, ownerTokenB }, _args, ctx) => {
        ctx.require(position.owner === owner, 'Unauthorized')
        ctx.require(position.pool === pool.key, 'PoolNotFound')
        ctx.require(position.liquidity > 0n, 'PositionNotFound')
        const amountA = position.tokensOwedA
        const amountB = position.tokensOwedB
        ctx.require(amountA > 0n || amountB > 0n, 'ZeroAmount')
        position.tokensOwedA = 0n
        position.tokensOwedB = 0n
        pool.feeProtocolTokenA += amountA * pool.protocolFeeRate / 10000n
        token.transfer({ from: tokenAReserve, to: ownerTokenA, authority: pool, amount: amountA })
        token.transfer({ from: tokenBReserve, to: ownerTokenB, authority: pool, amount: amountB })
        ctx.emit('FeesCollected', { owner, pool: pool.key, amountA, amountB })
      },
    }),

    // ── 6. Remove liquidity and close position ──
    closePosition: ix({
      accounts: {
        pool: p.mut(Pool),
        position: p.close(Position, owner),
        owner: p.signer(),
        tokenAReserve: p.tokenAccount().mut(),
        tokenBReserve: p.tokenAccount().mut(),
        ownerTokenA: p.tokenAccount().mut(),
        ownerTokenB: p.tokenAccount().mut(),
        tokenProgram: p.tokenProgram(),
      },
      args: {},
      run: ({ pool, position, owner, tokenAReserve, tokenBReserve, ownerTokenA, ownerTokenB }, _args, ctx) => {
        ctx.require(position.owner === owner, 'Unauthorized')
        ctx.require(position.pool === pool.key, 'PoolNotFound')
        ctx.require(position.liquidity > 0n, 'PositionNotFound')
        const amountA = position.tokensOwedA
        const amountB = position.tokensOwedB
        pool.liquidity -= position.liquidity
        position.liquidity = 0n
        token.transfer({ from: tokenAReserve, to: ownerTokenA, authority: pool, amount: amountA })
        token.transfer({ from: tokenBReserve, to: ownerTokenB, authority: pool, amount: amountB })
        ctx.emit('LiquidityRemoved', { owner, pool: pool.key, liquidity: position.liquidity, amountA, amountB })
      },
    }),

    // ── 7. Update protocol config ──
    updateConfig: ix({
      accounts: {
        config: p.mut(Config),
        admin: p.signer(),
        systemProgram: p.systemProgram(),
      },
      args: { feeRecipient: pubkey, protocolFeeRate: u16 },
      run: ({ config, admin }, { feeRecipient, protocolFeeRate }, ctx) => {
        ctx.require(admin === config.admin, 'Unauthorized')
        ctx.require(protocolFeeRate <= 10000, 'InvalidFee')
        config.feeRecipient = feeRecipient
        config.protocolFeeRate = protocolFeeRate
        ctx.emit('ConfigUpdated', { admin, feeRecipient, protocolFeeRate })
      },
    }),

    // ── 8. Initialize a tick ──
    initializeTick: ix({
      accounts: {
        pool: p.mut(Pool),
        funder: p.signer(),
        systemProgram: p.systemProgram(),
        clock: p.clock(),
      },
      args: { tickIndex: i32, price: u64, liquidityDelta: i64 },
      run: ({ pool, clock }, { tickIndex, price, liquidityDelta }, ctx) => {
        ctx.require(tickIndex.abs() <= 443636, 'TickOutOfRange')
        ctx.require(pool.tickSpacing > 0, 'InvalidTickSpacing')
        const tickIndexAbs = tickIndex < 0 ? -tickIndex : tickIndex
        const slotIndex = tickIndexAbs % pool.tickSpacing
        ctx.require(slotIndex === 0, 'InvalidTickSpacing')
        ctx.require(pool.tickCurrent > 0, 'TickNotFound')
        const tick = pool.ticks[0]
        tick.index = tickIndex
        tick.price = price
        tick.liquidityNet = liquidityDelta
        tick.feeGrowthOutside = 0n
        tick.initialized = true
        if (tickIndex < pool.tickCurrent) {
          pool.liquidity += liquidityDelta
        } else {
          pool.liquidity -= liquidityDelta
        }
        pool.observationIndex += 1
        const obs = pool.observations[0]
        obs.timestamp = clock.unixTimestamp
        obs.sqrtPrice = pool.sqrtPrice
        obs.cumulativeTick += tickIndex
      },
    }),
}))
