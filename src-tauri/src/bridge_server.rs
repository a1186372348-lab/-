use axum::{extract::State, routing::post, Json, Router};
use serde::Deserialize;
use std::net::SocketAddr;
use tauri::{AppHandle, Emitter};
use tower_http::cors::{Any, CorsLayer};

#[derive(Debug, Deserialize)]
pub struct ClaudeEvent {
    pub hook_event_name: Option<String>,
    pub tool_name: Option<String>,
    // 其余字段按需忽略
    #[serde(flatten)]
    pub _rest: serde_json::Value,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let router = Router::new()
            .route("/claude-event", post(handle_claude_event))
            .layer(cors)
            .with_state(app);

        let addr = SocketAddr::from(([127, 0, 0, 1], 3456));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[bridge] 绑定端口失败: {e}");
                return;
            }
        };

        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("[bridge] 服务异常: {e}");
        }
    });
}

async fn handle_claude_event(
    State(app): State<AppHandle>,
    Json(event): Json<ClaudeEvent>,
) -> Json<serde_json::Value> {
    let event_name = event.hook_event_name.as_deref().unwrap_or("unknown");
    let tool_name = event.tool_name.as_deref().unwrap_or("");

    // 向所有窗口广播 cc-event
    let payload = serde_json::json!({
        "event": event_name,
        "tool": tool_name,
    });
    let _ = app.emit("cc-event", payload);

    Json(serde_json::json!({ "ok": true }))
}
