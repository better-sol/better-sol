# Transaction UX

Use this reference when designing, building, or reviewing wallet connection flows, transaction signing screens, confirmation states, and error handling in crypto applications.

## Tools

- **Wallet connection**: `@solana/wallet-adapter-react` for React, `@solana/react-hooks` for framework-kit. Both connect via the wallet-standard protocol.
- **Transaction construction**: the Better Sol typed client builds transactions automatically from instruction calls. For manual construction, use `@solana/kit` (`createTransaction`, `signTransaction`, `sendAndConfirmTransaction`).
- **Status polling**: `@solana/kit` provides `awaitTransactionSignatureConfirmation` or use the Better Sol client's built-in confirmation handling.

## Wallet connection flow

### States

Every wallet connection UI has these states:

1. **Disconnected** (default): show a "Connect Wallet" button. No address, no balance, no identity.
2. **Connecting**: wallet modal is open or extension is activating. Show a loading state. Timeout after 15 seconds and return to disconnected.
3. **Connected**: show truncated address (`CoUnT...1111`), cluster badge (devnet/mainnet), and disconnect option. Enable transaction actions.
4. **Reconnecting**: page loaded with a previous session. Silently restore if the wallet is still available. Do not show a modal.
5. **Error**: wallet not found, user rejected, or extension crashed. Show the specific error and a retry button.

### Connection rules

- Auto-detect installed wallets via wallet-standard. Do not hard-code a wallet list.
- If no wallets are detected, show installation links for popular options (Phantom, Solflare, Backpack).
- Persist the last-used wallet name in `localStorage` for reconnection on reload.
- Never auto-connect without the user explicitly clicking "Connect" first.
- Support disconnecting from both the app and the wallet side. Listen for `disconnect` events.
- Handle wallet switching: if the user changes the active address in their wallet extension, update the app state immediately.

### Address display

- Standard format: first 4 characters, ellipsis, last 4 characters: `CoUn...1111`
- In contexts where more precision is needed (copy button, transaction details): show the full address
- Always provide a copy-to-clipboard action on the address
- Link to the block explorer (`explorer.solana.com/address/{address}?cluster=devnet`) where appropriate
- Never assume an address identifies a unique human; one person can have unlimited addresses

## Transaction signing flow

### The signing pipeline

Every user-initiated on-chain action follows this pipeline:

```
User action → Build transaction → Present for review → User signs → Submit → Confirm → Done
```

Never skip the "Present for review" step. The user must see exactly what they are signing before the wallet modal appears.

### Pre-sign screen

Before triggering the wallet popup, show a review screen with:

- **Action name**: "Stake 1.5 SOL" or "Transfer 100 USDC"
- **Exact amounts**: every token amount, fee, and slippage value
- **Token mints**: the full token name and symbol, not just an icon
- **Recipient**: the counterparty address or program name
- **Network fee**: estimated transaction cost in SOL
- **Slippage**: if applicable, show the tolerance and estimated price impact
- **Irreversible effects**: label actions that cannot be undone ("This transfer is irreversible")
- **Authority changes**: call out any approval, delegation, or authority transfer

### During signing

While the wallet popup is open:

- Show a "Waiting for signature..." state on the originating button or panel
- Do not block the rest of the UI; the user should be able to navigate away
- Set a 60-second timeout. After that, show "Signature timed out. Try again."
- Do not submit the transaction until the wallet confirms signing
- Handle the case where the user rejects the signature: return to the pre-sign screen with a "Rejected" message, not an error screen

### After signing

Once the wallet returns a signature:

1. Immediately show a "Submitted" state with the transaction signature
2. Poll for confirmation (default: `confirmed` commitment)
3. Update the UI optimistically if the success path is predictable
4. Show the final "Confirmed" state with a link to the block explorer

### Confirmation states

| State | Duration | UI |
|---|---|---|
| Building | < 1s | Spinner on button, "Preparing transaction..." |
| Awaiting signature | User-dependent | "Waiting for signature..." with timeout |
| Submitted | 1-5s | "Transaction sent" with signature link |
| Confirming | 1-30s | "Confirming..." with progress indicator |
| Confirmed | Permanent | Green check, explorer link, updated balance |
| Failed | Permanent | Red error, specific failure reason, retry button |
| Timed out | After 60s | "Confirmation taking longer than expected" with option to wait or retry |

## Error handling

### Error display rules

Every transaction error must answer three questions:

1. **What happened**: the specific failure in plain language
2. **Whether funds moved**: did any tokens or SOL change hands?
3. **What to do next**: the concrete action the user should take

### Error categories

| Error | User message | Action |
|---|---|---|
| Insufficient balance | "Not enough SOL for this transaction. You need 0.002 SOL for the network fee." | Show balance, link to faucet on devnet |
| Simulation failed | "This transaction would fail on-chain. The program returned: [custom error name]." | Show program error in plain language |
| Signature rejected | "You cancelled this transaction. No funds were moved." | Return to review screen |
| Blockhash expired | "The transaction expired before it was confirmed. No funds were moved. Please try again." | Retry button |
| Already processed | "This transaction was already submitted." | Show existing confirmation |
| Slippage exceeded | "The price changed beyond your 0.5% tolerance. No swap was executed." | Offer to retry with higher slippage |
| Program error (custom) | Map the program's error code to the error name from the program definition | Show the name and suggest the likely fix |

### Error anti-patterns

- Showing raw error strings from the RPC or wallet adapter
- Using generic "Something went wrong" when the error is specific
- Not confirming whether funds moved on a failed transaction
- Hiding the error behind a dismiss button before the user reads it
- Using red/error styling for expected states like "Signature rejected"

## Transaction list and history

When showing past transactions:

- Display the action name, not the instruction discriminator: "Staked 1.5 SOL" not "Instruction #3"
- Show relative time ("2 hours ago") with absolute time on hover
- Link each transaction to the block explorer
- Show status: confirmed, failed, or pending
- For failed transactions, show the failure reason
- Group by date for long lists

## Better Sol typed client patterns

The Better Sol client handles most of the transaction lifecycle automatically:

```tsx
const sol = await betterSol({
  cluster: "devnet",
  payer: walletAdapter.signer,
  programs: { counter },
})

try {
  const signature = await sol.counter.increment({
    counter: addr,
    amount: 5n,
  })
  // signature is returned after confirmation
} catch (error) {
  if (error instanceof ProgramError) {
    // error.name is the error name from your program definition
    // error.message is the human-readable description
  }
}
```

For multi-instruction transactions:

```tsx
const signature = await sol.send([
  sol.counter.increment({ counter: addr, amount: 5n }),
  sol.token.transfer({ mint: mintAddress, to: destAddress, amount: 1000n }),
])
```

For optimistic updates with confirmation:

```tsx
const signature = await sol.counter.increment({ counter: addr, amount: 5n })

// Optimistically update the UI
queryClient.setQueryData(["counter", addr], (old) => ({
  ...old,
  count: old.count + 5n,
}))

// Reconcile with on-chain state when confirmed
await queryClient.invalidateQueries({ queryKey: ["counter", addr] })
```

## Related

- `dapp-state-management.md` for caching transaction state and optimistic updates.
- `number-formatting.md` for displaying amounts, fees, and slippage values.
- `brand.md` for status color choices (success green, error red, warning amber).
- `accessibility-evaluation.md` for announcing transaction states to assistive technology.
