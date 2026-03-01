import { useEffect, useRef, useCallback, useState } from 'react';
import { Howl } from 'howler';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { resetClient } from './services/ai';
import { useAppStore } from './store';
import { getDb, fetchTodos, insertTodo, getSetting } from './services/db';
import { processInput } from './services/ai';
import { startWeatherSync } from './services/weather';
import { startReminderService } from './services/reminder';
import { startColorSampler, stopColorSampler } from './services/colorSampler';
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import SpeechBubble from './components/SpeechBubble';
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
// 待办/设置窗口显示/隐藏计时器
let todoShowTimer: ReturnType<typeof setTimeout> | null = null;
let todoHideTimer: ReturnType<typeof setTimeout> | null = null;
let settingsShowTimer: ReturnType<typeof setTimeout> | null = null;
let settingsHideTimer: ReturnType<typeof setTimeout> | null = null;

// 光标轮询：记录子窗口可见状态和物理边界
let todoVisible = false;
let settingsVisible = false;

// 低干扰豁免：任意交互发生时调用，通知组件重新计算透明度
let onInteractionChange: (() => void) | null = null;
type Bounds = { x: number; y: number; w: number; h: number };
let todoBounds: Bounds | null = null;
let settingsBounds: Bounds | null = null;
let cursorPollTimer: ReturnType<typeof setInterval> | null = null;

function stopCursorPoll() {
  if (cursorPollTimer) { clearInterval(cursorPollTimer); cursorPollTimer = null; }
}

function startCursorPoll() {
  if (cursorPollTimer) return;
  let prevInsideTodo = false;
  let prevInsideSettings = false;

  cursorPollTimer = setInterval(async () => {
    if (!todoVisible && !settingsVisible) { stopCursorPoll(); return; }

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

async function showSettingsWindow() {
  const settingsWin = await WebviewWindow.getByLabel('settings');
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
    addTodo,
    setIsProcessing,
  } = useAppStore();

  const reminderIntervalRef = useRef<number>(60);

  const unlistenMoveRef = useRef<(() => void) | null>(null);

  // 低干扰模式：0=正常，1=半透（最大化应用），2=隐藏（无边框全屏游戏）
  const disturbModeRef = useRef<0 | 1 | 2>(0);
  const isPetHoveredRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const [disturbMode, setDisturbMode] = useState<0 | 1 | 2>(0);

  const applyDim = useCallback(() => {
    // 任意交互时恢复正常：悬停云朵、输入框聚焦、待办窗口打开、设置窗口打开
    const isActive = isPetHoveredRef.current
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
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // 组件卸载时取消主窗口 move 监听
  useEffect(() => {
    return () => { unlistenMoveRef.current?.(); };
  }, []);

  // 初始化：数据库、待办、天气、提醒服务
  useEffect(() => {
    let stopWeather: ReturnType<typeof setInterval>;
    let stopReminder: () => void;

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
    };

    init();
    startColorSampler();

    return () => {
      if (stopWeather) clearInterval(stopWeather);
      if (stopReminder) stopReminder();
      stopColorSampler();
    };
  }, []);

  const handleSend = useCallback(async (text: string) => {
    resetIdle();
    setIsProcessing(true);
    setExpression('thinking');

    try {
      const currentTodos = useAppStore.getState().todos;
      const response = await processInput(text, currentTodos);
      console.log('[AI response]', JSON.stringify(response));

      if (response.intent === 'create_todo' && response.todo) {
        const newTodo = await insertTodo(response.todo.title, response.todo.priority);
        addTodo(newTodo);
        console.log('[Todo created]', newTodo);
        setExpression('happy');
        showSpeech(response.reply);
        setTimeout(() => setExpression('default'), 2000);
      } else if (response.intent === 'create_todo' && !response.todo) {
        // AI 意图是创建任务但没返回 todo 字段——提示用户重试
        console.warn('[AI] create_todo intent but no todo field:', response);
        setExpression('worried');
        showSpeech('哎，我好像没记下来，能再说一遍吗？');
        setTimeout(() => setExpression('default'), 2000);
      } else {
        setExpression('default');
        showSpeech(response.reply);
      }
    } catch (e) {
      console.error('[handleSend error]', e);
      showSpeech('哎呀，出了点问题，稍后再试试～');
      setExpression('default');
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

  const handleInputFocus = useCallback(() => {
    isInputFocusedRef.current = true;
    applyDim();
  }, [applyDim]);

  const handleInputBlur = useCallback(() => {
    isInputFocusedRef.current = false;
    applyDim();
  }, [applyDim]);

  // 鼠标进入云朵+菜单容器：600ms 后显示菜单
  const handlePetAreaEnter = () => {
    isPetHoveredRef.current = true;
    applyDim();
    resetIdle();
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(true), 600);
  };

  // 鼠标离开云朵+菜单容器：延迟 150ms 隐藏
  const handlePetAreaLeave = () => {
    isPetHoveredRef.current = false;
    applyDim();
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(false), 150);
  };

  return (
    <div className="app" style={{
      opacity: disturbMode === 2 ? 0 : disturbMode === 1 ? 0.1 : 1,
      transition: 'opacity 0.4s ease',
      pointerEvents: disturbMode === 2 ? 'none' : 'auto',
    }}>
      <SpeechBubble
        visible={speechBubble.visible}
        text={speechBubble.text}
        onClose={hideSpeech}
      />

      {/* 云朵 + 菜单共用一个容器，统一处理 enter/leave */}
      <div
        className="pet-area"
        onMouseEnter={handlePetAreaEnter}
        onMouseLeave={handlePetAreaLeave}
      >
        <HoverMenu
          visible={showHoverMenu}
          onTodoBtnEnter={handleTodoBtnEnter}
          onTodoBtnLeave={handleTodoBtnLeave}
          onSettingsBtnEnter={handleSettingsBtnEnter}
          onSettingsBtnLeave={handleSettingsBtnLeave}
        />

        <CloudPet
          expression={expression}
          weather={weather}
          isProcessing={isProcessing}
        />
      </div>

      <InputBar
        onSend={handleSend}
        isProcessing={isProcessing}
        onInputFocus={handleInputFocus}
        onInputBlur={handleInputBlur}
      />
    </div>
  );
}
