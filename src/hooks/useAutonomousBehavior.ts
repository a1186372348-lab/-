/**
 * useAutonomousBehavior — 将行为调度器接入 React 生命周期
 *
 * mount 时启动调度器，unmount 时自动停止。
 * 通过 useAppStore.getState() 只读获取表情状态，不触发重渲染。
 */

import { useState, useEffect, useCallback } from 'react';
import { startBehaviorScheduler, AutonomousBehavior } from '../services/behaviorScheduler';
import { useAppStore } from '../store';

export function useAutonomousBehavior() {
  const [pendingTrigger, setPendingTrigger] = useState<AutonomousBehavior | null>(null);

  const clearTrigger = useCallback(() => {
    setPendingTrigger(null);
  }, []);

  useEffect(() => {
    const stop = startBehaviorScheduler({
      minIntervalMs: 10_000,
      maxIntervalMs: 30_000,
      onBehavior: (b) => setPendingTrigger(b),
      // 直接读 store 快照，避免 stale closure
      getExpression: () => useAppStore.getState().expression,
    });

    return stop;
  }, []);

  return { pendingTrigger, clearTrigger };
}
