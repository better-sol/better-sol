use std::env;
use std::time::Duration;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub max_body_bytes: usize,
    pub request_timeout: Duration,
    pub build_timeout: Duration,
    pub enable_build: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            port: env_u16("COMPILER_API_PORT", 8080)?,
            max_body_bytes: env_usize("COMPILER_MAX_BODY_BYTES", 2 * 1024 * 1024)?,
            request_timeout: Duration::from_secs(
                env_u64("COMPILER_REQUEST_TIMEOUT_SECONDS", 30)?,
            ),
            build_timeout: Duration::from_secs(env_u64(
                "COMPILER_BUILD_TIMEOUT_SECONDS",
                120,
            )?),
            enable_build: env_bool("COMPILER_ENABLE_BUILD", false),
        })
    }
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
