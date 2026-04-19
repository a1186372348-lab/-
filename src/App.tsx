/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                  App.tsx 职责冻结清单                            ║
 * ║  目标：将 App.tsx 收敛为薄协调层，禁止继续堆积业务逻辑          ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║ 【薄协调层保留职责】（最终目标 ≤150 行）                         ║
 * ║  - 页面组装：CloudPet / InputBar / HoverMenu 的 JSX 渲染        ║
 * ║  - 用户交互入口：handleSend（AI 对话发送）                       ║
 * ║  - AI 表现协调：根据事件设置 expression / speech                 ║
 * ║  - 本地 UI state：showHoverMenu, showInputBar, focusClock,       ║
 * ║    ccActive（展示层状态）                                        ║
 * ║  - 展示层常量：thunderSound                                      ║
 * ║                                                                  ║
 * ║ 【已迁往 useWindowOrchestration（US-006 ~ US-008）】             ║
 * ║  ✓ 子窗口 show/hide、光标轮询、子窗口可见性与边界缓存           ║
 * ║  ✓ 气泡窗口 showSpeech、hover 计时器与按钮/菜单 handlers        ║
 * ║  ✓ 窗口初始化与联动（initWindows、onMoved）                     ║
 * ║  ✓ 低干扰模式：disturbMode 计算、全屏轮询、光标悬停显形         ║
 * ║  ✓ Ctrl 穿透：keydown/keyup/blur 键盘监听                      ║
 * ║  ✓ 宠物/输入栏交互：enter/leave/focus/blur handlers             ║
 * ║  ✓ Mousemove 兜底：document mousemove bounds check              ║
 * ║                                                                  ║
 * ║ 【迁往 useAppRuntime】                                           ║
 * ║  - 常驻服务生命周期：startWeatherSync, startReminderService,      ║
 * ║    startTimeCycleService, startSchedulerService,                  ║
 * ║    startColorSampler, startScreenMonitor                          ║
 * ║  - 事件桥接：settings-changed, all-todos-complete,               ║
 * ║    focus-phase-change, focus-start, focus-pause, focus-reset,     ║
 * ║    focus-tick, focus-mouse-enter, focus-mouse-leave, cc-event     ║
 * ║  - 空闲计时：idleTimer, IDLE_MS, resetIdle                       ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Howl } from 'howler';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';
import { resetClient, chatStream } from './services/ai';
import { startScreenMonitor, stopScreenMonitor } from './services/screenMonitor';
import { useAppStore } from './store';
import { getDb, getSetting } from './services/db';
import { startWeatherSync } from './services/weather';
import { startReminderService } from './services/reminder';
import { startColorSampler, stopColorSampler } from './services/colorSampler';
import { startTimeCycleService } from './services/timeCycle';
import { startSchedulerService } from './services/scheduler';
import { useWindowOrchestration } from './hooks/useWindowOrchestration';
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import './App.css';

const thunderSound = new Howl({
  src: ['/sounds/thunder.mp3'],
  volume: 0.4,
  preload: false,
});

// 空闲计时器：30 分钟无操作触发 sleepy
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 30 * 60 * 1000;

export default function App() {
  const {
    expression,
    weather,
    showHoverMenu,
    isProcessing,
    setExpression,
    setWeather,
    setShowHoverMenu,
    setIsProcessing,
  } = useAppStore();

  const [showInputBar, setShowInputBar] = useState(false);

  // 重置空闲计时器（用户有交互时调用）
  const resetIdle = useCallback(() => {
    if (idleTimer) clearTimeout(idleTimer);
    if (useAppStore.getState().expression === 'sleepy') {
      setExpression('default');
    }
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
  }, []);

  // ── 窗口编排 hook（US-008：全量接入低干扰、穿透与交互） ──────
  const winOrch = useWindowOrchestration({
    setShowHoverMenu,
    setShowInputBar,
    onActivity: resetIdle,
  });
  const {
    showSpeech,
    displayDisturbMode,
    isPassthrough,
  } = winOrch;

  const reminderIntervalRef = useRef<number>(60);

  const [focusClock, setFocusClock] = useState<{
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null>(null);

  // CC 工作感知：CC 有事件时临时显形
  const [ccActive, setCcActive] = useState(false);
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化：数据库、待办、天气、提醒服务
  useEffect(() => {
    let stopWeather: ReturnType<typeof setInterval>;
    let stopReminder: () => void;
    let stopTimeCycle: () => void;
    let stopScheduler: () => void;

    const init = async () => {
      // 确保主窗口获得焦点，否则透明窗口在 Windows 上不会收到鼠标悬停事件
      await getCurrentWindow().setFocus();

      await getDb();

      // 加载提醒间隔设置
      const savedInterval = await getSetting('reminder_interval_min');
      reminderIntervalRef.current = savedInterval ? parseInt(savedInterval) : 60;

      stopWeather = startWeatherSync((condition) => {
        setWeather(condition);
        if (condition === 'rainy') setExpression('rainy');
      });

      stopReminder = startReminderService(
        (todo) => {
          setExpression('worried');
          thunderSound.play();
          showSpeech(`"${todo.title}" is still pending.`, 7000);
          setTimeout(() => setExpression('default'), 3000);
        },
        () => reminderIntervalRef.current
      );

      // 时间联动：按时段切换表情和气泡
      stopTimeCycle = startTimeCycleService((period) => {
        setExpression(period.expression);
        if (period.greeting) showSpeech(period.greeting, 6000);
      });

      // 定时任务服务：触发时以气泡提醒
      stopScheduler = startSchedulerService((task) => {
        setExpression('happy');
        showSpeech(`⏰ 提醒：${task.title}`, 7000);
        setTimeout(() => setExpression('default'), 3000);
      });

      // 设置保存后重置 AI 客户端缓存并更新提醒间隔
      await listen('settings-changed', async () => {
        resetClient();
        const interval = await getSetting('reminder_interval_min');
        reminderIntervalRef.current = interval ? parseInt(interval) : 60;
      });

      // 所有待办完成时触发 proudly
      await listen('all-todos-complete', () => {
        setExpression('proudly');
        setTimeout(() => setExpression('default'), 3000);
      });

      await listen<{ phase: string; remainSecs: number }>('focus-phase-change', ({ payload }) => {
        const next = payload.phase as 'focus' | 'rest';
        if (next === 'rest') {
          showSpeech('专注结束！休息一下吧 🎉', 5000);
          setExpression('happy');
          setTimeout(() => setExpression('default'), 2000);
        } else {
          showSpeech('休息结束，继续专注！加油 💪', 4000);
        }
        setFocusClock(prev => prev
          ? { ...prev, phase: next, remainSecs: payload.remainSecs, totalSecs: payload.remainSecs, running: false }
          : null
        );
      });

      await listen<{ phase: string; remainSecs: number; task?: string }>('focus-start', ({ payload }) => {
        setFocusClock({ running: true, phase: payload.phase as 'focus' | 'rest', remainSecs: payload.remainSecs, totalSecs: payload.remainSecs });
      });

      await listen<{ phase: string; remainSecs: number }>('focus-pause', ({ payload }) => {
        setFocusClock(prev => prev ? { ...prev, running: false, remainSecs: payload.remainSecs } : null);
      });

      await listen<{ phase: string }>('focus-reset', () => {
        setFocusClock(null);
      });

      await listen<{ phase: string; remainSecs: number }>('focus-tick', ({ payload }) => {
        setFocusClock(prev => prev ? { ...prev, remainSecs: payload.remainSecs } : null);
      });

      await listen('focus-mouse-enter', () => {
        if (winOrch.focusHideTimerRef.current) clearTimeout(winOrch.focusHideTimerRef.current);
      });

      await listen('focus-mouse-leave', () => {
        winOrch.focusHideTimerRef.current = setTimeout(winOrch.hideFocusWindow, 500);
      });

      // CC 事件感知：低干扰模式下临时显形；阶段性节点弹气泡提示
      let ccPermissionPending = false;

      await listen<{ event: string; tool: string }>('cc-event', ({ payload }) => {
        if (ccTimerRef.current) { clearTimeout(ccTimerRef.current); ccTimerRef.current = null; }
        setCcActive(true);

        if (payload.event === 'PermissionRequest') {
          ccPermissionPending = true;
          setExpression('worried');
          showSpeech('主人，CC 需要你的指示~', 0);
        } else if (payload.event === 'Stop') {
          ccPermissionPending = false;
          setExpression('proudly');
          showSpeech('主人，任务完成了！', 0); // 不自动关闭，由 setTimeout 统一控制
          ccTimerRef.current = setTimeout(() => {
            setExpression('default');
            setCcActive(false);
            emit('speech:done', { duration: 300 }); // 与表情同步关闭
            ccTimerRef.current = null;
          }, 3000);
        } else {
          // PreToolUse / PostToolUse：用户已响应权限请求，立即恢复默认
          if (ccPermissionPending) {
            ccPermissionPending = false;
            setExpression('default');
            emit('speech:done', { duration: 300 });
          }
        }
      });
    };

    init();
    startColorSampler();

    startScreenMonitor({
      getDisturbMode: () => winOrch.disturbModeRef.current,
      isUserTyping: () => winOrch.isInputFocusedRef.current,
      onSpeak: (text) => {
        showSpeech(text, 0);
        setExpression('happy');
      },
      onChunk: (delta) => {
        emit('speech:append', { delta });
      },
      onDone: () => {
        emit('speech:done', { duration: 5000 });
        setTimeout(() => setExpression('default'), 2000);
      },
    });

    return () => {
      if (stopWeather) clearInterval(stopWeather);
      if (stopReminder) stopReminder();
      if (stopTimeCycle) stopTimeCycle();
      if (stopScheduler) stopScheduler();
      stopColorSampler();
      stopScreenMonitor();
    };
  }, []);

  const handleSend = useCallback(async (text: string) => {
    resetIdle();
    setIsProcessing(true);
    setExpression('thinking');

    let firstChunk = true;
    await chatStream(text, (delta) => {
      if (firstChunk) {
        // 第一个 chunk 到达时立刻打开气泡，传入 delta 作为初始内容
        showSpeech(delta, 0);   // duration=0：不自动关闭，流式期间保持
        firstChunk = false;
        setExpression('happy');
      } else {
        // 后续 chunk：追加文字
        emit('speech:append', { delta });
      }
    });

    // 流结束后启动自动关闭计时
    emit('speech:done', { duration: 5000 });
    setTimeout(() => setExpression('default'), 2000);
    setIsProcessing(false);
  }, []);

  // 启动 idle 计时器
  useEffect(() => {
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
    return () => { if (idleTimer) clearTimeout(idleTimer); };
  }, []);

  return (
    <div className="app" style={{
      opacity: isPassthrough
        ? 0.3
        : (ccActive && displayDisturbMode !== 0)
          ? 1
          : (displayDisturbMode === 2 ? 0 : displayDisturbMode === 1 ? 0.15 : 1),
      transition: 'opacity 0.4s ease',
      pointerEvents: (displayDisturbMode === 2 && !ccActive) ? 'none' : 'auto',
    }}>
      {/* 云朵 + 菜单容器 */}
      <div
        ref={winOrch.petAreaRef}
        className="pet-area"
        onMouseEnter={winOrch.handlePetAreaEnter}
        onMouseLeave={winOrch.handlePetAreaLeave}
      >
        {/* 菜单触发区：悬停在此处才显示菜单 */}
        <div
          className="menu-trigger"
          onMouseEnter={winOrch.handleMenuZoneEnter}
          onMouseLeave={winOrch.handleMenuZoneLeave}
        />

        <HoverMenu
          visible={showHoverMenu}
          onTodoBtnEnter={winOrch.handleTodoBtnEnter}
          onTodoBtnLeave={winOrch.handleTodoBtnLeave}
          onFocusBtnEnter={winOrch.handleFocusBtnEnter}
          onFocusBtnLeave={winOrch.handleFocusBtnLeave}
          onSettingsBtnEnter={winOrch.handleSettingsBtnEnter}
          onSettingsBtnLeave={winOrch.handleSettingsBtnLeave}
          onSchedulerBtnEnter={winOrch.handleSchedulerBtnEnter}
          onSchedulerBtnLeave={winOrch.handleSchedulerBtnLeave}
          onMenuEnter={winOrch.handleMenuZoneEnter}
          onMenuLeave={winOrch.handleMenuZoneLeave}
        />

        <div className="cloud-pet-bubble-anchor">
          <CloudPet
            expression={expression}
            weather={weather}
            isProcessing={isProcessing}
            focusClock={focusClock}
          />
        </div>
      </div>

      <div ref={winOrch.inputBarRef} style={{ width: '100%', transform: 'translateY(-40px)', paddingTop: '20px' }}>
        <InputBar
          onSend={handleSend}
          isProcessing={isProcessing}
          visible={showInputBar}
          onMouseEnter={winOrch.handleInputBarEnter}
          onMouseLeave={winOrch.handleInputBarLeave}
          onInputFocus={winOrch.handleInputFocus}
          onInputBlur={winOrch.handleInputBlur}
        />
      </div>
    </div>
  );
}
