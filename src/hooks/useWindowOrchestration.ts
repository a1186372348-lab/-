import { useRef, useCallback } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

// ── 内部类型 ──────────────────────────────────────────────
type Bounds = { x: number; y: number; w: number; h: number };

// ── Hook ──────────────────────────────────────────────────
export function useWindowOrchestration() {
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
    onInteractionChangeRef.current?.();
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
    onInteractionChangeRef.current?.();
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
    onInteractionChangeRef.current?.();
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
    onInteractionChangeRef.current?.();
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

  return {
    // refs
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
  };
}
