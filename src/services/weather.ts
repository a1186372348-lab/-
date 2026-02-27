import { WeatherCondition } from '../types';
import { getSetting, saveWeatherCache, loadWeatherCache } from './db';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1小时

function mapWeatherId(weatherId: number): WeatherCondition {
  if (weatherId === 800) return 'sunny';
  if (weatherId >= 500 && weatherId < 600) return 'rainy';
  if (weatherId >= 200 && weatherId < 400) return 'rainy'; // 雷雨
  return 'cloudy';
}

export async function fetchWeather(): Promise<WeatherCondition> {
  // 先读缓存
  const cache = await loadWeatherCache();
  if (cache) {
    const age = Date.now() - new Date(cache.updated_at).getTime();
    if (age < CACHE_TTL_MS) {
      return cache.condition as WeatherCondition;
    }
  }

  const apiKey = await getSetting('weather_api_key');
  const city = (await getSetting('weather_city')) ?? 'Beijing';

  if (!apiKey) return 'cloudy';

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
    );
    const data = await res.json();
    const weatherId: number = data.weather?.[0]?.id ?? 801;
    const condition = mapWeatherId(weatherId);

    await saveWeatherCache(condition, JSON.stringify(data));
    return condition;
  } catch {
    return cache ? (cache.condition as WeatherCondition) : 'cloudy';
  }
}

// 定时每小时刷新一次
export function startWeatherSync(
  onUpdate: (condition: WeatherCondition) => void
) {
  const run = async () => {
    const condition = await fetchWeather();
    onUpdate(condition);
  };

  run();
  return setInterval(run, CACHE_TTL_MS);
}
