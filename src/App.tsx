import { useEffect, useRef, useCallback, useState } from 'react';
import { Howl } from 'howler';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { resetClient } from './services/ai';
import { useAppStore } from './store';
import { getDb, fetchTodos, getSetting } from './services/db';
import { startWeatherSync } from './services/weather';
import { startReminderService } from './services/reminder';
import { startColorSampler, stopColorSampler } from './services/colorSampler';
import { startTimeCycleService } from './services/timeCycle';
import { startBridgeService, stopBridgeService } from './services/bridge';
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import SpeechBubble from './components/SpeechBubble';
import ProgressBar from './components/ProgressBar';
import './App.css';

const thunderSound = new Howl({
  src: ['/sounds/thunder.mp3'],
  volume: 0.4,
  preload: false,
});

// 空闲计时器：30 分钟无操作触发 sleepy
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 30 * 60 * 1000;

// 悬停计时器：鼠标进入容器 600ms 后显示菜单
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let inputBarTimer: ReturnType<typeof setTimeout> | null = null;
// 待办/设置窗口显示/隐藏计时器
let todoShowTimer: ReturnType<typeof setTimeout> | null = null;
let todoHideTimer: ReturnType<typeof setTimeout> | null = null;
let settingsShowTimer: ReturnType<typeof setTimeout> | null = null;
let settingsHideTimer: ReturnType<typeof setTimeout> | null = null;
let focusShowTimer: ReturnType<typeof setTimeout> | null = null;
let focusHideTimer: ReturnType<typeof setTimeout> | null = null;

// 光标轮询：记录子窗口可见状态和物理边界
let todoVisible = false;
let settingsVisible = false;
let focusVisible = false;

// 低干扰豁免：任意交互发生时调用，通知组件重新计算透明度
let onInteractionChange: (() => void) | null = null;
type Bounds = { x: number; y: number; w: number; h: number };
let todoBounds: Bounds | null = null;
let settingsBounds: Bounds | null = null;
let focusBounds: Bounds | null = null;
let cursorPollTimer: ReturnType<typeof setInterval> | null = null;

function stopCursorPoll() {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null; }
}

function startCursorPoll() {
  if (cursorPollTimer) return;
  let prevInsideTodo = false;
  let prevInsideSettings = false;
  let prevInsideFocus = false;

  cursorPollTimer = setInterval(async () => {
    if (!todoVisible && !settingsVisible && !focusVisible) { stopCursorPoll(); return; }

    const [cx, cy]: [number, number] = await invoke('get_cursor_position');

    if (todoVisible && todoBounds) {
      const inside = cx >= todoBounds.x && cx < todoBounds.x + todoBounds.w
                  && cy >= todoBounds.y && cy < todoBounds.y + todoBounds.h;
      if (inside && !prevInsideTodo) {
        prevInsideTodo = true;
        if (todoHideTimer) { clearTimeout(todoHideTimer); todoHideTimer = null; }
      } else if (!inside && prevInsideTodo) {
        prevInsideTodo = false;
        if (!todoHideTimer) todoHideTimer = setTimeout(hideTodoWindow, 500);
      }
    }

    if (settingsVisible && settingsBounds) {
      const inside = cx >= settingsBounds.x && cx < settingsBounds.x + settingsBounds.w
                  && cy >= settingsBounds.y && cy < settingsBounds.y + settingsBounds.h;
      if (inside && !prevInsideSettings) {
        prevInsideSettings = true;
        if (settingsHideTimer) { clearTimeout(settingsHideTimer); settingsHideTimer = null; }
      } else if (!inside && prevInsideSettings) {
        prevInsideSettings = false;
        if (!settingsHideTimer) settingsHideTimer = setTimeout(hideSettingsWindow, 500);
      }
    }

    if (focusVisible && focusBounds) {
      const inside = cx >= focusBounds.x && cx < focusBounds.x + focusBounds.w
                  && cy >= focusBounds.y && cy < focusBounds.y + focusBounds.h;
      if (inside && !prevInsideFocus) {
        prevInsideFocus = true;
        if (focusHideTimer) { clearTimeout(focusHideTimer); focusHideTimer = null; }
      } else if (!inside && prevInsideFocus) {
        prevInsideFocus = false;
        if (!focusHideTimer) focusHideTimer = setTimeout(hideFocusWindow, 500);
      }
    }
  }, 150);
}

async function showTodoWindow() {
  const todoWin = await WebviewWindow.getByLabel('todo-manager');
  if (!todoWin) return;
  const mainWin = getCurrentWindow();
  const mainPos = await mainWin.outerPosition();
  const sf = await mainWin.scaleFactor();
  const todoWidth = 306, gap = 8;
  await todoWin.setPosition(new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf));
  await todoWin.show();
  const pos = await todoWin.outerPosition();
  const size = await todoWin.outerSize();
  todoBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
  todoVisible = true;
  onInteractionChange?.();
  startCursorPoll();
}

async function hideTodoWindow() {
  const todoWin = await WebviewWindow.getByLabel('todo-manager');
  if (!todoWin) return;
  const visible = await todoWin.isVisible();
  if (visible) await todoWin.hide();
  todoVisible = false;
  todoBounds = null;
  onInteractionChange?.();
  if (!settingsVisible) stopCursorPoll();
}

async function showSettingsWindow() {  const settingsWin = await WebviewWindow.getByLabel('settings');
  if (!settingsWin) return;
  const mainWin = getCurrentWindow();
  const mainPos = await mainWin.outerPosition();
  const mainSize = await mainWin.outerSize();
  const sf = await mainWin.scaleFactor();
  const gap = 8;
  await settingsWin.setPosition(
    new LogicalPosition(mainPos.x / sf + mainSize.width / sf + gap, mainPos.y / sf)
  );
  await settingsWin.show();
  const pos = await settingsWin.outerPosition();
  const size = await settingsWin.outerSize();
  settingsBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
  settingsVisible = true;
  onInteractionChange?.();
  startCursorPoll();
}

async function hideSettingsWindow() {
  const settingsWin = await WebviewWindow.getByLabel('settings');
  if (!settingsWin) return;
  const visible = await settingsWin.isVisible();
  if (visible) await settingsWin.hide();
  settingsVisible = false;
  settingsBounds = null;
  onInteractionChange?.();
  if (!todoVisible) stopCursorPoll();
}

async function showFocusWindow() {
  const focusWin = await WebviewWindow.getByLabel('focus');
  if (!focusWin) return;
  const mainWin = getCurrentWindow();
  const mainPos = await mainWin.outerPosition();
  const mainSize = await mainWin.outerSize();
  const sf = await mainWin.scaleFactor();
  const focusWidth = 240, focusHeight = 320, gap = 8;
  // 显示在主窗口正上方居中，顶部与主窗口顶部对齐
  const lx = mainPos.x / sf + mainSize.width / sf / 2 - focusWidth / 2;
  const ly = mainPos.y / sf - focusHeight - gap;
  await focusWin.setPosition(new LogicalPosition(lx, ly));
  await focusWin.show();
  const pos = await focusWin.outerPosition();
  const size = await focusWin.outerSize();
  focusBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
  focusVisible = true;
  startCursorPoll();
}

async function hideFocusWindow() {
  const focusWin = await WebviewWindow.getByLabel('focus');
  if (!focusWin) return;
  const visible = await focusWin.isVisible();
  if (visible) await focusWin.hide();
  focusVisible = false;
  focusBounds = null;
  if (!todoVisible && !settingsVisible) stopCursorPoll();
}

export default function App() {
  const {
    expression,
    weather,
    showHoverMenu,
    speechBubble,
    isProcessing,
    setExpression,
    setWeather,
    setShowHoverMenu,
    showSpeech,
    hideSpeech,
    setTodos,
    setIsProcessing,
    taskProgress,
    taskProgressVisible,
    setTaskProgress,
  } = useAppStore();

  const reminderIntervalRef = useRef<number>(60);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isPassthrough, setIsPassthrough] = useState(false);
  const [focusClock, setFocusClock] = useState<{
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null>(null);
  const [showInputBar, setShowInputBar] = useState(false);
  const unlistenMoveRef = useRef<(() => void) | null>(null);
  const petAreaRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const showHoverMenuRef = useRef(false);
  const showInputBarRef = useRef(false);

  // 低干扰模式：0=正常，1=半透（最大化应用），2=隐藏（无边框全屏游戏）
  const disturbModeRef = useRef<0 | 1 | 2>(0);
  const isPetHoveredRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const isInputHoveredRef = useRef(false);
  const [disturbMode, setDisturbMode] = useState<0 | 1 | 2>(0);

  const applyDim = useCallback(() => {
    // 任意交互时恢复正常：悬停云朵、悬停输入框、输入框聚焦、待办窗口打开、设置窗口打开
    const isActive = isPetHoveredRef.current
      || isInputHoveredRef.current
      || isInputFocusedRef.current
      || todoVisible
      || settingsVisible;
    setDisturbMode(isActive ? 0 : disturbModeRef.current);
  }, []);

  // 注册到模块级回调，供 show/hideTodoWindow 等函数调用
  useEffect(() => {
    onInteractionChange = applyDim;
    return () => { onInteractionChange = null; };
  }, [applyDim]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const mode = await invoke<0 | 1 | 2>('get_fullscreen_mode');
      disturbModeRef.current = mode;
      applyDim();
    }, 500);
    return () => clearInterval(timer);
  }, [applyDim]);

  // 组件卸载时取消主窗口 move 监听
  useEffect(() => {
    return () => { unlistenMoveRef.current?.(); };
  }, []);

  // 初始化：数据库、待办、天气、提醒服务
  useEffect(() => {
    let stopWeather: ReturnType<typeof setInterval>;
    let stopReminder: () => void;
    let stopTimeCycle: () => void;

    // 监听 OpenClaw 推送的消息，显示气泡
    const handleBridgeMessage = (e: Event) => {
      const { message } = (e as CustomEvent).detail;
      // 收到回复，进度条到 100% 后消失
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setTaskProgress(100, true);
      setTimeout(() => setTaskProgress(0, false), 800);
      showSpeech(message, 5000);
      setExpression('happy');
      setTimeout(() => setExpression('default'), 2000);
    };
    window.addEventListener('bridge-message', handleBridgeMessage);

    // 监听 Claude Code Hooks 工作状态事件，更新表情
    const handleClaudeEvent = (e: Event) => {
      const { hook_event_name } = (e as CustomEvent).detail;
      if (hook_event_name === 'PreToolUse' || hook_event_name === 'PostToolUse') {
        hideSpeech();
        setExpression('default');
      } else if (hook_event_name === 'Stop') {
        hideSpeech();
        setExpression('proudly');
        showSpeech('主人，CC完成了任务！', 3000);
        setTimeout(() => setExpression('default'), 3000);
      } else if (hook_event_name === 'PermissionRequest') {
        setExpression('thinking');
        showSpeech('主人，CC需要你的指示！', 999999999);
      }
    };
    window.addEventListener('claude-event', handleClaudeEvent);

    const init = async () => {
      // 确保主窗口获得焦点，否则透明窗口在 Windows 上不会收到鼠标悬停事件
      await getCurrentWindow().setFocus();

      await getDb();

      const loaded = await fetchTodos();
      setTodos(loaded);

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
          showSpeech(`「${todo.title}」还没做完，要注意一下哦 ⚡`, 7000);
          setTimeout(() => setExpression('default'), 3000);
        },
        () => reminderIntervalRef.current
      );

      // 时间联动：按时段切换表情和气泡
      stopTimeCycle = startTimeCycleService((period) => {
        setExpression(period.expression);
        if (period.greeting) showSpeech(period.greeting, 6000);
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
        if (focusHideTimer) clearTimeout(focusHideTimer);
      });
      await listen('focus-mouse-leave', () => {
        focusHideTimer = setTimeout(hideFocusWindow, 500);
      });
    };

    init();
    startColorSampler();

    // 启动桥接服务
    startBridgeService();

    return () => {
      window.removeEventListener('bridge-message', handleBridgeMessage);
      window.removeEventListener('claude-event', handleClaudeEvent);
      if (stopWeather) clearInterval(stopWeather);
      if (stopReminder) stopReminder();
      if (stopTimeCycle) stopTimeCycle();
      stopColorSampler();
      stopBridgeService();
    };
  }, []);

  const handleSend = useCallback(async (text: string) => {
    resetIdle();
    setIsProcessing(true);
    setExpression('thinking');

    try {
      await fetch('http://127.0.0.1:3456/user-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      setExpression('default');

      // 启动进度条轮询
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setTaskProgress(10, true);

      let progress = 10;
      progressTimerRef.current = setInterval(async () => {
        // 越接近 90% 增长越慢，永远不到 90%
        const remaining = 90 - progress;
        const increment = Math.max(0.3, remaining * 0.04);
        progress = Math.min(89, progress + increment);
        setTaskProgress(Math.round(progress), true);
      }, 500);

    } catch (e) {
      showSpeech('OpenClaw 未连接，请确认服务已启动');
      setExpression('worried');
      setTimeout(() => setExpression('default'), 2000);
      setTaskProgress(0, false);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // 初始化：定位子窗口位置，监听主窗口移动同步位置并更新边界缓存
  useEffect(() => {
    const initWindows = async () => {
      const mainWin = getCurrentWindow();
      const mainPos = await mainWin.outerPosition();
      const mainSize = await mainWin.outerSize();
      const sf = await mainWin.scaleFactor();
      const todoWidth = 306, gap = 8;

      const todoWin = await WebviewWindow.getByLabel('todo-manager');
      if (todoWin) {
        await todoWin.setPosition(
          new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf)
        );
      }

      const unlisten = await mainWin.onMoved(async ({ payload: physPos }) => {
        // 子窗口实时跟随
        const tw = await WebviewWindow.getByLabel('todo-manager');
        if (tw) {
          await tw.setPosition(
            new LogicalPosition(physPos.x / sf - todoWidth - gap, physPos.y / sf)
          );
          if (todoVisible) {
            const pos = await tw.outerPosition();
            const size = await tw.outerSize();
            todoBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
          }
        }
        const sw = await WebviewWindow.getByLabel('settings');
        if (sw) {
          await sw.setPosition(
            new LogicalPosition(physPos.x / sf + mainSize.width / sf + gap, physPos.y / sf)
          );
          if (settingsVisible) {
            const pos = await sw.outerPosition();
            const size = await sw.outerSize();
            settingsBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
          }
        }
      });
      unlistenMoveRef.current = unlisten;
    };

    initWindows();
  }, []);

  const handleTodoBtnEnter = () => {
    if (todoHideTimer) clearTimeout(todoHideTimer);
    todoShowTimer = setTimeout(showTodoWindow, 200);
  };

  const handleTodoBtnLeave = () => {
    if (todoShowTimer) clearTimeout(todoShowTimer);
    todoHideTimer = setTimeout(hideTodoWindow, 500);
  };

  const handleFocusBtnEnter = () => {
    if (focusHideTimer) clearTimeout(focusHideTimer);
    focusShowTimer = setTimeout(showFocusWindow, 200);
  };

  const handleFocusBtnLeave = () => {
    if (focusShowTimer) clearTimeout(focusShowTimer);
    focusHideTimer = setTimeout(hideFocusWindow, 500);
  };

  const handleSettingsBtnEnter = () => {
    if (settingsHideTimer) clearTimeout(settingsHideTimer);
    settingsShowTimer = setTimeout(showSettingsWindow, 200);
  };

  const handleSettingsBtnLeave = () => {
    if (settingsShowTimer) clearTimeout(settingsShowTimer);
    settingsHideTimer = setTimeout(hideSettingsWindow, 500);
  };

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
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = null;
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
          if (inputBarTimer) clearTimeout(inputBarTimer);
          inputBarTimer = null;
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
    if (inputBarTimer) clearTimeout(inputBarTimer);
    isInputHoveredRef.current = true;
    applyDim();
    setShowInputBar(true);
  };

  const handleInputBarLeave = () => {
    if (inputBarTimer) clearTimeout(inputBarTimer);
    inputBarTimer = setTimeout(() => {
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

  // 鼠标进入菜单触发区或菜单本身：显示菜单
  const handleMenuZoneEnter = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(true), 200);
  };

  // 鼠标离开菜单触发区或菜单本身：隐藏菜单
  const handleMenuZoneLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(false), 50);
  };

  return (
    <div className="app" style={{
      opacity: isPassthrough ? 0.3 : (disturbMode === 2 ? 0 : disturbMode === 1 ? 0.15 : 1),
      transition: 'opacity 0.4s ease',
      pointerEvents: disturbMode === 2 ? 'none' : 'auto',
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
          onMouseEnter={handleMenuZoneEnter}
          onMouseLeave={handleMenuZoneLeave}
        />

        <HoverMenu
          visible={showHoverMenu}
          onTodoBtnEnter={handleTodoBtnEnter}
          onTodoBtnLeave={handleTodoBtnLeave}
          onFocusBtnEnter={handleFocusBtnEnter}
          onFocusBtnLeave={handleFocusBtnLeave}
          onSettingsBtnEnter={handleSettingsBtnEnter}
          onSettingsBtnLeave={handleSettingsBtnLeave}
          onMenuEnter={handleMenuZoneEnter}
          onMenuLeave={handleMenuZoneLeave}
        />

        <div className="cloud-pet-bubble-anchor">
          <SpeechBubble
            visible={speechBubble.visible}
            text={speechBubble.text}
            onClose={hideSpeech}
          />
          <CloudPet
            expression={expression}
            weather={weather}
            isProcessing={isProcessing}
            focusClock={focusClock}
          />
        </div>
      </div>

      <ProgressBar visible={taskProgressVisible} progress={taskProgress} />
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
