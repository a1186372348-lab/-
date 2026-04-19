// 事件总线工具函数 — L2 事件与状态层治理
// 唯一直接 import @tauri-apps/api/event 的文件

import { listen, emit, emitTo } from '@tauri-apps/api/event';
import type { EventMap, EventName } from './types';

/**
 * 类型安全的广播发送（全局 emit）。
 * 仅用于过渡期保留冗余广播，新代码应优先使用 typedEmitTo。
 */
export async function typedEmit<E extends EventName>(
  event: E,
  payload: EventMap[E],
): Promise<void> {
  await emit(event, payload);
}

/**
 * 类型安全的定向发送（emitTo 指定窗口）。
 */
export async function typedEmitTo<E extends EventName>(
  target: string,
  event: E,
  payload: EventMap[E],
): Promise<void> {
  await emitTo(target, event, payload);
}

/**
 * 类型安全的监听。handler 直接接收 payload（自动从 Tauri Event<T> 中解包）。
 * 返回 unlisten 函数，用于 cleanup。
 */
export async function typedListen<E extends EventName>(
  event: E,
  handler: (payload: EventMap[E]) => void | Promise<void>,
): Promise<() => void> {
  const unlisten = await listen<EventMap[E]>(event, (tauriEvent) => {
    handler(tauriEvent.payload);
  });
  return unlisten;
}
