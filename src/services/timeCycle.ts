import { CloudExpression } from '../types';

export interface TimePeriod {
  id: string;
  label: string;
  start: number; // 小时（0-23）
  end: number;
  expression: CloudExpression;
  greeting?: string; // 触发时说的话，undefined 表示静默切换
}

export const TIME_PERIODS: TimePeriod[] = [
  {
    id: 'morning',
    label: '清晨',
    start: 6,
    end: 9,
    expression: 'happy',
    greeting: '早上好呀～新的一天开始了 ☀️',
  },
  {
    id: 'forenoon',
    label: '上午',
    start: 9,
    end: 12,
    expression: 'default',
  },
  {
    id: 'noon',
    label: '午休',
    start: 12,
    end: 14,
    expression: 'sleepy',
    greeting: '该午休一下了，别太拼哦～ 😴',
  },
  {
    id: 'afternoon',
    label: '下午',
    start: 14,
    end: 18,
    expression: 'default',
  },
  {
    id: 'evening',
    label: '傍晚',
    start: 18,
    end: 22,
    expression: 'default',
  },
  {
    id: 'night',
    label: '深夜',
    start: 22,
    end: 24,
    expression: 'sleepy',
    greeting: '这么晚了还在工作，注意休息哦 🌙',
  },
  {
    id: 'midnight',
    label: '凌晨',
    start: 0,
    end: 6,
    expression: 'sleepy',
  },
];

export function getCurrentPeriod(): TimePeriod {
  const hour = new Date().getHours();
  return (
    TIME_PERIODS.find((p) => hour >= p.start && hour < p.end) ?? TIME_PERIODS[1]
  );
}

export function startTimeCycleService(
  onPeriodChange: (period: TimePeriod) => void
): () => void {
  let lastPeriodId = getCurrentPeriod().id;

  // 立即应用当前时段（静默，不触发 greeting，避免每次启动都说话）
  const initial = getCurrentPeriod();
  onPeriodChange({ ...initial, greeting: undefined });

  const timer = setInterval(() => {
    const current = getCurrentPeriod();
    if (current.id !== lastPeriodId) {
      lastPeriodId = current.id;
      onPeriodChange(current);
    }
  }, 60_000); // 每分钟检查一次

  return () => clearInterval(timer);
}
