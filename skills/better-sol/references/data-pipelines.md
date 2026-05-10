# Data Pipeline Patterns

## Source selection

- RPC polling: low volume, simple account reads.
- Webhooks: app events, wallet tracking, moderate real-time needs.
- Geyser/indexer: high throughput or low latency.
- Backfill job: historical analytics and recovery.
- Program events/logs: state transition stream.

## Better Sol advantage

Better Sol account definitions are TypeScript schemas. Reuse the program definition as the decoding source when indexing your own program to avoid schema drift.

## Pipeline spec

```markdown
## Source
[RPC/webhook/geyser/backfill]

## Entities
- [Account/Event/Transaction]

## Idempotency key
[signature+index, account+slot, event+index]

## Storage
[DB/tables]

## Backfill
[start slot, checkpoint, retry]

## Validation
[decode checks, finality, schema version]
```

## Failure modes

- duplicate webhook delivery
- provider outage
- missed slots
- finality mismatch
- schema drift after program upgrade
- RPC rate limits
- partial DB writes
- out-of-order events

## Monitoring

Track ingest lag, failed decodes, retry count, provider errors, finality gaps, and unexpected event rates.

## Related

- `web3-dapp-architecture.md` for RPC strategies, WebSocket subscriptions, and backend patterns.
- `sdk-reference.md` for Better Sol account definitions that serve as decoding schemas.
