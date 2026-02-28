import { useState, useEffect } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { getDb, getSetting, setSetting } from '../../services/db';
import './index.css';

export default function SettingsPage() {
  const [deepseekKey, setDeepseekKey] = useState('');
  const [weatherKey, setWeatherKey] = useState('');
  const [weatherCity, setWeatherCity] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      await getDb();
      setDeepseekKey((await getSetting('deepseek_api_key')) ?? '');
      setWeatherKey((await getSetting('weather_api_key')) ?? '');
      setWeatherCity((await getSetting('weather_city')) ?? '');
    };
    load();
  }, []);

  const handleSave = async () => {
    await setSetting('deepseek_api_key', deepseekKey.trim());
    await setSetting('weather_api_key', weatherKey.trim());
    await setSetting('weather_city', weatherCity.trim() || 'Beijing');
    await emitTo('main', 'settings-changed');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className="sp-root"
      onMouseEnter={() => emitTo('main', 'settings-mouse-enter')}
      onMouseLeave={() => emitTo('main', 'settings-mouse-leave')}
    >
      <div className="sp-titlebar">
        <span className="sp-title">⚙ 云宝设置</span>
      </div>

      <div className="sp-body">
        <div className="sp-field">
          <label className="sp-label">DeepSeek API Key</label>
          <input
            className="sp-input"
            type="password"
            placeholder="sk-..."
            value={deepseekKey}
            onChange={(e) => setDeepseekKey(e.target.value)}
          />
          <span className="sp-hint">用于 AI 对话功能</span>
        </div>

        <div className="sp-field">
          <label className="sp-label">OpenWeather API Key</label>
          <input
            className="sp-input"
            type="password"
            placeholder="输入 API Key（可选）"
            value={weatherKey}
            onChange={(e) => setWeatherKey(e.target.value)}
          />
          <span className="sp-hint">用于天气联动，不填则始终显示多云</span>
        </div>

        <div className="sp-field">
          <label className="sp-label">天气城市</label>
          <input
            className="sp-input"
            type="text"
            placeholder="Beijing"
            value={weatherCity}
            onChange={(e) => setWeatherCity(e.target.value)}
          />
          <span className="sp-hint">英文城市名，如 Shanghai、Chengdu</span>
        </div>
      </div>

      <div className="sp-footer">
        <button className="sp-save-btn" onClick={handleSave}>
          {saved ? '✓ 已保存' : '保存'}
        </button>
      </div>
    </div>
  );
}
