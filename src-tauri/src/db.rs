use tauri::AppHandle;

pub fn init(_app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // SQLite 初始化由 tauri-plugin-sql 的 JS 端 Migration 负责
    // 此处预留 Rust 侧扩展入口
    Ok(())
}
