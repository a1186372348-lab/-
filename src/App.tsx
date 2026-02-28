import { useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { resetClient } from './services/ai';
import { useAppStore } from './store';
import { getDb, fetchTodos, insertTodo } from './services/db';
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

// 悬停计时器：鼠标进入容器 600ms 后显示菜单
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
// 待办窗口显示/隐藏计时器
let todoShowTimer: ReturnType<typeof setTimeout> | null = null;
let todoHideTimer: ReturnType<typeof setTimeout> | null = null;
// 设置窗口显示/隐藏计时器
let settingsShowTimer: ReturnType<typeof setTimeout> | null = null;
let settingsHideTimer: ReturnType<typeof setTimeout> | null = null;

async function showTodoWindow() {
  const todoWin = await WebviewWindow.getByLabel('todo-manager');
  if (!todoWin) return;
  const mainWin = getCurrentWindow();
  const mainPos = await mainWin.outerPosition();
  const sf = await mainWin.scaleFactor();
  const todoWidth = 360, gap = 8;
  await todoWin.setPosition(new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf));
  await todoWin.show();
}

async function hideTodoWindow() {
  const todoWin = await WebviewWindow.getByLabel('todo-manager');
  if (!todoWin) return;
  const visible = await todoWin.isVisible();
  if (visible) await todoWin.hide();
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
}

async function hideSettingsWindow() {
  const settingsWin = await WebviewWindow.getByLabel('settings');
  if (!settingsWin) return;
  const visible = await settingsWin.isVisible();
  if (visible) await settingsWin.hide();
}

export default function App() {
  const {
    expression,
    weather,
    showHoverMenu,
    speechBubble,
    isProcessing,
    todos,
    setExpression,
    setWeather,
    setShowHoverMenu,
    showSpeech,
    hideSpeech,
    setTodos,
    addTodo,
    setIsProcessing,
  } = useAppStore();

  const todosRef = useRef(todos);
  todosRef.current = todos;

  const unlistenMoveRef = useRef<(() => void) | null>(null);

  // 组件卸载时取消主窗口 move 监听
  useEffect(() => {
    return () => { unlistenMoveRef.current?.(); };
  }, []);

  // 初始化：数据库、待办、天气、提醒服务
  useEffect(() => {
    let stopWeather: ReturnType<typeof setInterval>;
    let stopReminder: () => void;
    let unlistenEnter: (() => void) | undefined;
    let unlistenLeave: (() => void) | undefined;
    let unlistenSettingsEnter: (() => void) | undefined;
    let unlistenSettingsLeave: (() => void) | undefined;

    const init = async () => {
      await getDb();

      const loaded = await fetchTodos();
      setTodos(loaded);

      stopWeather = startWeatherSync((condition) => {
        setWeather(condition);
        if (condition === 'rainy') setExpression('rainy');
      });

      stopReminder = startReminderService(
        () => todosRef.current,
        (todo) => {
          setExpression('worried');
          thunderSound.play();
          showSpeech(`「${todo.title}」还没做完，要注意一下哦 ⚡`, 7000);
          setTimeout(() => setExpression('default'), 3000);
        }
      );

      // 监听待办窗口鼠标事件，控制隐藏计时器
      unlistenEnter = await listen('todo-mouse-enter', () => {
        if (todoHideTimer) clearTimeout(todoHideTimer);
      });
      unlistenLeave = await listen('todo-mouse-leave', () => {
        todoHideTimer = setTimeout(hideTodoWindow, 500);
      });

      // 监听设置窗口鼠标事件，控制隐藏计时器
      unlistenSettingsEnter = await listen('settings-mouse-enter', () => {
        if (settingsHideTimer) clearTimeout(settingsHideTimer);
      });
      unlistenSettingsLeave = await listen('settings-mouse-leave', () => {
        settingsHideTimer = setTimeout(hideSettingsWindow, 500);
      });

      // 设置保存后重置 AI 客户端缓存
      await listen('settings-changed', () => {
        resetClient();
      });
    };

    init();
    startColorSampler();

    return () => {
      if (stopWeather) clearInterval(stopWeather);
      if (stopReminder) stopReminder();
      stopColorSampler();
      unlistenEnter?.();
      unlistenLeave?.();
      unlistenSettingsEnter?.();
      unlistenSettingsLeave?.();
    };
  }, []);

  const handleSend = useCallback(async (text: string) => {
    setIsProcessing(true);
    setExpression('talking');

    try {
      const response = await processInput(text);

      if (response.intent === 'create_todo' && response.todo) {
        const newTodo = await insertTodo(response.todo.title, response.todo.priority);
        addTodo(newTodo);
        setExpression('happy');
        showSpeech(response.reply);
        setTimeout(() => setExpression('default'), 2000);
      } else {
        setExpression('default');
        showSpeech(response.reply);
      }
    } catch {
      showSpeech('哎呀，出了点问题，稍后再试试～');
      setExpression('default');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // 初始化：定位待办窗口到主窗口左侧，并监听主窗口移动同步位置
  useEffect(() => {
    const initTodoWindow = async () => {
      const todoWin = await WebviewWindow.getByLabel('todo-manager');
      if (!todoWin) return;

      const mainWin = getCurrentWindow();
      const mainPos = await mainWin.outerPosition();
      const sf = await mainWin.scaleFactor();
      const todoWidth = 360;
      const gap = 8;

      await todoWin.setPosition(
        new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf)
      );

      const unlisten = await mainWin.onMoved(async ({ payload: physPos }) => {
        const win = await WebviewWindow.getByLabel('todo-manager');
        if (!win) return;
        await win.setPosition(
          new LogicalPosition(physPos.x / sf - todoWidth - gap, physPos.y / sf)
        );
      });
      unlistenMoveRef.current = unlisten;
    };

    initTodoWindow();
  }, []);

  const handleTodoBtnEnter = () => {
    if (todoHideTimer) clearTimeout(todoHideTimer);
    todoShowTimer = setTimeout(showTodoWindow, 500);
  };

  const handleTodoBtnLeave = () => {
    if (todoShowTimer) clearTimeout(todoShowTimer);
    todoHideTimer = setTimeout(hideTodoWindow, 500);
  };

  const handleSettingsBtnEnter = () => {
    if (settingsHideTimer) clearTimeout(settingsHideTimer);
    settingsShowTimer = setTimeout(showSettingsWindow, 500);
  };

  const handleSettingsBtnLeave = () => {
    if (settingsShowTimer) clearTimeout(settingsShowTimer);
    settingsHideTimer = setTimeout(hideSettingsWindow, 500);
  };

  // 鼠标进入云朵+菜单容器：600ms 后显示菜单
  const handlePetAreaEnter = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(true), 600);
  };

  // 鼠标离开云朵+菜单容器：延迟 150ms 隐藏，确保按钮 click 事件能先触发
  const handlePetAreaLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(false), 150);
  };

  return (
    <div className="app">
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

      <InputBar onSend={handleSend} isProcessing={isProcessing} />
    </div>
  );
}
