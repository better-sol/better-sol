# Better Sol Architecture Playbook

## Program vs integration decision

Choose integration-only when the app can be built by calling existing programs or APIs and does not need custom on-chain state. Examples: swap UI, portfolio dashboard, lending interface, payment checkout, NFT gallery, analytics product.

Choose a Better Sol program when the product needs custom state, custom authorization, escrow/custody, settlement, attestations, rewards, one-shot claims, allowlists, or invariant enforcement.

Choose hybrid when existing protocols do the heavy financial primitive and a thin Better Sol program stores product-specific state such as user profiles, rewards, claim records, or attestations.

## Project skeleton

```text
programs/
  <program>.ts
src/
  solana/
    client.ts
    transactions.ts
  components/
    ...
test/
  <program>.test.ts
better-sol.config.ts
keypair.json
.better-sol/
  cache/
  <program>.json
```

## Scaffold workflow

```bash
bunx @better-sol/cli@alpha init
bunx @better-sol/cli@alpha create counter
bun add better-sol@alpha @better-sol/test@alpha
bun run check
```

If the user already has a frontend, do not force a new scaffold. Add Better Sol files incrementally.

## Milestone plan

1. State model: accounts, fields, PDA seeds, authority fields.
2. Minimal instruction: initialize or create one state transition.
3. Typed client: derive PDA, send instruction, fetch account.
4. Test: one happy path and one authority failure.
5. Domain expansion: token CPI, remaining accounts, IDL import, UI, or indexer.
6. Deploy: dry run, devnet, smoke test.

## Package manager rule

Use Bun commands in generated instructions unless the user’s project clearly uses another package manager. If adapting, keep the command semantics identical.

## Environment files

Use `.env.example` for public shape and placeholders. Never commit actual RPC API keys, private keys, seed phrases, keypair JSON, or compiler tokens.

## Related

- `program-patterns.md` for Better Sol account and instruction patterns used in the skeleton.
- `client-testing-deploy.md` for client setup and deployment after scaffolding.
