import { useState, type ReactElement } from "react"
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react"
import type { Provider } from "@reown/appkit-adapter-solana/react"
import { betterSol } from "better-sol"
import { reownWallet } from "better-sol/wallets"
import { counter } from "./counter"

export function ReownCounterButton(): ReactElement {
  const { address, isConnected } = useAppKitAccount({ namespace: "solana" })
  const { walletProvider } = useAppKitProvider<Provider>("solana")
  const [signature, setSignature] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function increment(): Promise<void> {
    if (!isConnected || address === undefined || walletProvider === undefined) return

    setIsPending(true)
    try {
      const baseClient = await betterSol({ cluster: "devnet", programs: { counter } })
      const client = await baseClient.withSigner(reownWallet({ address, walletProvider }))
      const counterAddress = await client.counter.accounts.Counter.derive({ authority: address })
      const txSignature = await client.counter.increment({
        counter: counterAddress,
        amount: 1n,
      })
      setSignature(txSignature)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <button disabled={!isConnected || isPending} onClick={increment}>
        {isPending ? "Incrementing..." : "Increment counter"}
      </button>
      {signature !== null ? <p>{signature}</p> : null}
    </div>
  )
}
