# NFT and Metaplex Patterns

Use this reference when building NFT marketplaces, minting flows, creator tools, or Metaplex integrations.

## NFT on Solana

An NFT is a SPL Token with decimals=0 and supply=1. The Metaplex Token Metadata program adds name, symbol, URI, creators, royalties, and collection assignment.

Key accounts:

- Mint account: token supply and authority.
- Metadata account: off-chain URI pointer, creators, royalty split.
- Master edition account: controls edition supply for printable NFTs.
- Edition account: individual prints from a master edition.
- Token account: ownership record for a specific wallet.
- Collection account: groups NFTs under a parent mint.

## Metaplex ecosystem

- Token Metadata: NFT metadata, creators, royalties, collections.
- Candy Machine: fair mint distribution with guards.
- Auction House: marketplace infrastructure.
- Token Auth Rules: programmable transfer rules.
- Bubblegum: compressed NFTs for large collections.
- Core: next-generation NFT standard with plugins.

## Mint flow

1. Create mint account with decimals=0.
2. Create metadata account with name, symbol, URI, creators, seller fee basis points.
3. Create master edition if printable.
4. Mint one token to recipient.

Use Candy Machine with guards for public mints. Guards enforce mint conditions: start/end time, mint limit per wallet, allowlist, payment, token gate, bot tax, sol threshold.

## Marketplace patterns

### Listing

Seller lists by delegating listing authority to the marketplace program. Price and terms stored on-chain or in marketplace state.

### Sale flow

Atomic transaction: transfer NFT from seller to buyer, transfer SOL/token from buyer to seller, distribute royalties to creators, collect marketplace fee.

### Escrow vs peer-to-peer

Escrow: NFT is transferred to a program-owned account during listing. Simpler but locks the NFT.

Peer-to-peer: NFT stays in seller wallet. Sale uses an atomic matching instruction. More flexible but requires correct account passing.

## Royalty enforcement

Metaplex royalties are metadata-level suggestions. On-chain enforcement requires the Token Auth Rules program with programmable transfer rules. Without enforcement, marketplaces can choose to respect or ignore royalties.

## Compressed NFTs (cNFTs)

Use Bubblegum for collections with thousands or millions of items. State compression stores only a merkle root on-chain. Individual NFT data is proven against the tree.

Trade-offs:

- Much cheaper per-item cost.
- Requires indexer for reading cNFT state.
- Transfer and burn are more complex.
- Some wallets and marketplaces may not display cNFTs.

## Creator tools

- Dynamic NFTs: metadata updates based on on-chain state or oracle data.
- On-chain generative art: store generation logic in program, render client-side.
- Soulbound tokens: use Token Auth Rules to prevent transfers.
- Edition-based prints: master edition controls max supply of prints.

## Better Sol integration

Use Better Sol programs when NFT interactions require custom logic: gated claims, custom royalties, staking mechanics, evolution/leveling, or marketplace-specific escrow. For standard mint/list/sell flows, integrate Metaplex programs directly.

## Related

- `tokens.md` for SPL Token and Token-2022 mechanics that underlie every NFT.
- `humanity.md` for gated claim patterns used in NFT allowlists and drops.
