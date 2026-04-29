// ============================================================
// CLIENT SDK USAGE
//
// The same `amm` definition used for compilation is the typed client.
// Zero additional SDK code. Just import and use.
// ============================================================

import { createClient } from '@solana-kit/sdk'
import { amm } from './programs/amm'


// ══════════════════════════════════════════
// Setup
// ══════════════════════════════════════════

const client = createClient({
  cluster: 'devnet',
  payer: './keypair.json',
  programs: { amm },
})

const payer = client.payer

// Well-known mints
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'


// ══════════════════════════════════════════
// PDA Derivation (from seed definitions)
// ══════════════════════════════════════════

// Config — seeds: ['config']
const configAddr = amm.accounts.Config.derive()

// Pool — seeds: ['pool', '{tokenAMint}', '{tokenBMint}']
const poolAddr = amm.accounts.Pool.derive({
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
})


// ══════════════════════════════════════════
// 1. Initialize config (admin only)
// ══════════════════════════════════════════

await client.amm.initializeConfig({
  config: configAddr,
  admin: payer,
})


// ══════════════════════════════════════════
// 2. Create a SOL/USDC pool
// ══════════════════════════════════════════

await client.amm.createPool({
  config: configAddr,
  pool: poolAddr,
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
  feeBps: 30n,  // 0.3%
})


// ══════════════════════════════════════════
// 3. Add liquidity (deposit 10 SOL + 1000 USDC)
// ══════════════════════════════════════════

// Fetch pool to get reserve/mint addresses
const pool = await amm.accounts.Pool.fetch(poolAddr)

await client.amm.addLiquidity({
  pool: poolAddr,
  tokenAReserve: pool.tokenAReserve,
  tokenBReserve: pool.tokenBReserve,
  lpMint: pool.lpMint,
  depositorTokenA: client.token.getATA({ owner: payer, mint: SOL_MINT }),
  depositorTokenB: client.token.getATA({ owner: payer, mint: USDC_MINT }),
  depositorLp: client.token.getATA({ owner: payer, mint: pool.lpMint }),
  depositor: payer,
  amountA: 10_000_000_000n,    // 10 SOL
  amountB: 1_000_000_000n,     // 1000 USDC
  minLpTokens: 0n,             // Accept any amount (dangerous in prod!)
})


// ══════════════════════════════════════════
// 4. Swap SOL → USDC
// ══════════════════════════════════════════

await client.amm.swapAForB({
  pool: poolAddr,
  tokenAReserve: pool.tokenAReserve,
  tokenBReserve: pool.tokenBReserve,
  traderTokenA: client.token.getATA({ owner: payer, mint: SOL_MINT }),
  traderTokenB: client.token.getATA({ owner: payer, mint: USDC_MINT }),
  trader: payer,
  amountIn: 1_000_000_000n,     // 1 SOL
  minOut: 90_000_000n,          // At least 90 USDC (slippage protection)
})


// ══════════════════════════════════════════
// 5. Swap USDC → SOL (reverse direction)
// ══════════════════════════════════════════

await client.amm.swapBForA({
  pool: poolAddr,
  tokenAReserve: pool.tokenAReserve,
  tokenBReserve: pool.tokenBReserve,
  traderTokenA: client.token.getATA({ owner: payer, mint: SOL_MINT }),
  traderTokenB: client.token.getATA({ owner: payer, mint: USDC_MINT }),
  trader: payer,
  amountIn: 100_000_000n,       // 100 USDC
  minOut: 900_000_000n,         // At least 0.9 SOL
})


// ══════════════════════════════════════════
// 6. Remove liquidity
// ══════════════════════════════════════════

const lpBalance = await client.token.getBalance({ owner: payer, mint: pool.lpMint })

await client.amm.removeLiquidity({
  pool: poolAddr,
  tokenAReserve: pool.tokenAReserve,
  tokenBReserve: pool.tokenBReserve,
  lpMint: pool.lpMint,
  withdrawerTokenA: client.token.getATA({ owner: payer, mint: SOL_MINT }),
  withdrawerTokenB: client.token.getATA({ owner: payer, mint: USDC_MINT }),
  withdrawerLp: client.token.getATA({ owner: payer, mint: pool.lpMint }),
  withdrawer: payer,
  lpTokens: lpBalance,           // Remove all LP tokens
  minAmountA: 0n,
  minAmountB: 0n,
})


// ══════════════════════════════════════════
// 7. Update fee (admin only)
// ══════════════════════════════════════════

await client.amm.updateFee({
  pool: poolAddr,
  admin: payer,
  newFeeBps: 50n,  // Increase to 0.5%
})


// ══════════════════════════════════════════
// Fetch & display pool state (fully typed)
// ══════════════════════════════════════════

const updatedPool = await amm.accounts.Pool.fetch(poolAddr)

console.log(updatedPool)
// {
//   tokenAMint: string,         // pubkey
//   tokenBMint: string,         // pubkey
//   tokenAReserve: string,      // pubkey
//   tokenBReserve: string,      // pubkey
//   lpMint: string,             // pubkey
//   lpSupply: bigint,           // u64
//   feeBps: bigint,             // u64
//   createdAt: bigint,          // u64 (unix timestamp)
//   admin: string,              // pubkey
//   isActive: boolean,          // bool
//   totalVolumeA: bigint,       // u64
//   totalVolumeB: bigint,       // u64
//   bump: number,               // u8
// }


// ══════════════════════════════════════════
// Listen to events
// ══════════════════════════════════════════

amm.on('SwapExecuted', (event) => {
  console.log(`Swap: ${event.amountIn} → ${event.amountOut} (fee: ${event.fee})`)
  console.log(`Direction: ${event.direction === 0 ? 'A→B' : 'B→A'}`)
})

amm.on('LiquidityAdded', (event) => {
  console.log(`+Liquidity: ${event.amountA} + ${event.amountB} = ${event.lpTokens} LP`)
})

amm.on('FeeUpdated', (event) => {
  console.log(`Fee changed to ${event.newFeeBps}bps on ${event.pool}`)
})


// ══════════════════════════════════════════
// Testing (instant in-process VM)
// ══════════════════════════════════════════

import { createTestClient } from '@solana-kit/sdk/testing'

const test = createTestClient({ programs: { amm } })

test('create pool and swap', async () => {
  const admin = test.payer
  const trader = await test.createAccount()

  // Create test tokens
  const tokenA = await test.token.createMint({ decimals: 9, authority: admin })
  const tokenB = await test.token.createMint({ decimals: 6, authority: admin })

  await test.token.mintTo({ mint: tokenA, destination: admin, amount: 1_000_000_000_000n })
  await test.token.mintTo({ mint: tokenB, destination: admin, amount: 1_000_000_000_000n })
  await test.token.mintTo({ mint: tokenA, destination: trader, amount: 100_000_000n })
  await test.token.mintTo({ mint: tokenB, destination: trader, amount: 100_000_000n })

  // Init config → create pool → add liquidity → swap
  const cfg = amm.accounts.Config.derive()
  const poolPda = amm.accounts.Pool.derive({ tokenAMint: tokenA, tokenBMint: tokenB })

  await test.amm.initializeConfig({ config: cfg, admin })
  await test.amm.createPool({ config: cfg, pool: poolPda, tokenAMint: tokenA, tokenBMint: tokenB, feeBps: 30n })
  await test.amm.addLiquidity({ pool: poolPda, amountA: 1_000_000_000n, amountB: 1_000_000_000n, minLpTokens: 0n })
  await test.amm.swapAForB({ pool: poolPda, amountIn: 100_000n, minOut: 50_000n, trader })

  // Verify
  const poolData = await amm.accounts.Pool.fetch(poolPda)
  test.assert(poolData.totalVolumeA > 0n)
  test.assert(poolData.totalVolumeB > 0n)
})
