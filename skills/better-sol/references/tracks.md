# Better Sol Learning Tracks

## Track A: Complete beginner

1. Wallets, signatures, and SOL.
2. Accounts as state containers.
3. Programs as stateless code.
4. Instructions as function calls with accounts.
5. PDAs as deterministic program-owned addresses.
6. A Better Sol counter program.
7. Typed client calls.
8. LiteSVM tests.

Exercise: add a `decrement` instruction that cannot underflow.

## Track B: EVM developer

See `solana-knowledge-base.md` for the full EVM-to-Solana concept map. Key differences to internalize first:

- State lives in separate accounts, not contract storage.
- `msg.sender` becomes an explicit `bs.signer()` account that must be compared to stored authority.
- Mappings become PDA namespaces with seeds.
- Internal calls become CPIs.

Exercise: build an ERC20-like reward minter mental model using mint, token account, and authority.

## Track C: Frontend developer

Focus:

- `betterSol({ programs })` read-only clients
- `withSigner(walletSigner)` for wallet actions
- deriving PDAs
- fetching accounts
- transaction states
- formatting token amounts

Exercise: derive a profile PDA, call initialize, fetch it, and render disconnected/loading/success/error states.

## Track D: Backend developer

Focus:

- `keypairFile()` for scripts
- RPC configuration
- scheduled jobs
- IDL imports
- account fetching
- indexers
- LiteSVM tests

Exercise: write a script that reads all known account addresses, fetches them, and prints a summarized report.

## Track E: DeFi builder

Focus:

- token mints and token accounts
- CPIs
- authorities and PDAs
- vault/share accounting
- invariant tests
- mainnet readiness

Exercise: design a vault account and list invariants before writing the deposit instruction.

## Common misconceptions

- A signer is not automatically the authority; compare it to the stored authority field.
- Deriving a PDA address does not create the account; initialization creates it.
- A token account is not a mint; it belongs to an owner and references a mint.
- Client-side checks are not security boundaries; program checks are.
- Devnet success is not mainnet readiness.

## Tiny counter lesson

```ts
const Counter = bs.account({ count: bs.u64(), authority: bs.pubkey() })
  .derive(seed => ["counter", seed.authority])
```

This says: a counter account stores a bigint count and an authority address; its PDA can be derived from the static namespace `counter` and the authority.

## Related

- `solana-knowledge-base.md` for conceptual explanations used in each track.
- `web3-fundamentals.md` for broader blockchain foundations.
- `cookbook-recipes.md` for exercises matched to each track.
