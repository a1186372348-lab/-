use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{CorsLayer, Any};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    pub action: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInputRequest {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEvent {
    pub hook_event_name: String,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
}

#[derive(Clone)]
struct AppState {
    // OpenClaw → 云朵（回复消息）
    pending_tasks: Arc<Mutex<Vec<TaskRequest>>>,
    // 云朵 → OpenClaw（用户输入）
    pending_inputs: Arc<Mutex<Vec<UserInputRequest>>>,
    // Claude Code Hooks → 云朵（工作状态事件）
    pending_claude_events: Arc<Mutex<Vec<ClaudeEvent>>>,
}

// 健康检查
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "cloudpet-bridge"
    }))
}

// OpenClaw MCP Server 提交回复给云朵
async fn submit_task(
    State(state): State<AppState>,
    Json(task): Json<TaskRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    let mut tasks = state.pending_tasks.lock().await;
    tasks.push(task);

    Ok(Json(TaskResponse {
        success: true,
        message: "任务已接收".to_string(),
        data: None,
    }))
}

// 云朵前端获取待处理回复
async fn get_tasks(State(state): State<AppState>) -> Json<Vec<TaskRequest>> {
    let mut tasks = state.pending_tasks.lock().await;
    let result = tasks.clone();
    tasks.clear();
    Json(result)
}

// 云朵前端提交用户输入，等待 OpenClaw 处理
async fn submit_user_input(
    State(state): State<AppState>,
    Json(input): Json<UserInputRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    let mut inputs = state.pending_inputs.lock().await;
    inputs.push(input);

    Ok(Json(TaskResponse {
        success: true,
        message: "消息已接收".to_string(),
        data: None,
    }))
}

// MCP Server 轮询获取用户输入
async fn get_user_input(State(state): State<AppState>) -> Json<Vec<UserInputRequest>> {
    let mut inputs = state.pending_inputs.lock().await;
    let result = inputs.clone();
    inputs.clear();
    Json(result)
}

// Claude Code Hooks 推送工作状态事件
async fn submit_claude_event(
    State(state): State<AppState>,
    Json(event): Json<ClaudeEvent>,
) -> Result<Json<TaskResponse>, StatusCode> {
    let mut events = state.pending_claude_events.lock().await;
    events.push(event);

    Ok(Json(TaskResponse {
        success: true,
        message: "事件已接收".to_string(),
        data: None,
    }))
}

// 云朵前端轮询获取 Claude Code 事件
async fn get_claude_events(State(state): State<AppState>) -> Json<Vec<ClaudeEvent>> {
    let mut events = state.pending_claude_events.lock().await;
    let result = events.clone();
    events.clear();
    Json(result)
}

// 查询 OpenClaw cron 任务是否在运行，返回进度
async fn get_task_progress() -> Json<serde_json::Value> {
    let output = tokio::process::Command::new("wsl")
        .args(["/home/yang/.npm-global/bin/openclaw", "sessions"])
        .output()
        .await;

    let is_running = match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.contains("cron:")
        }
        Err(_) => false,
    };

    Json(serde_json::json!({ "running": is_running }))
}

pub async fn start_bridge_server() -> Result<(), Box<dyn std::error::Error>> {
    let state = AppState {
        pending_tasks: Arc::new(Mutex::new(Vec::new())),
        pending_inputs: Arc::new(Mutex::new(Vec::new())),
        pending_claude_events: Arc::new(Mutex::new(Vec::new())),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/task", post(submit_task))
        .route("/tasks", get(get_tasks))
        .route("/user-input", post(submit_user_input))
        .route("/user-input", get(get_user_input))
        .route("/claude-event", post(submit_claude_event))
        .route("/claude-events", get(get_claude_events))
        .route("/task-progress", get(get_task_progress))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3456").await?;
    println!("[Bridge] HTTP 服务器启动在 http://127.0.0.1:3456");

    axum::serve(listener, app).await?;
    Ok(())
}
