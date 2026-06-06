# better-sol

> **Alpha**
>
> Better Sol is in early development. APIs may change, rough edges exist, and things can break. Your feedback shapes what comes next. Thank you for being an early adopter.

The Better Sol runtime SDK. Define Solana programs in TypeScript and get a fully typed client with no extra steps.

## Install

```bash
npm install better-sol@alpha
```

## Program definition

Import from `better-sol/program` to define accounts, instructions, errors, and events:

```ts
import { bs } from "better-sol/program"

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
sol.payer                                   // your wallet's address
sol.counter.increment({ counter, amount: 5n }) // send and confirm
sol.counter.increment.simulate({ ... })      // simulate without sending
sol.counter.increment.instruction({ ... })   // get raw Instruction for composition
sol.counter.accounts.Counter.derive({ authority: sol.payer }) // derive PDA
sol.counter.accounts.Counter.fetch(addr)     // typed account data (or null)
sol.counter.accounts.Counter.fetchMultiple([addr1, addr2]) // multiple at once
sol.counter.parseErrors(logs)                // parse program errors from logs
sol.counter.parseEvents(logs)                // parse events from logs
```

Types are inferred from your program definition. No hand-written types, no code generation step.

## Token operations

```ts
const { mint } = await sol.token.createMint({ decimals: 9 })
await sol.token.mintTo({ mint, to: ownerAddr, amount: 1_000_000_000n })
await sol.token.transfer({ mint, to: recipientAddr, amount: 100n })
const balance = await sol.token.getBalance({ owner: addr, mint })
```

`sol.token` for SPL Token and `sol.token2022` for Token-2022. Same API for both. Associated token accounts are created automatically on mint and transfer.

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

Use `sol.batch([...])` when order within a single transaction must be guaranteed.

## Account watching

Watch an account for real-time changes. Returns a `WatchHandle` that holds the current value and notifies on updates.

```ts
const handle = sol.counter.accounts.Counter.watch(addr)

handle.current     // { count: 42n, authority: "...", isActive: true } | null | undefined
handle.error       // unknown — populated on RPC or subscription errors

// Callback — fires on each change
const unsub = handle.onChange((data) => {
  console.log(data?.count)
})

// React — useSyncExternalStore compatible
import { useSyncExternalStore } from "react"
const data = useSyncExternalStore(handle.subscribe, () => handle.current)

// Cleanup
unsub()          // stop one subscription
handle.unsubscribe()  // stop all and abort
```

`current` is `undefined` until the first RPC response arrives, `null` if the account does not exist, or typed data otherwise. The initial fetch and ongoing WebSocket subscription are combined internally with slot-based deduplication.

Derive and watch in one call:

```ts
const handle = sol.counter.accounts.Counter.watch({ authority: sol.payer })
```

Requires `rpcSubscriptions` or `rpcSubscriptionsUrl` in your `betterSol()` config.

## Event types

Two types are available for working with program events:

`TypedEvent<TEvents>` is a discriminated union of all events defined in your program:

```ts
import type { TypedEvent } from "better-sol"

type CounterEvent = TypedEvent<typeof counter.events>
// { name: "Incremented", data: { newCount: bigint, authority: string }, slot: bigint, signature: Signature }

function handleEvent(event: CounterEvent) {
  if (event.name === "Incremented") {
    console.log(event.data.newCount)  // fully typed as bigint
  }
}
```

`EventContext` provides `slot` and `signature` metadata for event callbacks.

## Import external programs

### Generate a typed program from an IDL (recommended)

```bash
npx @better-sol/cli@alpha generate idl 12b3t1cNiAUoYLiWFEnFa4w6qYxVAiqCWU7KZuzLPYtH
```

This produces `generated/staking.ts`. Import it and get full autocomplete:

```ts
import { staking } from "./generated/staking"

const sol = await betterSol({ programs: { staking } })
await sol.staking.stake({ amount: 100n })
```

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

All type tokens live under the `bs` namespace from `better-sol/program`:

| Token | TypeScript type | Use for |
|---|---|---|
| `bs.u8()`, `bs.u16()`, `bs.u32()` | `number` | Small integers, bump seeds, indices |
| `bs.u64()`, `bs.u128()` | `bigint` | Balances, amounts, timestamps |
| `bs.i8()` through `bs.i128()` | `number` or `bigint` | Signed values |
| `bs.bool()` | `boolean` | Flags |
| `bs.pubkey()` | `string` | Solana addresses |
| `bs.string()` | `string` | UTF-8 text |
| `bs.bytes()` | `Uint8Array` | Raw binary data |
| `bs.optional(t)` | `T \| null` | Optional fields |
| `bs.vector(t, max?)` | `T[]` (default max 32) | Dynamic-length array |
| `bs.array(t, size)` | fixed-length `T[]` | Fixed-size array |

## Account constraints

| Constraint | What it does |
|---|---|
| `bs.init(Account)` | Create a new account |
| `bs.initIfNeeded(Account)` | Create if it does not exist |
| `bs.mut(Account)` | Read and write an existing account |
| `bs.close(Account, "refundTo")` | Close account and reclaim rent |
| `bs.realloc(Account, space)` | Resize an account |
| `bs.signer()` | Transaction signer (auto-filled with payer) |
| `bs.mint()` | SPL Token mint (read-only, chain `.writable()`) |
| `bs.tokenAccount()` | SPL Token account (read-only, chain `.writable()`) |
| `bs.tokenProgram()` | Token program address |
| `bs.token2022Program()` | Token-2022 program address |
| `bs.systemProgram()` | System program address |
| `bs.clock()` | Clock sysvar (unixTimestamp, slot, epoch) |
| `bs.remaining(Account)` | Dynamic list of accounts |

Zero-copy accounts get `bs.struct()`, `.zeroCopy()`, and `.hasOne("fieldName")`.

## Exports

| Import path | Selected exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `bs`, `cpi`, `ProgramError`, `WatchHandle`, `TypedEvent`, `EventContext`, types |
| `better-sol/program` | `bs`, `cpi`, all type tokens, constraint helpers, `InferType`, `InferFields`, types |
| `better-sol/codec` | `encodeField`, `decodeField`, `encodeAccount`, `decodeAccount`, `decodeZeroCopyAccount`, `encodeInstruction`, `anchorDiscriminator`, `accountDiscriminator` |

## License

MIT
