import { betterSol, keypairFile } from "better-sol"
import { counter } from "./counter-program"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const payer = sol.payer

const counterAddr = await sol.counter.accounts.Counter.derive({ authority: payer })

await sol.counter.initialize({
  counter: counterAddr,
  initialValue: 0n,
})

await sol.counter.increment({
  counter: counterAddr,
  amount: 5n,
})

const data = await sol.counter.accounts.Counter.fetch(counterAddr)
if (data) {
  console.log("count:", data.count)
  console.log("authority:", data.authority)
  console.log("active:", data.isActive)
}

const sig = await sol.counter.close({
  counter: counterAddr,
})

console.log("closed:", sig)

// Read-only client (no signer)
const readOnlySol = await betterSol({ cluster: "devnet" })
const balance = await readOnlySol.getBalance(payer)

// Token operations
const { mint } = await sol.token.createMint({ decimals: 9 })
const ata = await sol.token.getATA({ owner: payer, mint })
await sol.token.mintTo({ mint, to: payer, amount: 1_000_000_000n })

// Token-2022 operations
await sol.token2022.createMint({ decimals: 6 })

// Browser wallet adapter (conceptual)
// import { walletAdapter } from "better-sol/wallets/wallet-adapter"
// const userSol = await sol.withSigner(walletAdapter(useWallet()))
// await userSol.counter.increment({ counter: counterAddr, amount: 1n })

// Multi-instruction batching
await sol.send([
  sol.counter.increment.instruction({ counter: counterAddr, amount: 1n }),
  sol.counter.increment.instruction({ counter: counterAddr, amount: 2n }),
])

// Sequential steps with dependencies
const [mintResult, mintSig] = await sol.steps([
  async () => sol.token.createMint({ decimals: 9 }),
  async ({ mint }) => sol.token.mintTo({ mint, to: payer, amount: 1000n }),
])
