# 事件注册表

> 快照日期：2026-04-19（最终更新：2026-04-20）
> 状态：已迁移至类型化系统

本文档记录应用中所有 Tauri 事件通信的最终约定。所有事件已通过 `src/events/bus.ts` 的类型化 API 收口。

---

## 一、子窗口 → 主窗口（11 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 发送 API |
|--------|-----------|-----------|-------------|---------|
| `focus-phase-change` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | `typedEmitTo('main', ...)` |
| `focus-start` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number; task?: string }` | `typedEmitTo('main', ...)` |
| `focus-pause` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | `typedEmitTo('main', ...)` |
| `focus-reset` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string }` | `typedEmitTo('main', ...)` |
| `focus-tick` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | `typedEmitTo('main', ...)` |
| `focus-mouse-enter` | `components/FocusPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |
| `focus-mouse-leave` | `components/FocusPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |
| `all-todos-complete` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |
| `todo-mouse-enter` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |
| `todo-mouse-leave` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |
| `settings-changed` | `components/SettingsPage/index.tsx` | `App.tsx` | 无 payload | `typedEmitTo('main', ...)` |

## 二、主窗口 → 子窗口（4 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 发送 API |
|--------|-----------|-----------|-------------|---------|
| `speech:show` | `hooks/useWindowOrchestration.ts` | `components/SpeechBubblePage/index.tsx` | `{ text: string; duration: number }` | `typedEmitTo('speech-bubble', ...)` |
| `speech:append` | `App.tsx`、`hooks/useAppRuntime.ts` | `components/SpeechBubblePage/index.tsx` | `{ delta: string }` | `typedEmitTo('speech-bubble', ...)` |
| `speech:done` | `App.tsx`、`hooks/useAppRuntime.ts` | `components/SpeechBubblePage/index.tsx` | `{ duration: number }` | `typedEmitTo('speech-bubble', ...)` |
| `speech:hide` | 外部/MCP 服务 | `components/SpeechBubblePage/index.tsx` | 无 payload | `typedListen(...)` |

## 三、后端 → 前端（2 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 发送 API |
|--------|-----------|-----------|-------------|---------|
| `cc-event` | `src-tauri/src/bridge_server.rs` | `hooks/useAppRuntime.ts` | `{ event: string; tool?: string; [key: string]: unknown }` | `typedListen(...)` |
| `scheduler:reload` | 外部/MCP 服务 | `components/SchedulerPage/index.tsx` | 无 payload | `typedListen(...)` |

---

## 统计

- **总事件数**：17
- **子窗口→主窗口**：11 个（全部 `typedEmitTo`）
- **主窗口→子窗口**：4 个（3 个 `typedEmitTo` + 1 个 `typedListen`）
- **后端→前端**：2 个（全部 `typedListen`）
- **冗余双发**：0 个（已全部清除）
- **广播未迁移**：0 个（已全部改为定向发送）

---

## 新增事件 Checklist

添加新事件时，按以下 5 条规则执行：

1. **在 `EventMap` 中新增事件**：在 `src/events/types.ts` 的 `EventMap` 接口中新增事件名→payload 映射。无 payload 事件使用 `Record<string, never>`。
2. **明确发送方和接收方**：在 `src/events/EVENTS.md` 的对应分组中新增一行，标注发送方文件、接收方文件和 payload 结构。
3. **优先使用 `typedEmitTo`**：跨窗口事件使用 `typedEmitTo(targetWindow, eventName, payload)` 定向发送，禁止使用 `typedEmit`（全局广播）。
4. **payload 禁止临时 `as` 断言**：payload 类型必须通过 `EventMap` 推导，如需 `as` 断言说明 `EventMap` 定义不够精确，应修改类型定义。
5. **更新 `EVENTS.md`**：实现完成后同步更新本文档，确保注册表与代码一致。
