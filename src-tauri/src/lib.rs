mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::todo::get_todos,
            commands::todo::create_todo,
            commands::todo::update_todo_status,
            commands::todo::delete_todo,
            commands::weather::get_weather_cache,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::system::sample_pixel_color,
        ])
        .setup(|app| {
            db::init(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
