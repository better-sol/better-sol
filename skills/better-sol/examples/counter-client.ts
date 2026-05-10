import { betterSol, keypairFile } from "better-sol"
import { counter } from "./counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const counterAddress = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.initialize({ counter: counterAddress, initialValue: 0n })
await sol.counter.increment({ counter: counterAddress, amount: 1n })

const data = await sol.counter.accounts.Counter.fetch(counterAddress)
console.log(data)
