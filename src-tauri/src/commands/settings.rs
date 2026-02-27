#[tauri::command]
pub async fn get_setting(_key: String) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub async fn set_setting(_key: String, _value: String) -> Result<(), String> {
    Ok(())
}
