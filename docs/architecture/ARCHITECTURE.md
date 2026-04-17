# 架构分层说明

本文档定义 zhushou（云朵助手）的分层职责和边界。所有新代码应先判断属于哪一层，再决定放在哪里。

---

## 分层总览

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (src/components/)                             │
│  展示 + 轻量交互，不包含业务规则                          │
├─────────────────────────────────────────────────────────┤
│  Page Coordination Layer (src/App.tsx)                  │
│  主窗口状态、多窗口联动、事件监听、服务编排               │
│  ⚠️ 治理热点 — 不应继续堆积业务逻辑                      │
├─────────────────────────────────────────────────────────┤
│  Service Layer (src/services/)                          │
│  业务规则、数据持久化、外部 API 调用                      │
├─────────────────────────────────────────────────────────┤
│  Tauri / Rust Layer (src-tauri/src/)                    │
│  原生系统能力、窗口控制、桥接服务                         │
├─────────────────────────────────────────────────────────┤
│  cloudpet-mcp (cloudpet-mcp/)                           │
│  独立 MCP 服务，外部 AI agent 与桌面宠物交互的桥梁        │
└─────────────────────────────────────────────────────────┘
```

数据流方向：上层调用下层，下层不依赖上层。跨窗口通信通过 Tauri 事件机制。

---

## 1. UI Layer — `src/components/`

### 职责

- 渲染可视界面（云朵形象、菜单、输入框、各子窗口页面）
- 处理用户交互（点击、输入、悬停）
- 通过 Tauri 事件与主窗口或其他窗口通信

### 边界

- **允许**：管理组件本地 UI 状态（如输入框文字、展开/折叠）
- **允许**：通过 Tauri `emit`/`listen` 与协调层通信
- **允许**：调用 `src/services/` 中已有的服务函数
- **禁止**：直接定义业务规则（提醒判断、记忆提取、AI 调度等）
- **禁止**：直接操作数据库（应通过 `src/services/db.ts`）

### 关键组件

| 组件 | 文件 | 职责 |
|------|------|------|
| CloudPet | `src/components/CloudPet/` | 云朵逻辑层，桥接表情/天气/处理状态到渲染器 |
| CloudRenderer | `src/components/CloudPet/CloudRenderer.tsx` | 云朵渲染层，Framer Motion 动画与表情映射 |
| HoverMenu | `src/components/HoverMenu/` | 悬停菜单（待办、专注、设置、定时四个按钮） |
| InputBar | `src/components/InputBar/` | 文本输入和麦克风按钮 |
| TodoPage | `src/components/TodoPage/` | 待办管理页面（独立子窗口） |
| SettingsPage | `src/components/SettingsPage/` | 设置面板（独立子窗口） |
| FocusPage | `src/components/FocusPage/` | 番茄钟计时器（独立子窗口） |
| SchedulerPage | `src/components/SchedulerPage/` | 定时任务管理（独立子窗口） |
| SpeechBubblePage | `src/components/SpeechBubblePage/` | 气泡子窗口（独立子窗口） |

### 页面路由

`src/main.tsx` 通过 URL 查询参数 `?page=` 为不同 Tauri 窗口渲染对应页面：

| page 参数 | 组件 | 窗口标签 |
|-----------|------|----------|
| （无） | App | `main` |
| `todos` | TodoPage | `todo-manager` |
| `settings` | SettingsPage | `settings` |
| `focus` | FocusPage | `focus` |
| `speech-bubble` | SpeechBubblePage | `speech-bubble` |
| `scheduler` | SchedulerPage | `scheduler` |

---

## 2. Page Coordination Layer — `src/App.tsx`

### 职责

- 主窗口状态管理（透明度、穿透、打扰模式、空闲检测）
- 多窗口位置联动（主窗口移动时同步子窗口位置）
- 子窗口生命周期管理（显示/隐藏/互斥）
- Tauri 事件监听与分发（设置变更、待办完成、专注计时、CC 事件等）
- 服务编排（按顺序启动各后台服务）
- AI 对话入口（用户输入 → 调用 AI 服务 → 驱动气泡生命周期）

### 治理热点标记

> **`src/App.tsx` 是当前架构的治理热点。**
>
> 该文件约 900 行，承担了过多职责：多窗口管理、打扰模式检测、光标轮询、事件监听、服务编排、AI 对话流程等。新增业务逻辑不应默认放入此文件。
>
> **新代码放置规则：**
> - 业务规则 → `src/services/` 中新建或扩展现有服务
> - UI 展示逻辑 → `src/components/` 中对应组件
> - 事件监听编排 → 如果 App.tsx 已有类似模式可复用，在最小改动原则下添加；如果新增监听超过 3 个，应考虑抽取为独立 hook

### 状态管理

| 存储方式 | 用途 | 文件 |
|----------|------|------|
| Zustand | UI 状态（表情、天气、菜单可见、AI 处理中） | `src/store/index.ts` |
| React useState | 主窗口本地状态（穿透、打扰模式等） | `src/App.tsx` |
| 模块级变量 | 高频轮询标志（窗口可见性、定时器缓存） | `src/App.tsx` |
| SQLite | 所有持久化数据 | `src/services/db.ts` |

**真相源原则**：Zustand 仅存储 UI 状态；持久化真相在 SQLite；页面组件不应维护与数据库重复的状态。

### 子窗口互斥规则

- TodoPage 和 SchedulerPage 共享主窗口左侧位置，**互斥显示**
- SpeechBubble 定位在主窗口左上方
- SettingsPage 定位在主窗口右侧
- FocusPage 定位在主窗口上方

---

## 3. Service Layer — `src/services/`

### 职责

- 业务规则实现（提醒判断、记忆提取与检索、意图识别等）
- 数据持久化（SQLite schema、migration、CRUD）
- 外部 API 调用（AI、天气、视觉模型）
- 后台定时任务（调度轮询、屏幕监控、天气同步）

### 边界

- **允许**：被 UI 层和协调层调用
- **允许**：调用 Tauri command 获取原生存力
- **禁止**：直接操作 DOM 或管理 React 状态
- **禁止**：互相形成循环依赖

### 服务清单

| 服务 | 文件 | 职责 |
|------|------|------|
| 数据库 | `db.ts` | SQLite schema 管理、7 张表的 CRUD、记忆系统的语义去重和混合检索 |
| AI | `ai.ts` | DeepSeek 流式对话、Gemini 嵌入、视觉模型屏幕分析、记忆提取、日摘要 |
| 天气 | `weather.ts` | Open-Meteo API 同步、WMO 码映射、1 小时缓存 |
| 提醒 | `reminder.ts` | 按优先级和冷却时间选择待办提醒 |
| 屏幕监控 | `screenMonitor.ts` | 30 秒截图 → 哈希去重 → 视觉 AI 分析 → 主动发言决策 |
| 颜色采样 | `colorSampler.ts` | 1 秒间隔采样屏幕像素亮度 → 自适应明暗主题 |
| 时间周期 | `timeCycle.ts` | 7 个时段对应表情和问候语 |
| 调度器 | `scheduler.ts` | 60 秒轮询，支持 daily 和 interval 两种触发模式 |
| 行为调度 | `behaviorScheduler.ts` | 随机 10-30 秒触发自主行为动画（眨眼、张望、伸懒腰、打哈欠） |

### 数据库表

所有表由 `src/services/db.ts` 中的 JS migration 管理（非 Rust 侧）：

| 表 | 用途 |
|----|------|
| `todos` | 活跃待办 |
| `todo_history` | 归档待办（每日 5:00 清理） |
| `settings` | key-value 设置存储 |
| `weather_cache` | 天气缓存（单行） |
| `chat_history` | 对话历史（上限 60 条） |
| `user_memories` | 用户记忆（含向量嵌入） |
| `daily_summaries` | 每日摘要 |
| `scheduled_tasks` | 定时任务 |

---

## 4. Tauri / Rust Layer — `src-tauri/src/`

### 职责

- 提供前端无法直接访问的原生系统能力（像素采样、光标位置、全屏检测、截图、窗口穿透）
- 管理 Tauri 应用生命周期（插件注册、窗口创建、系统托盘）
- 运行桥接 HTTP 服务（供外部 AI agent 通信）

### 边界

- **允许**：通过 `invoke` 向前端暴露能力
- **允许**：通过 `emitTo` 向特定窗口发送事件
- **禁止**：包含业务逻辑（业务逻辑属于 Service Layer）
- **禁止**：直接操作数据库（当前由 JS 侧管理）

### Tauri Commands

| Command | 文件 | 功能 |
|---------|------|------|
| `sample_pixel_color` | `commands/system.rs` | Win32 GDI 像素颜色采样 |
| `get_cursor_position` | `commands/system.rs` | Win32 光标位置获取 |
| `get_fullscreen_mode` | `commands/system.rs` | 全屏/最大化应用检测 |
| `set_window_passthrough` | `commands/system.rs` | 窗口鼠标穿透切换 |
| `take_screenshot` | `commands/system.rs` | 截屏并返回 JPEG base64 |

### 桥接服务

`src-tauri/src/bridge_server.rs` — Axum HTTP 服务（`127.0.0.1:3456`）：
- `POST /claude-event`：接收 Claude Code hook 事件，广播 `cc-event` 到所有 Tauri 窗口
- 供 `cloudpet-mcp` 和 Claude Code hooks 与桌面宠物交互

### 新增 Command 的必要步骤

1. 在 `src-tauri/src/commands/` 中实现函数，返回 `Result<T, String>`
2. 在 `src-tauri/src/commands/mod.rs` 中注册模块
3. 在 `src-tauri/src/lib.rs` 的 `invoke_handler![]` 中注册 command
4. 在 `src-tauri/capabilities/default.json` 中添加权限声明

---

## 5. cloudpet-mcp — `cloudpet-mcp/`

### 职责

- 作为独立的 MCP（Model Context Protocol）服务运行
- 为外部 AI agent（如 Claude Code）提供与桌面宠物交互的工具接口

### 边界

- **独立子项目**：有自己的 `package.json` 和 `node_modules`，不与主应用共享依赖
- 通过桥接服务（`127.0.0.1:3456`）与主应用通信，不直接操作 Tauri
- 不直接访问数据库

### 提供的工具

| 工具 | 功能 |
|------|------|
| `get_user_input` | 获取待处理的用户消息 |
| `send_reply` | 向桌面宠物气泡发送回复 |

### 与主应用的关系

```
Claude Code → cloudpet-mcp → bridge_server (HTTP :3456) → Tauri 事件 → 气泡窗口
```

cloudpet-mcp 是外部 AI agent 与桌面宠物之间的翻译层，通过桥接服务的 HTTP 接口间接通信。

---

## 跨层通信规则

| 通信方式 | 适用场景 | 示例 |
|----------|----------|------|
| Tauri `invoke` | 前端 → Rust，获取原生存力 | 调用 `take_screenshot` |
| Tauri `emitTo` | 协调层 → 子窗口 | `emitTo('speech-bubble', 'speech:show', ...)` |
| Tauri `listen` | 子窗口 ← 协调层 | `listen('speech:show', handler)` |
| 直接函数调用 | 同层内或上层调用下层 | App.tsx 调用 `chatStream()` |
| HTTP POST | 外部 agent → 桥接服务 | Claude Code hooks → `/claude-event` |
| SQLite | 任意层通过 db 服务 | 所有持久化读写 |

### 事件命名规范

事件名使用 `<domain>:<action>` 格式。已登记事件见 `CLAUDE.md` 事件表。新增事件前必须检查该表，避免命名冲突。

---

## 依赖方向

```
cloudpet-mcp ──HTTP──→ Tauri/Rust Layer
                              ↑
UI Layer ──invoke──→ Tauri/Rust Layer
                              ↑
Page Coordination ──invoke──→ Tauri/Rust Layer
                              ↑
Service Layer ──invoke──→ Tauri/Rust Layer

UI Layer ←──listen/emitTo──→ Page Coordination
Service Layer ←──函数调用──→ Page Coordination
```

**核心原则**：依赖方向始终从上层指向下层，下层不感知上层。
