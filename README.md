# better-sol monorepo

Bun workspace monorepo for `better-sol`.

## Packages

- `packages/better-sol` — runtime library package
- `packages/cli` — CLI package published as `@better-sol/cli`
- `apps/compiler-api` — Rust + Axum compiler API

## Commands

```bash
bun install
bun run check
bun run build
bun run test
bun run lint
bun run format:check
bun run compiler:check
```

## Notes

The workspace uses Bun workspaces with `packages/*`. Oxc is wired through `oxlint` for linting and safe auto-fixes. The `format` script currently maps to Oxc auto-fix behavior, not a separate whitespace formatter.
