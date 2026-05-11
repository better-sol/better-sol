---
name: better-sol
description: >-
  Use when building, learning, designing, securing, or launching Solana and web3 applications. Covers Better Sol SDK programs and clients, Solana architecture, DeFi protocols, tokens, NFTs, DAOs, oracles, cross-chain, stablecoins, security audits, frontend design, dApp state management, tokenomics, product strategy, and web3 fundamentals.
license: MIT
compatibility: >-
  Requires an Agent Skills-compatible client. Examples use Bun and bunx; adapt commands if the user's environment explicitly uses another package manager.
---

# Better Sol

Build blockchain programs on Solana with Better Sol. This skill covers the full journey from concept to production: learning, building, securing, designing, and launching.

Better Sol is a TypeScript-first Solana framework. One program definition describes accounts, instructions, errors, events, and on-chain logic while also powering the runtime typed client.

## Build

Write programs, clients, tests, and deploy.

| Need | Load |
|---|---|
| Decide architecture, scaffold, program vs integration | `references/architecture-playbook.md` |
| Scaffold a new project (web, mobile, backend) with Vite, Tailwind, wallet setup | `references/project-scaffolding.md` |
| Write accounts, PDAs, instructions, constraints, CPIs | `references/program-patterns.md` |
| Common mistakes, PDA seed naming, run() constraints, CPI rules | `references/usage-guide.md` |
| Use `betterSol()`, wallets, fetches, multi-instruction flows | `references/client-testing-deploy.md` |
| Write tests, use LiteSVM, compile binaries | `references/client-testing-deploy.md` |
| Import external Anchor IDLs or migrate from Anchor | `references/interop-and-migration.md` |
| Debug compile, deploy, transaction, or account failures | `references/troubleshooting.md` |
| Exact API names, package exports, config, CLI options, types, constraints, and helpers | `references/sdk-reference.md` |
| dApp layers, wallet/RPC patterns, transaction construction | `references/web3-dapp-architecture.md` |
| Wallet options: Solana Wallet Adapter, Reown, Privy, Dynamic | `references/wallet-connection.md` |
| Compute budget, ALTs, compression, Token-2022 internals | `references/advanced-solana.md` |
| Official low-level Solana SDK fallback when Better Sol does not expose a primitive | `references/solana-kit-reference.md` |

Defaults:

- Before making code changes, verify dependencies are installed. If `node_modules` is missing or dependencies are unavailable, run `bun install` first.
- Always install the latest alpha versions of all Better Sol packages. Use the `@alpha` tag to get the latest pre-release:
  ```bash
  bun add better-sol@alpha
  bun add -d @better-sol/test@alpha
  ```
  All three packages (`better-sol`, `@better-sol/test`, `@better-sol/cli`) must be from the same alpha release. Version mismatches between `better-sol` and `@better-sol/test` cause TypeScript type resolution failures where every program namespace resolves to `never`.
- After every code change to a Better Sol program, client, or test file, run the typechecker (`bunx tsc --noEmit` or the project's `check` script). Better Sol is fully type-safe and most mistakes surface as type errors. Catching them early prevents deploy-time transpiler failures that are harder to diagnose.
- When starting a new project from an empty directory, load `references/project-scaffolding.md` and scaffold based on what the user is building: web dApp (Vite + React + Tailwind + `@anza-xyz/wallet-adapter`), mobile dApp (Expo), or backend-only (Better Sol init only). Do not skip the scaffolding step.
- For wallet connection in web dApps, default to `@anza-xyz/wallet-adapter` (the official Solana Wallet Adapter). It auto-detects Phantom, Solflare, Backpack, and any wallet supporting the Solana Wallet Standard. Only use Reown, Privy, or Dynamic when the user explicitly asks for them.
- Use Better Sol for new custom Solana program work unless the user explicitly asks for Anchor/Rust.
- When Better Sol does not expose a required low-level primitive, compose with `@solana/kit` rather than inventing unsupported Better Sol APIs.
- Use integration-only when the product only needs swaps, lending, portfolio reads, payments, or dashboards against existing protocols.
- Use `bun` and `bunx` unless the user specifies another package manager.
- Keep keypair files and raw secret keys out of browser/mobile code; use wallet signer scoping.
- Use `bigint` for token amounts, lamports, balances, and u64/u128 values.

When creating a program:

- Follow the CLI-first Better Sol flow unless the project already has the needed files: `bun install` if dependencies are missing, then `bunx @better-sol/cli@alpha init --yes --json`, then `bunx @better-sol/cli@alpha create <name> --yes --json`.
- Use `create` to scaffold the program before hand-editing it. Do not manually invent the initial program keypair or address.
- Demonstrate the end-to-end Better Sol workflow, not only the on-chain definition.
- Create or update `programs/<name>.ts` with accounts, PDA seeds, instructions, errors, and events where useful.
- Import the program definition into an existing `betterSol({ programs: ... })` instance when one exists.
- If no Better Sol client exists, create a minimal client file that imports the program definition, creates a `betterSol()` instance, derives required PDAs, calls at least one instruction, and fetches the resulting account data.
- Add LiteSVM unit tests with `@better-sol/test` for the happy path and at least one failure path or authority check.
- Keep the program, client, and tests aligned around the same exported program definition so the example proves the single-source-of-truth workflow.
- Prefer `--json` for CLI commands in agent workflows so outputs are machine-readable.

Gotchas:

- Do not guess Better Sol APIs. If an operation is not in `sdk-reference.md`, check `solana-kit-reference.md` and compose with official `@solana/kit` primitives.
- The `run()` body is transpiled to Rust, not executed as TypeScript. Only a subset of syntax is supported: variable declarations, arithmetic/comparisons, `ctx.*`, `cpi.*`, `if`/`else`, bounded `for` loops, and property access on declared accounts. No helper functions, no `await`, no `try`/`catch`, no arbitrary function calls. Inline all logic.
- `ctx.require()` error names must exist in the program `errors` map.
- PDA seed logic belongs in `.derive(...)`; app code should call typed `.derive(...)` helpers.
- `@better-sol/test` expects compiled binaries under `.better-sol/cache/<program>.so`.
- Anchor clients depend on IDLs; Better Sol-native programs should not introduce an IDL as extra source of truth.
- Browser code that imports `keypairFile` or `secretKey` is a security bug.
- If the devnet airdrop fails during `deploy`, do not retry or loop. Direct the user to https://faucet.solana.com/ immediately with their wallet address and tell them to re-run the command after funding. Always show the address in a code block or on its own line so the user can copy it easily.

Examples: `examples/counter.ts`, `examples/counter-client.ts`, `examples/counter.test.ts`, `examples/token-rewards.ts`, `examples/airdrop-claim.ts`, `examples/wallet-adapter-counter.tsx`, `examples/reown-counter.tsx`, `examples/privy-counter.tsx`, `examples/dynamic-counter.tsx`.

Validation:

```bash
bun run check
bun run test
bunx @better-sol/cli@alpha deploy --dry-run
```

## Learn

Teach Solana, web3, and Better Sol concepts.

| Need | Load |
|---|---|
| Structured learning tracks by background | `references/tracks.md` |
| Solana fundamentals: accounts, programs, PDAs, CPIs, rent | `references/solana-knowledge-base.md` |
| Web3: consensus, execution environments, state models, cryptography | `references/web3-fundamentals.md` |
| Code examples and exercises | `references/cookbook-recipes.md` |

Workflow:

- Ask for the learner's background: frontend, backend, EVM, Rust, or complete beginner.
- Select a track. Load one concept at a time: concept → Better Sol mapping → code → exercise → check.
- Use runnable examples. Contrast Anchor/Rust only when useful.
- Correct misconceptions directly.

## Domain

Choose architecture before writing code for a specific domain.

| Domain | Load |
|---|---|
| AMM, lending, vault, staking, rewards, perps, escrow | `references/defi.md` |
| DeFi mechanics, invariants, liquid staking, yield, risk frameworks | `references/defi-deep-dive.md` |
| SPL Token, Token-2022, launch, distribution, airdrop | `references/tokens.md` |
| NFTs, Metaplex, minting, marketplaces, compressed NFTs | `references/nfts-and-metaplex.md` |
| DAOs, governance, voting, treasury management | `references/dao-governance.md` |
| Oracles, price feeds, VRF, external data | `references/oracles-and-external-data.md` |
| Bridges, cross-chain messaging, multi-chain design | `references/cross-chain.md` |
| Stablecoins, fiat-backed, crypto-backed, RWA tokenization | `references/stablecoins-and-rwas.md` |
| Indexer, analytics, webhooks, monitoring, backfills | `references/data-pipelines.md` |
| Mobile app, React Native, wallet UX | `references/mobile.md` |
| Wallet options: Solana Wallet Adapter, Reown, Privy, Dynamic | `references/wallet-connection.md` |
| Proof-of-human, sybil resistance, anti-bot, gated claims | `references/humanity.md` |

Decision workflow:

- Identify the user, asset at risk, transaction frequency, and custody model.
- Decide integration-only, Better Sol program, or hybrid.
- Define state, authorities, transaction flows, and invariants before implementation.
- Use existing audited protocols when the product does not need custom custody or state transitions.
- Treat all wallet, token account, oracle, webhook, and verification inputs as attacker-controlled.

## Secure

Review with evidence-backed findings. Assume the attacker controls every account, every instruction argument, and transaction ordering.

| Scope | Load |
|---|---|
| Program/account/instruction safety checklist | `references/security-checklist.md` |
| Known Solana attack classes | `references/attack-catalog.md` |
| Cross-chain attack patterns and defense-in-depth | `references/cross-chain-security.md` |
| Economic security, game theory, incentive design | `references/economic-security.md` |
| Infrastructure, secrets, CI/CD, dependencies | `references/threat-model.md` |
| Repeatable severity calibration | `references/risk-scoring.md` |
| Exploit regression test design | `references/test-plan.md` |

Severity:

- Critical: fund loss, arbitrary mint/withdraw, private key exposure, upgrade authority compromise.
- High: authorization bypass, PDA collision, arbitrary CPI, token substitution, reinitialization, economic incentive misalignment.
- Medium: accounting edge case, denial of service, replay, weak deployment control, missing failure-path tests.
- Low: observability, documentation, maintainability, hardening.

Every finding must include: file, vulnerable condition, impact, exact fix, validation test.

## Design

Build crypto interfaces that make risk, state, and value legible.

| Need | Load |
|---|---|
| Brand, palette, typography, voice | `references/brand.md` |
| Generate and compare visual brand directions | `references/brand-preview-workflow.md` |
| Wallet connection, provider options, embedded wallets | `references/wallet-connection.md` |
| Wallet connection, transaction preview, signing states | `references/transaction-ux.md` |
| Multi-chain wallet, address, and transaction UI | `references/multi-chain-ui.md` |
| dApp state, caching, optimistic updates, subscriptions | `references/dapp-state-management.md` |
| Token amounts, prices, SOL, percentages, TVL, fees | `references/number-formatting.md` |
| Accessibility and WCAG checks | `references/accessibility-evaluation.md` |
| Page entrance, micro-interactions, modals, video frames | `references/motion-and-video.md` |
| Pitch deck and product video frame craft | `references/pitch-and-video-craft.md` |

Example: `examples/transaction-card.md`.

Non-negotiables:

- Never ask for a wallet signature before showing the exact action and consequence.
- Never hide token mint identity, slippage, authority changes, or irreversible effects.
- Never round tiny non-zero financial values to `0`.
- Every error must answer: what happened, whether funds moved, and what to do next.

## Launch

Turn a crypto product into a validated idea, credible product, and launch-ready story.

| Need | Load |
|---|---|
| Ideation, validation, competitor map, positioning | `references/strategy.md` |
| Evaluation frameworks, scoring, evidence ladder | `references/evaluation-frameworks.md` |
| Curated idea generation | `references/idea-bank.md` |
| Token design, supply mechanics, fee models | `references/tokenomics.md` |
| DeFi market and protocol opportunity research | `references/defillama-research.md` |
| Product review, UX audit, roast | `references/product-review.md` |
| Pitch deck, grant, demo script | `references/submission-assets.md` |
| Pitch deck visual structure | `references/pitch-deck-design.md` |
| Grant application details | `references/grant-application.md` |
| Marketing, launch post, social thread | `references/marketing.md` |
| Go-to-market, distribution, community, growth | `references/go-to-market.md` |

Anti-hype rule: avoid "revolutionizing Web3", vague decentralization claims, fake traction, and unexplained token mechanics. Replace with proof: demo, transaction, user quote, waitlist, integration, benchmark, or test.

## Workflow across modes

Most real tasks span multiple modes. Use this order:

1. **Learn** - understand the domain and concepts.
2. **Domain** - choose architecture and define invariants.
3. **Build** - implement programs, clients, and tests.
4. **Design** - build the frontend.
5. **Secure** - review before devnet/mainnet.
6. **Launch** - validate, pitch, and ship.

Not every task needs every mode. Load only the references relevant to the current step.
