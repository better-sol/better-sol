import { useState, type ReactElement } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { betterSol } from "better-sol"
import { walletAdapter } from "better-sol/wallets"
import { counter } from "./counter"

export function WalletAdapterCounterButton(): ReactElement {
  const { publicKey, signTransaction } = useWallet()
  const [signature, setSignature] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function increment(): Promise<void> {
    if (publicKey === null || signTransaction === undefined) return

    setIsPending(true)
    try {
      const baseClient = await betterSol({ cluster: "devnet", programs: { counter } })
      const client = await baseClient.withSigner(walletAdapter({ publicKey, signTransaction }))
      const counterAddress = await client.counter.accounts.Counter.derive({
        authority: publicKey.toBase58(),
      })
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
      <button disabled={publicKey === null || isPending} onClick={increment}>
        {isPending ? "Incrementing..." : "Increment counter"}
      </button>
      {signature !== null ? <p>{signature}</p> : null}
    </div>
  )
}
