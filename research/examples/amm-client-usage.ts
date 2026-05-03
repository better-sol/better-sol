import { betterSol, keypairFile } from 'better-sol'
import { amm } from './amm-program'

const sol = await betterSol({
  cluster: 'devnet',
  payer: keypairFile('./keypair.json'),
  programs: { amm },
})

const payer = sol.payer

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const configAddr = await sol.amm.accounts.Config.derive({})
const poolAddr = await sol.amm.accounts.Pool.derive({
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
})

await sol.amm.initializeConfig({
  config: configAddr,
  admin: payer,
})

await sol.amm.createPool({
  config: configAddr,
  pool: poolAddr,
  tokenAMint: SOL_MINT,
  tokenBMint: USDC_MINT,
  creator: payer,
  feeBps: 30n,
})

const poolResult = await sol.amm.accounts.Pool.fetch(poolAddr)
if (!poolResult) throw new Error("Pool not found")

await sol.amm.addLiquidity({
  pool: poolAddr,
  tokenAReserve: poolResult.tokenAReserve,
  tokenBReserve: poolResult.tokenBReserve,
  lpMint: poolResult.lpMint,
  depositorTokenA: "ATA_ADDRESS_HERE",
  depositorTokenB: "ATA_ADDRESS_HERE",
  depositorLp: "ATA_ADDRESS_HERE",
  depositor: payer,
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  amountA: 10_000_000_000n,
  amountB: 1_000_000_000n,
  minLpTokens: 0n,
})
