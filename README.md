# better-sol monorepo

**TypeScript-first Solana development.** Write one TypeScript program definition. Get an on-chain Anchor Rust program, a typed client SDK, and a database schema.

---

## Packages

| Package | Description |
|---|---|
| [`better-sol`](packages/better-sol) | Runtime SDK: program definition DSL, typed client, wallet adapters, token helpers, `fromIdl()` |
| [`@better-sol/cli`](packages/cli) | CLI: TypeScript → Anchor Rust transpiler, cloud compiler, deploy, database schema generation |
| `apps/compiler-api` | Rust + Axum cloud compiler API (internal, optional) |

The two-package split keeps the runtime library lean — no transpiler code ships to browser bundles.

---

## Quick Start

```bash
# Install
bun add better-sol
bun add -D @better-sol/cli

# Define a program in TypeScript
cat > programs/counter.ts << 'EOF'
import { account, p, program, pubkey, u64 } from "better-sol/program";
const Counter = account({ count: u64, authority: pubkey })
  .derive((seed) => ["counter", seed.authority]);
export const counter = program(
  { name: "counter", address: "CoUnTeR11111111111111111111111111111111111", accounts: { Counter } },
  ix => ({
    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: () => {},
    }),
  }),
);
EOF

# Generate Rust and check
bunx @better-sol/cli deploy --src "programs/*.ts" --dry-run

# Deploy
bunx @better-sol/cli deploy --src "programs/*.ts" --cluster devnet --keypair ./keypair.json
```

---

## Development Commands

```bash
bun install             # Install all dependencies
bun run check           # Type-check all packages
bun run build           # Build all packages
bun run test            # Run all tests
bun run lint            # Lint all packages
bun run format:check    # Format check (oxlint)
bun run compiler:check  # Rust compiler API check (requires cargo)
```

## Workspace Layout

```
├── packages/
│   ├── better-sol/          # Runtime library (published to npm)
│   │   ├── src/             # Source files
│   │   │   ├── client.ts    # betterSol() client factory
│   │   │   ├── program.ts   # program(), account(), p.* DSL
│   │   │   ├── coder.ts     # Borsh encoder/decoder
│   │   │   ├── idl.ts       # fromIdl() Anchor IDL importer
│   │   │   └── wallets/     # Wallet adapter subpaths
│   │   └── test/            # SDK test suite
│   └── cli/                 # CLI tool (published as @better-sol/cli)
│       ├── src/
│       │   ├── parser/      # TypeScript AST parser (ts-morph)
│       │   ├── generator/   # Rust code generator
│       │   ├── commands/    # CLI commands (create, deploy, generate, verify)
│       │   └── ir/          # Intermediate representation types
│       └── test/
│           └── fixtures/    # End-to-end program fixtures
└── apps/
    └── compiler-api/        # Rust cloud compiler API
```

## Tools

- **Bun** — Runtime, package manager, bundler, test runner
- **TypeScript 6** — Source language
- **Oxlint** — Linting and auto-fix
- **ts-morph** — TypeScript AST parsing (CLI only)
- **Anchor 1.0.1** — Rust framework target
- **@solana/kit** — Official Solana JavaScript SDK

## License

MIT
