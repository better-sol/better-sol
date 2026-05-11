import { useState, type ReactElement } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana"
import { betterSol } from "better-sol"
import { privyWallet } from "better-sol/wallets"
import { counter } from "./counter"

export function PrivyCounterButton(): ReactElement {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const { signTransaction } = useSignTransaction()
  const [signature, setSignature] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function increment(): Promise<void> {
    const wallet = wallets[0]
    if (wallet === undefined) return

    setIsPending(true)
    try {
      const baseClient = await betterSol({ cluster: "devnet", programs: { counter } })
      const client = await baseClient.withSigner(privyWallet({ wallet, signTransaction }))
      const counterAddress = await client.counter.accounts.Counter.derive({ authority: wallet.address })
      const txSignature = await client.counter.increment({
        counter: counterAddress,
        amount: 1n,
      })
      setSignature(txSignature)
    } finally {
      setIsPending(false)
    }
  }

  if (!ready) return <button disabled>Loading...</button>
  if (!authenticated) return <button onClick={login}>Log in</button>

  return (
    <div>
      <button disabled={wallets.length === 0 || isPending} onClick={increment}>
        {isPending ? "Incrementing..." : "Increment counter"}
      </button>
      {signature !== null ? <p>{signature}</p> : null}
    </div>
  )
}
