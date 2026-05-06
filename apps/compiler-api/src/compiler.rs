use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tempfile::TempDir;
use tokio::fs;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Deserialize)]
pub struct CompileRequest {
    pub name: String,
    pub program_id: String,
    pub version: String,
    pub lib_rs: String,
    pub cargo_toml: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompileOutput {
    pub bytecode: Option<String>,
    pub cargo_toml: String,
    pub logs: String,
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
) -> Result<CompileOutput, ApiError> {
    request.validate()?;

    let cargo_toml = request
        .cargo_toml
        .unwrap_or_else(|| default_cargo_toml(&request.name));

    let (bytecode, logs) = if enable_build {
        let output = run_build(&request.lib_rs, &cargo_toml, build_timeout).await?;
        (output.bytecode, output.logs)
    } else {
        (
            None,
            "Build execution disabled. Set COMPILER_ENABLE_BUILD=true to run cargo build-sbf."
                .to_string(),
        )
    };

    Ok(CompileOutput {
        bytecode,
        cargo_toml,
        logs,
    })
}

struct BuildOutput {
    bytecode: Option<String>,
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
                .map(|bytes| bytes_to_base64(&bytes))?,
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
anchor-lang = "1.0.2"
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
