use crate::AppState;
use crate::auth::Authenticated;
use crate::compiler::{CompileRequest, compile};
use crate::error::ApiError;
use crate::idl::IdlDocument;
use crate::storage::StoredArtifact;
use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/compile", post(compile_handler))
        .route("/v1/idl/{program_id}/latest", get(idl_handler))
        .route("/v1/artifacts/{id}", get(artifact_handler))
        .route("/v1/artifacts/{id}/source", get(source_handler))
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

#[derive(Serialize)]
struct CompileResult {
    id: String,
    name: String,
    program_id: String,
    source_hash: String,
    bytecode_hash: Option<String>,
    bytecode: Option<String>,
    size_bytes: Option<u64>,
    compile_time_ms: i64,
    logs: String,
    idl_url: String,
    artifact_url: String,
    source_url: String,
    user_id: String,
}

async fn compile_handler(
    State(state): State<AppState>,
    Authenticated { user }: Authenticated,
    Json(request): Json<CompileRequest>,
) -> Result<Json<CompileResult>, ApiError> {
    let start = std::time::Instant::now();

    let (response, artifact) = compile(
        request,
        state.config.enable_build,
        state.config.build_timeout,
    )
    .await?;

    state.store.put(&artifact).await?;

    let duration_ms = start.elapsed().as_millis() as i64;

    if let Some(auth_url) = &state.config.auth_api_url {
        let _ = record_compilation(auth_url, &user.user_id, &response, duration_ms).await;
    }

    Ok(Json(CompileResult {
        id: response.id,
        name: response.name,
        program_id: response.program_id,
        source_hash: response.source_hash,
        bytecode_hash: response.bytecode_hash,
        bytecode: response.bytecode,
        size_bytes: response.size_bytes,
        compile_time_ms: response.compile_time_ms,
        logs: response.logs,
        idl_url: response.idl_url,
        artifact_url: response.artifact_url,
        source_url: response.source_url,
        user_id: user.user_id,
    }))
}

async fn idl_handler(
    State(state): State<AppState>,
    Path(program_id): Path<String>,
) -> Result<Json<IdlDocument>, ApiError> {
    Ok(Json(state.store.get_idl(&program_id).await?))
}

async fn artifact_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<StoredArtifact>, ApiError> {
    Ok(Json(state.store.get_artifact(&id).await?))
}

async fn source_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let source = state.store.get_source(&id).await?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "text/rust; charset=utf-8")],
        source,
    )
        .into_response())
}

async fn record_compilation(
    auth_url: &str,
    user_id: &str,
    result: &crate::compiler::CompileResponse,
    duration_ms: i64,
) -> Result<(), ApiError> {
    let client = reqwest::Client::new();
    client
        .post(format!("{auth_url}/internal/record-compilation"))
        .json(&serde_json::json!({
            "user_id": user_id,
            "program_name": result.name,
            "program_id": result.program_id,
            "artifact_id": result.id,
            "source_hash": result.source_hash,
            "status": "success",
            "duration_ms": duration_ms,
        }))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|error| ApiError::Internal(format!("failed to record compilation: {error}")))?;
    Ok(())
}
