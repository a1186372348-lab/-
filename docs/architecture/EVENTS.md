# 事件文档

> 本文档记录项目当前已确认的 Tauri 事件名称、发送方、接收方、用途和 payload 结构。
> 新增事件前必须先查阅本文和 `CLAUDE.md` 事件表，避免命名冲突或重复链路。

---

## 事件命名规范

推荐格式：`<domain>:<action>`

- `domain`：功能域，例如 `speech`、`focus`、`scheduler`
- `action`：动作，例如 `show`、`append`、`done`、`reload`
- 不含冒号的事件名属于早期遗留命名，例如 `settings-changed`、`all-todos-complete`、`cc-event`

---

## 事件总表

| # | 事件名 | 发送方 | 接收方 | 用途 |
|---|---|---|---|---|
| 1 | `settings-changed` | `SettingsPage` | `main` | 设置保存后通知主窗口重新加载设置并刷新提醒间隔 |
| 2 | `all-todos-complete` | `TodoPage` | `main` | 所有待办完成后通知主窗口触发表情反馈 |
| 3 | `cc-event` | `bridge_server` (Rust) | `main` | 将 Claude Code Hook 事件从本地桥接服务转发到主窗口 |
| 4 | `speech:show` | `main` | `speech-bubble` | 显示气泡，payload 含首段文本和可选自动关闭时长 |
| 5 | `speech:append` | `main` | `speech-bubble` | 流式追加气泡文字 |
| 6 | `speech:done` | `main` | `speech-bubble` | 流式传输结束，启动关闭计时 |
| 7 | `speech:hide` | 未发现发送端 | `speech-bubble` | 立即隐藏气泡；当前仅在气泡窗口注册监听 |
| 8 | `focus-phase-change` | `FocusPage` (`emitTo('main', ...)`) | `main` | 专注/休息阶段切换时通知主窗口更新状态和提示语 |
| 9 | `focus-tick` | `FocusPage`（同时 `emit` 与 `emitTo('main', ...)`） | `main` | 每秒同步剩余时间给主窗口 |
| 10 | `focus-start` | `FocusPage`（同时 `emit` 与 `emitTo('main', ...)`） | `main` | 专注计时开始或继续 |
| 11 | `focus-pause` | `FocusPage`（同时 `emit` 与 `emitTo('main', ...)`） | `main` | 专注计时暂停 |
| 12 | `focus-reset` | `FocusPage`（同时 `emit` 与 `emitTo('main', ...)`） | `main` | 专注计时重置 |
| 13 | `focus-mouse-enter` | `FocusPage` (`emitTo('main', ...)`) | `main` | 鼠标进入专注窗口，主窗口停止延迟隐藏 |
| 14 | `focus-mouse-leave` | `FocusPage` (`emitTo('main', ...)`) | `main` | 鼠标离开专注窗口，主窗口启动延迟隐藏 |
| 15 | `todo-mouse-enter` | `TodoPage` | 未发现监听方 | 鼠标进入待办窗口；当前仅看到发送端 |
| 16 | `todo-mouse-leave` | `TodoPage` | 未发现监听方 | 鼠标离开待办窗口；当前仅看到发送端 |
| 17 | `scheduler:reload` | 未发现发送端 | `SchedulerPage` | 触发定时任务列表重载；当前仅看到监听端 |

---

## Payload 格式

| 事件名 | Payload 类型 | 字段说明 |
|---|---|---|
| `settings-changed` | 无 | 设置已变更，主窗口收到后自行重新读取设置 |
| `all-todos-complete` | 无 | 所有待办已完成 |
| `cc-event` | `{ event: string; tool: string }` | `event` 为 Hook 名称，`tool` 为触发工具名；由 Rust `bridge_server` 组装 |
| `speech:show` | `{ text: string; duration?: number }` | `text` 为显示内容，`duration` 为自动关闭毫秒数；`0` 表示不自动关闭 |
| `speech:append` | `{ delta: string }` | 增量追加到当前气泡文本 |
| `speech:done` | `{ duration: number }` | 流式传输结束后启动关闭计时 |
| `speech:hide` | 无 | 立即隐藏气泡 |
| `focus-phase-change` | `{ phase: 'focus' | 'rest'; remainSecs: number }` | `phase` 为下一阶段，`remainSecs` 为该阶段初始剩余秒数 |
| `focus-tick` | `{ phase: 'focus' | 'rest'; remainSecs: number }` | 每秒同步当前阶段和剩余秒数 |
| `focus-start` | `{ phase: 'focus' | 'rest'; remainSecs: number; task: string }` | 开始或继续计时时同步当前阶段、剩余秒数和输入任务 |
| `focus-pause` | `{ phase: 'focus' | 'rest'; remainSecs: number }` | 暂停时同步当前阶段和剩余秒数 |
| `focus-reset` | `{ phase: 'focus' | 'rest' }` | 重置当前阶段计时 |
| `focus-mouse-enter` | 无 | 鼠标进入专注窗口 |
| `focus-mouse-leave` | 无 | 鼠标离开专注窗口 |
| `todo-mouse-enter` | 无 | 鼠标进入待办窗口 |
| `todo-mouse-leave` | 无 | 鼠标离开待办窗口 |
| `scheduler:reload` | 无 | 触发 SchedulerPage 重新拉取列表 |

---

## 通信方式

- `emitTo(target, event, payload)`：向指定窗口发送事件，适合明确的点对点链路。
- `emit(event, payload)`：项目中仍有遗留使用；FocusPage 和 TodoPage 存在直接 `emit` 的事件。
- `listen(event, handler)`：注册监听器；页面组件必须在 cleanup 中调用 `unlisten` 或执行返回的解除函数。

当前约定以项目根目录 `CLAUDE.md` 事件表为准：跨窗口新事件默认使用 `emitTo(windowLabel, event, payload)`，不要继续扩大遗留 `emit` 用法。

---

## 当前状态与已知问题

| 事件 | 现状 | 说明 |
|---|---|---|
| `focus-start`、`focus-pause`、`focus-reset`、`focus-tick` | 重复发送 | `FocusPage` 同时使用 `emit` 和 `emitTo('main', ...)` 发送同名事件，当前主窗口监听链路可工作，但发送语义重复 |
| `todo-mouse-enter`、`todo-mouse-leave` | 孤立发送 | 当前仅在 `TodoPage` 发现发送端，未发现明确监听方 |
| `speech:hide` | 孤立监听 | 当前仅在 `SpeechBubblePage` 发现监听端，未发现明确发送方 |
| `scheduler:reload` | 孤立监听 | 当前仅在 `SchedulerPage` 发现监听端，未发现明确发送方 |

---

## 新增事件检查清单

新增事件前，至少完成以下检查：

1. 确认事件名不与本文和 `CLAUDE.md` 冲突。
2. 优先使用 `<domain>:<action>` 命名，除非是兼容历史链路。
3. 跨窗口通信默认使用 `emitTo(windowLabel, event, payload)`。
4. 在本文和 `CLAUDE.md` 的事件表中同步登记。
5. 确认监听器存在对应 cleanup，不留下悬挂 `listen`。
