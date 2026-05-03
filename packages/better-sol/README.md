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

`betterSol({ cluster })` is valid for read-only flows such as balances, PDA derivation, and account fetching. Mutating methods require a configured signer through `payer` or `sol.withSigner(...)`.

Signer accounts declared with `p.signer()` auto-fill from the active signer when omitted.

## Natural Instruction Signatures

Instruction methods only require the data the instruction actually needs:

```ts
await sol.app.ping();                              // no accounts, no params
await sol.app.setValue({ value: 1n });             // params only
await sol.app.close({ account: accountAddress });  // accounts only
await sol.counter.increment({ counter: addr, amount: 10n });
```

Signer accounts declared with `p.signer()` are optional at the call site and auto-fill from the active signer.

## Transaction-Building API

```ts
const ix = await sol.counter.increment.instruction({ counter: addr, amount: 10n });
const tx = await sol.counter.increment.transaction({ counter: addr, amount: 10n });
```

- `.instruction()` returns a Kit `Instruction` for manual composition.
- `.transaction()` returns a fully signed sendable transaction for RPC submission.
- The callable form `()` signs, sends with confirmation, and returns the signature.

## Multi-Instruction Batching

```ts
await sol.send([
  sol.counter.increment.instruction({ counter: addr1, amount: 1n }),
  sol.counter.increment.instruction({ counter: addr2, amount: 2n }),
]);
```

## Sequential Steps

```ts
const [mintResult, mintSig] = await sol.steps([
  () => sol.token.createMint({ decimals: 9 }),
  ({ mint }) => sol.token.mintTo({ mint, destination: sol.payer, amount: 1000n }),
]);
```

Each step receives the return values of all previous steps. Use for multi-step flows where each action depends on the prior result.

## Browser Wallets

Wallet adapter subpaths convert popular wallet libraries to Kit-compatible signers:

```ts
import { walletAdapter } from "better-sol/wallets/wallet-adapter";
import { useWallet } from "@solana/wallet-adapter-react";

const wallet = useWallet();
const userSol = await sol.withSigner(walletAdapter(wallet));
await userSol.counter.increment({ counter: addr, amount: 1n });
```

Available adapters:
- `better-sol/wallets/wallet-adapter` — `@solana/wallet-adapter-react`
- `better-sol/wallets/reown` — Reown AppKit
- `better-sol/wallets/privy` — Privy Solana
- `better-sol/wallets/dynamic` — Dynamic Solana

Each adapter requires its corresponding wallet library as a peer dependency.

## Scoped Signers

```ts
const userSol = await sol.withSigner(transactionSignerFromYourApp);
await userSol.counter.increment({ counter: addr, amount: 1n });
```

`withSigner()` accepts a Kit-compatible `TransactionSigner`. Server code can use `keypairFile()` or `secretKey()`.

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
import { betterSol, fromIdl, keypairFile } from "better-sol";
import mangoIdl from "./mango.json";

const mango = fromIdl(mangoIdl);
const sol = await betterSol({ cluster: "mainnet-beta", payer: keypairFile("./keypair.json"), programs: { mango } });
await sol.mango.someInstruction({ ... });
```

## Exports

```
better-sol              → betterSol(), keypairFile(), secretKey(), fromIdl(), BetterSolClient, BetterSolConfig, BoundAccount
better-sol/program      → program(), account(), struct(), p, token, sol, type tokens, type helpers
better-sol/wallets/*    → walletAdapter(), reownWallet(), privyWallet(), dynamicWallet()
```

## Development

```bash
bun --filter better-sol check
bun --filter better-sol build
bun --filter better-sol test
bun --filter better-sol lint
```
