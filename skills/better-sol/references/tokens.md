# Token Patterns

Use this reference when creating, transferring, distributing, or managing SPL Token and Token-2022 assets in a Solana application.

## Tools

Use the Better Sol typed client for all token operations:
- `sol.token` for SPL Token operations (create mint, mint tokens, transfer, check balance, create Associated Token Account)
- `sol.token2022` for Token-2022 operations (same API as `sol.token`, with extension support)

For Token-2022 extensions (confidential transfers, transfer fees, interest-bearing tokens, non-transferable tokens, etc.), use `@solana/spl-token` directly when the Better Sol wrapper does not cover the extension.

For token launches with bonding curves, use the pump.fun API or build a custom bonding curve with a Better Sol program.

## Token type decision

| Need | Use |
|---|---|
| Standard fungible token | SPL Token (`sol.token`) |
| Confidential transfers or transfer fees | Token-2022 (`sol.token2022`) |
| Non-transferable (soulbound, credentials) | Token-2022 non-transferable extension |
| Interest-bearing | Token-2022 interest-bearing extension |
| NFT or compressed NFT | See `nfts-and-metaplex.md` |

Use SPL Token by default for maximum compatibility. Use Token-2022 only when extensions are required and downstream wallet/protocol compatibility has been verified.

## Creating a mint

### SPL Token

```ts
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const { mint } = await sol.token.createMint({
  decimals: 9,
  freezeAuthority: null,
})
```

### Token-2022

```ts
const { mint } = await sol.token2022.createMint({
  decimals: 9,
  freezeAuthority: null,
})
```

## Associated Token Accounts

ATAs are created automatically by the Better Sol client when needed. You do not need to create them manually for standard operations.

Derive an ATA address:

```ts
const ata = await sol.token.getATA({ mint: mintAddress, owner: walletAddress })
```

## Transferring tokens

```ts
await sol.token.transfer({
  mint: mintAddress,
  to: recipientAta,
  amount: 1000n,
})
```

The `amount` is in the token's base unit (lamports for SOL, micro-units for 6-decimal tokens). Always use `bigint` for amounts.

## Minting tokens

```ts
await sol.token.mintTo({
  mint: mintAddress,
  to: recipientAta,
  amount: 1_000_000n,
})
```

## Checking balances

```ts
const balance = await sol.token.getBalance({ owner: walletAddress, mint: mintAddress })
console.log(balance.value) // bigint, base units
```

## Token distribution patterns

### Airdrop pattern

For distributing tokens to a list of recipients:

```ts
const recipients = ["addr1...", "addr2...", "addr3..."]

for (const recipient of recipients) {
  const ata = await sol.token.getATA({ mint: mintAddress, owner: recipient })

  await sol.token.transfer({
    mint: mintAddress,
    to: ata,
    amount: 100n,
  })
}
```

For large distributions (100+ recipients), batch transfers into multi-instruction transactions:

```ts
const BATCH_SIZE = 10

for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
  const batch = recipients.slice(i, i + BATCH_SIZE)
  const instructions = await Promise.all(
    batch.map((recipient) =>
      sol.token.transfer({
        mint: mintAddress,
        to: deriveAta(recipient),
        amount: 100n,
      })
    ),
  )
  await sol.send(instructions)
}
```

### Merkle claim pattern

For gas-efficient airdrops where users claim tokens themselves:

1. Generate a list of eligible addresses and amounts
2. Build a Merkle tree from the list
3. Store the Merkle root on-chain in a Better Sol program
4. Users submit a Merkle proof with their claim transaction
5. The program verifies the proof and transfers tokens

This avoids the need to send individual transactions to each recipient.

### Time-locked vesting pattern

```ts
const VestingSchedule = bs.account({
  beneficiary: bs.pubkey(),
  mint: bs.pubkey(),
  totalAmount: bs.u64(),
  claimedAmount: bs.u64(),
  startTimestamp: bs.u64(),
  endTimestamp: bs.u64(),
  cliffTimestamp: bs.u64(),
}).derive((seed) => ["vesting", seed.beneficiary, seed.mint])

export const vesting = bs.program({ name: "vesting", address: "<key>", accounts: { VestingSchedule }, errors: {
    NotBeneficiary: "Not the beneficiary",
    CliffNotReached: "Cliff not reached",
  },
}, (ix) => ({
  createSchedule: ix({
    accounts: { schedule: bs.init(VestingSchedule), beneficiary: bs.signer() },
    args: { mint: bs.pubkey(), totalAmount: bs.u64(), startTimestamp: bs.u64(), endTimestamp: bs.u64(), cliffTimestamp: bs.u64() },
    run: ({ schedule, beneficiary }, args, ctx) => {
      schedule.beneficiary = beneficiary
      schedule.mint = args.mint
      schedule.totalAmount = args.totalAmount
      schedule.claimedAmount = 0n
      schedule.startTimestamp = args.startTimestamp
      schedule.endTimestamp = args.endTimestamp
      schedule.cliffTimestamp = args.cliffTimestamp
    },
  }),
  claim: ix({
    accounts: { schedule: bs.mut(VestingSchedule), beneficiary: bs.signer() },
    run: ({ schedule, beneficiary }, ctx) => {
      ctx.require(schedule.beneficiary === beneficiary, "NotBeneficiary")
      ctx.require(cpi.sol.timestamp() >= schedule.cliffTimestamp, "CliffNotReached")
      const vested = calculateVested(schedule)
      const claimable = vested - schedule.claimedAmount
      schedule.claimedAmount += claimable
    },
  }),
}))
```

## Token-2022 extensions

Token-2022 extensions are configured during mint initialization using `@solana/spl-token`. The Better Sol client handles standard mint creation. For extension-specific mints, use `@solana/spl-token` directly:

```ts
import { createMint, ExtensionType, getMintLen } from "@solana/spl-token"
```

### Transfer fee

Charge a fee on every transfer. The fee stays in the recipient's account and can be harvested by the fee authority.

```ts
import { createMint, ExtensionType, getMintLen, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"

const mintLen = getMintLen([ExtensionType.TransferFeeConfig])
const mint = await createMint(
  connection,
  payer,
  mintAuthority,
  freezeAuthority,
  6,
  mintKeypair,
  { programId: TOKEN_2022_PROGRAM_ID },
)
```

### Non-transferable

Tokens cannot be transferred after minting. Useful for credentials, certificates, and soul-bound tokens. Configured as a mint extension.

### Confidential transfers

Hide transfer amounts using zero-knowledge proofs. Requires `@solana/spl-token` for the extension-specific operations.

### Interest-bearing

Token amount grows over time based on an interest rate. The balance query returns the current accrued amount.

### Default account state

New token accounts start frozen. The issuer thaws accounts after verification. Useful for compliance-aware tokens.

### Transfer hook

Execute custom program logic on every transfer. Use for KYC/AML checks, royalties, or custom restrictions.

### Permanent delegate

Issuer can move tokens from any account. Use for regulatory compliance (forced redemption, court orders).

### CPI guard

Prevent unauthorized programs from interacting with token accounts. Reduces attack surface for compliance-critical tokens.

## Security considerations

- Never trust a token mint address provided by the user. Verify it against an allowlist.
- Check that the token account owner matches the expected wallet. Token accounts can be created by anyone for any owner.
- Use `bigint` for all token amounts. JavaScript `Number` loses precision above 2^53.
- Be aware of Token-2022 account size differences. Token-2022 accounts may be larger than SPL Token accounts due to extension data.
- Freeze authority can freeze token accounts. If your product receives tokens, check whether the mint has a freeze authority and assess the risk.

## Related

- `defi.md` for DeFi protocol token integration patterns.
- `defi-deep-dive.md` for AMM and liquidity pool token mechanics.
- `number-formatting.md` for displaying token amounts in the UI.
- `humanity.md` for airdrop gating and anti-sybil patterns.
