# Better Sol

Write Solana programs in TypeScript. One file defines your accounts and instructions. Deploy on-chain from that same file, and get a fully typed client with no extra steps.

```ts
// programs/counter.ts
import { bs, cpi } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive(seed => ["counter", seed.authority])

export const counter = bs.program({ name: "counter", address: "<key>" }, ix => ({
  increment: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter }, { amount }) => { counter.count += amount },
  }),
}))
```

Deploy:

```bash
npx @better-sol/cli deploy
```

Use from your app:

```ts
import { betterSol } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs: { counter } })
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.increment({ counter: addr, amount: 5n })
const data = await sol.counter.accounts.Counter.fetch(addr)
```

No separate IDL to maintain. No hand-written client types. No code generation step. The same TypeScript file is the source of truth for deployment and for the client.

## Quick start

```bash
npx @better-sol/cli init                    # scaffold project + payer keypair
npx @better-sol/cli create counter          # create a program
npx @better-sol/cli deploy                  # compile and deploy to devnet
```

Your program is on-chain. Connect from TypeScript:

```bash
npm install better-sol
```

Follow the [Getting Started](https://better-sol.dev/docs) guide for the full walkthrough.

## Packages

| Package | What it does | Install |
|---|---|---|
| [better-sol](packages/better-sol) | Program definition DSL, typed client, token helpers, `fromIdl()` | `npm install better-sol` |
| [@better-sol/cli](packages/cli) | Create, deploy, generate schemas, import external programs | runs via `npx`, no install needed |

The runtime SDK has zero transpiler code. Nothing from the CLI ships to browser bundles.

## What you get

**Program definition.** Define accounts with typed fields, PDA seeds, zero-copy layouts, custom errors, and events. All in TypeScript, all type-checked.

**Deployment.** The CLI parses your TypeScript, generates Anchor Rust, compiles it via a cloud API, and deploys the `.so` binary to Solana. No local Rust toolchain needed.

**Typed client.** Pass your program definition to `betterSol()` and get typed methods for every instruction, typed account fetching, PDA derivation, error parsing, and event parsing. The types come from your definition, not from a separate code generation step.

**Token operations.** Built-in clients for SPL Token and Token-2022. Create mints, mint tokens, transfer, check balances. Associated token accounts are created automatically.

**External programs.** Import any Anchor program by address or IDL file with `generate idl`. Get a typed TypeScript definition you can use the same way as your own programs. Or use `fromIdl()` to load an IDL at runtime.

## Development

```bash
bun install
bun run check        # type-check all packages
bun run build        # build all packages
bun run test         # run all tests
bun run lint         # lint with oxlint
```

### Workspace layout

```
packages/
  better-sol/        # Runtime SDK
    src/
      program.ts     # bs, cpi, account definitions, constraints
      client/        # betterSol(), typed client, transactions, tokens
      idl.ts         # fromIdl(), AnchorIdl type
      codec.ts       # Borsh encoder/decoder
    test/            # 105 tests

  cli/               # CLI tool
    src/
      parser/        # ts-morph AST parser
      generator/     # Rust code generator + IDL code generator
      commands/      # init, create, deploy, generate, verify, login
      lib/           # shared config, auth, keypair, RPC helpers
    test/

apps/
  web/               # Documentation site (Fumadocs)
  compiler-api/      # Cloud compilation service (internal)
```

## License

MIT
