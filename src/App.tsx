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
 * ║ 【已迁往 useAppRuntime（US-014）】                               ║
 * ║  ✓ 常驻服务生命周期：startWeatherSync, startReminderService,      ║
 * ║    startTimeCycleService, startSchedulerService,                  ║
 * ║    startColorSampler, startScreenMonitor                          ║
 * ║  ✓ 事件桥接：settings-changed, all-todos-complete,               ║
 * ║    focus-phase-change, focus-start, focus-pause, focus-reset,     ║
 * ║    focus-tick, focus-mouse-enter, focus-mouse-leave, cc-event     ║
 * ║  ✓ 空闲计时：idleTimer, IDLE_MS, resetIdle                       ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { useRef, useCallback, useState } from 'react';
import { Howl } from 'howler';
import { emit } from '@tauri-apps/api/event';
import { chatStream } from './services/ai';
import { useAppStore } from './store';
import type { WeatherCondition } from './types';
import { useWindowOrchestration } from './hooks/useWindowOrchestration';
import { useAppRuntime } from './hooks/useAppRuntime';
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import './App.css';

const thunderSound = new Howl({
  src: ['/sounds/thunder.mp3'],
  volume: 0.4,
  preload: false,
});

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
  const [focusClock, setFocusClock] = useState<{
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null>(null);
  const [ccActive, setCcActive] = useState(false);

  // 提醒间隔缓存（供 useAppRuntime 读写）
  const reminderIntervalRef = useRef(60);

  // ── ref bridge：resetIdle 从 useAppRuntime 传递到 useWindowOrchestration ──
  const resetIdleRef = useRef<() => void>(() => {});

  // ── 窗口编排 hook ──────
  const winOrch = useWindowOrchestration({
    setShowHoverMenu,
    setShowInputBar,
    onActivity: () => resetIdleRef.current(),
  });
  const { showSpeech, displayDisturbMode, isPassthrough } = winOrch;

  // ── 运行时 hook（US-014：接入服务生命周期、事件桥接、空闲计时） ──
  const { resetIdle } = useAppRuntime({
    onWeather: (condition) => {
      setWeather(condition as WeatherCondition);
      if (condition === 'rainy') setExpression('rainy');
    },
    setExpression,
    showSpeech,
    getDisturbMode: () => winOrch.disturbModeRef.current,
    isUserTyping: () => winOrch.isInputFocusedRef.current,
    getReminderInterval: () => reminderIntervalRef.current,
    setReminderInterval: (min) => { reminderIntervalRef.current = min; },
    setFocusClock,
    setCcActive,
    setIsProcessing,
    playThunder: () => thunderSound.play(),
    focusHideTimerRef: winOrch.focusHideTimerRef,
    hideFocusWindow: winOrch.hideFocusWindow,
  });

  // Bridge resetIdle to ref for useWindowOrchestration
  resetIdleRef.current = resetIdle;

  const handleSend = useCallback(async (text: string) => {
    resetIdle();
    setIsProcessing(true);
    setExpression('thinking');

    let firstChunk = true;
    await chatStream(text, (delta) => {
      if (firstChunk) {
        showSpeech(delta, 0);
        firstChunk = false;
        setExpression('happy');
      } else {
        emit('speech:append', { delta });
      }
    });

    emit('speech:done', { duration: 5000 });
    setTimeout(() => setExpression('default'), 2000);
    setIsProcessing(false);
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
