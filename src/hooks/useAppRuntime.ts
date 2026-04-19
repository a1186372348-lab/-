import { useEffect, useRef } from 'react';
import { startWeatherSync } from '../services/weather';
import { startTimeCycleService } from '../services/timeCycle';
import type { TimePeriod } from '../services/timeCycle';
import { startColorSampler, stopColorSampler } from '../services/colorSampler';

// ── Callbacks 契约 ─────────────────────────────────────────
export interface AppRuntimeCallbacks {
  /** 天气变化：更新天气状态 + 关联表情 */
  onWeather: (condition: string) => void;
  /** 设置表情 */
  setExpression: (expr: string) => void;
  /** 显示气泡文字，duration=0 不自动关闭 */
  showSpeech: (text: string, duration: number) => void;
  /** 获取当前低干扰模式（0/1/2） */
  getDisturbMode: () => number;
  /** 用户是否正在输入 */
  isUserTyping: () => boolean;
  /** 获取提醒间隔（分钟） */
  getReminderInterval: () => number;
  /** 设置提醒间隔 */
  setReminderInterval: (min: number) => void;
  /** 设置专注时钟状态 */
  setFocusClock: (state: {
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null) => void;
  /** 设置 CC 工作感知状态 */
  setCcActive: (active: boolean) => void;
  /** 设置 AI 处理中状态 */
  setIsProcessing: (processing: boolean) => void;
  /** 播放音效 */
  playThunder: () => void;
  /** 重置空闲计时 */
  resetIdle: () => void;
  /** 获取 focus hide timer ref（用于 focus-mouse-enter/leave 联动） */
  focusHideTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** 隐藏 focus 窗口 */
  hideFocusWindow: () => void;
}

// ── Hook ──────────────────────────────────────────────────
export function useAppRuntime(callbacks: AppRuntimeCallbacks) {
  // Ref-synced callbacks：保证 useEffect 闭包中始终读取最新回调
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // 服务清理函数 refs
  const weatherStopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reminderStopRef = useRef<(() => void) | null>(null);
  const timeCycleStopRef = useRef<(() => void) | null>(null);
  const schedulerStopRef = useRef<(() => void) | null>(null);
  const screenMonitorActiveRef = useRef(false);

  // 事件监听清理函数 refs
  const unlistenRefs = useRef<Array<() => void>>([]);

  // CC 事件内部状态：权限等待标记
  const ccPermissionPendingRef = useRef(false);

  // CC 自动关闭计时器 ref
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── US-010: 常驻运行时服务（weather + timeCycle + colorSampler） ──
  useEffect(() => {
    // 天气同步
    weatherStopRef.current = startWeatherSync((condition) => {
      callbacksRef.current.onWeather(condition);
    });

    // 时间联动：按时段切换表情和气泡
    timeCycleStopRef.current = startTimeCycleService((period: TimePeriod) => {
      callbacksRef.current.setExpression(period.expression);
      if (period.greeting) {
        callbacksRef.current.showSpeech(period.greeting, 6000);
      }
    });

    // 背景色采样
    startColorSampler();

    return () => {
      if (weatherStopRef.current !== null) {
        clearInterval(weatherStopRef.current);
        weatherStopRef.current = null;
      }
      if (timeCycleStopRef.current) {
        timeCycleStopRef.current();
        timeCycleStopRef.current = null;
      }
      stopColorSampler();
    };
  }, []);

  // 尚未使用的 refs（US-011 ~ US-013 将填充）
  void reminderStopRef;
  void schedulerStopRef;
  void screenMonitorActiveRef;
  void unlistenRefs;
  void ccPermissionPendingRef;
  void ccTimerRef;
}
