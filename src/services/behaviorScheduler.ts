/**
 * behaviorScheduler — 自主行为调度器
 *
 * 与渲染层完全解耦，Phase 2 换 Rive 时无需改动此文件。
 * 返回 stop 函数，由调用方在 unmount 时执行。
 */

import type { CloudExpression } from '../types';

export type AutonomousBehavior = 'blink' | 'stretch' | 'glanceLeft' | 'glanceRight' | 'yawn';

// 允许自主行为触发的表情集合（业务表情期间暂停）
const IDLE_EXPRESSIONS = new Set<CloudExpression>(['default', 'sleepy', 'rainy']);

interface SchedulerOptions {
  minIntervalMs?: number;
  maxIntervalMs?: number;
  onBehavior: (b: AutonomousBehavior) => void;
  getExpression: () => CloudExpression;
}

/** 根据当前表情返回加权行为列表 */
function pickBehavior(expression: CloudExpression): AutonomousBehavior {
  const isSleepy = expression === 'sleepy';

  // [行为, 权重]
  const weights: [AutonomousBehavior, number][] = [
    ['blink',      40],
    ['glanceLeft', 20],
    ['glanceRight',20],
    ['stretch',    15],
    ['yawn',       isSleepy ? 35 : 5],
  ];

  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let rand = Math.random() * total;

  for (const [behavior, weight] of weights) {
    rand -= weight;
    if (rand <= 0) return behavior;
  }
  return 'blink';
}

/**
 * 启动行为调度器
 * @returns stop 函数，调用后停止调度
 */
export function startBehaviorScheduler(options: SchedulerOptions): () => void {
  const {
    minIntervalMs = 10_000,
    maxIntervalMs = 30_000,
    onBehavior,
    getExpression,
  } = options;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function schedule() {
    if (stopped) return;

    const delay = minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs);

    timerId = setTimeout(() => {
      if (stopped) return;

      const expr = getExpression();
      if (IDLE_EXPRESSIONS.has(expr)) {
        onBehavior(pickBehavior(expr));
      }
      // 无论是否触发，都继续下一轮调度
      schedule();
    }, delay);
  }

  schedule();

  return () => {
    stopped = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
}
