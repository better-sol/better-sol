use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct IdlDocument {
    pub name: String,
    pub version: String,
    pub program_id: String,
    pub document: Value,
}

impl IdlDocument {
    pub fn placeholder(name: &str, version: &str, program_id: &str) -> Self {
        Self {
            name: name.to_string(),
            version: version.to_string(),
            program_id: program_id.to_string(),
            document: serde_json::json!({
                "version": version,
                "name": name,
                "address": program_id,
                "instructions": [],
                "accounts": [],
                "errors": []
            }),
        }
    }
}
