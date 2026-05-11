# NFT and Metaplex Patterns

Use this reference when building NFT marketplaces, minting flows, creator tools, compressed NFT collections, or Metaplex integrations on Solana.

## Tools

- **Umi** (`@metaplex-foundation/umi`): framework-agnostic SDK for interacting with Metaplex programs. Provides signers, serializers, and transaction builders.
- **Umi bundle defaults** (`@metaplex-foundation/umi-bundle-defaults`): preconfigured Umi instance with standard plugins. Start here.
- **Token Metadata** (`@metaplex-foundation/mpl-token-metadata`): instructions for creating, updating, and managing NFTs using the Token Metadata program.
- **MPL Core** (`@metaplex-foundation/mpl-core`): next-generation asset standard with plugin system for royalties, attributes, edition management, and hooks. Recommended for new projects.
- **Candy Machine** (`@metaplex-foundation/mpl-candy-machine`): fair-launch minting with configurable guards (price, start date, allowlists, bot protection). Uses `create` and `mintV2` functions.
- **Bubblegum** (`@metaplex-foundation/mpl-bubblegum`): compressed NFTs via Merkle trees (dramatically lower cost for large collections). Uses `createTree` and `mintV2` functions.
- **Token Auth Rules** (`@metaplex-foundation/mpl-token-auth-rules`): programmable authorization rules for NFT transfers.

When a Metaplex or Anchor-compatible program exposes an IDL, import it with `fromIdl(idl)` from `better-sol`. For most NFT operations, use the current Metaplex Umi packages directly.

## NFT on Solana

An NFT on Solana is an SPL Token mint with:
- **Supply of 1**: exactly one token exists
- **Decimals of 0**: no fractional ownership
- **Metadata account**: a Metaplex Token Metadata account storing name, symbol, URI, and attributes
- **Optional master edition**: enables print supply control and edition tracking

The mint account is the NFT's unique identifier. The token account holding the single token is the owner's wallet.

## Setting up Umi

```ts
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { keypairIdentity } from "@metaplex-foundation/umi"
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata"

const umi = createUmi("https://api.devnet.solana.com")
  .use(mplTokenMetadata())
  .use(keypairIdentity(keypair))
```

For MPL Core assets:

```ts
import { mplCore } from "@metaplex-foundation/mpl-core"

const umi = createUmi("https://api.devnet.solana.com")
  .use(mplCore())
  .use(keypairIdentity(keypair))
```

## Minting an NFT

### Using Token Metadata (classic)

```ts
import { generateSigner, percentAmount } from "@metaplex-foundation/umi"
import { createNft } from "@metaplex-foundation/mpl-token-metadata"

const mint = generateSigner(umi)

await createNft(umi, {
  mint,
  name: "My NFT",
  uri: "https://example.com/metadata/1.json",
  sellerFeeBasisPoints: percentAmount(5),
}).sendAndConfirm(umi)
```

### Using MPL Core (recommended for new projects)

```ts
import { generateSigner } from "@metaplex-foundation/umi"
import { create } from "@metaplex-foundation/mpl-core"

const asset = generateSigner(umi)

await create(umi, {
  asset,
  name: "My NFT",
  uri: "https://example.com/metadata/1.json",
}).sendAndConfirm(umi)
```

### Metadata JSON format

The `uri` points to a JSON file with off-chain metadata (image, animation URL, attributes). This is typically hosted on Arweave or IPFS.

```json
{
  "name": "My NFT",
  "symbol": "MFT",
  "description": "A unique digital asset on Solana",
  "image": "https://arweave.net/.../image.png",
  "animation_url": "https://arweave.net/.../animation.mp4",
  "attributes": [
    { "trait_type": "Background", "value": "Sunset" },
    { "trait_type": "Rarity", "value": "Legendary" },
    { "trait_type": "Power", "value": 95 }
  ],
  "properties": {
    "files": [
      { "uri": "image.png", "type": "image/png" },
      { "uri": "animation.mp4", "type": "video/mp4" }
    ],
    "category": "video"
  }
}
```

## Candy Machine (fair-launch minting)

### Setup

```ts
import { create } from "@metaplex-foundation/mpl-candy-machine"
import { generateSigner, sol, dateTime, none, some } from "@metaplex-foundation/umi"

const candyMachine = generateSigner(umi)

await create(umi, {
  candyMachine,
  collectionMint: collectionNftMint,
  collectionUpdateAuthority: collectionUpdateAuthority,
  itemsAvailable: 1000,
  sellerFeeBasisPoints: percentAmount(5),
  creators: [{ address: authority.publicKey, share: 100 }],
  hiddenSettings: none(),
  guards: {
    startDate: some({ date: dateTime("2024-01-01T00:00:00Z") }),
    mintLimit: some({ id: 1, limit: 2 }),
    solPayment: some({ lamports: sol(0.1), destination: treasury }),
  },
}).sendAndConfirm(umi)
```

### Minting from Candy Machine

```ts
import { mintV2 } from "@metaplex-foundation/mpl-candy-machine"
import { setComputeUnitLimit } from "@metaplex-foundation/mpl-toolbox"
import { transactionBuilder } from "@metaplex-foundation/umi"

const nftMint = generateSigner(umi)

await transactionBuilder()
  .add(setComputeUnitLimit(umi, { units: 800_000 }))
  .add(
    mintV2(umi, {
      candyMachine: candyMachine.publicKey,
      nftMint,
      collectionMint: collectionNft.publicKey,
      collectionUpdateAuthority: collectionNft.metadata.updateAuthority,
      tokenStandard: candyMachine.tokenStandard,
      mintArgs: {},
    })
  )
  .sendAndConfirm(umi)
```

### Available guards

| Guard | Function |
|---|---|
| `startDate` | Minting opens at a specific time |
| `endDate` | Minting closes at a specific time |
| `mintLimit` | Limit mints per wallet |
| `solPayment` | Charge SOL per mint |
| `tokenPayment` | Charge a specific token per mint |
| `allowList` | Restrict to a Merkle root of allowed addresses |
| `botTax` | Charge a penalty for failed mints (anti-bot) |
| `redeemedAmount` | Cap total mints |
| `gatekeeper` | Require CAPTCHA or identity verification |
| `tokenBurn` | Burn a specific token to mint |
| `tokenGate` | Hold a specific token to mint |
| `nftBurn` | Burn an NFT to mint |
| `nftGate` | Hold an NFT to mint |
| `thirdPartySigner` | Require an additional signer |
| `edition` | Mint editions from a master edition |

## Compressed NFTs (Bubblegum)

Regular NFTs cost ~0.01 SOL each in rent. For large collections (10K+), this is expensive. Compressed NFTs store data in Merkle trees instead of individual accounts, reducing cost to ~0.0003 SOL per NFT.

### When to use compressed NFTs

- Large collections (>1,000 NFTs)
- Gaming assets with frequent state changes
- Ticketing or credentials where cost matters more than composability

### When not to use

- Small collections (<100 NFTs) where rent cost is negligible
- NFTs that need full SPL Token compatibility (transfers via standard wallets)
- When you need per-NFT program ownership verification

### Creating a Merkle tree

```ts
import { createTree, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum"
import { generateSigner } from "@metaplex-foundation/umi"

const treeSigner = generateSigner(umi)

await createTree(umi, {
  merkleTree: treeSigner,
  maxDepth: 14,
  maxBufferSize: 64,
}).sendAndConfirm(umi)
```

### Minting a compressed NFT

```ts
import { mintV2 } from "@metaplex-foundation/mpl-bubblegum"
import { none } from "@metaplex-foundation/umi"

await mintV2(umi, {
  leafOwner: recipient,
  merkleTree: treeSigner.publicKey,
  metadata: {
    name: "Compressed #1",
    uri: "https://arweave.net/...",
    sellerFeeBasisPoints: 500,
    collection: none(),
    creators: [{ address: authority.publicKey, share: 100, verified: false }],
  },
}).sendAndConfirm(umi)
```

## NFT design theory

### NFT standard selection

| Use case | Recommended standard | Reason |
|---|---|---|
| Art collection, profile picture | Token Metadata NFT | Broad marketplace and wallet compatibility |
| New app-specific asset | MPL Core | Plugin system and cleaner asset model |
| Game item or ticket at large scale | Compressed NFT | Low mint cost and massive scale |
| Credential or non-transferable proof | Token-2022 or MPL Core plugin | Enforce transfer restrictions |

Choose compatibility when the asset needs to trade broadly. Choose MPL Core or compression when the app controls the main experience and needs custom behavior or scale.

### Metadata integrity

NFT value often depends on metadata. Treat metadata as part of the trust model:

| Storage | Persistence | Risk |
|---|---|---|
| Centralized URL | Low | Server can change or disappear |
| IPFS | Medium | Requires pinning |
| Arweave | High | Higher upfront cost, strong permanence |
| On-chain inscription | Highest | Expensive, size-limited |

If metadata affects financial value, store immutable metadata on Arweave or commit to a content hash on-chain. If metadata is intentionally dynamic, disclose who can update it and under what conditions.

### Marketplace economics

NFT markets fail when incentives are unclear. Decide early:

- Who earns primary sale revenue?
- Are royalties enforced socially, programmatically, or not at all?
- Can the creator update metadata after mint?
- Can assets be frozen, burned, or migrated?
- Is rarity deterministic and disclosed before mint?
- Are allowlists based on community contribution or pay-to-play access?

Royalty enforcement is not only technical. It is also a market design problem. If royalties are optional, marketplaces compete by lowering fees. If royalties are enforced, liquidity may fragment because some buyers avoid restricted assets.

### Anti-spam and fairness

Minting flows are adversarial during hype. Assume bots will:

- Submit many transactions in parallel
- Use many wallets funded from the same source
- Try to bypass UI limits by calling instructions directly
- Exploit predictable allowlists or poorly seeded randomness

Use Candy Machine guards for start time, mint limits, bot tax, token gates, and allowlists. For high-demand launches, add server-side risk checks and delayed reveal. Do not rely on frontend disabled buttons as mint limits.

## Marketplace patterns

### Listing

Create a listing account that records the NFT, price, and seller:

```ts
const Listing = bs.account({
  nftMint: bs.pubkey(),
  seller: bs.pubkey(),
  price: bs.u64(),
  auctionHouse: bs.pubkey(),
  createdAt: bs.u64(),
}).derive((seed) => ["listing", seed.nftMint])
```

### Escrow-less trading

Solana supports escrow-less NFT trading through programs like Auction House. The NFT stays in the seller's wallet until the buyer's purchase transaction atomically transfers the NFT and payment.

### Royalty enforcement

Metaplex Token Metadata includes a `seller_fee_basis_points` field. Marketplaces that respect Metaplex royalties split the sale price according to the creator percentages. However, royalty enforcement is optional at the protocol level. Use Metaplex Token Auth Rules for programmable enforcement.

## Common NFT patterns

### Collection with verified creator

```ts
import { createNft } from "@metaplex-foundation/mpl-token-metadata"

const mint = generateSigner(umi)

await createNft(umi, {
  mint,
  name: "My Collection",
  uri: "https://example.com/collection.json",
  isCollection: true,
  sellerFeeBasisPoints: percentAmount(0),
}).sendAndConfirm(umi)
```

### Updating metadata

```ts
import { updateNft } from "@metaplex-foundation/mpl-token-metadata"

await updateNft(umi, {
  mint: nftMint,
  name: "Updated Name",
  uri: "https://example.com/new-metadata.json",
}).sendAndConfirm(umi)
```

### Transferring

```ts
import { transfer } from "@metaplex-foundation/mpl-token-metadata"

await transfer(umi, {
  mint: nftMint,
  authority: owner,
  tokenOwner: owner.publicKey,
  destinationOwner: recipientAddress,
  tokenStandard: TokenStandard.NonFungible,
}).sendAndConfirm(umi)
```

### Burning

```ts
import { burn } from "@metaplex-foundation/mpl-token-metadata"

await burn(umi, {
  mint: nftMint,
  authority: owner,
  tokenOwner: owner.publicKey,
  tokenStandard: TokenStandard.NonFungible,
}).sendAndConfirm(umi)
```

## Security considerations

- Verify mint authority before trusting NFT provenance
- Verify collection verification status (verified vs unverified creators)
- Check that metadata URI points to the expected content
- Compressed NFTs require indexers to read data; RPC cannot return full metadata
- Candy Machine guards should include `mintLimit` and `botTax` to prevent spam

## Related

- `tokens.md` for SPL Token and Token-2022 operations.
- `defi-deep-dive.md` for NFT lending and fractionalization.
- `web3-dapp-architecture.md` for NFT indexer and display patterns.
