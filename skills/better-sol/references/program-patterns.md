# Program Patterns

## State modeling

Model state before instructions. For each account define:

- owner/authority field
- PDA namespace and dynamic seeds
- mutable fields
- lifecycle: init, update, close, realloc
- events emitted when it changes
- invariants that must always hold

## PDA seeds

Use a static namespace seed first, then stable dynamic seeds.

```ts
const Profile = bs.account({
  owner: bs.pubkey(),
  displayName: bs.string(),
}).derive(seed => ["profile", seed.owner])
```

Avoid using user-provided arbitrary strings as the only dynamic seed for value-bearing accounts. Store canonical seed material in fields that the typed client can supply.

## Initialization pattern

```ts
initialize: ix({
  accounts: { profile: bs.init(Profile), owner: bs.signer() },
  args: { displayName: bs.string() },
  run: ({ profile, owner }, { displayName }) => {
    profile.owner = owner
    profile.displayName = displayName
  },
})
```

## Authority pattern

```ts
update: ix({
  accounts: { profile: bs.mut(Profile), owner: bs.signer() },
  args: { displayName: bs.string() },
  run: ({ profile, owner }, { displayName }, ctx) => {
    ctx.require(profile.owner === owner, "Unauthorized")
    profile.displayName = displayName
  },
})
```

## Close pattern

```ts
closeProfile: ix({
  accounts: {
    profile: bs.close(Profile, "owner"),
    owner: bs.signer(),
  },
  run: ({ profile, owner }, ctx) => {
    ctx.require(profile.owner === owner, "Unauthorized")
  },
})
```

## Realloc pattern

Use only when dynamic account growth is necessary. Validate authority, max size, and existing invariants before resizing.

## Events

Emit events for state transitions that frontends, indexers, or monitors need to observe.

```ts
ctx.emit("ProfileUpdated", { profile: profile.key, owner })
```

## Token CPI

```ts
reward: ix({
  accounts: {
    mint: bs.mint().writable(),
    destination: bs.tokenAccount().writable(),
    authority: bs.signer(),
    tokenProgram: bs.tokenProgram(),
  },
  args: { amount: bs.u64() },
  run: ({ mint, destination, authority }, { amount }, ctx) => {
    ctx.require(amount > 0n, "InvalidAmount")
    cpi.token.mintTo({ mint, to: destination, authority, amount })
  },
})
```

Prefer checked transfers where mint/decimal validation matters.

## Remaining accounts

Use `bs.remaining(...)` for marketplaces, batch operations, plugin-like account lists, and multi-recipient flows. Do not use it to avoid naming security-critical accounts.

## Zero-copy

Use zero-copy for fixed-size, high-throughput accounts. Avoid strings, vectors, optional values, and dynamic bytes. Prefer numeric, pubkey, fixed array, and zero-copy struct fields.

## Return values

Use instruction return values for simulation/read-like flows, not as a replacement for persisted state when future transactions need the result.

## Related

- `sdk-reference.md` for exact Better Sol account, constraint, CPI, and client API names.
- `security-checklist.md` for reviewing each pattern safely.
- `client-testing-deploy.md` for tests that validate program behavior.
