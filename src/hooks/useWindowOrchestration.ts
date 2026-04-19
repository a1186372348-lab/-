import { useRef } from 'react';

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

  return {
    // refs —— 后续 story 会基于这些 refs 实现具体逻辑
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
  };
}
