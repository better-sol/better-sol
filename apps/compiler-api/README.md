# Better Sol Compiler API

Cloud compilation service for Better Sol. Accepts generated Anchor Rust, runs `cargo build-sbf`, and returns compiled bytecode.

This is an internal service. The CLI communicates with it during `deploy`. You do not need to run this yourself unless you are self-hosting.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/compile` | Compile Anchor Rust to `.so` bytecode |

### `POST /compile`

Requires `x-api-key` header matching `COMPILER_API_KEY`. Returns 401 if missing or incorrect.

Accepts a JSON body:

```json
{
  "name": "counter",
  "programId": "91eZUq6pokUtTcucXV1BVCAaarMy7EiHWv3SogYNZ7xs",
  "version": "0.1.0",
  "libRs": "...",
  "cargoToml": "..."
}
```

Returns:

```json
{
  "status": "success",
  "compileTimeMs": 4523,
  "bytecode": "base64...",
  "cargoToml": "...",
  "logs": "..."
}
```

`status` is `"success"` or `"failed"`. `bytecode` is `null` when the build is disabled or fails.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server port |
| `MAX_BODY_BYTES` | `2097152` | Max request body size (2 MB) |
| `REQUEST_TIMEOUT_SECS` | `30` | HTTP request timeout |
| `BUILD_TIMEOUT_SECS` | `120` | `cargo build-sbf` timeout |
| `ENABLE_BUILD` | `false` | Set to `true` to actually run `cargo build-sbf` |
| `COMPILER_API_KEY` | (required) | API key for authenticating requests via `x-api-key` header |

When `ENABLE_BUILD` is `false`, requests succeed without compiling and return `status: "failed"` with `bytecode: null`. This is the default for development. Set to `true` in production.

## License

MIT
