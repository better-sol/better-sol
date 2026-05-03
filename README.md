# better-sol monorepo

**One TypeScript program definition → on-chain Anchor Rust + typed client SDK + DB schema.**

Stop maintaining separate Anchor Rust programs and hand-written TypeScript clients. Write your Solana program once in TypeScript. Derive everything else from it.

```bash
# Create a program (no installation needed — runs via npx/bunx)
npx @better-sol/cli create counter

# Edit programs/counter.ts with your logic

# Generate Rust + deploy to devnet
npx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet

# Use the typed SDK client-side
npm install better-sol
```

---

## Packages

| Package | Description | Install |
|---|---|---|
| [`better-sol`](packages/better-sol) | Runtime SDK: program definition DSL, typed client, wallet adapters, token helpers, `fromIdl()` | `bun add better-sol` |
| [`@better-sol/cli`](packages/cli) | CLI: TypeScript → Anchor Rust transpiler, cloud compiler, deploy, DB schema generation | `bun add -D @better-sol/cli` |
| `apps/compiler-api` | Rust + Axum cloud compiler API (internal, optional) | — |

The runtime library and CLI are published as separate npm packages so the runtime stays lean — no transpiler code ships to browser bundles.

---

## Architecture

```
programs/counter.ts (TypeScript definition)
         │
         ├── ▶ better-sol (runtime) — typed client SDK
         │                    instruction calls, PDA derivation,
         │                    account fetching, token operations
         │
         ├── ▶ @better-sol/cli — generates Anchor Rust + IDL
         │                    parses TS AST → generates lib.rs
         │                    → compiles → deploys
         │
         └── ▶ @better-sol/cli generate db — Drizzle ORM schema
```

---

## Development

```bash
git clone <repo>
cd better-sol
bun install              # Install dependencies
bun run check            # Type-check all packages
bun run build            # Build all packages
bun run test             # Run all tests (104 total)
bun run lint             # Lint (oxlint)
bun run format:check     # Format check
```

### Workspace layout

```
├── packages/
│   ├── better-sol/          # Runtime library
│   │   ├── src/
│   │   │   ├── client.ts    # betterSol() client factory
│   │   │   ├── program.ts   # Program DSL (program, account, p.*)
│   │   │   ├── coder.ts     # Borsh encoder/decoder
│   │   │   ├── idl.ts       # fromIdl() — Anchor IDL import
│   │   │   └── wallets/     # Wallet adapter subpaths
│   │   └── test/            # 54 tests
│   └── cli/                 # CLI tool
│       ├── src/
│       │   ├── parser/      # ts-morph AST parser
│       │   ├── generator/   # Rust code generator
│       │   ├── commands/    # CLI commands
│       │   └── ir/          # Intermediate representation
│       └── test/
│           └── fixtures/    # End-to-end program test fixtures
└── apps/
    └── compiler-api/        # Rust cloud compiler API (optional)
```

### Tools

| Tool | Purpose |
|---|---|
| [Bun](https://bun.sh) | Runtime, package manager, bundler, test runner |
| TypeScript 6 | Source language |
| [Oxlint](https://oxc.rs) | Linting |
| [ts-morph](https://ts-morph.com) | TypeScript AST parsing (CLI only) |
| Anchor 1.0.1 | Rust framework target |
| [@solana/kit](https://github.com/solana-foundation/solana-web3.js) | Official Solana JS SDK |

## License

MIT
