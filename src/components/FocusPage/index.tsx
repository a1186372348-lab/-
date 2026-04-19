import { useState, useEffect, useRef, useCallback } from 'react';
import { typedEmitTo } from '../../events';
import './index.css';

type Phase = 'focus' | 'rest';

const MAX_FOCUS_MIN = 180;
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_REST_MIN = 5;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function FocusPage() {
  const [focusDuration, setFocusDuration] = useState(DEFAULT_FOCUS_MIN);
  const [restDuration, setRestDuration]   = useState(DEFAULT_REST_MIN);
  const [phase, setPhase]                 = useState<Phase>('focus');
  const [totalSecs, setTotalSecs]         = useState(DEFAULT_FOCUS_MIN * 60);
  const [remainSecs, setRemainSecs]       = useState(DEFAULT_FOCUS_MIN * 60);
  const [running, setRunning]             = useState(false);
  const [task, setTask]                   = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const switchPhase = useCallback((nextPhase: Phase) => {
    clearTimer();
    const secs = (nextPhase === 'focus' ? focusDuration : restDuration) * 60;
    setPhase(nextPhase);
    setTotalSecs(secs);
    setRemainSecs(secs);
    setRunning(false);
    typedEmitTo('main', 'focus-phase-change', { phase: nextPhase, remainSecs: secs });
  }, [focusDuration, restDuration]);

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      setRemainSecs(prev => {
        if (prev <= 1) {
          clearTimer();
          const next: Phase = phase === 'focus' ? 'rest' : 'focus';
          setTimeout(() => switchPhase(next), 0);
          return 0;
        }
        const next = prev - 1;
        typedEmitTo('main', 'focus-tick', { phase, remainSecs: next });
        return next;
      });
    }, 1000);
    return clearTimer;
  }, [running, phase, switchPhase]);

  const handleToggle = () => {
    if (!running) {
      typedEmitTo('main', 'focus-start', { phase, remainSecs, task });
    } else {
      typedEmitTo('main', 'focus-pause', { phase, remainSecs });
    }
    setRunning(r => !r);
  };

  const handleReset = () => {
    clearTimer();
    setRunning(false);
    const secs = (phase === 'focus' ? focusDuration : restDuration) * 60;
    setTotalSecs(secs);
    setRemainSecs(secs);
    typedEmitTo('main', 'focus-reset', { phase });
  };

  const handleFocusChange = (v: number) => {
    const clamped = Math.min(MAX_FOCUS_MIN, Math.max(1, v));
    setFocusDuration(clamped);
    if (!running && phase === 'focus') {
      setTotalSecs(clamped * 60);
      setRemainSecs(clamped * 60);
    }
  };

  const handleRestChange = (v: number) => {
    const clamped = Math.min(60, Math.max(1, v));
    setRestDuration(clamped);
    if (!running && phase === 'rest') {
      setTotalSecs(clamped * 60);
      setRemainSecs(clamped * 60);
    }
  };

  const R = 78;
  const C = 2 * Math.PI * R;
  const progress = totalSecs > 0 ? remainSecs / totalSecs : 0;
  const dashOffset = C * (1 - progress);
  const isRest = phase === 'rest';

  return (
    <div
      className="fp-root"
      onMouseEnter={() => typedEmitTo('main', 'focus-mouse-enter', {} as Record<string, never>)}
      onMouseLeave={() => typedEmitTo('main', 'focus-mouse-leave', {} as Record<string, never>)}
    >
      {/* 标题 + 重置按钮 */}
      <div className="fp-titlebar">
        <span className="fp-title">🍅 专注时刻</span>
        <button className="fp-btn-reset" onClick={handleReset} title="重置">↺</button>
      </div>

      {/* 圆形计时器（点击圆心开始/暂停） */}
      <div className="fp-timer-wrap" onClick={handleToggle}>
        <svg className="fp-svg" viewBox="0 0 180 180">
          <circle className="fp-svg-bg" cx="90" cy="90" r={R} />
          <circle
            className={`fp-svg-progress${isRest ? ' rest' : ''}`}
            cx="90" cy="90" r={R}
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="fp-timer-inner">
          <span className="fp-phase">{isRest ? '休息中' : '专注中'}</span>
          <span className="fp-time">{fmt(remainSecs)}</span>
          <span className="fp-action">{running ? '暂停' : (remainSecs === totalSecs ? '开始' : '继续')}</span>
        </div>
      </div>

      {/* 时长设置 */}
      <div className="fp-settings">
        <div className="fp-duration-group">
          <span className="fp-duration-label">专注</span>
          <input
            className="fp-duration-input"
            type="number" min={1} max={MAX_FOCUS_MIN}
            value={focusDuration} disabled={running}
            onChange={e => handleFocusChange(parseInt(e.target.value) || 1)}
          />
          <span className="fp-duration-label">分钟</span>
        </div>
        <span className="fp-duration-sep">·</span>
        <div className="fp-duration-group">
          <span className="fp-duration-label">休息</span>
          <input
            className="fp-duration-input"
            type="number" min={1} max={60}
            value={restDuration} disabled={running}
            onChange={e => handleRestChange(parseInt(e.target.value) || 1)}
          />
          <span className="fp-duration-label">分钟</span>
        </div>
      </div>

      {/* 关联待办 */}
      <input
        className="fp-task-input"
        placeholder="🎯 准备专注做什么？"
        value={task} disabled={running}
        onChange={e => setTask(e.target.value)}
        maxLength={40}
      />
    </div>
  );
}
