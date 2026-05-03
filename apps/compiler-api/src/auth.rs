use crate::AppState;
use crate::error::ApiError;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct ValidatedUser {
    pub user_id: String,
    pub rate_limit_per_hour: i64,
    pub compilations_used: i64,
}

pub struct Authenticated {
    pub user: ValidatedUser,
}

impl FromRequestParts<AppState> for Authenticated {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let api_key = parts
            .headers
            .get("x-api-key")
            .and_then(|value| value.to_str().ok())
            .ok_or(ApiError::Unauthorized)?;

        if let Some(shared_secret) = &state.config.shared_secret
            && api_key == shared_secret
        {
            return Ok(Self {
                user: ValidatedUser {
                    user_id: "dev".to_string(),
                    rate_limit_per_hour: i64::MAX,
                    compilations_used: 0,
                },
            });
        }

        let auth_url = state
            .config
            .auth_api_url
            .as_ref()
            .ok_or(ApiError::Unauthorized)?;

        let client = reqwest::Client::new();
        let response = client
            .get(format!("{}/internal/validate-key?key={}", auth_url, api_key))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|error| {
                ApiError::Internal(format!("auth service unreachable: {error}"))
            })?;

        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(ApiError::RateLimited {
                limit: 0,
                remaining: 0,
                reset_in_seconds: 3600,
            });
        }

        if !response.status().is_success() {
            return Err(ApiError::Unauthorized);
        }

        let user: ValidatedUser = response
            .json()
            .await
            .map_err(|error| ApiError::Internal(format!("auth response invalid: {error}")))?;

        if user.compilations_used >= user.rate_limit_per_hour {
            return Err(ApiError::RateLimited {
                limit: user.rate_limit_per_hour,
                remaining: 0,
                reset_in_seconds: 3600,
            });
        }

        Ok(Self { user })
    }
}
