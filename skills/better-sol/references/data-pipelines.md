# Data Pipeline Patterns

Use this reference when building indexers, analytics dashboards, webhook processors, backfill jobs, or any system that ingests and processes Solana on-chain data.

## Tools

- **RPC polling**: use `@solana/kit` or the Better Sol typed client for `getAccountInfo` and `getProgramAccounts` polls. Suitable for low volume (< 10 accounts, > 30s refresh).
- **Webhooks**: Helius (`helius.xyz`) or Yellowstone (Triton) for geyser-style WebSocket feeds. Both deliver decoded account diffs and transaction events via HTTP callbacks. Suitable for moderate real-time needs (hundreds of accounts, sub-second latency).
- **Geyser/indexer**: Yellowstone geyser plugin for node operators, or Triton's managed geyser API for high-throughput low-latency ingestion. Suitable for indexing entire programs or processing thousands of events per second.
- **Backfill**: write a script using the Better Sol typed client to iterate `getProgramAccounts` with `dataSlice` and pagination. Suitable for historical analytics and recovery.
- **Storage**: ORM-backed Postgres, MySQL, or SQLite. Better Sol generates ORM-ready database schemas from account definitions via `npx @better-sol/cli@alpha generate db`.

## Source selection

| Source | Volume | Latency | Complexity | Use when |
|---|---|---|---|---|
| RPC polling | Low | 30s-5min | Low | Simple account reads, dashboards |
| Webhooks | Medium | Sub-second | Medium | App events, wallet tracking, real-time |
| Geyser/indexer | High | Sub-second | High | Full program indexing, analytics |
| Backfill job | Any | Batch | Low | Historical analytics, recovery |
| Program events/logs | Medium | Sub-second | Medium | State transition stream |

## Better Sol advantage

Better Sol account definitions are TypeScript schemas. Reuse the program definition as the decoding source when indexing your own program. This eliminates schema drift between the program and the indexer.

```ts
import { accountDiscriminator, decodeAccount } from "better-sol/codec"
import { counter } from "./programs/counter"

async function decodeCounterData(data: Uint8Array) {
  const discriminator = await accountDiscriminator("Counter")
  const hasExpectedDiscriminator = data.subarray(0, 8).every(
    (byte, index) => byte === discriminator[index]
  )
  if (!hasExpectedDiscriminator) return null
  return decodeAccount(counter.accounts.Counter.fields, data.subarray(8))
}

async function indexAccount(address: string, data: Uint8Array) {
  const decoded = await decodeCounterData(data)
  if (decoded === null) return

  await db.insert(accounts).values({
    address,
    count: decoded.count,
    authority: decoded.authority,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: accounts.address,
    set: { count: decoded.count, updatedAt: new Date() },
  })
}
```

No separate IDL, no codegen, no manual codec. The same TypeScript definition that drives the typed client also drives the indexer.

## Pipeline specification

For every data pipeline, define:

```markdown
## Source
[RPC polling / webhook / geyser / backfill]

## Triggers
[Which accounts, events, or transactions to watch]

## Entities
[Database tables and their columns]

## Idempotency key
[What makes each record unique: signature+index, account+slot, event+index]

## Storage
[Database engine, tables, indexes]

## Decode logic
[How to transform raw on-chain bytes into typed data]

## Backfill strategy
[Start slot, checkpointing, retry on failure]

## Validation
[Decode checks, finality requirements, schema version handling]

## Monitoring
[Lag metric, failed decode count, retry count, provider error rate]
```

## Webhook processor pattern

### Architecture

```
Solana validator → Webhook provider (Helius/Triton) → HTTP POST → Your handler → Database
```

### Handler implementation

```ts
import { accountDiscriminator, decodeAccount } from "better-sol/codec"
import { counter } from "./programs/counter"

type WebhookPayload = {
  readonly transaction: { readonly slot: bigint }
  readonly meta: {
    readonly accountData: readonly {
      readonly programId: string
      readonly pubkey: string
      readonly data: string
    }[]
  }
}

async function decodeCounterData(base64Data: string) {
  const data = Buffer.from(base64Data, "base64")
  const discriminator = await accountDiscriminator("Counter")
  const isCounter = data.subarray(0, 8).every((byte, index) => byte === discriminator[index])
  if (!isCounter) return null
  return decodeAccount(counter.accounts.Counter.fields, data.subarray(8))
}

async function handleWebhook(payload: WebhookPayload): Promise<void> {
  for (const accountChange of payload.meta.accountData) {
    if (accountChange.programId !== counter.address) continue

    try {
      const decoded = await decodeCounterData(accountChange.data)
      if (decoded === null) continue

      await db.insert(accounts).values({
        address: accountChange.pubkey,
        count: decoded.count,
        authority: decoded.authority,
        slot: payload.transaction.slot,
      }).onConflictDoUpdate({
        target: accounts.address,
        set: { count: decoded.count, slot: payload.transaction.slot },
      })
    } catch (error) {
      await db.insert(failedDecodes).values({
        address: accountChange.pubkey,
        raw_data: accountChange.data,
        error: error instanceof Error ? error.message : "Unknown decode error",
        slot: payload.transaction.slot,
      })
    }
  }
}
```

### Idempotency

Every processed record must have a unique identifier. Use `signature + accountIndex` for transaction-based processing, or `accountAddress + slot` for account-based processing. On conflict, skip or update; never insert duplicates.

### Ordering guarantees

Webhook providers do not guarantee ordering. Design for out-of-order delivery:

- Use slot numbers for ordering, not arrival time
- Only overwrite if the new slot is higher than the stored slot
- Handle reorgs by tracking finality status

## RPC polling pattern

### Architecture

```
Cron job (every 30s) → RPC getProgramAccounts → Decode → Database
```

### Implementation

```ts
const results = await sol.rpc
  .getProgramAccounts(counter.address, { commitment: "confirmed" })
  .send()

for (const { pubkey } of results) {
  const decoded = await sol.counter.accounts.Counter.fetch(pubkey)
  if (decoded === null) continue
  await db.insert(accounts).values({
    address: pubkey,
    count: decoded.count,
    authority: decoded.authority,
  }).onConflictDoUpdate({
    target: accounts.address,
    set: { count: decoded.count },
  })
}
```

### Optimization

- Use `dataSlice` to fetch only the fields you need
- Paginate with `memcmp` filters for large program account sets
- Cache decoded results in memory to skip unchanged accounts
- Rate limit requests to stay under RPC provider quotas

## Backfill pattern

### Architecture

```
Script → Iterate slots from start to current → Fetch and decode → Database
```

### Implementation

```ts
const currentSlot = await sol.rpc.getSlot().send()
const results = await sol.rpc
  .getProgramAccounts(counter.address, { commitment: "finalized" })
  .send()

for (const { pubkey } of results) {
  const decoded = await sol.counter.accounts.Counter.fetch(pubkey)
  if (decoded === null) continue

  await db.insert(accounts).values({
    address: pubkey,
    count: decoded.count,
    authority: decoded.authority,
    slot: currentSlot,
  }).onConflictDoUpdate({
    target: accounts.address,
    set: { count: decoded.count, slot: currentSlot },
  })
}

await checkpoint.set("last_processed_slot", currentSlot)
```

### Checkpointing

Save the last processed slot after each batch. If the script crashes, resume from the checkpoint rather than starting over.

## Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Duplicate webhook delivery | Idempotency key conflict | Skip silently |
| Provider outage | Timeout or error response | Retry with exponential backoff, up to 5 attempts |
| Missed slots | Gap detection between last processed slot and current | Backfill from last checkpoint |
| Finality mismatch | Processed slot is later reverted | Re-check finality status before committing |
| Schema drift after program upgrade | Decode failure | Log failed decodes, alert, update schema |
| RPC rate limits | 429 response | Back off, switch to dedicated provider |
| Partial DB writes | Transaction rollback | Wrap multi-row writes in DB transaction |
| Out-of-order events | Slot comparison on write | Only overwrite if new slot > stored slot |

## Monitoring

Track these metrics for every pipeline:

- **Ingest lag**: difference between current slot and last processed slot
- **Failed decodes**: count and rate of accounts that fail to decode
- **Retry count**: how often the pipeline retries due to provider or DB errors
- **Provider errors**: count and type of upstream failures
- **Finality gaps**: slots that were processed but later reverted
- **Unexpected event rates**: spikes that may indicate a program exploit or migration

Set alerts on ingest lag exceeding 100 slots and failed decode rate exceeding 1%.

## Related

- `web3-dapp-architecture.md` for RPC strategies and WebSocket subscriptions.
- `sdk-reference.md` for Better Sol account definitions used as decoding schemas.
- `defi-deep-dive.md` for DeFi-specific indexing patterns (price feeds, LP positions).
