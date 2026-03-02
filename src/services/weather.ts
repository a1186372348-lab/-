import { WeatherCondition } from '../types';
import { saveWeatherCache, loadWeatherCache } from './db';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1小时

// Open-Meteo WMO 天气码 → 云宝状态
// https://open-meteo.com/en/docs#weathervariables
function mapWmoCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return 'sunny';               // 晴、基本晴
  if (code >= 51 && code <= 67) return 'rainy';               // 毛毛雨、雨
  if (code >= 71 && code <= 77) return 'rainy';               // 雪（视为阴雨）
  if (code >= 80 && code <= 82) return 'rainy';               // 阵雨
  if (code >= 95 && code <= 99) return 'rainy';               // 雷雨
  return 'cloudy';                                             // 多云、阴、雾等
}

function getLocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[Weather] 定位成功', pos.coords.latitude, pos.coords.longitude);
        resolve(pos.coords);
      },
      (err) => {
        console.warn('[Weather] 定位失败', err.code, err.message);
        reject(err);
      },
      { timeout: 8000, maximumAge: 30 * 60 * 1000 }
    );
  });
}

export async function fetchWeather(): Promise<WeatherCondition> {
  // 先读缓存
  const cache = await loadWeatherCache();
  if (cache) {
    const age = Date.now() - new Date(cache.updated_at).getTime();
    console.log(`[Weather] 缓存命中: ${cache.condition}，已过 ${Math.round(age/60000)} 分钟`);
    if (age < CACHE_TTL_MS) {
      return cache.condition as WeatherCondition;
    }
    console.log('[Weather] 缓存已过期，重新拉取');
  } else {
    console.log('[Weather] 无缓存，首次拉取');
  }

  try {
    const coords = await getLocation();
    const { latitude, longitude } = coords;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weathercode&wind_speed_unit=ms`;
    console.log('[Weather] 请求 Open-Meteo:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const wmoCode: number = data.current?.weathercode ?? 2;
    const condition = mapWmoCode(wmoCode);
    console.log(`[Weather] WMO 码: ${wmoCode} → ${condition}`);

    await saveWeatherCache(condition, JSON.stringify(data));
    return condition;
  } catch (e) {
    console.error('[Weather] 拉取失败:', e);
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

// 开发调试用：在控制台调用 window.__testWeather('rainy') 强制切换天气
if (typeof window !== 'undefined') {
  (window as any).__testWeather = (condition: WeatherCondition) => {
    import('./weather').then(_m => {
      // 直接触发 app store 更新
      import('../store').then(({ useAppStore }) => {
        useAppStore.getState().setWeather(condition);
        if (condition === 'rainy') useAppStore.getState().setExpression('rainy');
        else useAppStore.getState().setExpression('default');
        console.log('[Weather Test] 已切换为:', condition);
      });
    });
  };
}
