// 事件类型定义 — L2 事件与状态层治理
// 所有 Tauri 事件的名称和 payload 类型约束

// ─── Focus 系列 Payload ───

export interface FocusPhaseChangePayload {
  phase: 'focus' | 'rest';
  remainSecs: number;
}

export interface FocusStartPayload {
  phase: 'focus' | 'rest';
  remainSecs: number;
  task?: string;
}

export interface FocusPausePayload {
  phase: 'focus' | 'rest';
  remainSecs: number;
}

export interface FocusResetPayload {
  phase: 'focus' | 'rest';
}

export interface FocusTickPayload {
  phase: 'focus' | 'rest';
  remainSecs: number;
}

// ─── Speech 系列 Payload ───

export interface SpeechShowPayload {
  text: string;
  duration?: number;
}

export interface SpeechAppendPayload {
  delta: string;
}

export interface SpeechDonePayload {
  duration: number;
}

// ─── CC Event Payload ───

export interface CcEventPayload {
  event: string;
  tool?: string;
  [key: string]: unknown;
}

// ─── EventMap：事件名 → Payload 类型映射 ───

export interface EventMap {
  // 子窗口 → 主窗口
  'focus-phase-change': FocusPhaseChangePayload;
  'focus-start': FocusStartPayload;
  'focus-pause': FocusPausePayload;
  'focus-reset': FocusResetPayload;
  'focus-tick': FocusTickPayload;
  'focus-mouse-enter': Record<string, never>;
  'focus-mouse-leave': Record<string, never>;
  'all-todos-complete': Record<string, never>;
  'todo-mouse-enter': Record<string, never>;
  'todo-mouse-leave': Record<string, never>;
  'settings-changed': Record<string, never>;

  // 主窗口 → 子窗口
  'speech:show': SpeechShowPayload;
  'speech:append': SpeechAppendPayload;
  'speech:done': SpeechDonePayload;
  'speech:hide': Record<string, never>;

  // 后端 → 前端
  'cc-event': CcEventPayload;
  'scheduler:reload': Record<string, never>;
}

// ─── 工具类型 ───

export type EventName = keyof EventMap;
