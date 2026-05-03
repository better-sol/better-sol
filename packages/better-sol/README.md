# better-sol

TypeScript-first Solana SDK. Define programs in TypeScript, generate Anchor/Rust, and use the same definition as a typed client.

## Official Solana SDK Backbone

`better-sol` uses the modern official Solana JavaScript stack:

- `@solana/kit` for RPC, addresses, signers, transaction messages, and transaction sending
- `@solana-program/system` for SOL transfers
- `@solana-program/token` for SPL Token and associated token account operations

It does not depend on legacy `@solana/web3.js` in the runtime client.

## Program Definition (`better-sol/program`)

```ts
import { account, p, program, pubkey, u64 } from "better-sol/program";

const Counter = account({ count: u64, authority: pubkey }).derive((seed) => ["counter", seed.authority]);

export const counter = program(
  {
    name: "counter",
    address: "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
    accounts: { Counter },
    errors: { Unauthorized: "Only authority" },
  },
  ix => ({
    initialize: ix({
      accounts: { counter: p.create(Counter), authority: p.signer() },
      args: { initialValue: u64 },
      run: ({ counter, authority }, { initialValue }) => {
        counter.count = initialValue;
        counter.authority = authority;
      },
    }),
    increment: ix({
      accounts: { counter: p.mut(Counter), authority: p.signer() },
      args: { amount: u64 },
      run: ({ counter, authority }, { amount }, ctx) => {
        ctx.require(authority === counter.authority, "Unauthorized");
        counter.count += amount;
      },
    }),
  }),
);
```

## Client SDK (`better-sol`)

```ts
import { betterSol, keypairFile } from "better-sol";
import { counter } from "./programs/counter";

const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
});

const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer });
const data = await sol.counter.accounts.Counter.fetch(addr);

await sol.counter.increment({ counter: addr, amount: 10n });
// Signer auto-fills from the active signer when omitted

const balance = await sol.getBalance(sol.payer);
await sol.transfer({ to: "recipient...", amount: 1000n });
```

Signer accounts declared with `p.signer()` auto-fill from the active signer when omitted.

## Transaction-Building API

```ts
const ix = await sol.counter.increment.instruction({ counter: addr, amount: 10n });
const tx = await sol.counter.increment.transaction({ counter: addr, amount: 10n });
```

- `.instruction()` returns a Kit `Instruction` for manual composition.
- `.transaction()` returns a fully signed sendable transaction.
- The callable form `end()` signs and sends with confirmation.

## Scoped Signers

```ts
const userSol = await sol.withSigner(walletSignerFromYourApp);
await userSol.counter.increment({ counter: addr, amount: 1n });
```

`withSigner()` accepts a Kit-compatible `TransactionSigner`. Server code can use `keypairFile()`, `secretKey()`, or `generateSigner()`.

## Token Operations

```ts
const { mint } = await sol.token.createMint({ decimals: 9 });
await sol.token.mintTo({ mint, destination: sol.payer, amount: 1_000_000_000n });
const ata = await sol.token.getATA({ owner: sol.payer, mint });
const tokenBalance = await sol.token.getBalance({ owner: sol.payer, mint });
await sol.token.transfer({ mint, to: "recipient...", amount: 100n });
```

## fromIdl()

Consume any external Anchor IDL as a typed program:

```ts
import { betterSol, fromIdl } from "better-sol";
import mangoIdl from "./mango.json";

const mango = fromIdl(mangoIdl);
const sol = await betterSol({ cluster: "mainnet-beta", programs: { mango } });
await sol.mango.someInstruction({ ... });
```

## Exports

```
better-sol              → betterSol(), keypairFile(), secretKey(), generateSigner(), walletSigner(), fromIdl(), BetterSolClient, BetterSolConfig, Cluster
better-sol/program      → program(), account(), struct(), p, token, sol, type tokens, type helpers
```

## Development

```bash
bun --filter better-sol check
bun --filter better-sol build
bun --filter better-sol test
bun --filter better-sol lint
```
