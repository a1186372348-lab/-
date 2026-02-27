use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WeatherCache {
    pub condition: String, // "sunny" | "rainy" | "cloudy"
    pub updated_at: String,
    pub description: String,
}

#[tauri::command]
pub async fn get_weather_cache() -> Result<WeatherCache, String> {
    // 占位：实际由前端通过 SQL 插件读取缓存
    Ok(WeatherCache {
        condition: "cloudy".to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        description: "多云".to_string(),
    })
}
