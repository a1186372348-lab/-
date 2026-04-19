/**
 * App.tsx — 薄协调层（~96 行）
 *
 * 本文件仅保留页面组装、用户交互入口、AI 表现协调和本地 UI state。
 * 窗口编排（子窗口 show/hide、光标轮询、低干扰、穿透、hover 交互）
 *   已迁至 useWindowOrchestration
 * 运行时（服务生命周期、事件桥接、空闲计时）
 *   已迁至 useAppRuntime
 */

import { useCallback, useState } from 'react';
import { Howl } from 'howler';
import { typedEmitTo } from './events';
import { chatStream } from './services/ai';
import { useAppStore } from './store';
import type { WeatherCondition } from './types';
import { useWindowOrchestration } from './hooks/useWindowOrchestration';
import { useAppRuntime } from './hooks/useAppRuntime';
import CloudPet from './components/CloudPet';
import InputBar from './components/InputBar';
import HoverMenu from './components/HoverMenu';
import './App.css';

const thunderSound = new Howl({ src: ['/sounds/thunder.mp3'], volume: 0.4, preload: false });

// resetIdle 桥接：useAppRuntime → useWindowOrchestration
let _resetIdle: () => void = () => {};

export default function App() {
  const { expression, weather, showHoverMenu, isProcessing,
    setExpression, setWeather, setShowHoverMenu, setIsProcessing } = useAppStore();

  const [showInputBar, setShowInputBar] = useState(false);
  const [ccActive, setCcActive] = useState(false);

  const winOrch = useWindowOrchestration({
    setShowHoverMenu, setShowInputBar, onActivity: () => _resetIdle(),
  });
  const { showSpeech, displayDisturbMode, isPassthrough } = winOrch;

  const { resetIdle } = useAppRuntime({
    onWeather: (c) => { setWeather(c as WeatherCondition); if (c === 'rainy') setExpression('rainy'); },
    setExpression,
    showSpeech,
    getDisturbMode: () => winOrch.disturbModeRef.current,
    isUserTyping: () => winOrch.isInputFocusedRef.current,
    setCcActive, setIsProcessing,
    playThunder: () => thunderSound.play(),
    focusHideTimerRef: winOrch.focusHideTimerRef,
    hideFocusWindow: winOrch.hideFocusWindow,
  });
  _resetIdle = resetIdle;

  const handleSend = useCallback(async (text: string) => {
    resetIdle();
    setIsProcessing(true);
    setExpression('thinking');
    let firstChunk = true;
    await chatStream(text, (delta) => {
      if (firstChunk) { showSpeech(delta, 0); firstChunk = false; setExpression('happy'); }
      else typedEmitTo('speech-bubble', 'speech:append', { delta });
    });
    typedEmitTo('speech-bubble', 'speech:done', { duration: 5000 });
    setTimeout(() => setExpression('default'), 2000);
    setIsProcessing(false);
  }, []);

  return (
    <div className="app" style={{
      opacity: isPassthrough ? 0.3
        : (ccActive && displayDisturbMode !== 0) ? 1
        : (displayDisturbMode === 2 ? 0 : displayDisturbMode === 1 ? 0.15 : 1),
      transition: 'opacity 0.4s ease',
      pointerEvents: (displayDisturbMode === 2 && !ccActive) ? 'none' : 'auto',
    }}>
      <div ref={winOrch.petAreaRef} className="pet-area"
        onMouseEnter={winOrch.handlePetAreaEnter} onMouseLeave={winOrch.handlePetAreaLeave}>
        <div className="menu-trigger"
          onMouseEnter={winOrch.handleMenuZoneEnter} onMouseLeave={winOrch.handleMenuZoneLeave} />
        <HoverMenu visible={showHoverMenu}
          onTodoBtnEnter={winOrch.handleTodoBtnEnter} onTodoBtnLeave={winOrch.handleTodoBtnLeave}
          onFocusBtnEnter={winOrch.handleFocusBtnEnter} onFocusBtnLeave={winOrch.handleFocusBtnLeave}
          onSettingsBtnEnter={winOrch.handleSettingsBtnEnter} onSettingsBtnLeave={winOrch.handleSettingsBtnLeave}
          onSchedulerBtnEnter={winOrch.handleSchedulerBtnEnter} onSchedulerBtnLeave={winOrch.handleSchedulerBtnLeave}
          onMenuEnter={winOrch.handleMenuZoneEnter} onMenuLeave={winOrch.handleMenuZoneLeave} />
        <div className="cloud-pet-bubble-anchor">
          <CloudPet expression={expression} weather={weather} isProcessing={isProcessing} />
        </div>
      </div>
      <div ref={winOrch.inputBarRef} style={{ width: '100%', transform: 'translateY(-40px)', paddingTop: '20px' }}>
        <InputBar onSend={handleSend} isProcessing={isProcessing} visible={showInputBar}
          onMouseEnter={winOrch.handleInputBarEnter} onMouseLeave={winOrch.handleInputBarLeave}
          onInputFocus={winOrch.handleInputFocus} onInputBlur={winOrch.handleInputBlur} />
      </div>
    </div>
  );
}
