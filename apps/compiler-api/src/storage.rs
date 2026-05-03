use crate::error::ApiError;
use crate::idl::IdlDocument;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

#[derive(Clone)]
pub struct ArtifactStore {
    backend: StoreBackend,
}

#[derive(Clone)]
enum StoreBackend {
    Local(LocalStore),
    S3(S3Store),
}

#[derive(Clone)]
struct LocalStore {
    root: PathBuf,
}

#[derive(Clone)]
struct S3Store {
    client: S3Client,
    bucket: String,
    prefix: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StoredArtifact {
    pub id: String,
    pub name: String,
    pub program_id: String,
    pub source_hash: String,
    pub bytecode_hash: Option<String>,
    pub bytecode_base64: Option<String>,
    pub size_bytes: Option<u64>,
    pub logs: String,
    pub idl: IdlDocument,
    pub rust_source: Option<String>,
    pub cargo_toml: Option<String>,
}

impl ArtifactStore {
    pub async fn new_local(root: PathBuf) -> Result<Self, ApiError> {
        fs::create_dir_all(root.join("artifacts")).await?;
        fs::create_dir_all(root.join("idl")).await?;
        Ok(Self {
            backend: StoreBackend::Local(LocalStore { root }),
        })
    }

    pub async fn new_s3(client: S3Client, bucket: String, prefix: String) -> Self {
        Self {
            backend: StoreBackend::S3(S3Store {
                client,
                bucket,
                prefix,
            }),
        }
    }

    pub async fn put(&self, artifact: &StoredArtifact) -> Result<(), ApiError> {
        match &self.backend {
            StoreBackend::Local(local) => local.put(artifact).await,
            StoreBackend::S3(s3) => s3.put(artifact).await,
        }
    }

    pub async fn get_idl(&self, program_id: &str) -> Result<IdlDocument, ApiError> {
        match &self.backend {
            StoreBackend::Local(local) => local.get_idl(program_id).await,
            StoreBackend::S3(s3) => s3.get_idl(program_id).await,
        }
    }

    pub async fn get_artifact(&self, id: &str) -> Result<StoredArtifact, ApiError> {
        match &self.backend {
            StoreBackend::Local(local) => local.get_artifact(id).await,
            StoreBackend::S3(s3) => s3.get_artifact(id).await,
        }
    }

    pub async fn get_source(&self, id: &str) -> Result<String, ApiError> {
        match &self.backend {
            StoreBackend::Local(local) => local.get_source(id).await,
            StoreBackend::S3(s3) => s3.get_source(id).await,
        }
    }
}

impl LocalStore {
    async fn put(&self, artifact: &StoredArtifact) -> Result<(), ApiError> {
        let dir = self.root.join("artifacts").join(&artifact.id);
        let src_dir = dir.join("src");
        fs::create_dir_all(&src_dir).await?;
        fs::write(
            dir.join("metadata.json"),
            serde_json::to_vec_pretty(artifact)?,
        )
        .await?;

        if let Some(source) = &artifact.rust_source {
            fs::write(dir.join("src").join("lib.rs"), source).await?;
        }
        if let Some(cargo) = &artifact.cargo_toml {
            fs::write(dir.join("Cargo.toml"), cargo).await?;
        }

        let idl_dir = self.root.join("idl").join(&artifact.program_id);
        fs::create_dir_all(&idl_dir).await?;
        fs::write(
            idl_dir.join("latest.json"),
            serde_json::to_vec_pretty(&artifact.idl)?,
        )
        .await?;
        fs::write(
            idl_dir.join(format!("{}.json", artifact.source_hash)),
            serde_json::to_vec_pretty(&artifact.idl)?,
        )
        .await?;
        Ok(())
    }

    async fn get_idl(&self, program_id: &str) -> Result<IdlDocument, ApiError> {
        let path = self.root.join("idl").join(program_id).join("latest.json");
        read_json(&path).await
    }

    async fn get_artifact(&self, id: &str) -> Result<StoredArtifact, ApiError> {
        let path = self.root.join("artifacts").join(id).join("metadata.json");
        read_json(&path).await
    }

    async fn get_source(&self, id: &str) -> Result<String, ApiError> {
        let path = self
            .root
            .join("artifacts")
            .join(id)
            .join("src")
            .join("lib.rs");
        fs::read_to_string(&path).await.map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                ApiError::NotFound
            } else {
                ApiError::Internal(error.to_string())
            }
        })
    }
}

impl S3Store {
    async fn put(&self, artifact: &StoredArtifact) -> Result<(), ApiError> {
        let metadata_bytes = serde_json::to_vec_pretty(artifact)?;
        self.put_object(
            &self.artifact_key(&artifact.id, "metadata.json"),
            metadata_bytes.into(),
        )
        .await?;

        if let Some(source) = &artifact.rust_source {
            self.put_object(
                &self.artifact_key(&artifact.id, "src/lib.rs"),
                source.clone().into_bytes().into(),
            )
            .await?;
        }
        if let Some(cargo) = &artifact.cargo_toml {
            self.put_object(
                &self.artifact_key(&artifact.id, "Cargo.toml"),
                cargo.clone().into_bytes().into(),
            )
            .await?;
        }

        let idl_bytes = serde_json::to_vec_pretty(&artifact.idl)?;
        self.put_object(
            &self.idl_key(&artifact.program_id, "latest.json"),
            idl_bytes.clone().into(),
        )
        .await?;
        self.put_object(
            &self.idl_key(
                &artifact.program_id,
                &format!("{}.json", artifact.source_hash),
            ),
            idl_bytes.into(),
        )
        .await?;
        Ok(())
    }

    async fn get_idl(&self, program_id: &str) -> Result<IdlDocument, ApiError> {
        let key = self.idl_key(program_id, "latest.json");
        let bytes = self.get_object(&key).await?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    async fn get_artifact(&self, id: &str) -> Result<StoredArtifact, ApiError> {
        let key = self.artifact_key(id, "metadata.json");
        let bytes = self.get_object(&key).await?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    async fn get_source(&self, id: &str) -> Result<String, ApiError> {
        let key = self.artifact_key(id, "src/lib.rs");
        let bytes = self.get_object(&key).await?;
        String::from_utf8(bytes.to_vec()).map_err(|error| ApiError::Internal(error.to_string()))
    }

    fn artifact_key(&self, id: &str, path: &str) -> String {
        format!("{}/artifacts/{}/{}", self.prefix, id, path)
    }

    fn idl_key(&self, program_id: &str, file: &str) -> String {
        format!("{}/idl/{}/{}", self.prefix, program_id, file)
    }

    async fn put_object(&self, key: &str, body: ByteStream) -> Result<(), ApiError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(body)
            .send()
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        Ok(())
    }

    async fn get_object(&self, key: &str) -> Result<bytes::Bytes, ApiError> {
        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|error| {
                if error.to_string().contains("NoSuchKey") || error.to_string().contains("404") {
                    ApiError::NotFound
                } else {
                    ApiError::Internal(error.to_string())
                }
            })?;
        response
            .body
            .collect()
            .await
            .map(|data| data.into_bytes())
            .map_err(|error| ApiError::Internal(error.to_string()))
    }
}

async fn read_json<T: for<'de> Deserialize<'de>>(path: &std::path::Path) -> Result<T, ApiError> {
    let bytes = fs::read(path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ApiError::NotFound
        } else {
            ApiError::Internal(error.to_string())
        }
    })?;
    Ok(serde_json::from_slice(&bytes)?)
}
