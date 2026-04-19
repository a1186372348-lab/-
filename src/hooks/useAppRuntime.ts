import { useEffect, useRef } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { startWeatherSync } from '../services/weather';
import { startTimeCycleService } from '../services/timeCycle';
import type { TimePeriod } from '../services/timeCycle';
import { startColorSampler, stopColorSampler } from '../services/colorSampler';
import { startReminderService } from '../services/reminder';
import { startSchedulerService } from '../services/scheduler';
import { startScreenMonitor, stopScreenMonitor } from '../services/screenMonitor';
import { resetClient } from '../services/ai';
import { getDb, getSetting } from '../services/db';

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

  // ── US-011: 条件运行时服务（reminder + scheduler + screenMonitor + settings-changed） ──
  useEffect(() => {
    let mounted = true;

    const initConditional = async () => {
      await getDb();

      // 加载提醒间隔设置
      const savedInterval = await getSetting('reminder_interval_min');
      if (!mounted) return;
      callbacksRef.current.setReminderInterval(savedInterval ? parseInt(savedInterval) : 60);

      // 提醒服务
      reminderStopRef.current = startReminderService(
        (todo) => {
          callbacksRef.current.setExpression('worried');
          callbacksRef.current.playThunder();
          callbacksRef.current.showSpeech(`"${todo.title}" is still pending.`, 7000);
          setTimeout(() => callbacksRef.current.setExpression('default'), 3000);
        },
        () => callbacksRef.current.getReminderInterval()
      );

      // 定时任务服务
      schedulerStopRef.current = startSchedulerService((task) => {
        callbacksRef.current.setExpression('happy');
        callbacksRef.current.showSpeech(`⏰ 提醒：${task.title}`, 7000);
        setTimeout(() => callbacksRef.current.setExpression('default'), 3000);
      });

      // 设置保存后重置 AI 客户端缓存并更新提醒间隔
      const unlistenSettings = await listen('settings-changed', async () => {
        resetClient();
        const newInterval = await getSetting('reminder_interval_min');
        callbacksRef.current.setReminderInterval(newInterval ? parseInt(newInterval) : 60);
      });
      if (!mounted) {
        unlistenSettings();
        return;
      }
      unlistenRefs.current.push(unlistenSettings);
    };

    initConditional();

    // 屏幕感知服务（同步启动）
    startScreenMonitor({
      getDisturbMode: () => callbacksRef.current.getDisturbMode(),
      isUserTyping: () => callbacksRef.current.isUserTyping(),
      onSpeak: (text) => {
        callbacksRef.current.showSpeech(text, 0);
        callbacksRef.current.setExpression('happy');
      },
      onChunk: (delta) => {
        emit('speech:append', { delta });
      },
      onDone: () => {
        emit('speech:done', { duration: 5000 });
        setTimeout(() => callbacksRef.current.setExpression('default'), 2000);
      },
    });
    screenMonitorActiveRef.current = true;

    return () => {
      mounted = false;
      if (reminderStopRef.current) {
        reminderStopRef.current();
        reminderStopRef.current = null;
      }
      if (schedulerStopRef.current) {
        schedulerStopRef.current();
        schedulerStopRef.current = null;
      }
      stopScreenMonitor();
      screenMonitorActiveRef.current = false;
      unlistenRefs.current.forEach(fn => fn());
      unlistenRefs.current = [];
    };
  }, []);

  // 尚未使用的 refs（US-012 ~ US-013 将填充）
  void ccPermissionPendingRef;
  void ccTimerRef;
}
