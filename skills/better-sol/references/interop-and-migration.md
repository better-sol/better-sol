# Interop and Migration

## Anchor client comparison

Anchor TypeScript clients are IDL-driven. Anchor projects generate IDL files and TypeScript types during build, then clients create a `Program` from the IDL/provider and call `program.methods.<instruction>(...).accounts(...).rpc()`, `.instruction()`, `.transaction()`, or `.simulate()`.

Better Sol-native programs use the TypeScript program definition itself as the runtime schema for typed clients. No separate client generation step is needed for Better Sol-native code.

## Codama comparison

Codama generates TypeScript and Rust clients from IDLs, including `@solana/kit`-compatible TypeScript clients. This is useful for existing IDL-first programs and published clients.

Better Sol should still import external programs from IDL when interacting with existing Anchor programs.

## Import external IDL

Prefer generated code for stable external programs:

```bash
bunx @better-sol/cli@alpha generate idl ./staking-idl.json --out generated/staking.ts
```

Use runtime import when the IDL is fetched dynamically:

```ts
import { fromIdl } from "better-sol"
const staking = fromIdl(idl)
const sol = await betterSol({ programs: { staking } })
```

## Migration from Anchor to Better Sol

Map concepts:

| Anchor | Better Sol |
|---|---|
| `#[account] struct` | `bs.account({...})` |
| `#[derive(Accounts)]` | instruction `accounts` object |
| `Signer<'info>` | `bs.signer()` |
| `#[account(mut)]` | `bs.mut(Account)` or writable token constraints |
| `#[account(init, seeds, bump)]` | `bs.init(Account)` + `.derive(...)` |
| `require!` | `ctx.require(...)` |
| `emit!` | `ctx.emit(...)` |
| IDL + generated TS client | runtime typed client from program definition |

## Migration cautions

- Do not blindly port unsupported Rust patterns into Better Sol run bodies.
- Recreate every Anchor account constraint as an explicit Better Sol account constraint or `ctx.require` invariant.
- Verify CPIs against the currently available `cpi.*` helpers.
- Keep existing audited Anchor programs if migration adds risk without product benefit.

## Related

- `sdk-reference.md` for Better Sol API names used in migrations.
- `program-patterns.md` for rewriting account constraints and instruction handlers.
- `security-checklist.md` for verifying migrated constraints preserve security properties.
