# @better-sol/test

> Local testing for Better Sol programs, powered by LiteSVM.

Test your Solana programs in milliseconds with no network required. The test context is fully compatible with the `betterSol()` client — same typed API, backed by an in-process Solana VM.

## Install

```bash
npm install -D @better-sol/test
```

## Usage

```ts
import { describe, expect, test } from "bun:test";
import { createTestContext } from "@better-sol/test";
import { counter } from "../programs/counter";

const t = await createTestContext({ programs: { counter } });

describe("counter", () => {
  test("initializes and increments", async () => {
    const addr = await t.counter.accounts.Counter.derive({ authority: t.payer });

    await t.counter.initialize({ counter: addr, initialValue: 0n });
    await t.counter.increment({ counter: addr, amount: 5n });

    const account = await t.counter.accounts.Counter.fetch(addr);
    expect(account?.count).toBe(5n);
  });

  test("rejects unauthorized increment", async () => {
    const stranger = await t.newSigner();
    const addr = await t.counter.accounts.Counter.derive({ authority: t.payer });

    await expect(
      t.as(stranger).counter.increment({ counter: addr, amount: 1n }),
    ).rejects.toThrow();
  });
});
```

## API

### `createTestContext(config)`

Creates a test context backed by LiteSVM. Returns a `BetterSolClient` with extra testing utilities.

```ts
const t = await createTestContext({
  programs: { counter },
  binaries: { counter: "./path/to/counter.so" },  // optional, auto-discovered by default
  computeUnits: { limit: 200_000n, price: 0n },
  commitment: "processed",
});
```

**Binary discovery**: By default, looks for compiled `.so` files in:
1. `.better-sol/output/<name>.so`
2. `generated/<name>/target/deploy/<name>.so`

Run `npx @better-sol/cli@alpha deploy` to compile your program first.

### `t.payer`

The funded test payer address. Pre-funded with 100 SOL.

### `t.svm`

The underlying `LiteSVM` instance. Use for advanced state manipulation.

### `t.newSigner(fundSol?)`

Create a new funded signer. Defaults to 100 SOL.

```ts
const wallet = await t.newSigner(50);
```

### `t.as(signer)`

Returns a new test context scoped to a different signer. All program calls use this signer as the payer.

```ts
const stranger = await t.newSigner();
const strangerContext = await t.as(stranger);
await strangerContext.counter.increment({ counter: addr, amount: 1n });
```

### `t.warp(relativeSeconds)`

Fast-forward the SVM clock by a number of seconds.

```ts
await t.warp(3600); // 1 hour forward
```

### `t.setClock(unixTimestamp)`

Set the SVM clock to an exact Unix timestamp.

```ts
await t.setClock(1700000000n);
```

### `t.setBalance(address, sol)`

Overwrite an account's SOL balance.

```ts
await t.setBalance(someAddress, 500);
```

### `t.createMint(decimals)`

Create a test SPL token mint.

```ts
const { mint } = await t.createMint(9);
```

### `t.mintTokens(params)`

Mint SPL tokens to an account.

```ts
await t.mintTokens({ mint, to: tokenAccount, amount: 1_000_000_000n });
```

### `t.profile(fn)`

Profile compute unit usage of a transaction.

```ts
const { result, computeUnits } = await t.profile(async () => {
  return await t.counter.increment({ counter: addr, amount: 1n });
});
console.log(`Used ${computeUnits} compute units`);
```

## Program Client

The test context inherits all typed methods from `BetterSolClient`:

```ts
t.counter.initialize({ ... })
t.counter.increment({ ... })
t.counter.accounts.Counter.derive({ ... })
t.counter.accounts.Counter.fetch(address)
t.counter.parseErrors(logs)
t.counter.parseEvents(logs)
t.token.createMint({ ... })
t.token.mintTo({ ... })
```

## Works with Bun

No custom test runner. Works with `bun test` out of the box:

```bash
bun test
```
