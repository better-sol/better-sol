# Cross-Chain Patterns

Use this reference when building cross-chain applications, integrating bridges, handling wrapped assets, or designing multi-chain dApps.

## Tools

- **Wormhole** (`@wormhole-foundation/sdk`): generic message passing and token bridging across 20+ chains. Supports both token transfers (lock-and-mint or burn-and-mint) and arbitrary message passing.
- **Allbridge**: alternative bridge infrastructure for token transfers across EVM, Solana, and other chains.
- **deBridge**: cross-chain messaging and liquidity transfer protocol.
- **LayerZero**: omnichain interoperability protocol for cross-chain messages.
- **Circle CCTP** (`@circle-fin/cctp`): native USDC transfers between EVM chains and Solana without wrapping. Burn USDC on source chain, mint on destination.
- **Multi-chain clients**: `viem` for EVM chains, `@solana/kit` for Solana, `better-sol` for typed Solana programs. Use per-chain SDKs in a shared TypeScript project.

## Bridge architectures

### Lock-and-mint

Lock tokens on the source chain. Mint wrapped tokens on the destination chain.

```
Source chain: lock 100 USDC → bridge custody
Destination chain: mint 100 USDC.wormhole → user wallet
```

Pros: simple, auditable.
Cons: wrapped tokens have different addresses than native tokens. Liquidity is fragmented.

### Burn-and-mint

Burn tokens on the source chain. Mint native tokens on the destination chain.

```
Source chain: burn 100 USDC.wormhole
Destination chain: mint 100 USDC → user wallet
```

Used for redeeming wrapped tokens back to native.

### Liquidity pool (atomic swap)

Bridge maintains liquidity pools on both chains. Transfers happen by swapping from the source pool and adding to the destination pool.

```
Source chain: withdraw 100 USDC from pool
Destination chain: deposit 100 USDC to pool from bridge reserve
```

Pros: native tokens on both sides. No wrapping.
Cons: requires bridge to maintain liquidity on every supported chain.

### Native burn-and-mint (CCTP)

Protocol-native cross-chain transfers without wrapping. Circle CCTP does this for USDC.

```
Source chain: burn 100 USDC via CCTP
Destination chain: attest burn → mint 100 USDC via CCTP
```

Pros: no wrapped tokens, no liquidity pools, native USDC on both chains.
Cons: only works for supported tokens (currently USDC).

## Message passing patterns

### Arbitrary cross-chain messages

Wormhole Core Bridge allows sending arbitrary bytes between chains. This enables:

- Cross-chain governance (vote on Solana, execute on Ethereum)
- Cross-chain NFT metadata sync
- Cross-chain price feeds
- Cross-chain state updates

### Message flow

```
1. Source chain: emit message via bridge program
2. Guardians observe and sign the message (VAA - Verifiable Action Approval)
3. Relayer submits VAA to destination chain
4. Destination chain: verify VAA signatures and execute
```

Time: typically 1-5 seconds for Wormhole VAA generation. Execution depends on destination chain finality.

## Designing cross-chain dApps

### State ownership model

Decide which chain owns the source of truth for each piece of state:

- **Primary on Solana, mirror elsewhere**: program state lives on Solana, cached copies on other chains for read performance.
- **Split by function**: user identity on one chain, financial operations on Solana, governance on another.
- **Symmetric**: same program deployed on multiple chains with cross-chain sync.

### User experience considerations

- Users should not need to understand bridge mechanics. Abstract the cross-chain step behind a single "bridge" button.
- Show estimated time to completion for each bridge step.
- Handle partial failures: the source chain transaction succeeded but the destination is pending. Show clear status.
- Always provide a transaction explorer link for both source and destination chains.

### Address handling

Different chains have different address formats:

| Chain | Address format | Length |
|---|---|---|
| Solana | Base58 | 32-44 chars |
| Ethereum | Hex (0x prefix) | 42 chars |
| Bitcoin | Base58 or Bech32 | 26-62 chars |

Never assume an address format. Validate addresses against the target chain's format before constructing transactions.

## Cross-chain design theory

### Choose consistency intentionally

Cross-chain systems cannot be instant, cheap, safe, and fully consistent at the same time. Pick the failure mode explicitly.

| Model | User experience | Risk |
|---|---|---|
| Optimistic UI | Shows destination state before finality | Must roll back if message fails |
| Confirmed-only UI | Waits for source and destination confirmation | Slower but safer |
| Escrowed intent | User signs once, relayer completes later | Relayer risk and stuck-intent handling |
| Manual claim | User executes destination claim | More steps but less relayer trust |

High-value transfers should prefer confirmed-only or manual claim flows. Low-value consumer actions can use optimistic UI if the rollback path is clear.

### Finality mismatch

Every chain has different finality. Solana confirmation is fast, while EVM chains may require multiple blocks and some bridges wait for additional safety windows. Treat "source transaction confirmed" and "destination action complete" as separate states.

```text
prepared → source_signed → source_confirmed → message_observed → destination_submitted → destination_confirmed
```

A correct product stores this state machine durably. If the browser closes after `source_confirmed`, the user must still be able to resume from a recovery screen.

### Message semantics

Cross-chain messages need the same discipline as distributed systems:

| Problem | Defense |
|---|---|
| Duplicate delivery | Store message ID and reject repeats |
| Out-of-order delivery | Include sequence numbers or nonces |
| Replay on wrong chain | Include source chain, destination chain, and destination program in signed payload |
| Partial completion | Track state machine and expose recovery action |
| Relayer censorship | Provide manual relay or claim path |

### Build vs integrate decision

Build custom cross-chain messaging only if the message is product-specific and cannot be represented as token transfer or CCTP movement. Otherwise integrate a mature bridge. Custom bridging multiplies your audit burden because you must reason about source chain, destination chain, relayer, finality, and replay protection.

## Security considerations

- **Bridge risk**: bridges are the #1 attack vector in crypto (>$2B lost in bridge hacks). Use audited, established bridges.
- **Finality mismatch**: source chain may finalize before destination. Design for the case where the destination chain reorgs.
- **Message ordering**: cross-chain messages may arrive out of order. Use nonces or sequence numbers.
- **Replay attacks**: ensure cross-chain messages cannot be replayed on the destination. Use unique message IDs.
- **Liquidity drain**: monitor bridge liquidity on both sides. If one side is drained, transfers in that direction will fail.

See `cross-chain-security.md` for detailed threat modeling.

## Common patterns

### Token bridge UI

```ts
async function bridgeTokens({
  amount,
  sourceChain,
  destinationChain,
  wallet,
}: BridgeParams) {
  if (sourceChain === "solana" && destinationChain === "ethereum") {
    const sol = await getSolClient(wallet)
    const signature = await sol.token.transfer({
      mint: usdcMint,
      to: bridgeAddress,
      amount,
    })
    return { sourceTx: signature, estimatedTime: "5-15 minutes" }
  }
}
```

### Cross-chain state sync

```ts
async function syncStateToEthereum(solanaState: AccountData) {
  const calldata = encodeFunctionData({
    abi: mirrorContractABI,
    functionName: "updateState",
    args: [solanaState.field1, solanaState.field2],
  })
  await ethereumClient.sendTransaction({ to: mirrorAddress, data: calldata })
}
```

## Related

- `cross-chain-security.md` for cross-chain threat modeling.
- `multi-chain-ui.md` for multi-chain wallet and address UI patterns.
- `web3-dapp-architecture.md` for overall dApp architecture.
