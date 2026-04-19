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
 * ║    isPassthrough, ccActive, disturbMode（展示层状态）             ║
 * ║  - 展示层常量：thunderSound                                      ║
 * ║                                                                  ║
 * ║ 【已迁往 useWindowOrchestration（US-006）】                      ║
 * ║  ✓ 子窗口 show/hide、光标轮询、子窗口可见性与边界缓存           ║
 * ║  ✓ 气泡窗口 showSpeech、hover 计时器与按钮/菜单 handlers        ║
 * ║  ✓ 窗口初始化与联动（initWindows、onMoved）                     ║
 * ║                                                                  ║
 * ║ 【迁往 useWindowOrchestration（待 US-007/008）】                 ║
 * ║  - 低干扰模式：disturbModeRef, applyDim, disturbPollRef,         ║
 * ║    disturbHoverStartRef, 全屏轮询 useEffect                      ║
 * ║  - Ctrl 穿透：keydown/keyup/blur 键盘监听                       ║
 * ║  - 宠物/输入栏交互：handlePetAreaEnter/Leave,                    ║
 * ║    handleInputBarEnter/Leave, handleInputFocus/Blur,              ║
 * ║    isPetHoveredRef, isInputHoveredRef, isInputFocusedRef          ║
 * ║  - Mousemove 兜底：document mousemove bounds check               ║
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
import { invoke } from '@tauri-apps/api/core';
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

  // ── 窗口编排 hook ───────────────────────────────────────────
  const winOrch = useWindowOrchestration({ setShowHoverMenu });
  const { showSpeech } = winOrch;

  const reminderIntervalRef = useRef<number>(60);

  const [isPassthrough, setIsPassthrough] = useState(false);
  const [focusClock, setFocusClock] = useState<{
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null>(null);
  const [showInputBar, setShowInputBar] = useState(false);
  const petAreaRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const showHoverMenuRef = useRef(false);
  const showInputBarRef = useRef(false);
  const disturbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disturbHoverStartRef = useRef<number | null>(null);

  // 低干扰模式：0=正常，1=半透（最大化应用），2=隐藏（无边框全屏游戏）
  const disturbModeRef = useRef<0 | 1 | 2>(0);
  const isPetHoveredRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const isInputHoveredRef = useRef(false);
  const [disturbMode, setDisturbMode] = useState<0 | 1 | 2>(0);

  // CC 工作感知：CC 有事件时临时显形
  const [ccActive, setCcActive] = useState(false);
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDim = useCallback(() => {
    // 任意交互时恢复正常：悬停云朵、悬停输入框、输入框聚焦、待办窗口打开、设置窗口打开
    const isActive = isPetHoveredRef.current
      || isInputHoveredRef.current
      || isInputFocusedRef.current
      || winOrch.todoVisibleRef.current
      || winOrch.settingsVisibleRef.current;
    setDisturbMode(isActive ? 0 : disturbModeRef.current);
  }, []);

  // 将 applyDim 同步到 hook 的 onInteractionChangeRef
  useEffect(() => {
    winOrch.onInteractionChangeRef.current = applyDim;
  }, [applyDim, winOrch.onInteractionChangeRef]);

  // 低干扰：窗口失焦时重置 hover refs（hook 的 onFocusChanged 只调用 onInteractionChange）
  useEffect(() => {
    const mainWin = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    mainWin.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        isPetHoveredRef.current = false;
        isInputHoveredRef.current = false;
        isInputFocusedRef.current = false;
        applyDim();
      }
    }).then(u => { unlisten = u; });
    return () => { unlisten?.(); };
  }, [applyDim]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const mode = await invoke<0 | 1 | 2>('get_fullscreen_mode');
      disturbModeRef.current = mode;
      applyDim();
    }, 500);
    return () => clearInterval(timer);
  }, [applyDim]);

  // 低干扰模式下：启用点击穿透 + 轮询光标位置，悬停 1s 后显形
  useEffect(() => {
    const stopPoll = () => {
      if (disturbPollRef.current) { clearInterval(disturbPollRef.current); disturbPollRef.current = null; }
      disturbHoverStartRef.current = null;
    };

    if (disturbMode !== 0) {
      invoke('set_window_passthrough', { passthrough: true }).catch(console.error);
      if (disturbPollRef.current) return;
      disturbPollRef.current = setInterval(async () => {
        const [cx, cy]: [number, number] = await invoke('get_cursor_position');
        const pos = await getCurrentWindow().outerPosition();
        const dpr = window.devicePixelRatio || 1;
        const rect = petAreaRef.current?.getBoundingClientRect();
        if (!rect) return;
        const inside = cx >= pos.x + rect.left * dpr && cx < pos.x + rect.right * dpr
                    && cy >= pos.y + rect.top  * dpr && cy < pos.y + rect.bottom * dpr;
        if (inside) {
          if (disturbHoverStartRef.current === null) {
            disturbHoverStartRef.current = Date.now();
          } else if (Date.now() - disturbHoverStartRef.current >= 1000) {
            stopPoll();
            await invoke('set_window_passthrough', { passthrough: false });
            isPetHoveredRef.current = true;
            applyDim();
          }
        } else {
          disturbHoverStartRef.current = null;
        }
      }, 100);
    } else {
      stopPoll();
      invoke('set_window_passthrough', { passthrough: false }).catch(console.error);
    }

    return stopPoll;
  }, [disturbMode, applyDim]);

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
      getDisturbMode: () => disturbModeRef.current,
      isUserTyping: () => isInputFocusedRef.current,
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

  // 重置空闲计时器（用户有交互时调用）
  const resetIdle = useCallback(() => {
    if (idleTimer) clearTimeout(idleTimer);
    // 若当前是 sleepy，恢复 default
    if (useAppStore.getState().expression === 'sleepy') {
      setExpression('default');
    }
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
  }, []);

  // 启动 idle 计时器
  useEffect(() => {
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
    return () => { if (idleTimer) clearTimeout(idleTimer); };
  }, []);

  // 同步 showHoverMenu 状态到 ref，供 mousemove 监听器使用
  useEffect(() => {
    showHoverMenuRef.current = showHoverMenu;
  }, [showHoverMenu]);

  // 同步 showInputBar 状态到 ref，供 mousemove 监听器使用
  useEffect(() => {
    showInputBarRef.current = showInputBar;
  }, [showInputBar]);

  // 兜底：document mousemove 检测鼠标是否真正离开 pet-area / input-bar
  // 防止 Tauri 透明窗口偶发性丢失 onMouseLeave 事件
  useEffect(() => {
    const checkBounds = (e: MouseEvent) => {
      // HoverMenu 兜底
      if (showHoverMenuRef.current && petAreaRef.current) {
        const rect = petAreaRef.current.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
                    && e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (!inside) {
          if (winOrch.hoverTimerRef.current) clearTimeout(winOrch.hoverTimerRef.current);
          winOrch.hoverTimerRef.current = null;
          setShowHoverMenu(false);
          isPetHoveredRef.current = false;
          applyDim();
        }
      }
      // InputBar 兜底
      if (showInputBarRef.current && inputBarRef.current) {
        const rect = inputBarRef.current.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
                    && e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (!inside) {
          if (winOrch.inputBarTimerRef.current) clearTimeout(winOrch.inputBarTimerRef.current);
          winOrch.inputBarTimerRef.current = null;
          setShowInputBar(false);
          isInputHoveredRef.current = false;
          applyDim();
        }
      }
    };
    document.addEventListener('mousemove', checkBounds);
    return () => document.removeEventListener('mousemove', checkBounds);
  }, [applyDim, setShowHoverMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !isPassthrough) {
        setIsPassthrough(true);
        invoke('set_window_passthrough', { passthrough: true }).catch(console.error);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && isPassthrough) {
        setIsPassthrough(false);
        invoke('set_window_passthrough', { passthrough: false }).catch(console.error);
      }
    };

    const handleBlur = () => {
      if (isPassthrough) {
        setIsPassthrough(false);
        invoke('set_window_passthrough', { passthrough: false }).catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isPassthrough]);

  const handleInputFocus = useCallback(() => {
    isInputFocusedRef.current = true;
    applyDim();
  }, [applyDim]);

  const handleInputBlur = useCallback(() => {
    isInputFocusedRef.current = false;
    applyDim();
  }, [applyDim]);

  const handleInputBarEnter = () => {
    if (winOrch.inputBarTimerRef.current) clearTimeout(winOrch.inputBarTimerRef.current);
    isInputHoveredRef.current = true;
    applyDim();
    setShowInputBar(true);
  };

  const handleInputBarLeave = () => {
    if (winOrch.inputBarTimerRef.current) clearTimeout(winOrch.inputBarTimerRef.current);
    winOrch.inputBarTimerRef.current = setTimeout(() => {
      isInputHoveredRef.current = false;
      applyDim();
      setShowInputBar(false);
    }, 50);
  };

  // 鼠标进入云朵区域：维护低干扰状态
  const handlePetAreaEnter = () => {
    isPetHoveredRef.current = true;
    applyDim();
    resetIdle();
  };

  // 鼠标离开云朵区域
  const handlePetAreaLeave = () => {
    isPetHoveredRef.current = false;
    applyDim();
  };

  return (
    <div className="app" style={{
      opacity: isPassthrough
        ? 0.3
        : (ccActive && disturbMode !== 0)
          ? 1
          : (disturbMode === 2 ? 0 : disturbMode === 1 ? 0.15 : 1),
      transition: 'opacity 0.4s ease',
      pointerEvents: (disturbMode === 2 && !ccActive) ? 'none' : 'auto',
    }}>
      {/* 云朵 + 菜单容器 */}
      <div
        ref={petAreaRef}
        className="pet-area"
        onMouseEnter={handlePetAreaEnter}
        onMouseLeave={handlePetAreaLeave}
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

      <div ref={inputBarRef} style={{ width: '100%', transform: 'translateY(-40px)', paddingTop: '20px' }}>
        <InputBar
          onSend={handleSend}
          isProcessing={isProcessing}
          visible={showInputBar}
          onMouseEnter={handleInputBarEnter}
          onMouseLeave={handleInputBarLeave}
          onInputFocus={handleInputFocus}
          onInputBlur={handleInputBlur}
        />
      </div>
    </div>
  );
}
