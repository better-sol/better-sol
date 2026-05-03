mod api;
mod auth;
mod compiler;
mod config;
mod error;
mod idl;
mod storage;

use crate::api::router;
use crate::config::{Config, StorageBackend};
use crate::storage::ArtifactStore;
use axum::serve;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::FmtSubscriber;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub store: ArtifactStore,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let subscriber = FmtSubscriber::builder().with_target(false).finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let config = Config::from_env()?;

    let artifact_dir = std::path::PathBuf::from(
        std::env::var("COMPILER_ARTIFACT_DIR")
            .unwrap_or_else(|_| "./data/artifacts".to_string()),
    );

    let store = match config.storage_backend {
        StorageBackend::Local => ArtifactStore::new_local(artifact_dir).await?,
        StorageBackend::S3 => {
            let aws_config = aws_config::from_env().load().await;
            let client = aws_sdk_s3::Client::new(&aws_config);
            ArtifactStore::new_s3(client, config.s3_bucket.clone(), config.s3_prefix.clone()).await
        }
    };

    let state = AppState { config: config.clone(), store };

    let app = router(state)
        .layer(RequestBodyLimitLayer::new(config.max_body_bytes))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            config.request_timeout,
        ))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let address = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(address).await?;

    info!("compiler-api listening on {}", address);
    info!("storage backend: {:?}", config.storage_backend);

    if config.auth_api_url.is_some() {
        info!("auth: delegated to {}", config.auth_api_url.as_deref().unwrap());
    } else if config.shared_secret.is_some() {
        info!("auth: shared secret (dev mode)");
    } else {
        info!("auth: none configured — compile endpoint will reject all requests");
    }

    serve(listener, app).await?;
    Ok(())
}
