# 07 — Documentation Plan

Guide-driven documentation for better-sol, written in MDX using Fumadocs.

---

## Documentation Style

Laravel and Better Auth style: every page is a guide or recipe. The reader is building something, not reading a reference. Each page opens with a short goal ("Create a counter program that tracks who incremented it"), then walks through the code, then explains what happened. API details are inline — shown in context, not listed in tables.

Every page should work as a standalone guide. A developer landing on any page from Google should be able to follow it without reading the pages before it.

---

## File Structure

The Fumadocs pattern uses flat files with `---Section Name---` separators for non-collapsible sidebar groups. Subfolders render as collapsible menus. Folder groups (parenthesized names) prevent URL prefixing.

When versioning is needed, wrap the latest version in a parenthesized folder group with `"root": true`. Older versions use regular folders without parentheses so their URLs include the version prefix:

```json
// content/docs/meta.json
{ "pages": ["(v2)", "v1"] }

// content/docs/(v2)/meta.json  ← latest version, no URL prefix
{ "title": "v2", "root": true, "pages": ["---Getting Started---", "index", "..."] }

// content/docs/v1/meta.json    ← old version, /docs/v1/... in URL
{ "title": "v1", "root": true, "pages": ["---Getting Started---", "index", "..."] }
```

Root folders auto-render as a version dropdown in the sidebar. With a single root folder the dropdown is hidden.

```
content/docs/
  meta.json                          ← root nav

  index.mdx                          ← installation + overview (at /docs)
  your-first-program.mdx             ← counter program, end to end
  your-first-client.mdx              ← connect and interact from TypeScript
  project-structure.mdx              ← what the scaffolded files do

  defining-programs/
    meta.json
    types.mdx                        ← all primitive and compound types
    accounts.mdx                     ← defining accounts, PDA seeds, zero-copy
    instructions.mdx                 ← defining instructions, accounts, args, returns
    constraints.mdx                  ← all account constraints in one place
    errors-and-events.mdx            ← custom errors and event emission
    program-config.mdx               ← putting it all together: bs.program()
    body-language.mdx                ← what you can write in run() bodies

  the-client/
    meta.json
    connecting.mdx                   ← betterSol() setup, all config options
    calling-instructions.mdx         ← .send(), .instruction(), .simulate(), etc.
    fetching-accounts.mdx            ← derive(), fetch(), fetchMultiple()
    errors.mdx                       ← ProgramError, parseErrors()
    events.mdx                       ← parseEvents() from transaction logs
    multi-instruction.mdx            ← send(), batch(), steps()
    tokens.mdx                       ← token + token-2022 operations
    sol-transfers.mdx                ← SOL transfers and balances

  advanced/
    meta.json
    address-lookup-tables.mdx        ← ALT configuration
    durable-nonce.mdx                ← offline signing with durable nonce
    compute-budget.mdx               ← compute unit limits and priority fees
    from-idl.mdx                     ← importing existing Anchor programs
    wallet-adapters.mdx              ← browser wallet integration (4 providers)
    custom-rpc.mdx                   ← custom RPC URLs, self-hosted compiler

  cli/
    meta.json
    creating-programs.mdx            ← npx create
    deploying.mdx                    ← npx deploy, options, dry-run
    generating-db-schemas.mdx        ← npx generate db
    verified-builds.mdx              ← npx verify
    configuration.mdx                ← better-sol.config.ts

  recipes/
    meta.json
    counter.mdx                      ← full counter program (reference implementation)
    token-rewards.mdx                ← CPI into Token program from on-chain
    nft-mint.mdx                     ← creating and managing NFTs
    escrow.mdx                       ← PDA-based escrow with conditional release
    marketplace.mdx                  ← multi-user marketplace with remaining accounts
```

---

## Page Outlines

### Getting Started

#### `index.mdx`

Goal: Landing page at `/docs`. What better-sol is, how it compares, and installation.

- Program SDK comparison: Anchor, Seahorse, Solang
- Client SDK comparison: @solana/kit, Kite, Umi, web3.js v1
- `npm install better-sol`
- Optional API key via `npx @better-sol/cli@latest login`

#### `your-first-program.mdx`

Goal: Build and deploy a counter program. Program side only.

- `npx @better-sol/cli@latest init` — creates keypair, .gitignore, programs/ dir
- `npx @better-sol/cli@latest create counter` — scaffolds the template
- Walk through the generated template (account, instructions, errors)
- `npx @better-sol/cli@latest deploy` — deploys to devnet (auto-funded)

#### `your-first-client.mdx`

Goal: Connect to the deployed program from TypeScript. Client side.

- `betterSol({ cluster, payer, programs })` — create the client
- `derive()` — derive PDA addresses
- `initialize()`, `increment()` — call instructions
- `fetch()` — read typed account data
- `close()` — reclaim rent
- No codegen, no separate IDL, types inferred from program definition

#### `project-structure.mdx`

Goal: Understand what every generated file does.

- `programs/` — your TypeScript definitions
- `generated/` — Rust output + compiled `.so`
- `better-sol.config.ts` — CLI configuration
- `.better-sol/` — keypairs and auth state

---

### Defining Programs

#### `types.mdx`

Goal: Know every type available and when to use each one.

- Integer types: `bs.u8()` through `bs.i128()` — when to use `number` vs `bigint`
- `bs.bool()`, `bs.pubkey()`, `bs.string()`, `bs.bytes()`
- Compound: `bs.optional()`, `bs.vector()`, `bs.array()`
- Zero-copy restrictions: what types are Pod-safe
- Each type shown with a field definition and the TypeScript type it maps to

#### `accounts.mdx`

Goal: Define accounts with fields, PDA seeds, and zero-copy.

- Basic account: `bs.account({ ... })`
- PDA derivation: `.derive(seed => ["prefix", seed.field])` — literal seeds, field seeds, mixed
- Zero-copy accounts: `.zeroCopy()` — when to use, Pod-safe type restrictions
- Struct definitions: `bs.struct({ ... })` for zero-copy sub-structs
- Account space is computed automatically

#### `instructions.mdx`

Goal: Define instructions with accounts, arguments, and optional return types.

- Basic structure: `ix({ accounts, args, run })`
- Four shapes: accounts only, args only, both, neither
- The `run()` callback: typed parameters matching your definition
- Return values: `returns: bs.u64()` with `return <expr>` in the body
- Account/arg name collision detection

#### `constraints.mdx`

Goal: Understand every constraint and what it generates in Anchor.

- User accounts: `bs.init()`, `bs.initIfNeeded()`, `bs.mut()`, `bs.close()`, `bs.realloc()`
- System accounts: `bs.signer()`, `bs.mint()`, `bs.tokenAccount()`, `bs.tokenProgram()`, `bs.token2022Program()`, `bs.systemProgram()`, `bs.clock()`
- Writable variants: `.writable()` on mint and tokenAccount
- Remaining accounts: `bs.remaining()`
- Validation: `bs.hasOne("field")` on account definitions
- Each constraint shown with generated Anchor equivalent

#### `errors-and-events.mdx`

Goal: Define custom errors and events, use them in run() bodies.

- Error definitions: `errors: { Unauthorized: "message" }`
- Using errors: `ctx.require(condition, "ErrorName")`
- Event definitions: `events: { Incremented: { newCount: bs.u64() } }`
- Emitting events: `ctx.emit("Incremented", { newCount })`
- Error and event names are validated at transpile time

#### `program-config.mdx`

Goal: Wire accounts, instructions, errors, and events into a program.

- `bs.program({ name, address, accounts, errors, events }, ix => ({ ... }))`
- Program address: where to get it, how to generate a keypair
- Multiple programs in one project
- Type inference: how TypeScript infers instruction params from the definition

#### `body-language.mdx`

Goal: Know exactly what you can write inside `run()` bodies.

- Supported: assignment, arithmetic, if/else, bounded for loops, ctx.require, ctx.emit, ctx.log, CPI calls, return values
- Unsupported: while, for-of, switch, try/catch, throw, await, Math.*, template strings, spread, destructuring, nested functions
- Each supported feature shown with TypeScript → Rust translation
- Type inference: how the body transpiler tracks types

---

### The Client

#### `connecting.mdx`

Goal: Create a client and understand all configuration options.

- Basic setup: `betterSol({ cluster, payer, programs })`
- Signer input types: `keypairFile()`, `secretKey()`, `TransactionSigner`
- Read-only client: `betterSol({ cluster })` without payer
- All config options: `commitment`, `computeUnits`, `addressLookupTables`, `durableNonce`, `rpcUrl`, `rpcSubscriptionsUrl`
- Client shape: what you get back (payer, rpc, rpcSubscriptions, token, token2022, program methods)
- Scoped signers: `sol.withSigner()` for multi-user scenarios

#### `calling-instructions.mdx`

Goal: Call program instructions in every possible way.

- Default call: `await sol.counter.increment({ ... })` → signature
- `.send()` — explicit send (same as default)
- `.instruction()` — get the Kit Instruction for composition
- `.transaction()` — get a signed transaction
- `.simulate()` — simulate without sending
- `.prepare()` — instruction + signers + pubkeys
- `.plan()` — composable instruction plan
- Signer auto-fill: when `bs.signer()` accounts are omitted

#### `fetching-accounts.mdx`

Goal: Derive PDAs and fetch typed account data.

- PDA derivation: `sol.counter.accounts.Counter.derive({ authority })`
- Fetch single: `sol.counter.accounts.Counter.fetch(address)` → typed data or null
- Fetch multiple: `sol.counter.accounts.Counter.fetchMultiple([addr1, addr2])`
- Auto-decoding: Borsh for standard, zero-copy for `.zeroCopy()` accounts
- Seed field types: what types can be PDA seeds

#### `errors.mdx`

Goal: Catch and parse typed program errors.

- Transaction failures throw generic errors from RPC
- `sol.counter.parseErrors(logs)` → `ProgramError | undefined`
- `ProgramError` properties: `programName`, `errorName`, `errorIndex`, `message`
- Using with try/catch
- Mapping error names back to your program definition

#### `events.mdx`

Goal: Decode Anchor events from transaction logs.

- `sol.counter.parseEvents(logs)` → `ParsedEvent[]`
- Event structure: `{ name, data }` with decoded fields
- How Anchor events are encoded in logs (discriminator + Borsh data)
- Getting logs from `rpc.getTransaction()` or simulate results

#### `multi-instruction.mdx`

Goal: Compose multiple instructions into single or sequential transactions.

- `sol.send([...])` — multiple instructions in one transaction
- `sol.batch([...])` — non-divisible sequential plan (all-or-nothing)
- `sol.steps([...])` — sequential steps with dependency passing
- Composing with `.instruction()` from different programs

#### `tokens.mdx`

Goal: Create, mint, transfer, and query tokens.

- `sol.token` (Token) and `sol.token2022` (Token-2022) — identical API
- Create mint: `sol.token.createMint({ decimals })` → `{ mint, mintSigner, signature }`
- Get ATA: `sol.token.getATA({ owner, mint })`
- Mint tokens: `sol.token.mintTo({ mint, to, amount })`
- Transfer: `sol.token.transfer({ mint, to, amount })`
- Balance: `sol.token.getBalance({ owner, mint })`

#### `sol-transfers.mdx`

Goal: Transfer SOL and query balances.

- `sol.transfer({ to, amount })` — send SOL
- `sol.getBalance(address)` — query balance in lamports
- `from` parameter defaults to active signer

---

### Advanced

#### `address-lookup-tables.mdx`

Goal: Configure ALTs for compact transaction encoding.

- Why ALTs matter: reducing transaction size for programs with many accounts
- Configuration: `addressLookupTables: [addr1, addr2]` in `betterSol()`
- How it works: addresses fetched and indexed at client creation, resolved at instruction build time
- Signer accounts excluded from ALT resolution

#### `durable-nonce.mdx`

Goal: Sign transactions offline with durable nonce.

- Why durable nonce: offline signing, transaction queueing
- Configuration: `durableNonce: { nonceAccountAddress }` in `betterSol()`
- How it works: nonce fetched fresh per transaction, advance nonce instruction auto-prepended
- Creating a nonce account (requires separate setup)

#### `compute-budget.mdx`

Goal: Set compute unit limits and priority fees.

- Configuration: `computeUnits: { limit, price }` in `betterSol()`
- When to set: complex instructions, prioritizing landing
- How it works: `setComputeUnitLimit` and `setComputeUnitPrice` instructions prepended

#### `from-idl.mdx`

Goal: Use any existing Anchor program with a typed client.

- `fromIdl(idlJson)` — import Anchor IDL
- Register with `betterSol({ programs: { mango: fromIdl(mangoIdl) } })`
- What's supported: instructions, accounts, errors, events
- Compound types: option, vec, coption, defined
- Optional accounts and nested items

#### `wallet-adapters.mdx`

Goal: Connect browser wallets to the client.

- `walletAdapter()` from `better-sol/wallets`
- `reownWallet()` from `better-sol/wallets/reown`
- `privyWallet()` from `better-sol/wallets/privy`
- `dynamicWallet()` from `better-sol/wallets/dynamic`
- Pattern: create read-only client → `sol.withSigner(adapter)` → call instructions
- Multiple users: different signers on the same base client

#### `custom-rpc.mdx`

Goal: Use custom RPC endpoints and self-host the compiler.

- Custom RPC: `rpcUrl` in config (requires `rpcSubscriptionsUrl` for WebSocket)
- Self-hosted compiler: `BETTER_SOL_COMPILER_URL` env var
- When you need custom RPC: rate limits, mainnet beta, dedicated nodes

---

### CLI

#### `creating-programs.mdx`

Goal: Scaffold a new program with the CLI.

- `npx @better-sol/cli create <name>` — what it generates
- `--dir` option for custom program directory
- `--force` to overwrite
- The generated template: basic account, init instruction, program config

#### `deploying.mdx`

Goal: Deploy a program from TypeScript to on-chain.

- `npx @better-sol/cli deploy` — full pipeline (parse → generate Rust → compile → deploy)
- `--dry-run` — generate Rust without compiling
- `--program <name>` — target specific program
- `--cluster` — override cluster
- `--output` — custom output directory for generated Rust
- `--verify` — write Rust for verified builds
- Login first: `npx @better-sol/cli login`

#### `generating-db-schemas.mdx`

Goal: Generate a Drizzle ORM schema from account definitions.

- `npx @better-sol/cli generate db`
- `--dialect` option: postgres, mysql, sqlite
- `--out` option: output file path
- Generated schema: type mappings (u64 → bigint, pubkey → text, etc.)

#### `verified-builds.mdx`

Goal: Submit a deployed program for OtterSec verified builds.

- `npx @better-sol/cli verify <program>`
- What verified builds prove: on-chain bytecode matches source
- Options: `--program-id`, `--lib-name`, `--mount-path`

#### `configuration.mdx`

Goal: Configure the CLI with `better-sol.config.ts`.

- `defineConfig({ programs, cluster, out })`
- `programs` glob pattern for file discovery
- Default values and when you need a config file

---

### Recipes

#### `counter.mdx`

Goal: A complete reference counter implementation — the "todo list" of Solana programs.

- Full program: init, increment, decrement, toggle, close, token reward (CPI)
- Client usage: every instruction method, account fetch, error handling, event parsing
- Deploy and test on devnet
- This is the page people copy-paste to get started

#### `token-rewards.mdx`

Goal: Mint and transfer tokens from on-chain via CPI.

- Program with `cpi.token.mintTo()` in `run()` body
- Required accounts: mint (writable), token account (writable), token program
- PDA-signed CPI: when the program owns the mint authority
- Client-side: creating the mint, calling the reward instruction

#### `nft-mint.mdx`

Goal: Create and manage NFTs with the token client.

- Create mint with decimals 0 and supply 1
- Set metadata (future: Metaplex helpers)
- Transfer the NFT
- Token-2022 NFT with extensions

#### `escrow.mdx`

Goal: Build an escrow program with PDA vault and conditional release.

- Escrow account: buyer, seller, amount, token mint, state
- PDA vault derived from escrow account
- Instructions: create, fund, release, cancel
- `bs.realloc()` for variable-size escrows
- Client: full flow from create to release

#### `marketplace.mdx`

Goal: Build a marketplace with `bs.remaining()` for dynamic account lists.

- Listing account: seller, price, token mint
- `bs.remaining()` for batch purchases
- Multiple listings in a single transaction
- Client: compose multi-listing calls

---

## Writing Guidelines

1. **Open with a goal.** "In this guide, you'll build a counter program that tracks an authority and can be toggled on and off."
2. **Show code first, explain after.** The code block is the answer. The prose below it explains why.
3. **Every example runs.** No pseudocode, no `// ...`. Every code block is complete and functional.
4. **One concept per page.** If a page needs a table of contents, it's too long.
5. **Cross-link liberally.** Every time a concept appears that's explained elsewhere, link to it.
6. **No API reference tables.** Types and options are shown in working code, not listed in isolation.
7. **Error messages are guides.** When something goes wrong, show the error message and explain what it means.

## Code Block Conventions

Use `npm` language tag for package install commands:

```npm
npm i my-package
```

Use `tsx ts2js` for TypeScript/TSX code blocks (enables the Fumadocs TS-to-JS tab switcher):

```tsx ts2js
import { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
```

CLI commands use `bash` language tag.
