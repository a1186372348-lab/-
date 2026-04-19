export type CloudExpression =
  | 'default'
  | 'happy'
  | 'thinking'
  | 'worried'
  | 'sleepy'
  | 'rainy'
  | 'sadly'
  | 'proudly';

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy';

export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: string;
  title: string;
  priority: Priority;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
  last_reminded_at: string | null;
}

export type ScheduleTriggerMode = 'daily' | 'interval';

export interface ScheduledTask {
  id: string;
  title: string;
  trigger_mode: ScheduleTriggerMode;
  daily_time: string | null;        // "HH:MM"，仅 daily 模式有效
  interval_minutes: number | null;  // 仅 interval 模式有效
  action: 'notify';
  is_enabled: number;               // 1=启用 0=禁用
  created_at: string;
  last_triggered_at: string | null;
}

export interface FocusClockState {
  running: boolean;
  phase: 'focus' | 'rest';
  remainSecs: number;
  totalSecs: number;
}
