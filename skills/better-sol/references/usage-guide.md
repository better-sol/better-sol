# Usage Guide and Common Mistakes

Use this reference to avoid the most common errors when writing Better Sol programs. Every rule here exists because the transpiler enforces it. Breaking these rules causes deploy-time failures with no prior type error.

## PDA seed names must match instruction accounts or args

This is the single most common mistake.

When an account is derived with `.derive()` and initialized with `bs.init()`, the transpiler cannot read the account to compute seeds because the account does not exist yet. It resolves each seed by looking for an instruction arg or account with the **exact same name** as the seed field.

```ts
const StakePosition = bs
  .account({
    user: bs.pubkey(),
    pool: bs.pubkey(),
    stakedAmount: bs.u64(),
  })
  .derive((seed) => ["stake", seed.user, seed.pool])
```

In this definition, the seeds reference `seed.user` and `seed.pool`. These names come from the account fields `user` and `pool`.

When you write an instruction that initializes this account with `bs.init()`, the instruction must provide an arg or account named `user` and an arg or account named `pool`:

```ts
// Correct: account named "user" matches seed.user, pool reference provided
stake: ix({
  accounts: {
    pool: bs.mut(StakingPool),
    position: bs.init(StakePosition),
    user: bs.signer(),
  },
  args: { amount: bs.u64() },
  run: ({ pool, position, user }, { amount }) => {
    position.user = user
    position.pool = pool.key
    position.stakedAmount = amount
  },
}),
```

```ts
// Wrong: account named "authority" does not match seed "user"
// Error: PDA seed field 'user' for initialized account 'StakePosition'
//        must be provided by an instruction arg or account with the same name.
stake: ix({
  accounts: {
    pool: bs.mut(StakingPool),
    position: bs.init(StakePosition),
    authority: bs.signer(),  // ← name must be "user"
  },
  run: ({ pool, position, authority }, { amount }) => {
    position.user = authority  // ← too late, seed resolution already failed
    position.pool = pool.key
    position.stakedAmount = amount
  },
}),
```

### Rules for PDA seed resolution

For each seed in `.derive()`:

1. If the account constraint is `bs.init()` or `bs.initIfNeeded()`, the seed name must appear as:
   - An instruction arg with the same name
   - An instruction account with the same name

2. If the account constraint is `bs.mut()`, `bs.close()`, or `bs.realloc()`, the seed value is read from the existing account data. No naming restriction applies because the account already exists.

3. Literal seeds (strings) never need matching. Only field references do.

### Strategies when your naming conflicts

If the seed field name does not match your desired account name:

- **Rename the instruction account** to match the seed. This is the simplest and most common fix.
- **Rename the account field** if the seed name does not reflect the actual role.
- **Add an instruction arg** with the seed name and pass the value explicitly:

```ts
const StakePosition = bs
  .account({
    owner: bs.pubkey(),    // field is called "owner"
    pool: bs.pubkey(),
  })
  .derive((seed) => ["stake", seed.owner, seed.pool])

stake: ix({
  accounts: {
    pool: bs.mut(StakingPool),
    position: bs.init(StakePosition),
    user: bs.signer(),
  },
  args: { owner: bs.pubkey() },  // ← provide seed value as arg
  run: ({ pool, position, user }, { owner }) => {
    // user is the signer, owner is the seed value
    // they can be the same address but must both be provided
    position.owner = owner
    position.pool = pool.key
  },
}),
```

In this case, the caller passes `{ owner: sol.payer, ... }`.

## Event field names must exactly match the event definition

When emitting events with `ctx.emit()`, every field name in the payload must match the event schema exactly:

```ts
events: {
  Staked: { user: bs.pubkey(), pool: bs.pubkey(), amount: bs.u64() },
},

// Correct
ctx.emit("Staked", { user: authority, pool: pool.key, amount })

// Wrong: wrong field name
ctx.emit("Staked", { user: authority, poolAddress: pool.key, amount })
// Error: emits event 'Staked' with unknown field 'poolAddress'
```

Every field defined in the event schema must be present in the payload. Extra fields are rejected. Missing fields are rejected.

## Error names must exist in the program errors map

Every error name used in `ctx.require()` must be declared in the program's `errors` map:

```ts
errors: {
  Unauthorized: "Only the authority can perform this action",
  InvalidAmount: "Amount must be greater than zero",
},

// Correct
ctx.require(counter.authority === authority, "Unauthorized")

// Wrong
ctx.require(counter.authority === authority, "NotAuthorized")
// Error: requires unknown error 'NotAuthorized'
```

## run() parameter count matches what was declared

The `run` callback receives parameters based on what the instruction declares:

```ts
// Accounts + args + ctx = 3 parameters
ix({
  accounts: { counter: bs.mut(Counter) },
  args: { amount: bs.u64() },
  run: ({ counter }, { amount }, ctx) => { ... },
})

// Accounts + ctx = 2 parameters (no args declared)
ix({
  accounts: { counter: bs.mut(Counter) },
  run: ({ counter }, ctx) => { ... },
})

// Args + ctx = 2 parameters (no accounts declared)
ix({
  args: { message: bs.string() },
  run: ({ message }, ctx) => { ... },
})

// Ctx only = 1 parameter (no accounts, no args)
ix({
  run: (ctx) => { ... },
})
```

Do not add parameters that were not declared. If there are no `args`, the `run` callback has 2 parameters maximum. If there are no `accounts`, the `run` callback has 2 parameters maximum.

## No helper functions in run()

The `run()` body is transpiled to Anchor Rust. You cannot define or call helper functions:

```ts
// Wrong
function calculateReward(amount: bigint, rate: bigint, time: bigint): bigint {
  return (amount * rate * time) / PRECISION
}

run: ({ position, pool }, ctx) => {
  const reward = calculateReward(position.stakedAmount, pool.rewardRate, elapsed)
  // Error: function call 'calculateReward' is not supported
}
```

Inline all logic directly:

```ts
// Correct
run: ({ position, pool }, ctx) => {
  const reward = (position.stakedAmount * pool.rewardRate * elapsed) / PRECISION
  position.pendingRewards += reward
}
```

If two instructions share identical logic, duplicate the code in each instruction body. The transpiler does not support shared helper functions.

## No external constants or type references

The transpiler has no access to variables defined outside `run()`:

```ts
// Wrong
const PRECISION = 1_000_000_000n
const PositionType = { ... }

run: ({ pool }, ctx) => {
  pool.rate = pool.rate / PRECISION  // Error: identifier 'PRECISION' not found
}
```

Use literal values inline:

```ts
// Correct
run: ({ pool }, ctx) => {
  pool.rate = pool.rate / 1_000_000_000n
}
```

Or pass the constant as an instruction arg:

```ts
args: { precision: bs.u64() },
run: ({ pool }, { precision }, ctx) => {
  pool.rate = pool.rate / precision
}
```

## No object destructuring in variable declarations

Declare each variable separately:

```ts
// Wrong
const { user, amount } = someAccount

// Correct
const user = someAccount.user
const amount = someAccount.amount
```

## Account fields: only declared fields are accessible

You can only read and write fields that are defined on the account:

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
})

run: ({ counter }, ctx) => {
  counter.count += 1n        // OK
  counter.authority = owner  // OK
  counter.name = "hello"     // Error: unknown field 'name' on account 'Counter'
}
```

## CPI authority for PDA-signed mintTo

When calling `cpi.token.mintTo()` with a PDA as the mint authority, the authority parameter must be the account that owns the PDA signer seeds. The transpiler detects this automatically when the `authority` is an account field that matches the PDA derivation:

```ts
cpi.token.mintTo({
  mint: rewardMint,
  to: userRewardAccount,
  authority: pool,   // pool is a PDA account, transpiler adds signer seeds
  amount: rewardAmount,
})
```

The `authority` value must be a declared account object (from the instruction's `accounts`), not a plain address string. If you pass a plain address like `authority: pool.key` the PDA signer seeds will not be attached and the CPI will fail with a signature verification error.

For `bs.signer()` accounts, pass the signer directly since it is already an `Address`:

```ts
cpi.token.transfer({
  from: userTokenAccount,
  to: vaultTokenAccount,
  authority: user,   // user is bs.signer(), already an Address
  amount,
})
```

## CPI property requirements

Each CPI function requires specific account types:

| CPI function | Required account types |
|---|---|
| `cpi.token.transfer` | `from`: tokenAccount, `to`: tokenAccount, `authority`: signer or PDA account, `amount`: bigint |
| `cpi.token.transferChecked` | `from`: tokenAccount, `to`: tokenAccount, `authority`: signer or PDA account, `amount`: bigint, `mint`: mint, `decimals`: number |
| `cpi.token.mintTo` | `mint`: mint, `to`: tokenAccount, `authority`: signer or PDA account, `amount`: bigint |
| `cpi.token.burn` | `from`: tokenAccount, `mint`: mint, `authority`: signer or PDA account, `amount`: bigint |

The `from`, `to`, and `mint` values must be declared instruction accounts with the correct constraint type. The `authority` can be a signer or a PDA-derived account that holds the signing authority.

## Clock access

Use `bs.clock()` to access on-chain time:

```ts
accounts: {
  pool: bs.mut(StakingPool),
  clock: bs.clock(),
},
run: ({ pool, clock }) => {
  const now = clock.unixTimestamp
  const elapsed = now - pool.lastUpdateTimestamp
  pool.lastUpdateTimestamp = now
},
```

Or use `cpi.sol.timestamp()` which does not require a clock account:

```ts
run: ({ pool }) => {
  const now = cpi.sol.timestamp()
  pool.lastUpdateTimestamp = now
},
```

`cpi.sol.timestamp()` returns a `bigint`. `clock.unixTimestamp` is also `bigint`.

## .key() access

Only accounts initialized with `bs.init()`, `bs.initIfNeeded()`, or `bs.mut()` have a `.key` property:

```ts
run: ({ counter, authority }) => {
  const address = counter.key   // OK: counter is bs.init(Counter) or bs.mut(Counter)
  const signerKey = authority   // OK: authority is bs.signer(), already an Address string
}
```

`bs.signer()` accounts are plain `Address` strings. They do not have `.key`. Use them directly.

`bs.mint()` accounts have `.key`. `bs.tokenAccount()` accounts have `.key`.

## mintTo and transfer: understanding authority

`cpi.token.mintTo` mints new tokens. The `authority` must be the mint authority of the mint. If the mint authority is a PDA, pass the PDA account object so the transpiler attaches signer seeds.

`cpi.token.transfer` moves existing tokens. The `authority` must be the owner of the `from` token account. For a user's ATA, this is the user's signer.

```ts
// User transfers their own tokens
cpi.token.transfer({
  from: userTokenAccount,
  to: vaultTokenAccount,
  authority: user,   // user must own userTokenAccount
  amount,
})

// Program mints tokens from a PDA-controlled mint
cpi.token.mintTo({
  mint: rewardMint,
  to: userRewardAccount,
  authority: pool,   // pool must be the mintAuthority of rewardMint
  amount: rewardAmount,
})
```

## bs.init() auto-derives the PDA

When you use `bs.init(AccountDef)` and the account has `.derive()`, the client automatically derives the correct PDA address from the seed values. You do not compute the PDA manually:

```ts
// Client side
const positionAddr = await sol.staking.accounts.StakePosition.derive({
  user: sol.payer,
  pool: poolAddr,
})

await sol.staking.stake({
  position: positionAddr,  // client derives and verifies this
  pool: poolAddr,
  user: sol.payer,
  amount: 100n,
})
```

## Account fields assigned in run() must cover all non-optional fields

When using `bs.init()`, every non-optional field must be assigned in the `run()` body. If you forget to set a field, the account data will contain the zero value for that type:

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
})

// Correct: both fields assigned
run: ({ counter, authority }) => {
  counter.count = 0n
  counter.authority = authority
}

// Wrong: authority not set, will be default pubkey (all zeros)
run: ({ counter }) => {
  counter.count = 0n
}
```

## Reusing the same account in multiple instructions

Each instruction is independent. Account state changes in one instruction are visible to the next instruction within the same transaction. But each instruction must declare all accounts it touches:

```ts
// Instruction 1: initialize
initialize: ix({
  accounts: { counter: bs.init(Counter), authority: bs.signer() },
  run: ({ counter, authority }) => {
    counter.count = 0n
    counter.authority = authority
  },
}),

// Instruction 2: increment (separate declaration)
increment: ix({
  accounts: { counter: bs.mut(Counter), authority: bs.signer() },
  args: { amount: bs.u64() },
  run: ({ counter, authority }, { amount }, ctx) => {
    ctx.require(counter.authority === authority, "Unauthorized")
    counter.count += amount
  },
}),
```

## bs.close() requires a refund account

`bs.close(AccountDef, "refundToAccount")` takes two arguments: the account definition and the name of another instruction account that receives the reclaimed lamports:

```ts
close: ix({
  accounts: {
    position: bs.close(StakePosition, "receiver"),
    receiver: bs.signer(),
  },
  run: ({ position }, ctx) => {
    ctx.log("Position closed")
  },
}),
```

The `receiver` must be declared as a separate account in the same instruction.

## Types not yet supported

The Better Sol program DSL does not yet support these Anchor types. If your program needs them, write the program in Anchor/Rust directly and import the IDL with `fromIdl()`, or use the workarounds below.

### Enums

Anchor supports both simple enums (`enum Status { Active, Paused }`) and data-carrying enums (`enum Instruction { Transfer { amount: u64 } }`). Better Sol does not support enum types in account or arg definitions.

**Workaround**: use a `u8` or `u64` field with named constants checked by `ctx.require`:

```ts
const Pool = bs.account({
  status: bs.u8(),          // 0 = Active, 1 = Paused, 2 = Closed
  authority: bs.pubkey(),
  totalStaked: bs.u64(),
})

// In instruction logic:
ctx.require(pool.status === 0, "PoolNotActive")
pool.status = 1  // Paused
```

In the client, define constants or a TypeScript enum:

```ts
const PoolStatus = { Active: 0, Paused: 1, Closed: 2 } as const
```

### u256 / i256

Anchor IDL supports 256-bit integers. Better Sol does not.

**Workaround**: use `u128` if the value fits, or `bs.bytes()` for a raw 32-byte field:

```ts
const Data = bs.account({
  largeValue: bs.bytes(),   // 32 bytes, Uint8Array in TS
  maxValue: bs.u128(),      // if 128 bits is enough
})
```

### HashMap / BTreeMap

On-chain maps are not supported.

**Workaround**: use `bs.vector(bs.struct({ key, value }))` and iterate:

```ts
const Metadata = bs.account({
  entries: bs.vector(bs.struct({ key: bs.string(), value: bs.string() }), 10),
}).zeroCopy()
```

Note: `bs.struct` inside `bs.vector` is only supported in zero-copy accounts. For regular accounts, flatten the key-value pairs into separate vectors:

```ts
const Data = bs.account({
  keys: bs.vector(bs.string(), 10),
  values: bs.vector(bs.string(), 10),
})
```

### Nested structs in regular accounts

`bs.struct()` can only be used inside zero-copy accounts (`.zeroCopy()`). For regular accounts, flatten the fields:

```ts
// Not supported in regular accounts:
const Inner = bs.struct({ x: bs.u64(), y: bs.u64() })
const Data = bs.account({ point: Inner })

// Workaround: flatten into the account
const Data = bs.account({
  pointX: bs.u64(),
  pointY: bs.u64(),
})

// Or use zero-copy:
const Data = bs.account({ point: Inner }).zeroCopy()
```

## Related

- `sdk-reference.md` for the complete API reference with every type, method, and constraint.
- `program-patterns.md` for complete program definition patterns and all constraint modes.
- `project-scaffolding.md` for scaffolding a new project from scratch.
- `client-testing-deploy.md` for testing and deployment.
