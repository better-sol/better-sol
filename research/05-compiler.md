# Cloud Compiler Design

## The Compilation Pipeline

```
Developer writes:        programs/counter.ts
                         ↓
npx @better-sol/cli deploy:     1. Parse TypeScript AST
                         2. Extract program(), account(), ix() definitions
                         3. Generate Anchor Rust source code
                         4. POST Rust to cloud compiler
                         5. Server runs: cargo build-sbf → .so file
                         6. Deploys .so to the target cluster
                         7. Prints summary with explorer link
                         ↓
Result:                  Program is live on-chain. Same .ts file = typed sol.
```

No build artifacts. The `.so` lives on-chain. IDL auto-published.
The developer gets a clear summary:

```
  ✅ counter deployed

  Program:   CouNTeR11111111111111111111111111111111111
  Cluster:   devnet
  Explorer:  https://explorer.solana.com/address/CouNTeR.../programs?cluster=devnet
  IDL:       https://better-sol.fun/idl/CouNTeR.../latest
  Signature: 4kM7x... (deploy tx)

  2 accounts, 5 instructions, 3 errors, 2 events
```

### IDL Auto-Publishing

We auto-generate a standard Anchor IDL and publish it alongside the deployment.
Our users never need it (the TS definition is the sol), but it enables **full ecosystem
compatibility** — anyone using Codama, Anchor TS, `@solana/kit`, Shiru, or plain RPC calls
can interact with programs built with our library.

The IDL is stored:
- **On-chain** via Anchor's `declare_id` + metadata account (standard Anchor approach)
- **On our cloud** at `https://better-sol.fun/idl/{programId}/latest` for easy access

What the IDL contains (that our TS computes at runtime instead):

| IDL field | Purpose | Our equivalent |
|---|---|---|
| Instruction discriminators | Identify which instruction in binary | `sha256("global:name")[0..8]` computed from `ix()` names |
| Account discriminators | Identify which account type in binary | `sha256("account:Name")[0..8]` computed from `account()` names |
| Field byte offsets + sizes | Serialize/deserialize binary data | Computed from field order + type sizes (u64=8, pubkey=32, bool=1) |
| PDA seed definitions | Derive deterministic addresses | `.seeds('counter', '{authority}')` |
| Error codes (numeric) | Map error code → name | `defineErrors()` names → assigned 6000, 6001... |
| Account constraints | Which accounts sign, writable, relations | `p.init()`, `p.mut()`, `p.signer()` |

All deterministic. Same inputs → same IDL. We generate it from the TS definition
at deploy time, not as a separate step.

If the developer wants to inspect the generated Rust, they use `deploy --dry-run`.
If they need the `.so` file for auditing or offline deployment, they use `deploy --output ./build`.

---

## The Cloud Compiler API

```
POST https://compile.better-sol.fun/api/v1/compile
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

---

## Configuration

### No config file required (Paykit pattern)

The CLI finds program definitions automatically. No `better-sol.config.ts` needed:

```bash
# Default: finds all program() exports in programs/**/*.ts
npx @better-sol/cli deploy

# Explicit: target specific files
npx @better-sol/cli deploy --src programs/counter.ts
npx @better-sol/cli deploy --src 'programs/**/*.ts'    # glob

# With cluster and keypair
npx @better-sol/cli deploy --cluster devnet --keypair ~/.config/solana/id.json
```

### Optional config file for defaults

If the project wants to pin defaults instead of passing flags every time:

```typescript
// better-sol.config.ts
import { defineConfig } from '@better-sol/cli'

export default defineConfig({
  programs: './programs/**/*.ts',       // glob to find program() definitions
  cluster: 'devnet',                      // default cluster
  keypair: '~/.config/solana/id.json',   // default keypair
  out: './generated',                     // where to write generated Rust (for verification)
})
```

Like Drizzle's `drizzle.config.ts`, but optional. Without it, the CLI uses sensible
defaults (auto-discovery + CLI flags). With it, you can just run `npx @better-sol/cli deploy`
with no arguments.

### Why not require a config file?

Three reasons:
1. **Paykit doesn't need one** — their CLI imports the runtime file directly. We do the same.
2. **Convention over configuration** — `programs/**/*.ts` is the obvious default.
3. **Fewer files = less friction** — the library's value is zero setup. Don't add setup.

---

## Program Verification

Solana has a [verified builds](https://verify.osec.io/) system (by OtterSec/Ellipsis Labs)
that lets anyone confirm an on-chain program matches its published source code.
Verified programs show a ✅ badge in Solana Explorer, SolanaFM, and SolScan.

### The verification process

1. Developer publishes source code on GitHub
2. `solana-verify` clones the repo, builds it in a deterministic Docker container
3. Compares the hash of that build against the on-chain program's hash
4. If they match → verified ✓

### Why this matters for us

Our users write TypeScript, but verification expects Rust source in a Git repo.
This seems like a problem — but it's actually an opportunity:

**The Anchor Rust we generate is deterministic.** Same TypeScript input always produces
the same Rust output. So we write that Rust to `generated/` in the user's repo, they
commit + push to GitHub, and OtterSec verifies against it.

### Whose repository?

**The user's own repository.** Not ours. Not a shared one. Theirs.

Why not alternatives:

| Approach | Problem |
|---|---|
| Our monorepo (all programs) | Namespace collisions, mixed codebase, trust conflict (we host + compile) |
| Self-hosted Git (repo per program) | We'd be running a Git hosting service. Not our job. |
| User's own repo | ✅ Natural, trusted, zero extra infrastructure |

Verification is about trust: "this on-chain program matches the developer's source."
If we host the source, users trust *us* instead of the developer. That's a conflict of
interest. The source must live in a repo the developer controls.

### How it works

**Step 1: Push with `--verify`** (writes generated Rust to `generated/`)

```bash
npx @better-sol/cli deploy --cluster mainnet-beta --verify
# → Parsing programs/counter.ts...
# → Generating Anchor Rust (437 lines)...
# → Writing to generated/counter/...
# → Compiling via cloud service... (3.2s)
# → Deploying to mainnet-beta...
#
# ✅ counter deployed
#    Program:   CouNTeR...
#    Cluster:   mainnet-beta
#
# 📋 To verify: commit and push the generated Rust, then run:
#    npx @better-sol/cli verify --program-id CouNTeR...
```

**Step 2: Commit and push** (normal Git workflow — developer controls this)

```bash
git add generated/
git commit -m "deploy counter v1.2.0"
git push
```

**Step 3: Submit for verification**

```bash
npx @better-sol/cli verify --program-id CouNTeR...
# → Repository: github.com/user/my-app
# → Commit:     abc123def
# → Submitting to verify.osec.io...
# → ✅ Verification pending (OtterSec builds in Docker, ~5 min)
# → Check status: verify.osec.io/status/CouNTeR...
```

What `verify` does:
1. Reads the current Git remote + commit hash from the local repo
2. Calls `POST https://verify.osec.io/verify` with repo URL, commit hash, and lib name
3. OtterSec clones the repo, builds the Rust in Docker, compares hashes
4. If match → ✅ verified (appears in Solana Explorer, SolanaFM, SolScan)

### Why not auto-commit?

We deliberately don't commit on the user's behalf. Reasons:
- **No GitHub auth in our CLI** — avoids storing tokens, OAuth flows, permission scopes
- **Developer controls what ships** — they review the generated Rust before it goes public
- **Clean Git history** — no surprise commits from a tool
- **Works with any Git host** — GitHub, GitLab, Bitbucket, self-hosted

### This is a competitive advantage

No other TypeScript Solana tool supports verified builds:
- Anchor requires manual Docker setup
- Poseidon, Kite, Gill — none handle verification
- We make it two commands: `deploy --verify` then `verify`

For production programs (mainnet), verification is expected. Making it this easy is a real differentiator.

---

**Mode 1: Cloud compilation (default — no Rust needed)**
```bash
npx @better-sol/cli deploy --cluster devnet
```

**Mode 2: Local compilation (for developers who have Rust)**
```bash
npx @better-sol/cli deploy --cluster devnet --local
```

The `deploy` command detects whether the local toolchain is available and falls back to the cloud.

---

## What the Transpiler Generates

From this TypeScript:
```typescript
const Counter = account({ count: u64, authority: pubkey }).seeds('counter', '{authority}')

const errors = defineErrors({ Unauthorized: 'Not authorized' })

const events = defineEvents({ Incremented: { newCount: u64 } })

export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors, events }, {
  increment: ix({
    accounts: { counter: p.mut(Counter), authority: p.signer() },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, 'Unauthorized')
      counter.count += amount
      ctx.emit('Incremented', { newCount: counter.count })
    },
  }),
})
```

The transpiler generates:

1. **Error enum** → `#[error_code] pub enum CounterError { Unauthorized }`
2. **Event structs** → `#[event] pub struct Incremented { pub new_count: u64 }`
3. **Account structs** → `#[account] pub struct Counter { pub count: u64, pub authority: Pubkey }`
4. **Instruction handlers** → `pub fn increment(ctx: Context<Increment>) -> Result<()> { ... }`
5. **Account validation** → `#[derive(Accounts)] pub struct Increment { ... }`
6. **CPI calls** → `token::transfer(cpi_ctx, amount)?`

See `examples/amm-generated-rust.rs` for a full 633-line example.

---

## Security

- The server **compiles only** — it never executes the compiled program
- The generated Rust source is **transparent and inspectable** (shown in CLI output)
- The developer can **verify the bytecode hash** against what they expect
- No secrets are sent to the server — only generated Rust code and a program ID

---

## Transpiler Coverage

| Category | Coverage | Notes |
|---|---|---|
| Arithmetic (+, -, *, /, %) | ✅ Full | All bigint operations |
| Control flow (if/else) | ✅ Full | Including else-if chains |
| Comparisons (===, !==, >, <) | ✅ Full | Direct mapping to Rust |
| Boolean logic (&&, \|\|, !) | ✅ Full | |
| Account field read/write | ✅ Full | Assignment and compound (+=, -=) |
| ctx.require() | ✅ Full | Maps to `require!()` with error enum |
| ctx.emit() | ✅ Full | Maps to `emit!()` with event struct |
| ctx.log() | ✅ Full | Maps to `msg!()` with format string |
| CPI: token.transfer | ✅ Full | Both user-signed and PDA-signed |
| CPI: token.mintTo | ✅ Full | PDA-signed authority |
| CPI: token.burn | ✅ Full | |
| Sysvars (sol.timestamp) | ✅ Full | Maps to `Clock::get()?.unix_timestamp` |
| Escape hatch (rust\`...\`) | ✅ Full | Emitted verbatim into Rust function |
| **Overall** | **83%** | 75 operations tested across 16 program types |

See `04-transpiler.md` for the full coverage matrix.

---

# Push Workflow & CLI

## Push Workflow

### The Developer Experience

```bash

npx @better-sol/cli deploy --cluster devnet
```

That's it. Under the hood:

```
programs/counter.ts
       │
       ▼
  ┌─────────────────┐
  │  Parse TS files  │  ← TypeScript compiler API extracts program() + ix() definitions
  └─────────────────┘
       │
       ▼
  ┌─────────────────┐
  │  Build IR       │  ← Typed intermediate representation (accounts, instructions, logic)
  └─────────────────┘
       │
       ├─────────────────────┐
       ▼                     ▼
  ┌──────────────┐   ┌──────────────┐
  │  Generate    │   │  Generate    │
  │  Rust Code   │   │  Client SDK  │
  └──────────────┘   │  types       │
       │             └──────────────┘
       ▼
  ┌──────────────┐
  │  Cloud       │
  │  Compiler    │  ← POST Rust source, get back .so bytecode
  └──────────────┘
       │
       ▼
  ┌──────────────┐
  │  Deploy      │  ← solana program deploy (or via RPC)
  └──────────────┘
```

### What `deploy` Does (Like `drizzle-kit push`)

1. Reads all `programs/*.ts` files
2. Extracts `program()`, `account()`, `ix()` definitions using TypeScript AST parsing
3. For each program, verifies the address matches the keypair in `.better-sol/`
4. If no address exists, offers to generate a keypair and update the source file
5. Builds a typed IR (accounts, fields, instructions, logic functions)
6. Generates Anchor Rust source code (with `declare_id!()` from the address)
7. Sends Rust to cloud compiler → gets `.so` bytecode back
8. Deploys the `.so` to the target cluster
9. Auto-publishes IDL to chain and cloud

**Address verification:** If the address in `program()` doesn't match the keypair
in `.better-sol/`, `deploy` errors immediately:
```
❌ Address mismatch for 'counter':
   Source file: CouNTeR...
   Keypair:     DiFfErNt...
   Either update the address in programs/counter.ts or delete .better-sol/counter.json
```

**Missing address:** If `program()` has no address and no keypair exists, `deploy`
asks to generate one and update the source file (like `drizzle-kit push` asks
before applying changes).

### Schema Diffing (Like Drizzle)

When you change your program:

```bash
npx @better-sol/cli deploy --cluster devnet
```

The tool tracks what's deployed (like Drizzle's migration journal) and only
recompiles/redeploys when the schema changes.

### The CLI Surface

Three commands. Like `paykitjs push`, `drizzle-kit generate`, and `laravel make:migration`.

```bash
# Create — scaffold a new program (like laravel make:migration)
npx @better-sol/cli create counter              # Creates programs/counter.ts with boilerplate
npx @better-sol/cli create escrow --seeds owner  # With custom PDA seeds

# Push — compile and deploy (keypair auto-generated if missing)
npx @better-sol/cli deploy                     # Parse → Rust → cloud compile → deploy
npx @better-sol/cli deploy --local             # Compile locally (if you have Rust installed)
npx @better-sol/cli deploy --dry-run           # Show generated Rust without compiling
npx @better-sol/cli deploy --cluster devnet    # Target cluster (default: devnet)
npx @better-sol/cli deploy --program counter   # Push a specific program
npx @better-sol/cli deploy --verify            # Also write generated Rust to generated/ for verification

# Verify (submits to OtterSec after you commit + push)
npx @better-sol/cli verify --program-id CouNTeR...
```

Everything else is unnecessary:
- `deploy` → `solana program deploy` already exists (not our job)
- `generate` → `--dry-run` flag handles this
- `compile` → `--local` flag handles this
- `client` → contradicts our value prop (the TS definition IS the client, nothing to generate)
- `diff` → programs are upgradeable, just re-deploy
- `inspect` → `solana program show` already exists


## The `create` Command

Like Laravel's `php artisan make:migration`, this scaffolds a new program file
with working boilerplate. It's optional — you can always create the file manually.

```bash
npx @better-sol/cli create counter
# → Created programs/counter.ts
# → Generated keypair: CoUnTeR11111111111111111111111111111111111
# → Saved .better-sol/counter.json (private, gitignored)
```

This creates:

```typescript
// programs/counter.ts
import { program, account, ix, defineErrors, u64, pubkey, p } from 'better-sol/program'

const Counter = account({
  count: u64,
  authority: pubkey,
}).seeds('counter', '{authority}')

const errors = defineErrors({
  Unauthorized: 'Not the authority',
})

export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { errors }, {
  initialize: ix({
    accounts: {
      counter: p.init(Counter),
      authority: p.signer(),
    },
    args: { initialValue: u64 },
    run: ({ counter, authority }, { initialValue }) => {
      counter.count = initialValue
      counter.authority = authority
    },
  }),

  increment: ix({
    accounts: {
      counter: p.mut(Counter),
      authority: p.signer(),
    },
    args: { amount: u64 },
    run: ({ counter, authority }, { amount }, ctx) => {
      ctx.require(authority === counter.authority, 'Unauthorized')
      counter.count += amount
    },
  }),
})
```

The developer edits this file — adding accounts, instructions, errors, events — 
then runs `npx @better-sol/cli deploy` to compile and deploy.

### Why `create` is optional

You don't have to use `create`. If you prefer to start from scratch:

```typescript
// programs/counter.ts — written from scratch
import { program, account, ix, u64, pubkey, p } from 'better-sol/program'

// ... your code ...

export const counter = program('counter', 'CouNTeR11111111111111111111111111111111111', { ... }, { ... })
```

`create` is a convenience. It gives you a working starting point with the right
imports, a basic account, and two instructions. Like `npm init` — helpful, not required.

### Why `create` also generates the keypair

When you run `create counter`, it generates the keypair and writes the address
into the program file. The address is immediately available:

```bash
npx @better-sol/cli create counter
# → Created programs/counter.ts
# → Generated keypair: CoUnTeR...
# → Saved .better-sol/counter.json (private, gitignored)
```

The address is in `programs/counter.ts` — committed to git. Anyone who clones the repo can
use the client immediately. They don't need the keypair to call the program,
only to deploy upgrades.

If you skip `create` and write the file manually, `deploy` will offer to generate
a keypair and update the source file on first deploy — same result, just one step later.
