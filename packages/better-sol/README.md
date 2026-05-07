# better-sol

The Better Sol runtime SDK. Define Solana programs in TypeScript and get a fully typed client with no extra steps.

## Install

```bash
npm install better-sol
```

## Program definition

Import from `better-sol/program` to define accounts, instructions, errors, and events:

```ts
import { bs, cpi } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
  isActive: bs.bool(),
}).derive(seed => ["counter", seed.authority])

export const counter = bs.program({
  name: "counter",
  address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can update this counter",
    NotActive: "Counter is not active",
  },
  events: {
    Incremented: { newCount: bs.u64(), authority: bs.pubkey() },
  },
}, ix => ({
  initialize: ix({
    accounts: {
      counter: bs.init(Counter),
      authority: bs.signer(),
    },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
      counter.isActive = true
    },
  }),

  increment: ix({
    accounts: {
      counter: bs.mut(Counter),
      authority: bs.signer(),
    },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, "Unauthorized")
      ctx.require(counter.isActive, "NotActive")
      counter.count += amount
      ctx.emit("Incremented", { newCount: counter.count, authority })
    },
  }),
}))
```

The same file is used for deployment (via the CLI) and for the typed client at runtime.

## Typed client

```ts
import { betterSol, keypairFile } from "better-sol"
import { counter } from "./programs/counter"

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})
```

From that single call you get:

```ts
sol.payer                               // your wallet's address
sol.counter.increment({ counter, amount: 5n })  // send and confirm
sol.counter.increment.simulate({ ... }) // simulate without sending
sol.counter.increment.instruction({ ... }) // get raw Instruction
sol.counter.accounts.Counter.derive({ authority: sol.payer }) // PDA address
sol.counter.accounts.Counter.fetch(addr) // typed account data
sol.counter.parseErrors(logs)           // parse program errors from logs
sol.counter.parseEvents(logs)           // parse events from logs
```

Types are inferred from the program definition. No hand-written types, no code generation step.

## Token operations

```ts
sol.token.createMint({ decimals: 9 })
sol.token.mintTo({ mint, to: ownerAddr, amount: 1_000_000_000n })
sol.token.transfer({ mint, to: recipientAddr, amount: 100n })
sol.token.getBalance({ owner: addr, mint })
```

`sol.token` for SPL Token, `sol.token2022` for Token-2022. Same API for both.

## Multiple instructions

```ts
// Batch into one transaction
const ix1 = await sol.counter.increment.instruction({ counter: addr1, amount: 5n })
const ix2 = await sol.counter.increment.instruction({ counter: addr2, amount: 10n })
await sol.send([ix1, ix2])

// Sequential steps with dependencies
await sol.steps([
  () => sol.counter.initialize.send({ counter: addr, initialValue: 0n }),
  () => sol.counter.increment.send({ counter: addr, amount: 5n }),
])
```

## Import external programs

### Generate a typed program from an IDL (recommended)

```bash
npx @better-sol/cli generate idl 12b3t1cNiAUoYLiWFEnFa4w6qYxVAiqCWU7KZuzLPYtH
```

This produces `generated/staking.ts` with full autocomplete.

### Load at runtime with `fromIdl()`

```ts
import { fromIdl } from "better-sol"

const idl = await fetch("/staking-idl.json").then(r => r.json())
const staking = fromIdl(idl)
const sol = await betterSol({ programs: { staking } })
```

Instruction and account names are `string` (no autocomplete). Use the CLI generator when you can.

### Write by hand

Define the program yourself with `bs.program()` using the same API as your own programs. Useful when the IDL is incomplete or you need custom behavior.

## Type tokens

All type tokens live under the `bs` namespace:

| Token | TypeScript type | Use for |
|---|---|---|
| `bs.u8()`, `bs.u16()`, `bs.u32()` | `number` | Small integers, bump seeds, indices |
| `bs.u64()`, `bs.u128()` | `bigint` | Balances, amounts, timestamps |
| `bs.i8()` through `bs.i128()` | `number` or `bigint` | Signed values |
| `bs.bool()` | `boolean` | Flags |
| `bs.pubkey()` | `string` | Solana addresses |
| `bs.string()` | `string` | UTF-8 text |
| `bs.bytes()` | `Uint8Array` | Raw binary |
| `bs.optional(t)` | `T \| null` | Optional fields |
| `bs.vector(t, max?)` | `T[]` | Dynamic array (default max 32) |
| `bs.array(t, size)` | fixed-length `T[]` | Fixed-size array |

## Account constraints

| Constraint | What it does |
|---|---|
| `bs.init(Account)` | Create a new account |
| `bs.initIfNeeded(Account)` | Create if it doesn't exist |
| `bs.mut(Account)` | Read and write an existing account |
| `bs.close(Account, "refundTo")` | Close account, reclaim rent |
| `bs.realloc(Account, space)` | Resize an account |
| `bs.signer()` | Transaction signer (auto-filled with payer) |
| `bs.mint()` | SPL Token mint (read-only) |
| `bs.tokenAccount()` | SPL Token account (read-only) |
| `bs.clock()` | Clock sysvar (timestamps, slots, epochs) |
| `bs.systemProgram()` | System program address |
| `bs.remaining(Account)` | Dynamic list of accounts |

Add `.writable()` to `bs.mint()` or `bs.tokenAccount()` for write access.

## Exports

| Import path | What you get |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `bs`, `cpi`, `ProgramError`, types |
| `better-sol/program` | `bs`, `cpi`, all type tokens, constraint helpers, type helpers |
| `better-sol/codec` | `encodeAccount`, `decodeAccount`, `decodeZeroCopyAccount`, discriminators |

## License

MIT
