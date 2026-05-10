# Transaction Card Example

```tsx
function TransactionCard() {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Deposit USDC</h2>
          <p className="text-sm text-muted-foreground">Review the vault, amount, and wallet before signing.</p>
        </div>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">Devnet</span>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Wallet</dt>
          <dd className="font-mono">8xK...2p9</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium">125.00 USDC</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Vault</dt>
          <dd className="font-mono">3Av...x1L</dd>
        </div>
      </dl>

      <button className="mt-5 h-11 w-full rounded-xl bg-primary font-medium text-primary-foreground">
        Sign deposit
      </button>
    </section>
  )
}
```
