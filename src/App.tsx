import { useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
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

// 显示计时器：鼠标悬停云朵 800ms 后显示菜单
// 隐藏计时器：鼠标离开云朵或菜单后 300ms 才隐藏，给用户足够时间移到菜单
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

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

  const handleOpenTodoWindow = useCallback(async () => {
    // 若窗口已存在则聚焦，否则新建
    const existing = await WebviewWindow.getByLabel('todo-manager');
    if (existing) {
      await existing.setFocus();
      return;
    }

    const mainWin = getCurrentWindow();
    const mainPos = await mainWin.outerPosition(); // 物理像素
    const sf = await mainWin.scaleFactor();

    const todoWidth = 360;
    const gap = 8;
    // 紧靠主窗口左侧，顶部对齐
    const todoX = mainPos.x / sf - todoWidth - gap;
    const todoY = mainPos.y / sf;

    new WebviewWindow('todo-manager', {
      url: '/?page=todos',
      title: '云宝待办',
      width: todoWidth,
      height: 540,
      x: todoX,
      y: todoY,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: false,
    });

    // 取消旧的 move 监听（如有）
    unlistenMoveRef.current?.();

    // 监听主窗口移动，同步更新待办窗口位置
    unlistenMoveRef.current = await mainWin.onMoved(async ({ payload: physPos }) => {
      const todoWin = await WebviewWindow.getByLabel('todo-manager');
      if (!todoWin) {
        unlistenMoveRef.current?.();
        unlistenMoveRef.current = null;
        return;
      }
      await todoWin.setPosition(
        new LogicalPosition(physPos.x / sf - todoWidth - gap, physPos.y / sf)
      );
    });
  }, []);

  // 鼠标进入云朵：取消隐藏计时器，启动显示计时器（800ms）
  const handleCloudMouseEnter = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hoverTimer = setTimeout(() => setShowHoverMenu(true), 800);
  };

  // 鼠标离开云朵：取消显示计时器，启动隐藏计时器（300ms 缓冲，供用户移到菜单）
  const handleCloudMouseLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    hideTimer = setTimeout(() => setShowHoverMenu(false), 300);
  };

  // 鼠标进入菜单：取消隐藏计时器，菜单保持显示
  const handleMenuMouseEnter = () => {
    if (hideTimer) clearTimeout(hideTimer);
  };

  // 鼠标离开菜单：隐藏菜单
  const handleMenuMouseLeave = () => {
    setShowHoverMenu(false);
  };

  // 安全兜底：鼠标离开整个窗口时清理
  const handleAppMouseLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    if (hideTimer) clearTimeout(hideTimer);
    setShowHoverMenu(false);
  };

  return (
    <div className="app" onMouseLeave={handleAppMouseLeave}>
      <SpeechBubble
        visible={speechBubble.visible}
        text={speechBubble.text}
        onClose={hideSpeech}
      />

      <HoverMenu
        visible={showHoverMenu}
        onSelectTodo={() => {
          handleOpenTodoWindow();
          setShowHoverMenu(false);
        }}
        onSelectSettings={() => {
          showSpeech('设置功能即将到来～');
          setShowHoverMenu(false);
        }}
        onMouseEnter={handleMenuMouseEnter}
        onMouseLeave={handleMenuMouseLeave}
      />

      <CloudPet
        expression={expression}
        weather={weather}
        isProcessing={isProcessing}
        onMouseEnter={handleCloudMouseEnter}
        onMouseLeave={handleCloudMouseLeave}
      />

      <InputBar onSend={handleSend} isProcessing={isProcessing} />
    </div>
  );
}
