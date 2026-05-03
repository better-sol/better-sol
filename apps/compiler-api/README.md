# Better Sol Compiler API

Cloud compilation service for Better Sol. Accepts generated Anchor Rust, runs `cargo build-sbf`, stores artifacts and IDLs.

## Architecture

The compiler API is a **stateless compilation service**. It has zero database code and zero user management.

```
User → Website API (TanStack Start + Drizzle + Postgres)
         ↑                              ↓
    Users, API keys,              Compiler API (this service)
    rate limits, history            Compile only
                                    Store artifacts
```

- The **website API** owns users, API keys, rate limits, compilation history
- The **compiler API** only compiles code and stores artifacts
- Auth is delegated to the website API via HTTP

## Authentication

All compile requests need an `x-api-key` header.

### Dev Mode: Shared Secret

Set `COMPILER_SHARED_SECRET` for local/hackathon development. Any request with a matching key is accepted with unlimited rate.

```bash
COMPILER_SHARED_SECRET=bs_dev_secret_key cargo run
# curl -H 'x-api-key: bs_dev_secret_key' ...
```

### Production: Delegated Auth

Set `COMPILER_AUTH_API_URL` to the website API base URL. The compiler API calls:

```
GET {AUTH_API_URL}/internal/validate-key?key={api_key}
→ { user_id, rate_limit_per_hour, compilations_used }
```

After successful compilation, the compiler API notifies:

```
POST {AUTH_API_URL}/internal/record-compilation
→ { user_id, program_name, program_id, artifact_id, source_hash, status, duration_ms }
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/v1/compile` | Yes | Compile Anchor Rust → .so bytecode |
| GET | `/v1/idl/{program_id}/latest` | No | Get latest IDL for a program |
| GET | `/v1/artifacts/{id}` | No | Get stored artifact metadata |
| GET | `/v1/artifacts/{id}/source` | No | Get raw Rust source |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPILER_API_PORT` | 8080 | Server port |
| `COMPILER_STORAGE_BACKEND` | local | `local` or `s3` |
| `COMPILER_ARTIFACT_DIR` | ./data/artifacts | Local artifact storage |
| `COMPILER_S3_BUCKET` | better-sol-artifacts | S3 bucket (s3 backend) |
| `COMPILER_S3_PREFIX` | v1 | S3 key prefix |
| `COMPILER_AUTH_API_URL` | | Website API URL for delegated auth |
| `COMPILER_SHARED_SECRET` | | Dev mode shared secret (bypasses auth API) |
| `COMPILER_ENABLE_BUILD` | false | Enable `cargo build-sbf` execution |
| `COMPILER_MAX_BODY_BYTES` | 2097152 | Max request body size |
| `COMPILER_REQUEST_TIMEOUT_SECONDS` | 30 | HTTP request timeout |
| `COMPILER_BUILD_TIMEOUT_SECONDS` | 120 | `cargo build-sbf` timeout |
