use std::env;
use std::time::Duration;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub storage_backend: StorageBackend,
    pub s3_bucket: String,
    pub s3_prefix: String,
    pub max_body_bytes: usize,
    pub request_timeout: Duration,
    pub build_timeout: Duration,
    pub enable_build: bool,
    pub auth_api_url: Option<String>,
    pub shared_secret: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageBackend {
    Local,
    S3,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let backend_str = env_string("COMPILER_STORAGE_BACKEND", "local");
        let backend = match backend_str.as_str() {
            "s3" => StorageBackend::S3,
            _ => StorageBackend::Local,
        };

        Ok(Self {
            port: env_u16("COMPILER_API_PORT", 8080)?,
            storage_backend: backend,
            s3_bucket: env_string("COMPILER_S3_BUCKET", "better-sol-artifacts"),
            s3_prefix: env_string("COMPILER_S3_PREFIX", "v1"),
            max_body_bytes: env_usize("COMPILER_MAX_BODY_BYTES", 2 * 1024 * 1024)?,
            request_timeout: Duration::from_secs(
                env_u64("COMPILER_REQUEST_TIMEOUT_SECONDS", 30)?,
            ),
            build_timeout: Duration::from_secs(env_u64(
                "COMPILER_BUILD_TIMEOUT_SECONDS",
                120,
            )?),
            enable_build: env_bool("COMPILER_ENABLE_BUILD", false),
            auth_api_url: env::var("COMPILER_AUTH_API_URL")
                .ok()
                .filter(|value| !value.is_empty()),
            shared_secret: env::var("COMPILER_SHARED_SECRET")
                .ok()
                .filter(|value| !value.is_empty()),
        })
    }
}

fn env_string(name: &str, fallback: &str) -> String {
    env::var(name).unwrap_or_else(|_| fallback.to_string())
}

fn env_u16(name: &str, fallback: u16) -> anyhow::Result<u16> {
    Ok(env::var(name).map_or(Ok(fallback), |value| value.parse())?)
}

fn env_u64(name: &str, fallback: u64) -> anyhow::Result<u64> {
    Ok(env::var(name).map_or(Ok(fallback), |value| value.parse())?)
}

fn env_usize(name: &str, fallback: usize) -> anyhow::Result<usize> {
    Ok(env::var(name).map_or(Ok(fallback), |value| value.parse())?)
}

fn env_bool(name: &str, fallback: bool) -> bool {
    env::var(name).map_or(fallback, |value| {
        value == "1" || value.eq_ignore_ascii_case("true")
    })
}
