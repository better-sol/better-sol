# Interop and Migration

Use this reference when integrating Anchor IDLs, migrating client code from Anchor, or wrapping external Solana programs with Better Sol typed clients.

## Tools

- **Better Sol IDL adapter**: `fromIdl(idl)` from `better-sol`. Converts an Anchor-compatible IDL object into a Better Sol `ProgramDefinition`.
- **Anchor IDL files**: JSON files emitted by Anchor builds or published by protocols.
- **Better Sol typed client**: `betterSol({ programs })` registers imported IDL programs next to native Better Sol programs.
- **LiteSVM tests**: `@better-sol/test` for deterministic tests after migration.

## Correct API surface

Better Sol currently exposes IDL import through `fromIdl()`. Do not use fake APIs such as `bs.import.address()`, `bs.import.idl()`, or `bs.import.anchor()`.

```ts
import { betterSol, fromIdl, keypairFile, type AnchorIdl } from "better-sol"
import idlJson from "./idl/counter.json"

const importedCounter = fromIdl(idlJson as AnchorIdl)

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { importedCounter },
})
```

If the IDL has literal instruction names, keep it as a const object so TypeScript can infer names more precisely:

```ts
const idl = {
  address: "PROGRAM_ID",
  metadata: { name: "counter" },
  instructions: [
    {
      name: "increment",
      accounts: [
        { name: "counter", writable: true },
        { name: "authority", signer: true },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
} as const satisfies AnchorIdl

const counter = fromIdl(idl)
```

## What `fromIdl()` does

`fromIdl()` converts:

| IDL item | Better Sol representation |
|---|---|
| `metadata.name` or `name` | Program name |
| `address` | Program address |
| `instructions` | Instruction methods |
| `accounts` + matching type definitions | Account fetch definitions |
| `events` + matching type definitions | Event schemas |
| `errors` | Error name to message map |
| `u64`, `i64`, `u128`, `i128` | `bigint` values |
| `pubkey` | base58 string address |
| `option` and `coption` | nullable values |
| `vec` | arrays |
| fixed `array` | fixed arrays |

## Known limitations

IDL interop is a boundary layer, not magic. Current limitations to account for:

- Generic IDL types are not supported.
- Generic array lengths are not supported.
- `defined` types inside field schemas are treated conservatively and may need manual modeling.
- Imported instruction `run` bodies are placeholders. They describe the client interface, not on-chain logic.
- PDA and address resolution may require explicit account wiring depending on the IDL shape.
- If the IDL is stale or mismatched with the deployed program, client calls can serialize incorrect instruction data.

Use imported IDLs for integration with existing programs. Use native Better Sol definitions for new Better Sol programs where the TypeScript definition is the source of truth.

## Migration decision framework

### Do not migrate if

- The existing Anchor program is audited, stable, and only needs a few client calls.
- The team already has reliable Anchor tests and no client drift problems.
- The protocol's published IDL is the integration contract for external partners.

### Migrate client code if

- The app wants one `betterSol()` client for native and external programs.
- The frontend is suffering from Anchor client setup friction.
- The team wants typed account fetches and transaction flows without Anchor provider boilerplate.
- You need deterministic LiteSVM tests around app flows.

### Migrate program definitions if

- You are building new custom Solana programs.
- TypeScript-first development is the team's strongest advantage.
- You want program definition, typed client, errors, events, and tests in one source language.

## Anchor client to Better Sol client

### Before: Anchor client

```ts
import { Program } from "@coral-xyz/anchor"

const program = new Program(idl, provider)
const account = await program.account.counter.fetch(counterAddress)
await program.methods
  .increment(5n)
  .accounts({ counter: counterAddress })
  .rpc()
```

### After: Better Sol with imported IDL

```ts
import { betterSol, fromIdl, keypairFile, type AnchorIdl } from "better-sol"
import idlJson from "./idl/counter.json"

const counter = fromIdl(idlJson as AnchorIdl)

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})

const account = await sol.counter.accounts.Counter.fetch(counterAddress)
await sol.counter.increment({ counter: counterAddress, amount: 5n })
```

## Anchor program to Better Sol-native program

Anchor Rust:

```rust
#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}
```

Better Sol TypeScript:

```ts
import { bs } from "better-sol/program"

const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority])

export const counter = bs.program({
  name: "counter",
  address: "PROGRAM_ID",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can update this counter",
  },
}, (ix) => ({
  increment: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
      counter.count += amount
    },
  }),
}))
```

## Anchor tests to Better Sol tests

Anchor-style tests usually depend on a local validator and provider setup. Better Sol tests run against LiteSVM through `@better-sol/test`.

```ts
import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { counter } from "./counter"

describe("counter", () => {
  test("increments", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const counterAddress = await ctx.counter.accounts.Counter.derive({
      authority: ctx.payer,
    })

    await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
    await ctx.counter.increment({ counter: counterAddress, amount: 5n })

    const account = await ctx.counter.accounts.Counter.fetch(counterAddress)
    expect(account?.count).toBe(5n)
  })
})
```

## Type mapping

| Anchor IDL type | Better Sol type | TypeScript value |
|---|---|---|
| `u8`, `u16`, `u32` | `bs.u8()`, `bs.u16()`, `bs.u32()` | `number` |
| `u64`, `u128` | `bs.u64()`, `bs.u128()` | `bigint` |
| `i8`, `i16`, `i32` | `bs.i8()`, `bs.i16()`, `bs.i32()` | `number` |
| `i64`, `i128` | `bs.i64()`, `bs.i128()` | `bigint` |
| `bool` | `bs.bool()` | `boolean` |
| `pubkey` | `bs.pubkey()` | base58 string |
| `string` | `bs.string()` | `string` |
| `bytes` | `bs.bytes()` | `Uint8Array` |
| `{ option: T }` | `bs.optional(T)` | `T | null` |
| `{ vec: T }` | `bs.vector(T)` | `T[]` |
| `{ array: [T, N] }` | `bs.array(T, N)` | fixed array |

## Migration checklist

- [ ] Identify every Anchor client call and whether it is read-only or transaction-sending.
- [ ] Confirm the IDL matches the deployed program address.
- [ ] Import the IDL with `fromIdl()` and register it in `betterSol({ programs })`.
- [ ] Replace BN values with `bigint` where applicable.
- [ ] Replace provider wallet assumptions with explicit signer scoping.
- [ ] Add LiteSVM tests for each migrated flow.
- [ ] Keep the old Anchor client temporarily for side-by-side verification.
- [ ] Remove the Anchor client only after transaction signatures and account results match.

## Related

- `sdk-reference.md` for the complete Better Sol API reference.
- `program-patterns.md` for native Better Sol program definitions.
- `client-testing-deploy.md` for tests, deployment, and signer flows.
