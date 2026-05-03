use crate::error::ApiError;
use crate::idl::IdlDocument;
use crate::storage::StoredArtifact;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tempfile::TempDir;
use tokio::fs;
use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CompileRequest {
    pub name: String,
    pub program_id: String,
    pub version: String,
    pub lib_rs: String,
    pub cargo_toml: Option<String>,
    pub idl: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct CompileResponse {
    pub id: String,
    pub name: String,
    pub program_id: String,
    pub source_hash: String,
    pub bytecode_hash: Option<String>,
    pub bytecode: Option<String>,
    pub size_bytes: Option<u64>,
    pub compile_time_ms: i64,
    pub logs: String,
    pub idl_url: String,
    pub artifact_url: String,
    pub source_url: String,
}

impl CompileRequest {
    pub fn validate(&self) -> Result<(), ApiError> {
        validate_name(&self.name)?;
        validate_program_id(&self.program_id)?;
        if self.version.trim().is_empty() {
            return Err(ApiError::InvalidRequest("version is required".to_string()));
        }
        if self.lib_rs.trim().is_empty() {
            return Err(ApiError::InvalidRequest(
                "lib_rs source is required".to_string(),
            ));
        }
        if self.lib_rs.len() > 1_500_000 {
            return Err(ApiError::InvalidRequest("source is too large".to_string()));
        }
        Ok(())
    }
}

pub async fn compile(
    request: CompileRequest,
    enable_build: bool,
    build_timeout: Duration,
) -> Result<(CompileResponse, StoredArtifact), ApiError> {
    let start = std::time::Instant::now();
    request.validate()?;

    let id = Uuid::new_v4().to_string();
    let source_hash = hash_hex(request.lib_rs.as_bytes());
    let idl = request.idl.map_or_else(
        || IdlDocument::placeholder(&request.name, &request.version, &request.program_id),
        |document| IdlDocument {
            name: request.name.clone(),
            version: request.version.clone(),
            program_id: request.program_id.clone(),
            document,
        },
    );

    let cargo_toml = request
        .cargo_toml
        .unwrap_or_else(|| default_cargo_toml(&request.name));

    let build = if enable_build {
        run_build(&request.lib_rs, &cargo_toml, build_timeout).await?
    } else {
        BuildOutput {
            bytecode: None,
            logs:
                "Build execution disabled. Set COMPILER_ENABLE_BUILD=true to run cargo build-sbf."
                    .to_string(),
        }
    };

    let bytecode_hash = build.bytecode.as_ref().map(|bytes| hash_hex(bytes));
    let bytecode_base64 = build.bytecode.as_ref().map(|bytes| bytes_to_base64(bytes));
    let size_bytes = build.bytecode.as_ref().map(|bytes| bytes.len() as u64);
    let compile_time_ms = start.elapsed().as_millis() as i64;

    let response = CompileResponse {
        id: id.clone(),
        name: request.name.clone(),
        program_id: request.program_id.clone(),
        source_hash: source_hash.clone(),
        bytecode_hash: bytecode_hash.clone(),
        bytecode: bytecode_base64.clone(),
        size_bytes,
        compile_time_ms,
        logs: build.logs.clone(),
        idl_url: format!("/v1/idl/{}/latest", request.program_id),
        artifact_url: format!("/v1/artifacts/{}", id),
        source_url: format!("/v1/artifacts/{}/source", id),
    };

    let artifact = StoredArtifact {
        id,
        name: request.name,
        program_id: request.program_id,
        source_hash,
        bytecode_hash,
        bytecode_base64,
        size_bytes,
        logs: build.logs,
        idl,
        rust_source: Some(request.lib_rs),
        cargo_toml: Some(cargo_toml),
    };

    Ok((response, artifact))
}

struct BuildOutput {
    bytecode: Option<Vec<u8>>,
    logs: String,
}

async fn run_build(
    lib_rs: &str,
    cargo_toml: &str,
    build_timeout: Duration,
) -> Result<BuildOutput, ApiError> {
    let dir = TempDir::new().map_err(|error| ApiError::Internal(error.to_string()))?;
    let src_dir = dir.path().join("src");
    fs::create_dir_all(&src_dir).await?;
    fs::write(src_dir.join("lib.rs"), lib_rs).await?;
    fs::write(dir.path().join("Cargo.toml"), cargo_toml).await?;

    let result = timeout(
        build_timeout,
        Command::new("cargo")
            .arg("build-sbf")
            .arg("--manifest-path")
            .arg(dir.path().join("Cargo.toml"))
            .output(),
    )
    .await
    .map_err(|_| ApiError::BuildFailed("build timed out".to_string()))?
    .map_err(|error| ApiError::BuildFailed(error.to_string()))?;

    let logs = format!(
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr),
    );

    if !result.status.success() {
        return Err(ApiError::BuildFailed(logs));
    }

    let so_path = find_so_file(dir.path()).await;
    let bytecode = match so_path {
        Some(path) => Some(
            fs::read(&path)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?,
        ),
        None => None,
    };

    Ok(BuildOutput { bytecode, logs })
}

async fn find_so_file(build_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let target_dir = build_dir.join("target").join("deploy");
    if !target_dir.exists() {
        return None;
    }
    let mut entries = fs::read_dir(&target_dir).await.ok()?;
    while let Some(entry) = entries.next_entry().await.ok()? {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "so") {
            return Some(path);
        }
    }
    None
}

fn default_cargo_toml(name: &str) -> String {
    format!(
        r#"[package]
name = "{name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "1.0.0"
"#
    )
}

fn validate_name(value: &str) -> Result<(), ApiError> {
    if value
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '_')
        && !value.is_empty()
    {
        Ok(())
    } else {
        Err(ApiError::InvalidRequest(
            "name must contain only letters, numbers, and underscores".to_string(),
        ))
    }
}

fn validate_program_id(value: &str) -> Result<(), ApiError> {
    if value.len() >= 32
        && value.len() <= 44
        && value.chars().all(|char| char.is_ascii_alphanumeric())
    {
        Ok(())
    } else {
        Err(ApiError::InvalidRequest(
            "program_id must be a base58-like public key".to_string(),
        ))
    }
}

fn hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn bytes_to_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::new();
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);
        let combined = ((first as u32) << 16) | ((second as u32) << 8) | third as u32;
        output.push(TABLE[((combined >> 18) & 63) as usize] as char);
        output.push(TABLE[((combined >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[((combined >> 6) & 63) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(combined & 63) as usize] as char
        } else {
            '='
        });
    }
    output
}
