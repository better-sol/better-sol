import { useState, type ReactElement } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { isSolanaWallet } from "@dynamic-labs/solana"
import { betterSol } from "better-sol"
import { dynamicWallet } from "better-sol/wallets"
import { counter } from "./counter"

export function DynamicCounterButton(): ReactElement {
  const { primaryWallet } = useDynamicContext()
  const [signature, setSignature] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function increment(): Promise<void> {
    if (primaryWallet === null || primaryWallet === undefined || !isSolanaWallet(primaryWallet)) return

    setIsPending(true)
    try {
      const baseClient = await betterSol({ cluster: "devnet", programs: { counter } })
      const client = await baseClient.withSigner(dynamicWallet(primaryWallet))
      const counterAddress = await client.counter.accounts.Counter.derive({ authority: primaryWallet.address })
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
      <button disabled={primaryWallet === null || primaryWallet === undefined || isPending} onClick={increment}>
        {isPending ? "Incrementing..." : "Increment counter"}
      </button>
      {signature !== null ? <p>{signature}</p> : null}
    </div>
  )
}
