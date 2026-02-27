use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub priority: String,
    pub is_completed: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub last_reminded_at: Option<String>,
}

// 待办 CRUD 由前端通过 tauri-plugin-sql JS API 直接操作 SQLite
// 以下 commands 为 Rust 侧扩展预留入口

#[tauri::command]
pub async fn get_todos() -> Result<Vec<Todo>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn create_todo(title: String, priority: String) -> Result<String, String> {
    Ok(format!("{}-{}", title, priority))
}

#[tauri::command]
pub async fn update_todo_status(id: String, is_completed: bool) -> Result<(), String> {
    let _ = (id, is_completed);
    Ok(())
}

#[tauri::command]
pub async fn delete_todo(id: String) -> Result<(), String> {
    let _ = id;
    Ok(())
}
