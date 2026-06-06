# Better Sol

> **Alpha**
>
> Better Sol is in early development. APIs may change, rough edges exist, and things can break. Your feedback shapes what comes next. Thank you for being an early adopter.

Write Solana programs in TypeScript. One file defines your accounts and instructions. Deploy on-chain from that same file, and get a fully typed client with no extra steps.

```ts
// programs/counter.ts
import { bs } from "better-sol/program"

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
npx @better-sol/cli@alpha deploy
```

Use from your app:

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
await sol.counter.increment({ counter: addr, amount: 5n })
const data = await sol.counter.accounts.Counter.fetch(addr)
```

No separate IDL to maintain. No hand-written client types. No code generation step. The same TypeScript file is the source of truth for deployment and for the client.

## Quick start

```bash
npx @better-sol/cli@alpha init                     # scaffold project + payer keypair
npx @better-sol/cli@alpha create counter           # scaffold a program
npx @better-sol/cli@alpha deploy                   # compile and deploy to devnet
```

Your program is on-chain. Read the [full guide](https://better-sol.fun/docs).

## Testing

```ts
import { createTestContext } from "@better-sol/test"
import { counter } from "../programs/counter"

const ctx = createTestContext({ programs: { counter } })
const sol = ctx.client()

await sol.counter.increment({ counter: addr, amount: 5n })
const { count } = await sol.counter.accounts.Counter.fetch(addr)
```

No local validator. No CLI. Pure TypeScript tests that run in milliseconds.

## Packages

| Package | What it does | Install |
|---|---|---|
| [better-sol](packages/better-sol) | Program definition DSL, typed client, token helpers, real-time subscriptions, `fromIdl()` | `npm install better-sol@alpha` |
| [@better-sol/test](packages/test) | Local test runner backed by LiteSVM | `npm install @better-sol/test@alpha` |
| [@better-sol/cli](packages/cli) | Create, deploy, generate schemas, import external programs | runs via `npx`, no install needed |

The runtime SDK contains no compiler or code generation logic. Nothing from the CLI ships to browser bundles.

## Development

```bash
bun install
bun run check        # type-check all packages
bun run build        # build all packages
bun run test         # run all tests (197 total: 174 SDK + 23 test)
bun run lint         # lint with oxlint
```

### Workspace layout

```
packages/
  better-sol/        # Runtime SDK
    src/
      program.ts     # bs, cpi, account definitions, constraints
      client/        # betterSol(), typed client, transactions, tokens, subscriptions
      idl.ts         # fromIdl(), AnchorIdl type
      codec.ts       # Borsh encoder/decoder and discriminators
    test/            # 174 tests (8 files)

  test/              # Testing SDK
    src/
      context.ts     # createTestContext, LiteSVM-backed VM
    test/            # 23 tests (1 file)

  cli/               # CLI tool
    src/
      parser/        # ts-morph AST parser
      generator/     # Rust code generator + IDL code generator
      commands/      # init, create, deploy, generate, verify, login
      lib/           # shared config, auth, keypair, RPC helpers

apps/
  web/               # Documentation site (Fumadocs)
  compiler-api/      # Cloud compilation service (Bun + cargo build-sbf)
```

## License

MIT
