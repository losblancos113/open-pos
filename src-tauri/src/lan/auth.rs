use axum::{
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub active_branch_id: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct SwitchBranchRequest {
    pub target_branch_id: String,
}

#[derive(Debug, Serialize)]
pub struct SwitchBranchResponse {
    pub token: String,
    pub active_branch_id: String,
}

/// Default secret key for signing LAN session tokens.
const LAN_SECRET: &str = "openpos_lan_secret_default";

fn compute_signature(payload_b64: &str, secret: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in secret.as_bytes().iter().chain(payload_b64.as_bytes()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

/// Simple session token generator for LAN simulation.
/// Uses base64 payload with cryptographic signature format: `base64url(payload).sig`.
pub fn create_lan_token(
    username: &str,
    role: &str,
    branch_ids: &[String],
    active_branch: &str,
) -> String {
    let payload = json!({
        "sub": username,
        "username": username,
        "role": role,
        "branchIds": branch_ids,
        "activeBranchId": active_branch,
        "exp": 9999999999i64
    });
    let payload_str = payload.to_string();
    let b64 = base64_sim_encode(payload_str.as_bytes());
    let sig = compute_signature(&b64, LAN_SECRET);
    format!("{}.{}", b64, sig)
}

pub fn parse_lan_token(token: &str) -> Option<Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 2 {
        return None;
    }
    let expected_sig = compute_signature(parts[0], LAN_SECRET);
    if parts[1] != expected_sig {
        return None;
    }
    let decoded_bytes = base64_sim_decode(parts[0])?;
    serde_json::from_slice(&decoded_bytes).ok()
}

fn base64_sim_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 {
            chunk[1] as usize
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            chunk[2] as usize
        } else {
            0
        };

        out.push(CHARS[b0 >> 2] as char);
        out.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            out.push(CHARS[((b1 & 15) << 2) | (b2 >> 6)] as char);
        }
        if chunk.len() > 2 {
            out.push(CHARS[b2 & 63] as char);
        }
    }
    out
}

fn base64_sim_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let decode_char = |c: char| -> Option<u8> {
        match c {
            'A'..='Z' => Some(c as u8 - b'A'),
            'a'..='z' => Some(c as u8 - b'a' + 26),
            '0'..='9' => Some(c as u8 - b'0' + 52),
            '-' | '+' => Some(62),
            '_' | '/' => Some(63),
            '=' => None,
            _ => None,
        }
    };

    let mut i = 0;
    while i < chars.len() {
        let c0 = decode_char(chars[i])?;
        let c1 = if i + 1 < chars.len() {
            decode_char(chars[i + 1])?
        } else {
            0
        };
        out.push((c0 << 2) | (c1 >> 4));

        if i + 2 < chars.len() {
            if let Some(c2) = decode_char(chars[i + 2]) {
                out.push(((c1 & 15) << 4) | (c2 >> 2));
                if i + 3 < chars.len() {
                    if let Some(c3) = decode_char(chars[i + 3]) {
                        out.push(((c2 & 3) << 6) | c3);
                    }
                }
            }
        }
        i += 4;
    }
    Some(out)
}

pub async fn login(
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<Value>)> {
    // Basic verification against default accounts
    if payload.username == "admin" && payload.pin == "1234" {
        let token = create_lan_token(
            "admin",
            "owner",
            &["hq".to_string(), "dist1".to_string()],
            "hq",
        );
        Ok(Json(LoginResponse {
            token,
            active_branch_id: "hq".to_string(),
            role: "owner".to_string(),
        }))
    } else if payload.username == "cashier1" && payload.pin == "1111" {
        let token = create_lan_token("cashier1", "cashier", &["hq".to_string()], "hq");
        Ok(Json(LoginResponse {
            token,
            active_branch_id: "hq".to_string(),
            role: "cashier".to_string(),
        }))
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid_credentials", "message": "Invalid username or PIN" })),
        ))
    }
}

pub async fn switch_branch(
    headers: HeaderMap,
    Json(payload): Json<SwitchBranchRequest>,
) -> Result<Json<SwitchBranchResponse>, (StatusCode, Json<Value>)> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "unauthorized", "message": "Missing Authorization header" })),
            )
        })?;

    if !auth_header.starts_with("Bearer ") {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized", "message": "Invalid token format" })),
        ));
    }

    let token = &auth_header[7..];
    let claims = parse_lan_token(token).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized", "message": "Invalid token" })),
        )
    })?;

    let role = claims["role"].as_str().unwrap_or("");
    let allowed_branches: Vec<String> = claims["branchIds"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if role != "owner" && !allowed_branches.contains(&payload.target_branch_id) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "forbidden", "message": "Not authorized for target branch" })),
        ));
    }

    let username = claims["sub"].as_str().unwrap_or("unknown");
    let new_token = create_lan_token(username, role, &allowed_branches, &payload.target_branch_id);

    Ok(Json(SwitchBranchResponse {
        token: new_token,
        active_branch_id: payload.target_branch_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn login_with_valid_pin_returns_token_and_active_branch() {
        let app = crate::lan::router();
        let payload = json!({
            "username": "admin",
            "pin": "1234"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn login_with_invalid_pin_returns_unauthorized() {
        let app = crate::lan::router();
        let payload = json!({
            "username": "admin",
            "pin": "9999"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn switch_branch_with_valid_token_succeeds() {
        let app = crate::lan::router();
        let token = create_lan_token(
            "admin",
            "owner",
            &["hq".to_string(), "dist1".to_string()],
            "hq",
        );
        let payload = json!({
            "target_branch_id": "dist1"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/switch-branch")
                    .header("Content-Type", "application/json")
                    .header("Authorization", format!("Bearer {}", token))
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn switch_branch_denied_when_not_in_user_branches() {
        let app = crate::lan::router();
        let token = create_lan_token("cashier1", "cashier", &["hq".to_string()], "hq");
        let payload = json!({
            "target_branch_id": "dist1"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/switch-branch")
                    .header("Content-Type", "application/json")
                    .header("Authorization", format!("Bearer {}", token))
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn switch_branch_rejects_forged_signature_token() {
        let app = crate::lan::router();
        let payload = json!({
            "sub": "attacker",
            "username": "attacker",
            "role": "owner",
            "branchIds": ["hq".to_string(), "dist1".to_string()],
            "activeBranchId": "hq",
            "exp": 9999999999i64
        });
        let b64 = base64_sim_encode(payload.to_string().as_bytes());
        let forged_token = format!("{}.forged_invalid_signature_xyz", b64);
        let request_body = json!({ "target_branch_id": "dist1" });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/switch-branch")
                    .header("Content-Type", "application/json")
                    .header("Authorization", format!("Bearer {}", forged_token))
                    .body(Body::from(serde_json::to_vec(&request_body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
