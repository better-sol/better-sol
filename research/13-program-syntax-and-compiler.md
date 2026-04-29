# Program Definition API: Syntax Exploration & Cloud Compiler Design

## The Problem with the Object Syntax

Current v3:

```typescript
const counter = defineProgram({
  id: 'CoUnTeR...',
  accounts: {
    counter: {
      seeds: ['counter', '{authority}'],
      fields: {
        count: u64,
        authority: pubKey,
        isActive: bool,
      },
    },
  },
  instructions: {
    initialize: {
      accounts: {
        counter: { writable: true, pda: true },
        authority: { signer: true, writable: true },
      },
      args: { initialValue: u64 },
    },
  },
})
```

Problems:
- Deeply nested objects — hard to read, hard to write
- Account constraints are declarative strings (`'counter.authority'`) — no autocomplete, no type checking
- Instruction logic is completely absent — just a schema, not a program
- Feels like writing JSON, not code
- The developer has to mentally map between this and Anchor/Rust concepts

---

## Alternative Approaches — Let's Explore

### Approach A: Class-Based (like Poseidon)

```typescript
import { Program, Account, u64, bool, Signer, Pubkey } from '@solana-kit/program'

class Counter extends Account {
  count = u64
  authority = Pubkey
  isActive = bool
}

@program('CoUnTeR...')
class CounterProgram extends Program {
  @account(Counter)
  counter = this.account(Counter).seeds('counter', this.authority)

  @instruction
  initialize(ctx: { counter: Counter; authority: Signer }, args: { initialValue: bigint }) {
    ctx.counter.count = args.initialValue
    ctx.counter.authority = ctx.authority.publicKey
    ctx.counter.isActive = true
  }

  @instruction
  increment(ctx: { counter: Counter; authority: Signer }, args: { amount: bigint }) {
    require(ctx.authority.publicKey.equals(ctx.counter.authority))
    require(ctx.counter.isActive)
    ctx.counter.count += args.amount
  }
}
```

Pros: Familiar OOP pattern, actual logic in the methods
Cons: Decorators (stage 3, not universal), heavy class ceremony, doesn't feel idiomatic TypeScript

---

### Approach B: Function Chains (Zod / ElysiaJS style)

```typescript
import { p, account, instruction, u64, bool, signer, writable } from '@solana-kit/program'

export const counter = p('CoUnTeR...', {
  accounts: {
    counter: account({
      seeds: ['counter', p.authority],
      count: u64,
      authority: p.pubkey,
      isActive: bool,
    }),
  },

  instructions: {
    initialize: instruction({
      accounts: {
        counter: writable(p.counter),
        authority: signer(writable),
      },
      args: { initialValue: u64 },
      logic: ({ accounts, args }) => {
        accounts.counter.count = args.initialValue
        accounts.counter.authority = accounts.authority
        accounts.counter.isActive = true
      },
    }),

    increment: instruction({
      accounts: {
        counter: writable(p.counter),
        authority: signer(),
      },
      args: { amount: u64 },
      logic: ({ accounts, args }) => {
        p.require(accounts.authority.equals(accounts.counter.authority))
        p.require(accounts.counter.isActive)
        accounts.counter.count += args.amount
      },
    }),
  },
})
```

Pros: Chainable, composable, type-safe
Cons: Still object-heavy, the `logic` function can't actually run (it's transpiled, not executed)

---

### Approach C: Declarative + Separate Logic (Drizzle-inspired)

The key insight from Drizzle ORM: **define the schema as pure TypeScript values, keep it separate from logic.**

Schema (what data looks like):
```typescript
import { table, column, u64, bool, pubKey } from '@solana-kit/program'

export const counterAccount = table('counter', {
  count: column(u64),
  authority: column(pubKey),
  isActive: column(bool),
}).withSeeds('counter', '{authority}')
```

This is clean but maps database thinking to blockchain, which doesn't quite fit.

---

### Approach D: Instruction-First (my recommendation to explore)

Instead of defining programs top-down (accounts → instructions), what if we flip it?
Define instructions first. The accounts and types emerge from usage.

```typescript
import { program, u64, bool } from '@solana-kit/program'

export const counter = program('CoUnTeR...', {
  counter: account({
    count: u64,
    authority: pubkey,
    isActive: bool,
  }).seeds('counter', '{authority}'),
})

// Instructions are methods on the program — defined separately, composed freely
counter.instruction('initialize', {
  accounts: {
    counter: counter.counter.writable().pda(),
    authority: signer().writable(),
  },
  args: { initialValue: u64 },
})

counter.instruction('increment', {
  accounts: {
    counter: counter.counter.writable(),
    authority: signer(),
  },
  args: { amount: u64 },
  require: [
    authority => authority.equals(counter.counter.authority),
    () => counter.counter.isActive,
  ],
})

counter.instruction('close', {
  accounts: {
    counter: counter.counter.writable().closeTo('authority'),
    authority: signer().writable(),
  },
  require: [
    authority => authority.equals(counter.counter.authority),
  ],
})
```

Pros: Method chains, autocomplete-friendly, accounts reference the program's own types
Cons: Still somewhat verbose

---

### Approach E: Minimal DSL (the most radical — worth discussing)

What if the program definition looked nothing like TypeScript objects, and instead felt like writing pseudocode that happens to be valid TypeScript?

```typescript
import { sol } from '@solana-kit/program'

export const Counter = sol.program('CoUnTeR...', ({ account, instruction, signer, pubkey, u64, bool }) => {

  const Counter = account({
    count: u64,
    authority: pubkey,
    isActive: bool,
  }).seeded('counter', ctx => [ctx.authority])

  instruction('initialize', {
    counter: Counter.writable(),
    authority: signer().payer(),
  }, ({ counter, authority }, { initialValue: u64 }) => {
    counter.count = initialValue
    counter.authority = authority
    counter.isActive = true
  })

  instruction('increment', {
    counter: Counter.writable(),
    authority: signer(),
  }, ({ counter, authority }, { amount: u64 }) => {
    require(authority === counter.authority)
    require(counter.isActive)
    counter.count += amount
  })

  instruction('close', {
    counter: Counter.writable().closeTo('authority'),
    authority: signer().payer(),
  }, ({ counter, authority }) => {
    require(authority === counter.authority)
  })

  return { Counter }
})
```

Pros:
- Feels like writing pseudocode — very readable
- The callback pattern scopes everything naturally
- Account fields and instruction logic are co-located
- `require()` is a natural way to express constraints
- The `({ destructured accounts }, { destructured args }) =>` pattern is clean

Cons:
- The logic function can't actually execute in TypeScript — it has to be transpiled to Rust
- This is the hardest to implement (need a proper transpiler, not just a schema parser)

---

## My Honest Assessment

For a **2-week hackathon**, Approach E is too ambitious — it requires building a full transpiler that converts TypeScript AST to Anchor Rust.

The most practical approach that still feels great:

**Start with a clean schema definition (the data), skip the inline logic for now, and generate Rust from the schema + constraints.**

Here's what I think we should actually build:

```typescript
import { program, u64, bool, pubkey, signer, writable, pda } from '@solana-kit/program'

export const counter = program('counter', 'CoUnTeR1111111111111111111111111111111111111', {

  accounts: {
    counter: {
      seeds: ['counter', '{authority}'],
      count: u64,
      authority: pubkey,
      isActive: bool,
    },
  },

  instructions: {
    initialize: {
      accounts: {
        counter: [pda, writable],
        authority: [signer, writable],
      },
      args: { initialValue: u64 },
    },
    increment: {
      accounts: {
        counter: [writable],
        authority: [signer],
      },
      args: { amount: u64 },
      checks: ['authority == counter.authority', 'counter.isActive'],
    },
    close: {
      accounts: {
        counter: [writable, closeTo('authority')],
        authority: [signer, writable],
      },
      checks: ['authority == counter.authority'],
    },
  },
})
```

Then separately, the Rust logic is either:
- Generated from `checks` constraints (for simple programs)
- Written by hand (for complex programs) — the generated Rust gives you the scaffolding

This is simpler to implement, still a big DX improvement over raw Anchor, and the `defineProgram` object is immediately useful as a client (PDA derivation, account decoding, instruction building).

---

## Cloud Compiler Design

### The Flow

```
Developer writes:        programs/counter.ts (defineProgram schema)
         ↓
Developer runs:          npx solana-kit compile
         ↓
What happens:
  1. Parse the TypeScript file, extract the defineProgram() call
  2. Generate Anchor Rust source code
  3. POST the Rust source to compile.solana-kit.dev/api/compile
  4. Server runs: cargo build-sbf → .so file
  5. Server returns: { bytecode: Buffer, programId: string }
  6. CLI saves: ./build/counter.so
         ↓
Developer deploys:       npx solana-kit deploy --cluster devnet
```

### The Cloud Service API

```
POST https://compile.solana-kit.dev/api/v1/compile
Content-Type: application/json

{
  "name": "counter",
  "programId": "CoUnTeR1111111111111111111111111111111111111",
  "source": "/* generated Anchor Rust */",
  "version": "1.0.0"
}

→ Response (200):
{
  "bytecode": "<base64-encoded .so file>",
  "bytecodeHash": "sha256:...",
  "sizeBytes": 12345,
  "compileTimeMs": 3200
}
```

### Developer Experience — Three Modes

**Mode 1: Just the client (no compilation needed)**
```typescript
import { solanaKit } from '@solana-kit/sdk'
// Use existing on-chain programs. No compiler needed at all.
```

**Mode 2: Define a program, compile locally (has Rust toolchain)**
```bash
npx solana-kit compile --local
# Generates Rust, runs cargo build-sbf locally
```

**Mode 3: Define a program, compile via cloud (no Rust needed)**
```bash
npx solana-kit compile
# Generates Rust, sends to cloud, gets back .so
# Developer never installs Rust
```

The `compile` command detects whether the local toolchain is available and falls back to the cloud.

### Security Considerations for the Cloud Compiler

The server never executes the compiled program — it only compiles it. The developer verifies the bytecode hash against what they expect. The generated Rust source is transparent and inspectable.

---

## Open Questions for Brainstorming

1. **Should `checks` be strings or TypeScript expressions?**
   - Strings: `'authority == counter.authority'` — simple to parse, limited expressiveness
   - Functions: `(ctx) => ctx.authority.equals(ctx.counter.authority)` — type-safe, but can't be serialized to Rust
   - We need something that can be converted to Rust `require!()` statements

2. **Should we support inline logic at all in v1?**
   - If yes: we're building a transpiler (hard)
   - If no: we generate Rust scaffolding and the developer fills in the logic (like Poseidon)
   - Middle ground: support `checks` for constraints, but actual mutation logic requires hand-written Rust

3. **What about complex CPI programs?**
   - A token swap involves CPIs to Token Program, calculating math, handling slippage
   - A schema-only definition can't capture this
   - For complex programs, developers will always need Rust
   - Our tool should be great for the 80% case (simple programs) and not get in the way for the 20%

4. **How does the program builder relate to the SDK client?**
   - `defineProgram()` produces a typed object that can be passed to `kit.registerProgram()`
   - The SDK uses the schema to serialize instruction args and deserialize account data
   - No code generation needed — it's all runtime
   - But the same schema is ALSO used by the compiler to generate Rust
   - This dual use (client + compiler) is the key architectural decision
