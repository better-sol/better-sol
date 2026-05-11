# Program Patterns

Use this reference when writing Better Sol program definitions: accounts, instructions, PDAs, constraints, CPIs, errors, and events.

## Account definitions

### Basic account

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
})
```

### Account with PDA derivation

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority])
```

### Multi-seed PDA

```ts
const UserPosition = bs.account({
  user: bs.pubkey(),
  market: bs.pubkey(),
  amount: bs.u64(),
  entryPrice: bs.u64(),
}).derive((seed) => ["position", seed.user, seed.market])
```

### Registering accounts on the program

Accounts must be registered in the program config for the client to access typed `.derive()` and `.fetch()` methods:

```ts
export const counter = bs.program({
  name: "counter",
  address: "<program-address>",
  accounts: { Counter },
}, (ix) => ({
  // instructions...
}))
```

### Available field types

| Type | Syntax | On-chain size | TypeScript type |
|---|---|---|---|
| Unsigned int | `bs.u8()`, `bs.u16()`, `bs.u32()`, `bs.u64()`, `bs.u128()` | 1, 2, 4, 8, 16 bytes | `number` or `bigint` |
| Signed int | `bs.i8()`, `bs.i16()`, `bs.i32()`, `bs.i64()`, `bs.i128()` | 1, 2, 4, 8, 16 bytes | `number` or `bigint` |
| Float | `bs.f32()`, `bs.f64()` | 4, 8 bytes | `number` |
| Boolean | `bs.bool()` | 1 byte | `boolean` |
| Public key | `bs.pubkey()` | 32 bytes | `string` (base58) |
| String | `bs.string()` | 4 + len bytes | `string` |
| Bytes | `bs.bytes()` | 4 + len bytes | `Uint8Array` |
| Option | `bs.optional(bs.pubkey())` | 1 + inner size | `string | null` |
| Vector | `bs.vector(bs.u64(), 32)` | 4 + len * inner size | `bigint[]` |
| Fixed array | `bs.array(bs.u8(), 32)` | size * inner size | `number[]` |
| Struct | `bs.struct({ amount: bs.u64() })` | sum of field sizes | `{ amount: bigint }` |

## Instruction definitions

### Basic instruction with accounts and args

```ts
export const counter = bs.program({
  name: "counter",
  address: "<program-address>",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can perform this action",
    Underflow: "Counter cannot go below zero",
  },
  events: {
    CounterChanged: { counter: bs.pubkey(), authority: bs.pubkey(), count: bs.u64() },
  },
}, (ix) => ({
  increment: ix({
    accounts: { counter: bs.mut(Counter), authority: bs.signer() },
    args: { amount: bs.u64() },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(counter.authority === authority, "Unauthorized")
      counter.count += amount
      ctx.emit("CounterChanged", { counter: counter.key, authority, count: counter.count })
    },
  }),
}))
```

The `run` function receives three parameters:
1. **Accounts**: destructured object with all declared accounts
2. **Args**: destructured object with all declared args (empty `{}` if no args)
3. **Ctx**: context object with `ctx.require()`, `ctx.emit()`, and `ctx.log()`

### Account constraint modes

| Mode | Meaning | Syntax |
|---|---|---|
| Init | Create a new account | `bs.init(AccountDef)` |
| Init if needed | Create only if not exists | `bs.initIfNeeded(AccountDef)` |
| Mut | Writable existing account | `bs.mut(AccountDef)` |
| Close | Close account, reclaim rent | `bs.close(AccountDef, "refundToAccount")` |
| Realloc | Resize account data | `bs.realloc(AccountDef, newSpace)` |
| Signer | Must sign the transaction | `bs.signer()` |
| Mint | SPL Token mint account | `bs.mint()` or `bs.mint().writable()` |
| Token account | SPL Token token account | `bs.tokenAccount()` or `bs.tokenAccount().writable()` |
| Token program | SPL Token program | `bs.tokenProgram()` |
| Token-2022 program | Token-2022 program | `bs.token2022Program()` |
| System program | System program | `bs.systemProgram()` |
| Clock sysvar | Clock sysvar | `bs.clock()` |
| Remaining | Dynamic remaining accounts | `bs.remaining(AccountDef)` |

### Authorization with ctx.require

Use `ctx.require(condition, errorName)` for all validation:

```ts
run: ({ counter, authority }, { amount }, ctx) => {
  ctx.require(counter.authority === authority, "Unauthorized")
  ctx.require(amount > 0n, "InvalidAmount")
  ctx.require(counter.count >= amount, "Underflow")
  counter.count -= amount
},
```

The error name must match a key in the program's `errors` map. If the condition is false, the transaction fails with that named error.

### Undeclared run parameters

The `run` callback can also receive undeclared parameter objects instead of destructured fields. This is useful in longer instructions where destructuring every account and argument at the top adds noise:

```ts
run: (accounts, args, ctx) => {
  const now = cpi.sol.timestamp()
  ctx.require(args.amount > 0n, "InvalidAmount")
  ctx.require(accounts.vault.authority === accounts.authority, "Unauthorized")
  accounts.vault.totalDeposited += args.amount
}
```

Or mix destructured and undeclared parameters:

```ts
run: ({ vault, authority }, args, ctx) => {
  ctx.require(vault.authority === authority, "Unauthorized")
  vault.totalDeposited += args.amount
}
```

The transpiler recognizes `accounts`/`accs`, `args`/`arguments`, and `ctx`/`context` by convention. Object destructuring patterns for the accounts and args positions are also recognized.

### Events with ctx.emit

```ts
run: ({ counter, authority }, { amount }, ctx) => {
  counter.count += amount
  ctx.emit("CounterChanged", {
    counter: counter.key,
    authority,
    count: counter.count,
  })
},
```

Event names must match a key in the program's `events` map. Event payload fields must match the defined schema.

### CPI patterns

Import `cpi` from the program module:

```ts
import { bs, cpi } from "better-sol/program"

export const vault = bs.program({
  name: "vault",
  address: "<program-address>",
  accounts: { Vault },
  errors: { Unauthorized: "Only vault authority can deposit" },
}, (ix) => ({
  deposit: ix({
    accounts: {
      vault: bs.mut(Vault),
      mint: bs.mint().writable(),
      source: bs.tokenAccount().writable(),
      destination: bs.tokenAccount().writable(),
      authority: bs.signer(),
      tokenProgram: bs.tokenProgram(),
    },
    args: { amount: bs.u64() },
    run: ({ vault, mint, source, destination, authority }, { amount }, ctx) => {
      ctx.require(vault.authority === authority, "Unauthorized")
      cpi.token.transfer({
        from: source,
        to: destination,
        authority,
        amount,
      })
      vault.totalDeposited += amount
    },
  }),
}))
```

Available CPI functions: `cpi.token.transfer()`, `cpi.token.transferChecked()`, `cpi.token.mintTo()`, `cpi.token.burn()`, `cpi.sol.timestamp()`.

### Initialize pattern (account creation)

```ts
initialize: ix({
  accounts: { counter: bs.init(Counter), authority: bs.signer() },
  args: { initialValue: bs.u64() },
  run: ({ counter, authority }, { initialValue }, ctx) => {
    counter.count = initialValue
    counter.authority = authority
  },
}),
```

`bs.init()` creates the account at the PDA and pays rent from the transaction signer. No separate payer account is needed.

### Close pattern (account cleanup)

```ts
close: ix({
  accounts: {
    counter: bs.close(Counter, "receiver"),
    authority: bs.signer(),
    receiver: bs.mut(Vault),
  },
  run: ({ counter, authority }, ctx) => {
    ctx.require(counter.authority === authority, "Unauthorized")
  },
}),
```

`bs.close(AccountDef, "receiver")` closes the account and transfers remaining lamports to the named receiver account.

## Error definitions

```ts
export const counter = bs.program({
  name: "counter",
  address: "<program-address>",
  errors: {
    Unauthorized: "Only the authority can perform this action",
    Underflow: "Counter cannot go below zero",
    InvalidAmount: "Amount must be greater than zero",
  },
}, (ix) => ({ /* instructions */ }))
```

The client parses errors automatically:

```ts
try {
  await sol.counter.decrement({ counter: addr, amount: 5n })
} catch (error) {
  if (error instanceof ProgramError) {
    console.log(error.name) // "Underflow"
  }
}
```

## Event definitions

```ts
export const counter = bs.program({
  name: "counter",
  address: "<program-address>",
  events: {
    CounterChanged: { counter: bs.pubkey(), authority: bs.pubkey(), count: bs.u64() },
  },
}, (ix) => ({ /* instructions */ }))
```

## Common patterns

### Authority check

```ts
ctx.require(counter.authority === authority, "Unauthorized")
```

### Overflow protection

```ts
ctx.require(counter.count + amount <= 18_446_744_073_709_551_615n, "Overflow")
counter.count += amount
```

### Multi-role check

```ts
ctx.require(
  vault.admin === authority || vault.operators.includes(authority),
  "Unauthorized"
)
```

## Related

- `sdk-reference.md` for the complete API reference.
- `cookbook-recipes.md` for runnable examples.
- `client-testing-deploy.md` for testing and deployment.
- `architecture-playbook.md` for deciding what goes in the program.
