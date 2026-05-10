# Better Sol SDK Reference

## Core idea

A Better Sol-native program definition is both deploy-time source and runtime client schema. Avoid creating separate hand-written client types or an IDL as an extra source of truth.

## Packages

- `better-sol`: `bs`, `cpi`, `betterSol`, token helpers, `fromIdl`, Borsh codec.
- `@better-sol/cli`: init, create, deploy, generate IDL client, generate DB schema, verify.
- `@better-sol/test`: LiteSVM-backed typed tests.

## CLI

```bash
bunx @better-sol/cli@alpha init
bunx @better-sol/cli@alpha create counter
bunx @better-sol/cli@alpha deploy --dry-run
bunx @better-sol/cli@alpha deploy --cluster devnet
bunx @better-sol/cli@alpha deploy --cluster mainnet --dry-run
bunx @better-sol/cli@alpha generate idl ./idl.json --out generated/program.ts
bunx @better-sol/cli@alpha generate db --dialect postgres --out src/db/better-sol.ts
bunx @better-sol/cli@alpha verify counter --program-id <ADDRESS>
```

## Program imports

```ts
import { bs, cpi } from "better-sol/program"
```

## Types

| Token | TS type | Use |
|---|---|---|
| `bs.u8/u16/u32`, `bs.i8/i16/i32`, `bs.f32/f64` | `number` | small numeric values |
| `bs.u64/u128`, `bs.i64/i128` | `bigint` | balances, amounts, timestamps |
| `bs.bool()` | `boolean` | flags |
| `bs.pubkey()` | `string` | Solana addresses |
| `bs.string()` | `string` | UTF-8 text |
| `bs.bytes()` | `Uint8Array` | raw bytes |
| `bs.optional(t)` | `T | null` | optional values |
| `bs.vector(t, max?)` | bounded array | dynamic list |
| `bs.array(t, size)` | fixed array | fixed-size data |

## Accounts

```ts
const RecordAccount = bs.account({
  authority: bs.pubkey(),
  value: bs.u64(),
}).derive(seed => ["record", seed.authority])

const Fixed = bs.account({ values: bs.array(bs.u64(), 16) }).zeroCopy()
```

## Program

```ts
export const program = bs.program({
  name: "program",
  address: "PROGRAM_ID",
  accounts: { RecordAccount },
  errors: { Unauthorized: "Only authority may call this" },
  events: { Updated: { account: bs.pubkey() } },
}, ix => ({
  update: ix({
    accounts: { record: bs.mut(RecordAccount), authority: bs.signer() },
    args: { value: bs.u64() },
    run: ({ record, authority }, { value }, ctx) => {
      ctx.require(record.authority === authority, "Unauthorized")
      record.value = value
      ctx.emit("Updated", { account: record.key })
    },
  }),
}))
```

## Constraints

- `bs.init(Account)`: create account.
- `bs.initIfNeeded(Account)`: create if missing; guard against reinitialization.
- `bs.mut(Account)`: mutable account.
- `bs.close(Account, "refundTo")`: close and refund rent.
- `bs.realloc(Account, space)`: resize.
- `bs.signer()`: signer, usually auto-filled by client payer.
- `bs.mint()`, `bs.mint().writable()`.
- `bs.tokenAccount()`, `bs.tokenAccount().writable()`.
- `bs.tokenProgram()`, `bs.token2022Program()`.
- `bs.systemProgram()`, `bs.clock()`.
- `bs.remaining(AccountOrConstraint)`.

## CPI helpers

```ts
cpi.token.transfer({ from, to, authority, amount })
cpi.token.transferChecked({ from, to, authority, mint, amount, decimals })
cpi.token.mintTo({ mint, to, authority, amount })
cpi.token.burn({ from, mint, authority, amount })
cpi.sol.timestamp()
```

## Client

```ts
import { betterSol, keypairFile, secretKey, fromIdl } from "better-sol"

const sol = await betterSol({ cluster: "devnet", payer: keypairFile("./keypair.json"), programs })
```

Capabilities:

- instruction call: `sol.counter.increment({ counter, amount: 1n })`
- explicit send: `.send(params)`
- raw instruction: `.instruction(params)`
- signed transaction: `.transaction(params)`
- simulation: `.simulate(params)`
- metadata: `.prepare(params)`
- Solana Kit plan: `.plan(params)`
- PDA: `sol.counter.accounts.Counter.derive({ authority })`
- fetch: `.fetch(address)`, `.fetchMultiple(addresses)`
- compose: `sol.send([...])`, `sol.batch([...])`, `sol.steps([...])`
- tokens: `sol.token`, `sol.token2022`

## Token client

```ts
const { mint } = await sol.token.createMint({ decimals: 9 })
const ata = await sol.token.getATA({ owner, mint })
await sol.token.mintTo({ mint, to: owner, amount: 1_000_000_000n })
await sol.token.transfer({ mint, to: recipient, amount: 100_000_000n })
const balance = await sol.token.getBalance({ owner, mint })
```

## Related

- `program-patterns.md` for how these APIs fit into account and instruction design.
- `client-testing-deploy.md` for runtime client, LiteSVM, and deploy workflows.
- `tokens.md` for token-specific architecture choices.
