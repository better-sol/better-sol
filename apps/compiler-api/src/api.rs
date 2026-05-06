use crate::AppState;
use crate::compiler::{compile, CompileRequest};
use crate::error::ApiError;
use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/compile", post(compile_handler))
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

#[derive(Deserialize)]
struct CompileInput {
    name: String,
    program_id: String,
    version: String,
    lib_rs: String,
    cargo_toml: Option<String>,
}

#[derive(Serialize)]
struct CompileResponse {
    status: &'static str,
    compile_time_ms: i64,
    bytecode: Option<String>,
    cargo_toml: String,
    logs: String,
}

async fn compile_handler(
    State(state): State<AppState>,
    Json(input): Json<CompileInput>,
) -> Result<Json<CompileResponse>, ApiError> {
    let start = std::time::Instant::now();

    let request = CompileRequest {
        name: input.name,
        program_id: input.program_id,
        version: input.version,
        lib_rs: input.lib_rs,
        cargo_toml: input.cargo_toml,
    };

    let output = compile(
        request,
        state.config.enable_build,
        state.config.build_timeout,
    )
    .await?;

    let duration_ms = start.elapsed().as_millis() as i64;
    let status = if output.bytecode.is_some() {
        "success"
    } else {
        "failed"
    };

    Ok(Json(CompileResponse {
        status,
        compile_time_ms: duration_ms,
        bytecode: output.bytecode,
        cargo_toml: output.cargo_toml,
        logs: output.logs,
    }))
}
