import { useRef, useCallback, useEffect, useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

// ── 内部类型 ──────────────────────────────────────────────
type Bounds = { x: number; y: number; w: number; h: number };

// ── Hook 参数 ─────────────────────────────────────────────
interface WindowOrchestrationOpts {
  onInteractionChange?: () => void;
  setShowHoverMenu?: (show: boolean) => void;
  setShowInputBar?: (show: boolean) => void;
  onActivity?: () => void;
}

// ── Hook ──────────────────────────────────────────────────
export function useWindowOrchestration(opts?: WindowOrchestrationOpts) {
  // 子窗口可见性跟踪
  const todoVisibleRef = useRef(false);
  const settingsVisibleRef = useRef(false);
  const focusVisibleRef = useRef(false);
  const schedulerVisibleRef = useRef(false);

  // 子窗口物理边界缓存（光标轮询命中检测用）
  const todoBoundsRef = useRef<Bounds | null>(null);
  const settingsBoundsRef = useRef<Bounds | null>(null);
  const focusBoundsRef = useRef<Bounds | null>(null);
  const schedulerBoundsRef = useRef<Bounds | null>(null);

  // 光标轮询计时器
  const cursorPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hover 延时计时器
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputBarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todoShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulerShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulerHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 气泡窗口就绪标记
  const bubbleReadyRef = useRef(false);

  // 过渡期交互回调（低干扰模式通知）
  const onInteractionChangeRef = useRef<(() => void) | null>(null);
  // 外部传入的 setShowHoverMenu 回调
  const setShowHoverMenuRef = useRef<((show: boolean) => void) | null>(null);

  // 气泡窗口联动常量
  const CLOUD_TOP_OFFSET = 40;
  const BUBBLE_WIN_H = 120;

  // 主窗口事件清理函数
  const unlistenMoveRef = useRef<(() => void) | null>(null);
  const unlistenFocusRef = useRef<(() => void) | null>(null);

  // ── 低干扰模式 refs ──────────────────────────────────────
  const disturbModeRef = useRef<0 | 1 | 2>(0);
  const disturbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disturbHoverStartRef = useRef<number | null>(null);

  // 宠物/输入栏交互跟踪
  const isPetHoveredRef = useRef(false);
  const isInputHoveredRef = useRef(false);
  const isInputFocusedRef = useRef(false);

  // DOM refs
  const petAreaRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);

  // 内部 show 状态跟踪（mousemove 兜底用）
  const hoverMenuShownRef = useRef(false);
  const inputBarShownRef = useRef(false);

  // 额外 setter refs
  const setShowInputBarRef = useRef<((show: boolean) => void) | null>(null);
  const onActivityRef = useRef<(() => void) | null>(null);

  // 低干扰展示状态
  const [displayDisturbMode, setDisplayDisturbMode] = useState<0 | 1 | 2>(0);
  // Ctrl 穿透状态
  const [isPassthrough, setIsPassthrough] = useState(false);

  // 同步外部传入的 onInteractionChange 到 ref
  useEffect(() => {
    onInteractionChangeRef.current = opts?.onInteractionChange ?? null;
  }, [opts?.onInteractionChange]);

  // 同步外部传入的 setShowHoverMenu 到 ref
  useEffect(() => {
    setShowHoverMenuRef.current = opts?.setShowHoverMenu ?? null;
  }, [opts?.setShowHoverMenu]);

  // 同步外部传入的 setShowInputBar 到 ref
  useEffect(() => {
    setShowInputBarRef.current = opts?.setShowInputBar ?? null;
  }, [opts?.setShowInputBar]);

  // 同步外部传入的 onActivity 到 ref
  useEffect(() => {
    onActivityRef.current = opts?.onActivity ?? null;
  }, [opts?.onActivity]);

  // ── 低干扰模式：计算展示状态 ────────────────────────────
  const applyDim = useCallback(() => {
    const isActive = isPetHoveredRef.current
      || isInputHoveredRef.current
      || isInputFocusedRef.current
      || todoVisibleRef.current
      || settingsVisibleRef.current;
    setDisplayDisturbMode(isActive ? 0 : disturbModeRef.current);
  }, []);

  // ── 光标轮询：停止 ──────────────────────────────────────
  const stopCursorPoll = useCallback(() => {
    if (cursorPollTimerRef.current) {
      clearInterval(cursorPollTimerRef.current);
      cursorPollTimerRef.current = null;
    }
  }, []);

  // ── 子窗口 hide helpers ─────────────────────────────────

  const hideSchedulerWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('scheduler');
    if (!win) return;
    const visible = await win.isVisible();
    if (visible) await win.hide();
    schedulerVisibleRef.current = false;
    schedulerBoundsRef.current = null;
    if (
      !todoVisibleRef.current &&
      !settingsVisibleRef.current &&
      !focusVisibleRef.current
    ) {
      stopCursorPoll();
    }
  }, []);

  const hideTodoWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('todo-manager');
    if (!win) return;
    const visible = await win.isVisible();
    if (visible) await win.hide();
    todoVisibleRef.current = false;
    todoBoundsRef.current = null;
    applyDim();
    if (
      !settingsVisibleRef.current &&
      !focusVisibleRef.current &&
      !schedulerVisibleRef.current
    ) {
      stopCursorPoll();
    }
  }, []);

  const hideSettingsWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('settings');
    if (!win) return;
    const visible = await win.isVisible();
    if (visible) await win.hide();
    settingsVisibleRef.current = false;
    settingsBoundsRef.current = null;
    applyDim();
    if (
      !todoVisibleRef.current &&
      !focusVisibleRef.current &&
      !schedulerVisibleRef.current
    ) {
      stopCursorPoll();
    }
  }, []);

  const hideFocusWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('focus');
    if (!win) return;
    const visible = await win.isVisible();
    if (visible) await win.hide();
    focusVisibleRef.current = false;
    focusBoundsRef.current = null;
    if (!todoVisibleRef.current && !settingsVisibleRef.current) {
      stopCursorPoll();
    }
  }, []);

  // ── 光标轮询：启动 ──────────────────────────────────────
  const startCursorPoll = useCallback(() => {
    if (cursorPollTimerRef.current) return;
    let prevInsideTodo = false;
    let prevInsideSettings = false;
    let prevInsideFocus = false;
    let prevInsideScheduler = false;

    cursorPollTimerRef.current = setInterval(async () => {
      if (
        !todoVisibleRef.current &&
        !settingsVisibleRef.current &&
        !focusVisibleRef.current &&
        !schedulerVisibleRef.current
      ) {
        stopCursorPoll();
        return;
      }

      const [cx, cy]: [number, number] = await invoke('get_cursor_position');

      if (todoVisibleRef.current && todoBoundsRef.current) {
        const b = todoBoundsRef.current;
        const inside =
          cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
        if (inside && !prevInsideTodo) {
          prevInsideTodo = true;
          if (todoHideTimerRef.current) {
            clearTimeout(todoHideTimerRef.current);
            todoHideTimerRef.current = null;
          }
        } else if (!inside && prevInsideTodo) {
          prevInsideTodo = false;
          if (!todoHideTimerRef.current)
            todoHideTimerRef.current = setTimeout(hideTodoWindow, 500);
        }
      }

      if (settingsVisibleRef.current && settingsBoundsRef.current) {
        const b = settingsBoundsRef.current;
        const inside =
          cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
        if (inside && !prevInsideSettings) {
          prevInsideSettings = true;
          if (settingsHideTimerRef.current) {
            clearTimeout(settingsHideTimerRef.current);
            settingsHideTimerRef.current = null;
          }
        } else if (!inside && prevInsideSettings) {
          prevInsideSettings = false;
          if (!settingsHideTimerRef.current)
            settingsHideTimerRef.current = setTimeout(hideSettingsWindow, 500);
        }
      }

      if (focusVisibleRef.current && focusBoundsRef.current) {
        const b = focusBoundsRef.current;
        const inside =
          cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
        if (inside && !prevInsideFocus) {
          prevInsideFocus = true;
          if (focusHideTimerRef.current) {
            clearTimeout(focusHideTimerRef.current);
            focusHideTimerRef.current = null;
          }
        } else if (!inside && prevInsideFocus) {
          prevInsideFocus = false;
          if (!focusHideTimerRef.current)
            focusHideTimerRef.current = setTimeout(hideFocusWindow, 500);
        }
      }

      if (schedulerVisibleRef.current && schedulerBoundsRef.current) {
        const b = schedulerBoundsRef.current;
        const inside =
          cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h;
        if (inside && !prevInsideScheduler) {
          prevInsideScheduler = true;
          if (schedulerHideTimerRef.current) {
            clearTimeout(schedulerHideTimerRef.current);
            schedulerHideTimerRef.current = null;
          }
        } else if (!inside && prevInsideScheduler) {
          prevInsideScheduler = false;
          if (!schedulerHideTimerRef.current)
            schedulerHideTimerRef.current = setTimeout(
              hideSchedulerWindow,
              500,
            );
        }
      }
    }, 150);
  }, []);

  // ── 子窗口 show helpers ─────────────────────────────────

  const showSchedulerWindow = useCallback(async () => {
    await hideTodoWindow();
    const win = await WebviewWindow.getByLabel('scheduler');
    if (!win) return;
    const mainWin = getCurrentWindow();
    const mainPos = await mainWin.outerPosition();
    const sf = await mainWin.scaleFactor();
    const schedulerWidth = 306,
      gap = 8;
    await win.setPosition(
      new LogicalPosition(
        mainPos.x / sf - schedulerWidth - gap,
        mainPos.y / sf,
      ),
    );
    await win.show();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    schedulerBoundsRef.current = {
      x: pos.x,
      y: pos.y,
      w: size.width,
      h: size.height,
    };
    schedulerVisibleRef.current = true;
    startCursorPoll();
  }, []);

  const showTodoWindow = useCallback(async () => {
    await hideSchedulerWindow();
    const win = await WebviewWindow.getByLabel('todo-manager');
    if (!win) return;
    const mainWin = getCurrentWindow();
    const mainPos = await mainWin.outerPosition();
    const sf = await mainWin.scaleFactor();
    const todoWidth = 306,
      gap = 8;
    await win.setPosition(
      new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf),
    );
    await win.show();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    todoBoundsRef.current = {
      x: pos.x,
      y: pos.y,
      w: size.width,
      h: size.height,
    };
    todoVisibleRef.current = true;
    applyDim();
    startCursorPoll();
  }, []);

  const showSettingsWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('settings');
    if (!win) return;
    const mainWin = getCurrentWindow();
    const mainPos = await mainWin.outerPosition();
    const mainSize = await mainWin.outerSize();
    const sf = await mainWin.scaleFactor();
    const gap = 8;
    await win.setPosition(
      new LogicalPosition(
        mainPos.x / sf + mainSize.width / sf + gap,
        mainPos.y / sf,
      ),
    );
    await win.show();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    settingsBoundsRef.current = {
      x: pos.x,
      y: pos.y,
      w: size.width,
      h: size.height,
    };
    settingsVisibleRef.current = true;
    applyDim();
    startCursorPoll();
  }, []);

  const showFocusWindow = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('focus');
    if (!win) return;
    const mainWin = getCurrentWindow();
    const mainPos = await mainWin.outerPosition();
    const mainSize = await mainWin.outerSize();
    const sf = await mainWin.scaleFactor();
    const focusWidth = 240,
      focusHeight = 320,
      gap = 8;
    const lx = mainPos.x / sf + mainSize.width / sf / 2 - focusWidth / 2;
    const ly = mainPos.y / sf - focusHeight - gap;
    await win.setPosition(new LogicalPosition(lx, ly));
    await win.show();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    focusBoundsRef.current = {
      x: pos.x,
      y: pos.y,
      w: size.width,
      h: size.height,
    };
    focusVisibleRef.current = true;
    startCursorPoll();
  }, []);

  // ── 气泡展示 ──────────────────────────────────────────────
  const showSpeech = useCallback(async (text: string, durationMs = 5000) => {
    try {
      const mainWin = getCurrentWindow();
      const bubbleWin = await WebviewWindow.getByLabel('speech-bubble');
      if (!bubbleWin) return;
      const pos = await mainWin.outerPosition();
      const sf = await mainWin.scaleFactor();
      await bubbleWin.setPosition(new LogicalPosition(
        pos.x / sf,
        Math.max(0, pos.y / sf + CLOUD_TOP_OFFSET - BUBBLE_WIN_H),
      ));
      if (!bubbleReadyRef.current) {
        await bubbleWin.show();
        bubbleReadyRef.current = true;
        await new Promise<void>(r => setTimeout(r, 400));
      }
      await emit('speech:show', { text, duration: durationMs });
    } catch {
      // 静默失败
    }
  }, []);

  // ── Hover handlers：按钮 enter/leave ──────────────────────

  const handleTodoBtnEnter = useCallback(() => {
    if (schedulerShowTimerRef.current) { clearTimeout(schedulerShowTimerRef.current); schedulerShowTimerRef.current = null; }
    if (schedulerHideTimerRef.current) { clearTimeout(schedulerHideTimerRef.current); schedulerHideTimerRef.current = null; }
    hideSchedulerWindow();
    if (todoHideTimerRef.current) clearTimeout(todoHideTimerRef.current);
    todoShowTimerRef.current = setTimeout(() => showTodoWindow(), 200);
  }, []);

  const handleTodoBtnLeave = useCallback(() => {
    if (todoShowTimerRef.current) clearTimeout(todoShowTimerRef.current);
    todoHideTimerRef.current = setTimeout(() => hideTodoWindow(), 500);
  }, []);

  const handleFocusBtnEnter = useCallback(() => {
    if (focusHideTimerRef.current) clearTimeout(focusHideTimerRef.current);
    focusShowTimerRef.current = setTimeout(() => showFocusWindow(), 200);
  }, []);

  const handleFocusBtnLeave = useCallback(() => {
    if (focusShowTimerRef.current) clearTimeout(focusShowTimerRef.current);
    focusHideTimerRef.current = setTimeout(() => hideFocusWindow(), 500);
  }, []);

  const handleSettingsBtnEnter = useCallback(() => {
    if (settingsHideTimerRef.current) clearTimeout(settingsHideTimerRef.current);
    settingsShowTimerRef.current = setTimeout(() => showSettingsWindow(), 200);
  }, []);

  const handleSettingsBtnLeave = useCallback(() => {
    if (settingsShowTimerRef.current) clearTimeout(settingsShowTimerRef.current);
    settingsHideTimerRef.current = setTimeout(() => hideSettingsWindow(), 500);
  }, []);

  const handleSchedulerBtnEnter = useCallback(() => {
    if (todoShowTimerRef.current) { clearTimeout(todoShowTimerRef.current); todoShowTimerRef.current = null; }
    if (todoHideTimerRef.current) { clearTimeout(todoHideTimerRef.current); todoHideTimerRef.current = null; }
    hideTodoWindow();
    if (schedulerHideTimerRef.current) clearTimeout(schedulerHideTimerRef.current);
    schedulerShowTimerRef.current = setTimeout(() => showSchedulerWindow(), 200);
  }, []);

  const handleSchedulerBtnLeave = useCallback(() => {
    if (schedulerShowTimerRef.current) clearTimeout(schedulerShowTimerRef.current);
    schedulerHideTimerRef.current = setTimeout(() => hideSchedulerWindow(), 500);
  }, []);

  // ── Hover handlers：菜单区域 enter/leave ───────────────────

  const handleMenuZoneEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverMenuShownRef.current = true;
      setShowHoverMenuRef.current?.(true);
    }, 200);
  }, []);

  const handleMenuZoneLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverMenuShownRef.current = false;
      setShowHoverMenuRef.current?.(false);
    }, 50);
  }, []);

  // ── 宠物/输入栏交互 handlers ────────────────────────────

  const handlePetAreaEnter = useCallback(() => {
    isPetHoveredRef.current = true;
    applyDim();
    onActivityRef.current?.();
  }, [applyDim]);

  const handlePetAreaLeave = useCallback(() => {
    isPetHoveredRef.current = false;
    applyDim();
  }, [applyDim]);

  const handleInputBarEnter = useCallback(() => {
    if (inputBarTimerRef.current) clearTimeout(inputBarTimerRef.current);
    isInputHoveredRef.current = true;
    applyDim();
    inputBarShownRef.current = true;
    setShowInputBarRef.current?.(true);
  }, [applyDim]);

  const handleInputBarLeave = useCallback(() => {
    if (inputBarTimerRef.current) clearTimeout(inputBarTimerRef.current);
    inputBarTimerRef.current = setTimeout(() => {
      isInputHoveredRef.current = false;
      applyDim();
      inputBarShownRef.current = false;
      setShowInputBarRef.current?.(false);
    }, 50);
  }, [applyDim]);

  const handleInputFocus = useCallback(() => {
    isInputFocusedRef.current = true;
    applyDim();
  }, [applyDim]);

  const handleInputBlur = useCallback(() => {
    isInputFocusedRef.current = false;
    applyDim();
  }, [applyDim]);

  // ── 窗口初始化与联动 ──────────────────────────────────────
  useEffect(() => {
    const initWindows = async () => {
      const mainWin = getCurrentWindow();
      const mainPos = await mainWin.outerPosition();
      const mainSize = await mainWin.outerSize();
      const sf = await mainWin.scaleFactor();
      const todoWidth = 306, gap = 8;

      // 初始定位 todo 窗口
      const todoWin = await WebviewWindow.getByLabel('todo-manager');
      if (todoWin) {
        await todoWin.setPosition(
          new LogicalPosition(mainPos.x / sf - todoWidth - gap, mainPos.y / sf),
        );
      }

      // 主窗口移动 → 子窗口跟随
      const unlisten = await mainWin.onMoved(async ({ payload: physPos }) => {
        const tw = await WebviewWindow.getByLabel('todo-manager');
        if (tw) {
          await tw.setPosition(
            new LogicalPosition(physPos.x / sf - todoWidth - gap, physPos.y / sf),
          );
          if (todoVisibleRef.current) {
            const pos = await tw.outerPosition();
            const size = await tw.outerSize();
            todoBoundsRef.current = { x: pos.x, y: pos.y, w: size.width, h: size.height };
          }
        }
        const sw = await WebviewWindow.getByLabel('settings');
        if (sw) {
          await sw.setPosition(
            new LogicalPosition(physPos.x / sf + mainSize.width / sf + gap, physPos.y / sf),
          );
          if (settingsVisibleRef.current) {
            const pos = await sw.outerPosition();
            const size = await sw.outerSize();
            settingsBoundsRef.current = { x: pos.x, y: pos.y, w: size.width, h: size.height };
          }
        }
        const bw = await WebviewWindow.getByLabel('speech-bubble');
        if (bw) {
          await bw.setPosition(new LogicalPosition(
            physPos.x / sf,
            physPos.y / sf + CLOUD_TOP_OFFSET - BUBBLE_WIN_H,
          ));
        }
        const scw = await WebviewWindow.getByLabel('scheduler');
        if (scw) {
          await scw.setPosition(
            new LogicalPosition(physPos.x / sf - todoWidth - gap, physPos.y / sf),
          );
          if (schedulerVisibleRef.current) {
            const pos = await scw.outerPosition();
            const size = await scw.outerSize();
            schedulerBoundsRef.current = { x: pos.x, y: pos.y, w: size.width, h: size.height };
          }
        }
      });
      unlistenMoveRef.current = unlisten;

      // 窗口失焦 → 重置交互状态
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
  }, []);

  // 组件卸载时取消主窗口事件监听
  useEffect(() => {
    return () => {
      unlistenMoveRef.current?.();
      unlistenFocusRef.current?.();
    };
  }, []);

  // ══════════════════════════════════════════════════════════
  // 以下 useEffects 仅在 opts.setShowInputBar 存在时激活
  // US-007 阶段 App.tsx 不传此参数，US-008 切换时激活
  // ══════════════════════════════════════════════════════════

  // ── 全屏模式轮询（500ms） ───────────────────────────────
  useEffect(() => {
    if (!opts?.setShowInputBar) return;

    const timer = setInterval(async () => {
      const mode = await invoke<0 | 1 | 2>('get_fullscreen_mode');
      disturbModeRef.current = mode;
      applyDim();
    }, 500);
    return () => clearInterval(timer);
  }, [applyDim, opts?.setShowInputBar]);

  // ── 低干扰模式：光标轮询 + 穿透切换 ──────────────────
  useEffect(() => {
    if (!opts?.setShowInputBar) return;

    const stopPoll = () => {
      if (disturbPollRef.current) { clearInterval(disturbPollRef.current); disturbPollRef.current = null; }
      disturbHoverStartRef.current = null;
    };

    if (displayDisturbMode !== 0) {
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
  }, [displayDisturbMode, applyDim, opts?.setShowInputBar]);

  // ── Ctrl 穿透：键盘监听 ────────────────────────────────
  useEffect(() => {
    if (!opts?.setShowInputBar) return;

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
  }, [isPassthrough, opts?.setShowInputBar]);

  // ── Mousemove 兜底：检测鼠标离开 pet-area / input-bar ─
  useEffect(() => {
    if (!opts?.setShowInputBar) return;

    const checkBounds = (e: MouseEvent) => {
      // HoverMenu 兜底
      if (hoverMenuShownRef.current && petAreaRef.current) {
        const rect = petAreaRef.current.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
                    && e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (!inside) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          hoverMenuShownRef.current = false;
          setShowHoverMenuRef.current?.(false);
          isPetHoveredRef.current = false;
          applyDim();
        }
      }
      // InputBar 兜底
      if (inputBarShownRef.current && inputBarRef.current) {
        const rect = inputBarRef.current.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
                    && e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (!inside) {
          if (inputBarTimerRef.current) clearTimeout(inputBarTimerRef.current);
          inputBarTimerRef.current = null;
          inputBarShownRef.current = false;
          setShowInputBarRef.current?.(false);
          isInputHoveredRef.current = false;
          applyDim();
        }
      }
    };
    document.addEventListener('mousemove', checkBounds);
    return () => document.removeEventListener('mousemove', checkBounds);
  }, [applyDim, opts?.setShowInputBar]);

  return {
    // 子窗口可见性 refs
    todoVisibleRef,
    settingsVisibleRef,
    focusVisibleRef,
    schedulerVisibleRef,
    todoBoundsRef,
    settingsBoundsRef,
    focusBoundsRef,
    schedulerBoundsRef,
    cursorPollTimerRef,
    hoverTimerRef,
    inputBarTimerRef,
    todoShowTimerRef,
    todoHideTimerRef,
    settingsShowTimerRef,
    settingsHideTimerRef,
    focusShowTimerRef,
    focusHideTimerRef,
    schedulerShowTimerRef,
    schedulerHideTimerRef,
    bubbleReadyRef,
    onInteractionChangeRef,
    setShowHoverMenuRef,
    unlistenMoveRef,
    unlistenFocusRef,

    // 低干扰模式 refs
    disturbModeRef,
    isPetHoveredRef,
    isInputHoveredRef,
    isInputFocusedRef,

    // 低干扰展示状态
    displayDisturbMode,

    // Ctrl 穿透状态
    isPassthrough,

    // DOM refs
    petAreaRef,
    inputBarRef,

    // 气泡联动常量
    CLOUD_TOP_OFFSET,
    BUBBLE_WIN_H,

    // 光标轮询
    startCursorPoll,
    stopCursorPoll,

    // 子窗口 show/hide
    showTodoWindow,
    hideTodoWindow,
    showSettingsWindow,
    hideSettingsWindow,
    showFocusWindow,
    hideFocusWindow,
    showSchedulerWindow,
    hideSchedulerWindow,

    // 气泡展示
    showSpeech,

    // 按钮 hover handlers
    handleTodoBtnEnter,
    handleTodoBtnLeave,
    handleFocusBtnEnter,
    handleFocusBtnLeave,
    handleSettingsBtnEnter,
    handleSettingsBtnLeave,
    handleSchedulerBtnEnter,
    handleSchedulerBtnLeave,

    // 菜单区域 hover handlers
    handleMenuZoneEnter,
    handleMenuZoneLeave,

    // 宠物/输入栏交互 handlers
    handlePetAreaEnter,
    handlePetAreaLeave,
    handleInputBarEnter,
    handleInputBarLeave,
    handleInputFocus,
    handleInputBlur,
  };
}
