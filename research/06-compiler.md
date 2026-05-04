# Cloud Compiler Design

Internal design doc for the compilation pipeline.

---

## Pipeline

```
Developer writes:        programs/counter.ts
                         ↓
npx @better-sol/cli deploy:
                         1. Discover programs from glob pattern
                         2. Parse TypeScript AST via ts-morph
                         3. Generate Anchor Rust (lib.rs + Cargo.toml + IDL)
                         4. POST to cloud compiler API
                         5. Server runs cargo build-sbf → .so bytecode
                         6. Returns compilation artifacts
                         ↓
Result:                  Compiled .so ready for on-chain deployment
```

For local review, `deploy --dry-run` writes generated Rust without compiling.

---

## Authentication

```bash
npx @better-sol/cli login    # Saves API key to ~/.better-sol/auth.json
```

The API key is sent as `x-api-key` header. No env var flags, no `--api-key` parameter. One path.

`BETTER_SOL_COMPILER_URL` env var overrides the compiler URL (for local development against the Rust server). Not in user-facing docs.

---

## Cloud Compiler API (apps/compiler-api)

Axum server written in Rust.

### Compile Endpoint

```
POST /v1/compile
Content-Type: application/json
x-api-key: <key>

{
  "name": "counter",
  "program_id": "CoUnTeR11111111111111111111111111111111111",
  "version": "0.1.0",
  "lib_rs": "/* generated Anchor Rust */",
  "cargo_toml": "/* generated Cargo.toml */",
  "idl": {}
}
```

Response:
```json
{
  "id": "uuid",
  "name": "counter",
  "program_id": "...",
  "source_hash": "sha256...",
  "bytecode_hash": "sha256...",
  "bytecode": "base64 .so",
  "size_bytes": 12345,
  "logs": "cargo build output",
  "idl_url": "https://...",
  "artifact_url": "https://...",
  "source_url": "https://..."
}
```

### Server Components

| File | Purpose |
|---|---|
| `main.rs` | Axum server, route registration |
| `api.rs` | `/v1/compile` handler |
| `auth.rs` | API key validation via shared secret |
| `compiler.rs` | Spawns `cargo build-sbf`, captures output |
| `config.rs` | Server config (port, storage path, shared secret) |
| `error.rs` | Error response types |
| `idl.rs` | IDL storage/retrieval |
| `storage.rs` | File-based artifact storage |

### Build Process

1. Write `lib.rs` + `Cargo.toml` to temp directory
2. Run `cargo build-sbf --features <features>` based on program needs
3. Read `.so` output from `target/deploy/`
4. Store artifacts (source, bytecode, IDL)
5. Return compilation result

---

## CLI Config

```ts
// better-sol.config.ts (optional)
import { defineConfig } from "@better-sol/cli"

export default defineConfig({
  programs: "programs/**/*.ts",
  cluster: "devnet",
  out: "generated",
})
```

All fields optional. No `keypair` field — program keys live in `.better-sol/<name>.json` (created by `create`).

---

## Program Keys

Each program gets its own keypair when scaffolded:

```bash
npx @better-sol/cli create counter
# → programs/counter.ts
# → .better-sol/counter.json  (keypair with publicKey + secretKey)
```

The public key is embedded in the generated `declare_id!()` macro. The secret key is used for program deployment (not yet wired in the deploy command).

---

## IDL Auto-Generation

The CLI generates a standard Anchor IDL alongside the Rust code. This enables ecosystem compatibility — tools using Codama, Anchor TS, or plain RPC can interact with our programs.

The IDL is generated from the parsed IR, not from the compiled `.so`. It's deterministic: same TS input → same IDL.

---

## OtterSec Verified Builds

```bash
npx @better-sol/cli verify counter
```

Submits to OtterSec's verification API with:
- Program ID (from `.better-sol/counter.json` or `--program-id`)
- Git remote + commit hash
- Library name + mount path (defaults to `generated/<name>`)

OtterSec clones the repo, builds in a deterministic Docker container, and verifies the bytecode matches the on-chain program.
