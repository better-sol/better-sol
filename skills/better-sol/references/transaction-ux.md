# Transaction UX

## Required states

Every on-chain action should represent:

1. disconnected wallet
2. wrong cluster
3. connected but invalid input
4. connected and ready
5. wallet prompt open
6. signed/submitted
7. confirming
8. confirmed
9. failed before signature
10. failed after submission

## Transaction preview

Show before signature:

- action title
- connected wallet
- cluster
- program/protocol name if relevant
- token mint and amount
- source/destination
- slippage, fees, authority changes, lockups, or irreversible effects
- estimated result

## Button copy

Use action-specific copy:

- `Connect wallet`
- `Switch to Devnet`
- `Review deposit`
- `Sign transaction`
- `Confirming...`
- `View transaction`

Avoid vague copy like `Submit` for financial actions.

## Error copy

Template:

```text
[What happened]. [Whether funds moved]. [What to do next].
```

Example:

```text
The transaction was rejected in your wallet. No funds moved. Review the details and try again.
```

## Dashboard hierarchy

- Header: current wallet/network and main status.
- Summary cards: balances, positions, claimability, risk.
- Primary actions: deposit, withdraw, claim, create, vote.
- Detail: history, events, raw addresses, diagnostics.

## Form rules

- Validate before wallet prompt.
- Keep input when recoverable errors happen.
- Disable duplicate submission while signing/confirming.
- Explain max buttons, decimals, and available balance.
- Never silently coerce a token amount in a way that changes value.

## Related

- `dapp-state-management.md` for the transaction state machine that drives these UI states.
- `number-formatting.md` for how to display amounts in transaction previews.
- `multi-chain-ui.md` for chain-specific transaction patterns.
