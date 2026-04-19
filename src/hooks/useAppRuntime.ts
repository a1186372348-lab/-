import { useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { CloudExpression, FocusClockState } from '../types';

// 兼容 re-export：外部消费者仍可从本文件导入 FocusClockState
export type { FocusClockState } from '../types';
import { startWeatherSync } from '../services/weather';
import { startTimeCycleService } from '../services/timeCycle';
import type { TimePeriod } from '../services/timeCycle';
import { startColorSampler, stopColorSampler } from '../services/colorSampler';
import { startReminderService } from '../services/reminder';
import { startSchedulerService } from '../services/scheduler';
import { startScreenMonitor, stopScreenMonitor } from '../services/screenMonitor';
import { resetClient } from '../services/ai';
import { getDb, getSetting } from '../services/db';
import { useAppStore } from '../store';
import { typedEmitTo, typedListen } from '../events';

// ── Callbacks 契约 ─────────────────────────────────────────
export interface AppRuntimeCallbacks {
  /** 天气变化：更新天气状态 + 关联表情 */
  onWeather: (condition: string) => void;
  /** 设置表情 */
  setExpression: (expr: CloudExpression) => void;
  /** 显示气泡文字，duration=0 不自动关闭 */
  showSpeech: (text: string, duration: number) => void;
  /** 获取当前低干扰模式（0/1/2） */
  getDisturbMode: () => number;
  /** 用户是否正在输入 */
  isUserTyping: () => boolean;
  /** 设置 AI 处理中状态 */
  setIsProcessing: (processing: boolean) => void;
  /** 播放音效 */
  playThunder: () => void;
  /** 获取 focus hide timer ref（用于 focus-mouse-enter/leave 联动） */
  focusHideTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** 隐藏 focus 窗口 */
  hideFocusWindow: () => void;
}

// ── Hook ──────────────────────────────────────────────────
const IDLE_MS = 30 * 60 * 1000;

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

  // 提醒间隔内部缓存
  const reminderIntervalRef = useRef(60);

  // ── US-013: 空闲计时 ──
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (useAppStore.getState().expression === 'sleepy') {
      callbacksRef.current.setExpression('default');
    }
    idleTimerRef.current = setTimeout(() => {
      callbacksRef.current.setExpression('sleepy');
    }, IDLE_MS);
  }, []);

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
      // 确保主窗口获得焦点，否则透明窗口在 Windows 上不会收到鼠标悬停事件
      await getCurrentWindow().setFocus();

      await getDb();

      // 加载提醒间隔设置
      const savedInterval = await getSetting('reminder_interval_min');
      if (!mounted) return;
      reminderIntervalRef.current = savedInterval ? parseInt(savedInterval) : 60;

      // 提醒服务
      reminderStopRef.current = startReminderService(
        (todo) => {
          callbacksRef.current.setExpression('worried');
          callbacksRef.current.playThunder();
          callbacksRef.current.showSpeech(`"${todo.title}" is still pending.`, 7000);
          setTimeout(() => callbacksRef.current.setExpression('default'), 3000);
        },
        () => reminderIntervalRef.current
      );

      // 定时任务服务
      schedulerStopRef.current = startSchedulerService((task) => {
        callbacksRef.current.setExpression('happy');
        callbacksRef.current.showSpeech(`⏰ 提醒：${task.title}`, 7000);
        setTimeout(() => callbacksRef.current.setExpression('default'), 3000);
      });

      // 设置保存后重置 AI 客户端缓存并更新提醒间隔
      const unlistenSettings = await typedListen('settings-changed', async () => {
        resetClient();
        const newInterval = await getSetting('reminder_interval_min');
        reminderIntervalRef.current = newInterval ? parseInt(newInterval) : 60;
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
        typedEmitTo('speech-bubble', 'speech:append', { delta });
      },
      onDone: () => {
        typedEmitTo('speech-bubble', 'speech:done', { duration: 5000 });
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

  // ── US-012: 事件桥接（todo/focus/cc 事件） ──
  useEffect(() => {
    let mounted = true;
    const cleanups: Array<() => void> = [];

    const registerListeners = async () => {
      // all-todos-complete
      const un1 = await typedListen('all-todos-complete', () => {
        callbacksRef.current.setExpression('proudly');
        setTimeout(() => callbacksRef.current.setExpression('default'), 3000);
      });
      if (!mounted) { un1(); return; }
      cleanups.push(un1);

      // focus-phase-change
      const un2 = await typedListen('focus-phase-change', (payload) => {
        const next = payload.phase;
        if (next === 'rest') {
          callbacksRef.current.showSpeech('专注结束！休息一下吧 🎉', 5000);
          callbacksRef.current.setExpression('happy');
          setTimeout(() => callbacksRef.current.setExpression('default'), 2000);
        } else {
          callbacksRef.current.showSpeech('休息结束，继续专注！加油 💪', 4000);
        }
        useAppStore.getState().setFocusClock((prev: FocusClockState | null) =>
          prev ? { ...prev, phase: next, remainSecs: payload.remainSecs, totalSecs: payload.remainSecs, running: false } : null
        );
      });
      if (!mounted) { un2(); return; }
      cleanups.push(un2);

      // focus-start
      const un3 = await typedListen('focus-start', (payload) => {
        useAppStore.getState().setFocusClock({
          running: true,
          phase: payload.phase,
          remainSecs: payload.remainSecs,
          totalSecs: payload.remainSecs,
        });
      });
      if (!mounted) { un3(); return; }
      cleanups.push(un3);

      // focus-pause
      const un4 = await typedListen('focus-pause', (payload) => {
        useAppStore.getState().setFocusClock((prev: FocusClockState | null) =>
          prev ? { ...prev, running: false, remainSecs: payload.remainSecs } : null
        );
      });
      if (!mounted) { un4(); return; }
      cleanups.push(un4);

      // focus-reset
      const un5 = await typedListen('focus-reset', () => {
        useAppStore.getState().setFocusClock(null);
      });
      if (!mounted) { un5(); return; }
      cleanups.push(un5);

      // focus-tick
      const un6 = await typedListen('focus-tick', (payload) => {
        useAppStore.getState().setFocusClock((prev: FocusClockState | null) =>
          prev ? { ...prev, remainSecs: payload.remainSecs } : null
        );
      });
      if (!mounted) { un6(); return; }
      cleanups.push(un6);

      // focus-mouse-enter
      const un7 = await typedListen('focus-mouse-enter', () => {
        if (callbacksRef.current.focusHideTimerRef.current) {
          clearTimeout(callbacksRef.current.focusHideTimerRef.current);
        }
      });
      if (!mounted) { un7(); return; }
      cleanups.push(un7);

      // focus-mouse-leave
      const un8 = await typedListen('focus-mouse-leave', () => {
        callbacksRef.current.focusHideTimerRef.current = setTimeout(callbacksRef.current.hideFocusWindow, 500);
      });
      if (!mounted) { un8(); return; }
      cleanups.push(un8);

      // cc-event
      const un9 = await typedListen('cc-event', (payload) => {
        if (ccTimerRef.current) {
          clearTimeout(ccTimerRef.current);
          ccTimerRef.current = null;
        }
        useAppStore.getState().setCcActive(true);

        if (payload.event === 'PermissionRequest') {
          ccPermissionPendingRef.current = true;
          callbacksRef.current.setExpression('worried');
          callbacksRef.current.showSpeech('主人，CC 需要你的指示~', 0);
        } else if (payload.event === 'Stop') {
          ccPermissionPendingRef.current = false;
          callbacksRef.current.setExpression('proudly');
          callbacksRef.current.showSpeech('主人，任务完成了！', 0);
          ccTimerRef.current = setTimeout(() => {
            callbacksRef.current.setExpression('default');
            useAppStore.getState().setCcActive(false);
            typedEmitTo('speech-bubble', 'speech:done', { duration: 300 });
            ccTimerRef.current = null;
          }, 3000);
        } else {
          if (ccPermissionPendingRef.current) {
            ccPermissionPendingRef.current = false;
            callbacksRef.current.setExpression('default');
            typedEmitTo('speech-bubble', 'speech:done', { duration: 300 });
          }
        }
      });
      if (!mounted) { un9(); return; }
      cleanups.push(un9);
    };

    registerListeners();

    return () => {
      mounted = false;
      cleanups.forEach(fn => fn());
    };
  }, []);

  // ── US-013: 空闲计时初始化 ──
  useEffect(() => {
    idleTimerRef.current = setTimeout(() => {
      callbacksRef.current.setExpression('sleepy');
    }, IDLE_MS);

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, []);

  return { resetIdle };
}
