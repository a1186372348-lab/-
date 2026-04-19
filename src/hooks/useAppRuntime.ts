import { useRef } from 'react';

// ── Callbacks 契约 ─────────────────────────────────────────
export interface AppRuntimeCallbacks {
  /** 天气变化：更新天气状态 + 关联表情 */
  onWeather: (condition: string) => void;
  /** 设置表情 */
  setExpression: (expr: string) => void;
  /** 显示气泡文字，duration=0 不自动关闭 */
  showSpeech: (text: string, duration: number) => void;
  /** 获取当前低干扰模式（0/1/2） */
  getDisturbMode: () => number;
  /** 用户是否正在输入 */
  isUserTyping: () => boolean;
  /** 获取提醒间隔（分钟） */
  getReminderInterval: () => number;
  /** 设置提醒间隔 */
  setReminderInterval: (min: number) => void;
  /** 设置专注时钟状态 */
  setFocusClock: (state: {
    running: boolean;
    phase: 'focus' | 'rest';
    remainSecs: number;
    totalSecs: number;
  } | null) => void;
  /** 设置 CC 工作感知状态 */
  setCcActive: (active: boolean) => void;
  /** 设置 AI 处理中状态 */
  setIsProcessing: (processing: boolean) => void;
  /** 播放音效 */
  playThunder: () => void;
  /** 重置空闲计时 */
  resetIdle: () => void;
  /** 获取 focus hide timer ref（用于 focus-mouse-enter/leave 联动） */
  focusHideTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** 隐藏 focus 窗口 */
  hideFocusWindow: () => void;
}

// ── Hook ──────────────────────────────────────────────────
export function useAppRuntime(callbacks: AppRuntimeCallbacks) {
  // 占位：callbacks 和 refs 将在后续 stories（US-010 ~ US-013）中填充使用
  void callbacks;

  // 服务清理函数 refs
  const weatherStopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reminderStopRef = useRef<(() => void) | null>(null);
  const timeCycleStopRef = useRef<(() => void) | null>(null);
  const schedulerStopRef = useRef<(() => void) | null>(null);
  const screenMonitorActiveRef = useRef(false);
  void weatherStopRef;
  void reminderStopRef;
  void timeCycleStopRef;
  void schedulerStopRef;
  void screenMonitorActiveRef;

  // 事件监听清理函数 refs
  const unlistenRefs = useRef<Array<() => void>>([]);
  void unlistenRefs;

  // CC 事件内部状态：权限等待标记
  const ccPermissionPendingRef = useRef(false);
  void ccPermissionPendingRef;

  // CC 自动关闭计时器 ref
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  void ccTimerRef;
}
