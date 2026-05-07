# Better Sol Compiler API

Cloud compilation service for Better Sol. Accepts generated Anchor Rust, runs `cargo build-sbf`, stores artifacts and IDLs.

This is an internal service. The CLI communicates with it during `deploy`. You do not need to run this yourself unless you are self-hosting.

## Architecture

The compiler API is a stateless compilation service. It has no database and no user management.

```
User ──→ Website API (users, API keys, rate limits)
              │
              └──→ Compiler API (this service)
                     Compiles code, stores artifacts
```

- The **website API** owns users, API keys, rate limits, and compilation history
- The **compiler API** only compiles code and stores artifacts
- Auth is delegated to the website API via HTTP

## Authentication

All compile requests require an `x-api-key` header.

### Dev mode: shared secret

Set `COMPILER_SHARED_SECRET` for local development. Any request with a matching key is accepted with unlimited rate.

```bash
COMPILER_SHARED_SECRET=bs_dev_secret_key cargo run
```

### Production: delegated auth

Set `COMPILER_AUTH_API_URL` to the website API base URL. The compiler API calls:

```
GET {AUTH_API_URL}/internal/validate-key?key={api_key}
→ { user_id, rate_limit_per_hour, compilations_used }
```

After successful compilation:

```
POST {AUTH_API_URL}/internal/record-compilation
→ { user_id, program_name, program_id, artifact_id, source_hash, status, duration_ms }
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/v1/compile` | Yes | Compile Anchor Rust to `.so` bytecode |
| GET | `/v1/idl/{program_id}/latest` | No | Get latest IDL for a program |
| GET | `/v1/artifacts/{id}` | No | Get artifact metadata |
| GET | `/v1/artifacts/{id}/source` | No | Get raw Rust source |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `COMPILER_API_PORT` | `8080` | Server port |
| `COMPILER_STORAGE_BACKEND` | `local` | `local` or `s3` |
| `COMPILER_ARTIFACT_DIR` | `./data/artifacts` | Local artifact storage |
| `COMPILER_S3_BUCKET` | `better-sol-artifacts` | S3 bucket (s3 backend) |
| `COMPILER_S3_PREFIX` | `v1` | S3 key prefix |
| `COMPILER_AUTH_API_URL` | (none) | Website API URL for delegated auth |
| `COMPILER_SHARED_SECRET` | (none) | Dev mode shared secret |
| `COMPILER_ENABLE_BUILD` | `false` | Enable `cargo build-sbf` execution |
| `COMPILER_MAX_BODY_BYTES` | `2097152` | Max request body size (2 MB) |
| `COMPILER_REQUEST_TIMEOUT_SECONDS` | `30` | HTTP request timeout |
| `COMPILER_BUILD_TIMEOUT_SECONDS` | `120` | `cargo build-sbf` timeout |

## License

MIT
