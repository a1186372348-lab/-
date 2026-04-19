# 事件注册表

> 快照日期：2026-04-19
> 状态：冻结快照（尚未迁移至类型化系统）

本文档记录应用中所有 Tauri 事件通信，作为后续类型化迁移的基础。

---

## 一、子窗口 → 主窗口（11 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 当前问题 | 目标发送方式 |
|--------|-----------|-----------|-------------|---------|-------------|
| `focus-phase-change` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | 仅 emitTo，无冗余 | `typedEmitTo('main', ...)` |
| `focus-start` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number; task?: string }` | 同时调用 emit() + emitTo()，冗余双发 | `typedEmitTo('main', ...)` |
| `focus-pause` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | 同时调用 emit() + emitTo()，冗余双发 | `typedEmitTo('main', ...)` |
| `focus-reset` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string }` | 同时调用 emit() + emitTo()，冗余双发 | `typedEmitTo('main', ...)` |
| `focus-tick` | `components/FocusPage/index.tsx` | `App.tsx` | `{ phase: string; remainSecs: number }` | 同时调用 emit() + emitTo()，冗余双发 | `typedEmitTo('main', ...)` |
| `focus-mouse-enter` | `components/FocusPage/index.tsx` | `App.tsx` | 无 payload | 仅 emitTo，无冗余 | `typedEmitTo('main', ...)` |
| `focus-mouse-leave` | `components/FocusPage/index.tsx` | `App.tsx` | 无 payload | 仅 emitTo，无冗余 | `typedEmitTo('main', ...)` |
| `all-todos-complete` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | 使用 emit() 广播，应改为定向 | `typedEmitTo('main', ...)` |
| `todo-mouse-enter` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | 使用 emit() 广播，应改为定向 | `typedEmitTo('main', ...)` |
| `todo-mouse-leave` | `components/TodoPage/index.tsx` | `App.tsx` | 无 payload | 使用 emit() 广播，应改为定向 | `typedEmitTo('main', ...)` |
| `settings-changed` | `components/SettingsPage/index.tsx` | `App.tsx` | 无 payload | 已使用 emitTo('main', ...)，无冗余 | `typedEmitTo('main', ...)` |

## 二、主窗口 → 子窗口（4 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 当前问题 | 目标发送方式 |
|--------|-----------|-----------|-------------|---------|-------------|
| `speech:show` | `App.tsx` | `components/SpeechBubblePage/index.tsx` | `{ text: string; duration: number }` | 使用 emit() 广播，应改为定向 speech-bubble | `typedEmitTo('speech-bubble', ...)` |
| `speech:append` | `App.tsx` | `components/SpeechBubblePage/index.tsx` | `{ delta: string }` | 使用 emit() 广播，应改为定向 speech-bubble | `typedEmitTo('speech-bubble', ...)` |
| `speech:done` | `App.tsx` | `components/SpeechBubblePage/index.tsx` | `{ duration: number }` | 使用 emit() 广播，应改为定向 speech-bubble | `typedEmitTo('speech-bubble', ...)` |
| `speech:hide` | 外部/MCP 服务 | `components/SpeechBubblePage/index.tsx` | 无 payload | 发送方不在前端代码中，保持 listen | `typedListen(...)` |

## 三、后端 → 前端（2 个）

| 事件名 | 发送方文件 | 接收方文件 | Payload 结构 | 当前问题 | 目标发送方式 |
|--------|-----------|-----------|-------------|---------|-------------|
| `cc-event` | `src-tauri/src/bridge_server.rs` | `App.tsx` | `{ event: string; tool?: string; [key: string]: unknown }` | Rust 端通过 app.emit() 全局广播 | `typedListen(...)` |
| `scheduler:reload` | 外部/MCP 服务 | `components/SchedulerPage/index.tsx` | 无 payload | 发送方不在前端代码中，保持 listen | `typedListen(...)` |

---

## 统计

- **总事件数**：17
- **子窗口→主窗口**：11 个
- **主窗口→子窗口**：4 个
- **后端→前端**：2 个
- **冗余双发**：4 个（focus-start、focus-pause、focus-reset、focus-tick）
- **广播应改定向**：6 个（speech:show、speech:append、speech:done、all-todos-complete、todo-mouse-enter、todo-mouse-leave）

## 直接 import @tauri-apps/api/event 的文件

| 文件 | 导入的函数 |
|------|----------|
| `App.tsx` | `emit`, `listen` |
| `components/FocusPage/index.tsx` | `emit`, `emitTo` |
| `components/TodoPage/index.tsx` | `emit` |
| `components/SettingsPage/index.tsx` | `emitTo` |
| `components/SchedulerPage/index.tsx` | `listen` |
| `components/SpeechBubblePage/index.tsx` | `listen` |
