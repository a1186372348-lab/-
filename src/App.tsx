import { useEffect, useRef, useCallback, useState } from 'react';
import { Howl } from 'howler';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
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
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import './App.css';

const thunderSound = new Howl({
  src: ['/sounds/thunder.mp3'],
  volume: 0.4,
  preload: false,
});

// 绌洪棽璁℃椂鍣細30 鍒嗛挓鏃犳搷浣滆Е鍙?sleepy
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 30 * 60 * 1000;

// 鎮仠璁℃椂鍣細榧犳爣杩涘叆瀹瑰櫒 600ms 鍚庢樉绀鸿彍鍗?
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let inputBarTimer: ReturnType<typeof setTimeout> | null = null;
// 寰呭姙/璁剧疆绐楀彛鏄剧ず/闅愯棌璁℃椂鍣?
let todoShowTimer: ReturnType<typeof setTimeout> | null = null;
let todoHideTimer: ReturnType<typeof setTimeout> | null = null;
let settingsShowTimer: ReturnType<typeof setTimeout> | null = null;
let settingsHideTimer: ReturnType<typeof setTimeout> | null = null;
let focusShowTimer: ReturnType<typeof setTimeout> | null = null;
let focusHideTimer: ReturnType<typeof setTimeout> | null = null;

// 鍏夋爣杞锛氳褰曞瓙绐楀彛鍙鐘舵€佸拰鐗╃悊杈圭晫
let todoVisible = false;
let settingsVisible = false;
let focusVisible = false;

// 浣庡共鎵拌眮鍏嶏細浠绘剰浜や簰鍙戠敓鏃惰皟鐢紝閫氱煡缁勪欢閲嶆柊璁＄畻閫忔槑搴?
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
  // 鏄剧ず鍦ㄤ富绐楀彛姝ｄ笂鏂瑰眳涓紝椤堕儴涓庝富绐楀彛椤堕儴瀵归綈
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
    isProcessing,
    setExpression,
    setWeather,
    setShowHoverMenu,
    setIsProcessing,
  } = useAppStore();

  // ── 气泡窗口控制 ─────────────────────────────────────────────
  // 云朵顶部距主窗口顶部约 70px（逻辑像素），气泡窗口高 210px
  const CLOUD_TOP_OFFSET = 40;
  const BUBBLE_WIN_H = 210;
  const bubbleReadyRef = useRef(false); // 记录气泡窗口是否已首次 show（WebView 已初始化）

  const showSpeech = useCallback(async (text: string, durationMs = 5000) => {
    try {
      const mainWin = getCurrentWindow();
      const bubbleWin = await WebviewWindow.getByLabel('speech-bubble');
      if (!bubbleWin) return;
      const pos = await mainWin.outerPosition();
      const sf = await mainWin.scaleFactor();
      // 1. 先定位（窗口隐藏时定位不会闪烁）
      await bubbleWin.setPosition(new LogicalPosition(
        pos.x / sf,
        Math.max(0, pos.y / sf + CLOUD_TOP_OFFSET - BUBBLE_WIN_H),
      ));
      // 2. 首次 show：等 WebView 完成初始化再 emit
      if (!bubbleReadyRef.current) {
        await bubbleWin.show();
        bubbleReadyRef.current = true;
        // 等待 React 挂载并注册 listen（WebView2 冷启动约需 300ms）
        await new Promise<void>(r => setTimeout(r, 400));
      }
      // 3. 发送内容，React 渲染气泡并关闭穿透
      await emit('speech:show', { text, duration: durationMs });
    } catch {
      // 静默失败
    }
  }, []);


  const reminderIntervalRef = useRef<number>(60);

  const [isPassthrough, setIsPassthrough] = useState(false);
  const [focusClock, setFocusClock] = useState<{
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null>(null);
  const [showInputBar, setShowInputBar] = useState(false);
  const unlistenMoveRef = useRef<(() => void) | null>(null);
  const unlistenFocusRef = useRef<(() => void) | null>(null);
  const petAreaRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const showHoverMenuRef = useRef(false);
  const showInputBarRef = useRef(false);
  const disturbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disturbHoverStartRef = useRef<number | null>(null);

  // 浣庡共鎵版ā寮忥細0=姝ｅ父锛?=鍗婇€忥紙鏈€澶у寲搴旂敤锛夛紝2=闅愯棌锛堟棤杈规鍏ㄥ睆娓告垙锛?
  const disturbModeRef = useRef<0 | 1 | 2>(0);
  const isPetHoveredRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const isInputHoveredRef = useRef(false);
  const [disturbMode, setDisturbMode] = useState<0 | 1 | 2>(0);

  // CC 工作感知：CC 有事件时临时显形
  const [ccActive, setCcActive] = useState(false);
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDim = useCallback(() => {
    // 浠绘剰浜や簰鏃舵仮澶嶆甯革細鎮仠浜戞湹銆佹偓鍋滆緭鍏ユ銆佽緭鍏ユ鑱氱劍銆佸緟鍔炵獥鍙ｆ墦寮€銆佽缃獥鍙ｆ墦寮€
    const isActive = isPetHoveredRef.current
      || isInputHoveredRef.current
      || isInputFocusedRef.current
      || todoVisible
      || settingsVisible;
    setDisturbMode(isActive ? 0 : disturbModeRef.current);
  }, []);

  // 娉ㄥ唽鍒版ā鍧楃骇鍥炶皟锛屼緵 show/hideTodoWindow 绛夊嚱鏁拌皟鐢?
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

  // 浣庡共鎵版ā寮忎笅锛氬惎鐢ㄧ偣鍑荤┛閫?+ 杞鍏夋爣浣嶇疆锛屾偓鍋?2s 鍚庢樉褰?
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

  // 组件卸载时取消主窗口事件监听
  useEffect(() => {
    return () => {
      unlistenMoveRef.current?.();
      unlistenFocusRef.current?.();
    };
  }, []);

  // 鍒濆鍖栵細鏁版嵁搴撱€佸緟鍔炪€佸ぉ姘斻€佹彁閱掓湇鍔?
  useEffect(() => {
    let stopWeather: ReturnType<typeof setInterval>;
    let stopReminder: () => void;
    let stopTimeCycle: () => void;

    const init = async () => {
      // 纭繚涓荤獥鍙ｈ幏寰楃劍鐐癸紝鍚﹀垯閫忔槑绐楀彛鍦?Windows 涓婁笉浼氭敹鍒伴紶鏍囨偓鍋滀簨浠?
      await getCurrentWindow().setFocus();

      await getDb();


      // 鍔犺浇鎻愰啋闂撮殧璁剧疆
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

      // 鏃堕棿鑱斿姩锛氭寜鏃舵鍒囨崲琛ㄦ儏鍜屾皵娉?
      stopTimeCycle = startTimeCycleService((period) => {
        setExpression(period.expression);
        if (period.greeting) showSpeech(period.greeting, 6000);
      });

      // 璁剧疆淇濆瓨鍚庨噸缃?AI 瀹㈡埛绔紦瀛樺苟鏇存柊鎻愰啋闂撮殧
      await listen('settings-changed', async () => {
        resetClient();
        const interval = await getSetting('reminder_interval_min');
        reminderIntervalRef.current = interval ? parseInt(interval) : 60;
      });

      // 鎵€鏈夊緟鍔炲畬鎴愭椂瑙﹀彂 proudly
      await listen('all-todos-complete', () => {
        setExpression('proudly');
        setTimeout(() => setExpression('default'), 3000);
      });

      await listen<{ phase: string; remainSecs: number }>('focus-phase-change', ({ payload }) => {
        const next = payload.phase as 'focus' | 'rest';
        if (next === 'rest') {
          showSpeech('涓撴敞缁撴潫锛佷紤鎭竴涓嬪惂 馃帀', 5000);
          setExpression('happy');
          setTimeout(() => setExpression('default'), 2000);
        } else {
          showSpeech('浼戞伅缁撴潫锛岀户缁笓娉紒鍔犳补 馃挭', 4000);
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

  // 鍒濆鍖栵細瀹氫綅瀛愮獥鍙ｄ綅缃紝鐩戝惉涓荤獥鍙ｇЩ鍔ㄥ悓姝ヤ綅缃苟鏇存柊杈圭晫缂撳瓨
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
        // 瀛愮獥鍙ｅ疄鏃惰窡闅?
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
        const bw = await WebviewWindow.getByLabel('speech-bubble');
        if (bw) {
          await bw.setPosition(new LogicalPosition(
            physPos.x / sf,
            physPos.y / sf + CLOUD_TOP_OFFSET - BUBBLE_WIN_H,
          ));
        }
      });
      unlistenMoveRef.current = unlisten;

      // 窗口失焦（最小化 / 其他窗口获焦）→ 重置悬停 ref，防止低干扰模式被卡住
      // 用 Tauri 原生事件，比 window.blur 在 WebView2 里更可靠
      const unlistenFocus = await mainWin.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          isPetHoveredRef.current = false;
          isInputHoveredRef.current = false;
          isInputFocusedRef.current = false;
          applyDim();
        }
      });
      unlistenFocusRef.current = unlistenFocus;
    };

    initWindows();
  }, [applyDim]);

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

  // 閲嶇疆绌洪棽璁℃椂鍣紙鐢ㄦ埛鏈変氦浜掓椂璋冪敤锛?
  const resetIdle = useCallback(() => {
    if (idleTimer) clearTimeout(idleTimer);
    // 鑻ュ綋鍓嶆槸 sleepy锛屾仮澶?default
    if (useAppStore.getState().expression === 'sleepy') {
      setExpression('default');
    }
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
  }, []);

  // 鍚姩 idle 璁℃椂鍣?
  useEffect(() => {
    idleTimer = setTimeout(() => setExpression('sleepy'), IDLE_MS);
    return () => { if (idleTimer) clearTimeout(idleTimer); };
  }, []);

  // 鍚屾 showHoverMenu 鐘舵€佸埌 ref锛屼緵 mousemove 鐩戝惉鍣ㄤ娇鐢?
  useEffect(() => {
    showHoverMenuRef.current = showHoverMenu;
  }, [showHoverMenu]);

  // 鍚屾 showInputBar 鐘舵€佸埌 ref锛屼緵 mousemove 鐩戝惉鍣ㄤ娇鐢?
  useEffect(() => {
    showInputBarRef.current = showInputBar;
  }, [showInputBar]);

  // 鍏滃簳锛歞ocument mousemove 妫€娴嬮紶鏍囨槸鍚︾湡姝ｇ寮€ pet-area / input-bar
  // 闃叉 Tauri 閫忔槑绐楀彛鍋跺彂鎬т涪澶?onMouseLeave 浜嬩欢
  useEffect(() => {
    const checkBounds = (e: MouseEvent) => {
      // HoverMenu 鍏滃簳
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
      // InputBar 鍏滃簳
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

  // 榧犳爣杩涘叆浜戞湹鍖哄煙锛氱淮鎶や綆骞叉壈鐘舵€?
  const handlePetAreaEnter = () => {
    isPetHoveredRef.current = true;
    applyDim();
    resetIdle();
  };

  // 榧犳爣绂诲紑浜戞湹鍖哄煙
  const handlePetAreaLeave = () => {
    isPetHoveredRef.current = false;
    applyDim();
  };

  // 榧犳爣杩涘叆鑿滃崟瑙﹀彂鍖烘垨鑿滃崟鏈韩锛氭樉绀鸿彍鍗?
  const handleMenuZoneEnter = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(true), 200);
  };

  // 榧犳爣绂诲紑鑿滃崟瑙﹀彂鍖烘垨鑿滃崟鏈韩锛氶殣钘忚彍鍗?
  const handleMenuZoneLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(false), 50);
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
      {/* 浜戞湹 + 鑿滃崟瀹瑰櫒 */}
      <div
        ref={petAreaRef}
        className="pet-area"
        onMouseEnter={handlePetAreaEnter}
        onMouseLeave={handlePetAreaLeave}
      >
        {/* 鑿滃崟瑙﹀彂鍖猴細鎮仠鍦ㄦ澶勬墠鏄剧ず鑿滃崟 */}
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

