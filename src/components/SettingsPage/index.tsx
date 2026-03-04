import { useState, useEffect } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { getDb, getSetting, setSetting } from '../../services/db';
import './index.css';

export default function SettingsPage() {
  const [deepseekKey, setDeepseekKey] = useState('');
  const [openclawToken, setOpenclawToken] = useState('');
  const [reminderInterval, setReminderInterval] = useState(60);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      await getDb();
      setDeepseekKey((await getSetting('deepseek_api_key')) ?? '');
      setOpenclawToken((await getSetting('openclaw_token')) ?? '');
      const interval = await getSetting('reminder_interval_min');
      setReminderInterval(interval ? parseInt(interval) : 60);
    };
    load();
  }, []);

  const handleSave = async () => {
    await setSetting('deepseek_api_key', deepseekKey.trim());
    await setSetting('openclaw_token', openclawToken.trim());
    await setSetting('reminder_interval_min', String(reminderInterval));
    await emitTo('main', 'settings-changed');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="sp-root">
      <div className="sp-titlebar">
        <span className="sp-title">⚙ 云宝设置</span>
      </div>

      <div className="sp-body">
        <div className="sp-field">
          <label className="sp-label">OpenClaw Token
            <span className="sp-badge">优先使用</span>
          </label>
          <input
            className="sp-input"
            type="password"
            placeholder="填入后云宝将通过 OpenClaw 执行真实操作"
            value={openclawToken}
            onChange={(e) => setOpenclawToken(e.target.value)}
          />
          <span className="sp-hint">需先在本机启动 OpenClaw 网关（端口 18789）</span>
        </div>

        <div className="sp-field">
          <label className="sp-label">DeepSeek API Key</label>
          <input
            className="sp-input"
            type="password"
            placeholder="sk-..."
            value={deepseekKey}
            onChange={(e) => setDeepseekKey(e.target.value)}
          />
          <span className="sp-hint">未填 OpenClaw Token 时作为 fallback</span>
        </div>

        <div className="sp-field">
          <label className="sp-label">
            待办提醒间隔
            <span className="sp-interval-value">{reminderInterval} 分钟</span>
          </label>
          <input
            className="sp-slider"
            type="range"
            min={30}
            max={120}
            step={5}
            value={reminderInterval}
            style={{ '--val': `${((reminderInterval - 30) / 90) * 100}%` } as React.CSSProperties}
            onChange={(e) => setReminderInterval(parseInt(e.target.value))}
          />
          <div className="sp-slider-range">
            <span>30 分钟</span>
            <span>120 分钟</span>
          </div>
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
