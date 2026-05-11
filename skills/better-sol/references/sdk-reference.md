# Better Sol SDK Reference

Use this reference for the complete API surface of the Better Sol program DSL, runtime client, testing SDK, CLI, package exports, and config definition.

## Package exports

| Import path | Exports |
|---|---|
| `better-sol` | `betterSol`, `keypairFile`, `secretKey`, `fromIdl`, `ProgramError`, `TransactionFailedError`, `bs`, `cpi`, `nonDivisibleSequentialInstructionPlan`, `flattenInstructionPlan`, public types |
| `better-sol/program` | `bs`, `cpi`, program definition classes, account/type helpers, inferred type helpers |
| `better-sol/codec` | `anchorDiscriminator`, `accountDiscriminator`, `encodeField`, `decodeField`, `encodeAccount`, `decodeAccount`, `decodeZeroCopyAccount`, `encodeInstruction` |
| `better-sol/wallets` | `walletAdapter`, `reownWallet`, `privyWallet`, `dynamicWallet` |
| `better-sol/wallets/reown` | `reownWallet` |
| `better-sol/wallets/privy` | `privyWallet` |
| `better-sol/wallets/dynamic` | `dynamicWallet` |
| `@better-sol/test` | `createTestContext`, `TestContext`, `TestContextConfig`, `TestSigner` |
| `@better-sol/cli` | CLI executable plus `defineConfig` and CLI option types for `better-sol.config.ts` |

## Program DSL

Import: `import { bs, cpi } from "better-sol/program"`

### Type builders

| Method | Return type | On-chain size | TypeScript type |
|---|---|---|---|
| `bs.u8()` | `TypeToken<number>` | 1 byte | `number` |
| `bs.u16()` | `TypeToken<number>` | 2 bytes | `number` |
| `bs.u32()` | `TypeToken<number>` | 4 bytes | `number` |
| `bs.u64()` | `TypeToken<bigint>` | 8 bytes | `bigint` |
| `bs.u128()` | `TypeToken<bigint>` | 16 bytes | `bigint` |
| `bs.i8()` | `TypeToken<number>` | 1 byte | `number` |
| `bs.i16()` | `TypeToken<number>` | 2 bytes | `number` |
| `bs.i32()` | `TypeToken<number>` | 4 bytes | `number` |
| `bs.i64()` | `TypeToken<bigint>` | 8 bytes | `bigint` |
| `bs.i128()` | `TypeToken<bigint>` | 16 bytes | `bigint` |
| `bs.f32()` | `TypeToken<number>` | 4 bytes | `number` |
| `bs.f64()` | `TypeToken<number>` | 8 bytes | `number` |
| `bs.bool()` | `TypeToken<boolean>` | 1 byte | `boolean` |
| `bs.pubkey()` | `TypeToken<Address>` | 32 bytes | `string` (base58) |
| `bs.string()` | `TypeToken<string>` | 4 + len | `string` |
| `bs.bytes()` | `TypeToken<Uint8Array>` | 4 + len | `Uint8Array` |
| `bs.optional(inner)` | `OptionToken<T>` | 1 + inner | `T | null` |
| `bs.vector(inner, max?)` | `VecToken<T>` | 4 + len * inner | `T[]` (max defaults to 32) |
| `bs.array(inner, size)` | `ArrayToken<T>` | size * inner | `T[]` (fixed length) |
| `bs.struct({ fields })` | `StructZCDefinition<T>` | sum of fields | `{ fields }` (zero-copy accounts only) |

### Types not yet supported

These Anchor types are not yet available in the Better Sol program DSL. If your program needs them, write the program in Anchor/Rust directly and import the IDL with `fromIdl()`:

| Anchor type | Status | Workaround |
|---|---|---|
| `enum` (simple, e.g. `enum Status { Active, Paused }`) | Not supported | Use `u8` constants with `ctx.require` checks |
| `enum` (data-carrying, e.g. `enum Instruction { Transfer { amount: u64 } }`) | Not supported | Flatten to separate fields with an optional discriminator |
| `u256` / `i256` | Not supported | Use `u128` or `bs.bytes()` for large values |
| `COption<T>` | IDL parsing only | Use `bs.optional()` for program definitions |
| `HashMap` / `BTreeMap` | Not supported | Use `bs.vector(bs.struct({ key, value }))` and iterate |
| Nested structs in regular accounts | Not supported | Flatten fields into the account, or use `.zeroCopy()` accounts |

### Account definition

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
})
```

Creates an `AccountDefinition` with the given fields.

#### `.derive(buildSeeds)`

```ts
const Counter = bs.account({
  count: bs.u64(),
  authority: bs.pubkey(),
}).derive((seed) => ["counter", seed.authority])
```

Defines PDA seeds. The `seed` parameter is a proxy that lets you reference account fields. Only numeric and pubkey fields can be used as seeds.

The seed array can mix literal strings and field references:

```ts
.derive((seed) => ["position", seed.user, seed.market])
```

#### `.zeroCopy()`

```ts
const Header = bs.account({
  authority: bs.pubkey(),
  count: bs.u64(),
}).zeroCopy()
```

Enables zero-copy deserialization. Only allowed on accounts where every field is a numeric, float, pubkey, or struct of the same. No strings, vectors, or optional fields.

#### `.hasOne(field)`

```ts
const TokenAccount = bs.account({
  owner: bs.pubkey(),
  mint: bs.pubkey(),
}).hasOne("mint")
```

Declares that the account has a one-to-one relationship with another account, referenced by a field.

### Account constraint modes

Used in instruction `accounts` declarations:

| Method | Kind | Mutable | Use when |
|---|---|---|---|
| `bs.init(AccountDef)` | init | yes | Creating a new account |
| `bs.initIfNeeded(AccountDef)` | initIfNeeded | yes | Create if not exists, use existing if it does |
| `bs.mut(AccountDef)` | mut | yes | Writing to an existing account |
| `bs.close(AccountDef, "refundTo")` | close | yes | Closing an account and reclaiming rent |
| `bs.realloc(AccountDef, space)` | realloc | yes | Resizing account data |
| `bs.signer()` | signer | no | Transaction signer (auto-resolved to payer) |
| `bs.mint()` | mint | no | SPL Token mint account |
| `bs.mint().writable()` | mint | yes | Writable SPL Token mint |
| `bs.tokenAccount()` | tokenAccount | no | SPL Token token account |
| `bs.tokenAccount().writable()` | tokenAccount | yes | Writable token account |
| `bs.tokenProgram()` | tokenProgram | no | SPL Token program (auto-resolved) |
| `bs.token2022Program()` | token2022Program | no | Token-2022 program (auto-resolved) |
| `bs.systemProgram()` | systemProgram | no | System program (auto-resolved) |
| `bs.clock()` | clock | no | Clock sysvar (auto-resolved) |
| `bs.remaining(AccountDef)` | remaining | no | Dynamic remaining accounts |

Auto-resolved constraints (`signer`, `systemProgram`, `tokenProgram`, `token2022Program`, `clock`) are optional in the client call. The client fills them automatically.

### Program definition

```ts
export const counter = bs.program({
  name: "counter",
  address: "PROGRAM_ADDRESS",
  accounts: { Counter },
  errors: {
    Unauthorized: "Only the authority can perform this action",
    Underflow: "Counter cannot go below zero",
  },
  events: {
    CounterChanged: { counter: bs.pubkey(), authority: bs.pubkey(), count: bs.u64() },
  },
}, (ix) => ({
  initialize: ix({
    accounts: { counter: bs.init(Counter), authority: bs.signer() },
    args: { initialValue: bs.u64() },
    run: ({ counter, authority }, { initialValue }, ctx) => {
      counter.count = initialValue
      counter.authority = authority
    },
  }),
}))
```

#### `bs.program(config, buildInstructions)`

**config fields:**

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | yes | `string` | Program name for logging and debugging |
| `address` | yes | `Address` | On-chain program ID (base58 string) |
| `accounts` | no | `Record<string, AccountDefinition>` | Named account definitions |
| `errors` | no | `Record<string, string>` | Error name to human-readable message |
| `events` | no | `Record<string, FieldSchema>` | Event name to field schema |

**`buildInstructions(ix)`:** a function that receives the `ix` builder and returns an object of instruction definitions.

### Instruction definition

```ts
ix({
  accounts: { counter: bs.mut(Counter), authority: bs.signer() },
  args: { amount: bs.u64() },
  run: (accounts, args, ctx) => { /* instruction logic */ },
})
```

**Overloads:**

| Has accounts | Has args | Signature |
|---|---|---|
| Yes | Yes | `ix({ accounts, args, run: (accounts, args, ctx) => {} })` |
| Yes | No | `ix({ accounts, run: (accounts, ctx) => {} })` |
| No | Yes | `ix({ args, run: (args, ctx) => {} })` |
| No | No | `ix({ run: (ctx) => {} })` |

When there are no `args`, the `run` callback receives 2 parameters, not 3. When there are no `accounts`, the `run` callback also receives 2 parameters. When there are neither, `run` receives only `ctx`. The number of callback parameters always matches what was declared. Do not add a third parameter for `ctx` when `args` is absent.

**`run` parameters:**

1. **accounts**: destructured object. Each key matches an `accounts` entry. Value type depends on the constraint:
   - `bs.init(Counter)` → `Counter & { key: Address }` (includes `.key`)
   - `bs.initIfNeeded(Counter)` → `Counter & { key: Address }`
   - `bs.mut(Counter)` → `Counter & { key: Address }`
   - `bs.signer()` → `Address` (just the public key string)
   - `bs.mint()` → `{ key: Address, supply: bigint, decimals: number, mintAuthority: Address | null, freezeAuthority: Address | null }`
   - `bs.tokenAccount()` → `{ key: Address, mint: Address, owner: Address, amount: bigint }`
   - `bs.tokenProgram()` → `{ key: Address }`
   - `bs.systemProgram()` → `{ key: Address }`
   - `bs.clock()` → `{ unixTimestamp: bigint, slot: bigint, epoch: bigint }`

   You can also use an undeclared parameter object and access accounts by name: `accounts.counter.count`. The transpiler recognizes `accounts`/`accs` by convention and resolves property access through the instruction's declared accounts.

2. **args**: destructured object matching the `args` schema, or `{}` if no args. Like accounts, you can use an undeclared parameter object: `args.amount`.

3. **ctx**: `InstructionContext` with:
   - `ctx.require(condition: boolean, errorName: string): void` - assert a condition, fail with named error
   - `ctx.emit(eventName: string, payload: object): void` - emit a program event
   - `ctx.log(message: string, ...values): void` - log a message to transaction logs

### CPI functions

Import: `import { cpi } from "better-sol/program"`

```ts
cpi.token.transfer({ from, to, authority, amount })
cpi.token.transferChecked({ from, to, authority, amount, mint, decimals })
cpi.token.mintTo({ mint, to, authority, amount })
cpi.token.burn({ from, mint, authority, amount })
cpi.sol.timestamp() // returns bigint (current unix timestamp)
```

`from`, `to`, `mint` are the deserialized account objects from the instruction's `accounts` parameter. `authority` is an `Address` string (from a signer or stored authority).

### Supported run() body syntax

The `run()` body is transpiled to Anchor Rust. These TypeScript features are supported:

- Variable declarations (`const`, `let`)
- Arithmetic, comparison, and logical operators on fields and args
- `ctx.require()`, `ctx.emit()`, `ctx.log()`
- `cpi.token.*` and `cpi.sol.*` calls
- `if`/`else` branches
- Bounded `for` loops: `for (let i = 0; i < limit; i++)`
- Property access and assignment on declared accounts
- `clock.unixTimestamp` for time-based logic

These are **not** supported in `run()`:

- Helper functions or nested functions. Inline all logic.
- Arbitrary function calls (only `ctx.*`, `cpi.*`, `.key()`, `.abs()`, `cpi.sol.timestamp()`).
- `await`, `try`/`catch`, `while`, `switch`, `for...of`, template literals.
- External constants or type references (e.g. `typeof Account.type`). Use inline values.
- Object/array destructuring in variable declarations (declare each variable separately).

## Runtime client

Import: `import { betterSol, keypairFile, secretKey } from "better-sol"`

### Creating a client

```ts
const sol = await betterSol({
  cluster: "devnet",
  payer: keypairFile("./keypair.json"),
  programs: { counter },
})
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `cluster` | `"devnet" | "testnet" | "mainnet" | "localnet"` | `"devnet"` | Solana cluster |
| `rpcUrl` | `string` | cluster default | Custom RPC endpoint |
| `rpcSubscriptionsUrl` | `string` | cluster default | Custom WebSocket URL |
| `rpc` | `Rpc` | built from cluster | Pre-existing RPC connection |
| `rpcSubscriptions` | `RpcSubscriptions` | built from cluster | Pre-existing WebSocket connection |
| `payer` | `SignerInput` | none | Transaction signer |
| `programs` | `Record<string, AnyProgram>` | none | Program definitions to register |
| `commitment` | `"processed" | "confirmed" | "finalized"` | `"confirmed"` | Transaction confirmation level |
| `computeUnits` | `{ computeUnitLimit?: bigint, computeUnitPrice?: bigint }` | none | Compute budget settings |
| `addressLookupTables` | `Address[]` | none | Address Lookup Table addresses |
| `durableNonce` | `{ nonceAccountAddress, nonceAuthority }` | none | Durable nonce config |

### Signer input types

```ts
import { keypairFile, secretKey } from "better-sol"

keypairFile("./keypair.json")          // reads a keypair file from disk
secretKey(new Uint8Array([/* 64 bytes */])) // raw secret key bytes
walletAdapter(wallet)                  // TransactionSigner from better-sol/wallets
```

### Client methods

#### Program namespace

For each registered program, the client exposes a namespace:

```ts
sol.counter                           // program namespace
sol.counter.address                   // program's on-chain address
sol.counter.accounts.Counter          // BoundAccount with derive() and fetch()
sol.counter.parseErrors(logs)         // parse Anchor-style program errors from logs
sol.counter.parseEvents(logs)         // parse Anchor events from logs
sol.counter.initialize(params)        // instruction method
sol.counter.increment(params)         // instruction method
```

#### Bound account methods

```ts
const addr = await sol.counter.accounts.Counter.derive({ authority: sol.payer })
const data = await sol.counter.accounts.Counter.fetch(addr)
const multiple = await sol.counter.accounts.Counter.fetchMultiple([addr1, addr2])
```

| Method | Parameters | Returns |
|---|---|---|
| `derive(values)` | PDA seed values matching `.derive()` definition | `Promise<Address>` |
| `fetch(address)` | Account address | `Promise<FieldType | null>` |
| `fetchMultiple(addresses)` | Array of addresses | `Promise<(FieldType | null)[]>` |

#### Error and event parsing

```ts
const error = sol.counter.parseErrors(logs)
const events = await sol.counter.parseEvents(logs)
```

| Method | Parameters | Returns |
|---|---|---|
| `parseErrors(logs)` | transaction log messages | `ProgramError | undefined` |
| `parseEvents(logs)` | transaction log messages | `Promise<ParsedEvent[]>` |

#### Instruction methods

Every instruction on the program is available as a method on the namespace:

```ts
const signature = await sol.counter.increment({ counter: addr, amount: 5n })
```

Each instruction method has these variants:

| Method | Returns | Description |
|---|---|---|
| `method(params)` | `Promise<Signature>` | Send and confirm (default) |
| `method.send(params)` | `Promise<Signature>` | Same as calling directly |
| `method.instruction(params)` | `Promise<Instruction>` | Get the raw instruction |
| `method.transaction(params)` | `Promise<SignedTransaction>` | Build the full transaction |
| `method.simulate(params)` | `Promise<SimulateResult>` | Simulate without sending |
| `method.prepare(params)` | `Promise<PrepareResult>` | Get instruction + signers + pubkeys |
| `method.plan(params)` | `Promise<InstructionPlanResult>` | Get instruction + plan object |

#### Transaction methods

```ts
sol.send([...instructions])           // atomic multi-instruction transaction
sol.batch([...instructions])          // non-divisible sequential plan
sol.steps([step1, step2, step3])      // sequential with dependency passing
sol.transfer({ to, amount })          // transfer SOL (lamports)
sol.getBalance(address)               // get SOL balance (lamports)
sol.withSigner(signer)                // create scoped client with different signer
sol.onTransaction(callback)           // listen for confirmed transactions
```

#### Token client

```ts
sol.token.createMint({ decimals, authority?, freezeAuthority? })
// Returns { mint: Address, mintSigner: TransactionSigner, signature: Signature }

sol.token.mintTo({ mint, to, amount, decimals? })
// Returns Signature

sol.token.transfer({ mint, to, amount, from?, decimals? })
// Returns Signature. Derives ATAs automatically.

sol.token.getBalance({ owner, mint })
// Returns bigint

sol.token.getATA({ owner, mint })
// Returns Address (the Associated Token Address)
```

`sol.token2022` has the same API but uses the Token-2022 program.

## Test context

Import: `import { createTestContext } from "@better-sol/test"`

```ts
const ctx = await createTestContext({ programs: { counter } })
```

| Property | Type | Description |
|---|---|---|
| `ctx.svm` | `LiteSVM` | Underlying LiteSVM instance |
| `ctx.payer` | `Address` | Test payer public key |
| `ctx.newSigner(fundSol?)` | `Promise<TransactionSigner>` | Generate a funded keypair (default: 100 SOL) |
| `ctx.as(signer)` | `Promise<TestContext>` | Create scoped client for a signer |
| `ctx.warp(seconds)` | `void` | Advance clock by relative seconds |
| `ctx.setClock(timestamp)` | `void` | Set exact clock unix timestamp |
| `ctx.setBalance(address, sol)` | `void` | Set account SOL balance |
| `ctx.createMint(decimals)` | `Promise<{ mint, mintSigner }>` | Create a token mint |
| `ctx.mintTokens(params)` | `Promise<Signature>` | Mint tokens to an address |
| `ctx.profile(fn)` | `Promise<{ result, computeUnits, logs }>` | Profile a transaction |
| `ctx.program.*` | same as production client | Full typed client for registered programs |
| `ctx.send([...])` | same as production client | Atomic multi-instruction transaction |
| `ctx.token.*` | same as production client | Token operations |

## CLI and config

Import config helper from `@better-sol/cli`:

```ts
import { defineConfig } from "@better-sol/cli"

export default defineConfig({
  programs: "programs/**/*.ts",
  cluster: "devnet",
  out: "generated",
  payer: "./keypair.json",
})
```

### `CliConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `programs` | `string` | `"programs/**/*.ts"` | Glob used by CLI program discovery |
| `cluster` | `"devnet" | "testnet" | "mainnet" | "localnet"` | `"devnet"` | Default cluster for deploy and generate commands |
| `out` | `string` | `"generated"` | Default output directory for generated artifacts |
| `payer` | `string` | `undefined` | Optional keypair path when not using `./keypair.json` |

### CLI commands

| Command | Purpose | Key options |
|---|---|---|
| `npx @better-sol/cli@alpha init` | Initialize project files and payer keypair | `--force`, `--skip-install`, `--yes`, `--json` |
| `npx @better-sol/cli@alpha create <name>` | Create a new program template and program keypair | `--dir <dir>`, `--force`, `--yes`, `--json` |
| `npx @better-sol/cli@alpha login <api-key>` | Store compiler API key | `--json` |
| `npx @better-sol/cli@alpha deploy` | Parse, generate, compile, cache binary, and deploy programs | `--src <glob>`, `--program <name>`, `--payer <path>`, `--cluster <cluster>`, `--verify`, `--dry-run`, `--output <dir>`, `--json` |
| `npx @better-sol/cli@alpha generate db` | Generate ORM-ready database schema from account definitions | `--dialect postgres|mysql|sqlite`, `--out <path>`, `--src <glob>`, `--json` |
| `npx @better-sol/cli@alpha generate idl <source>` | Generate typed Better Sol program from IDL file or on-chain program address | `--out <path>`, `--name <name>`, `--cluster <cluster>`, `--json` |
| `npx @better-sol/cli@alpha verify [program]` | Submit a deployed program for OtterSec verified builds | `--program-id <id>`, `--lib-name <name>`, `--mount-path <path>`, `--json` |

### Agent-friendly CLI flow

Use the non-interactive flags in automation:

```bash
bunx @better-sol/cli@alpha init --yes --json
bunx @better-sol/cli@alpha create counter --yes --json
bunx @better-sol/cli@alpha deploy --program counter --dry-run --json
bunx @better-sol/cli@alpha generate db --json
```

Rules:

- Run `init` before `create` in a fresh project.
- Run `create <name>` before editing a new program so the CLI generates the program address and `.better-sol/<name>.json` keypair.
- Commands open the interactive UI only when required inputs are missing and no non-interactive flags are provided.
- Providing command arguments or options skips prompts and runs non-interactively.
- `--yes` always skips prompts and uses defaults where possible.
- `--json` always skips prompts and prints machine-readable output.
- Use `--force` explicitly if overwriting generated files.

### CLI option types

| Type | Fields |
|---|---|
| `InitOptions` | `force`, `skipInstall`, `yes`, `json` |
| `CreateOptions` | `dir`, `force`, `yes`, `json` |
| `DeployOptions` | `src`, `program`, `cluster`, `payer`, `verify`, `dryRun`, `output`, `json` |
| `GenerateDbOptions` | `dialect`, `out`, `src`, `json` |
| `GenerateIdlOptions` | `out`, `name`, `cluster`, `json` |
| `VerifyOptions` | `programId`, `libName`, `mountPath`, `json` |

## Related

- `program-patterns.md` for program definition patterns.
- `client-testing-deploy.md` for testing and deployment workflows.
- `cookbook-recipes.md` for runnable examples.
