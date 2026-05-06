mod api;
mod compiler;
mod config;
mod error;

use crate::api::router;
use crate::config::Config;
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let subscriber = FmtSubscriber::builder().with_target(false).finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let config = Config::from_env()?;
    let state = AppState {
        config: config.clone(),
    };

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

    serve(listener, app).await?;
    Ok(())
}
