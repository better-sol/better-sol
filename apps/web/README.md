# Better Sol Docs

The documentation site for Better Sol, built with [Fumadocs](https://fumadocs.vercel.app/).

## Development

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Build

```bash
bun run build
```

## Content

Documentation pages live in `content/docs/` as MDX files. The page structure is controlled by `meta.json` files in each directory.

```
content/docs/
  index.mdx                          # Installation landing page
  your-first-program.mdx             # Getting started
  your-first-client.mdx
  project-structure.mdx
  comparisons.mdx
  defining-programs/                  # Program definition reference
    types.mdx
    accounts.mdx
    instructions.mdx
    constraints.mdx
    errors-and-events.mdx
    program-config.mdx
    body-language.mdx
  the-client/                         # Client SDK reference
    connecting.mdx
    calling-instructions.mdx
    fetching-accounts.mdx
    parsing-outputs.mdx
    multi-instruction.mdx
    tokens.mdx
    from-idl.mdx
```

## License

MIT
