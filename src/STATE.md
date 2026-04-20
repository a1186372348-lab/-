# 状态归属规则

> 创建日期：2026-04-20
> 本文档定义应用中各类状态的归属规则，明确"什么状态该放哪里"。

---

## 四种状态容器

| 容器 | 适用场景 | 生命周期 | 示例 |
|------|---------|---------|------|
| **组件局部 useState** | 仅在单个组件内使用，不跨组件共享 | 组件挂载→卸载 | `showInputBar`（App.tsx） |
| **Zustand Store** | 跨组件或跨窗口共享的 UI 状态，无需持久化 | 应用进程生命周期 | `expression`、`focusClock`、`ccActive` |
| **SQLite 数据库** | 需要持久化的结构化数据 | 跨应用重启 | `todos`、`settings`、`scheduler tasks` |
| **Rust/Tauri 状态** | 由后端驱动或需要 OS API 的状态 | 应用进程生命周期 | `cc-event`（桥接服务器推送）、光标位置、窗口状态 |

---

## 当前归属一览

### Zustand Store（`src/store/index.ts`）

| 状态字段 | 类型 | 写入方 | 读取方 |
|---------|------|--------|--------|
| `expression` | `CloudExpression` | App.tsx、useAppRuntime | CloudPet/CloudRenderer |
| `weather` | `WeatherCondition` | App.tsx | CloudPet/CloudRenderer |
| `showHoverMenu` | `boolean` | useWindowOrchestration | App.tsx |
| `isProcessing` | `boolean` | App.tsx | CloudPet |
| `focusClock` | `FocusClockState \| null` | useAppRuntime（focus 事件监听） | CloudPet/CloudRenderer |
| `ccActive` | `boolean` | useAppRuntime（cc-event 监听） | App.tsx（opacity/pointerEvents） |

### SQLite（`src/services/db.ts`）

| 数据 | 说明 |
|------|------|
| `todos` | 待办事项列表 |
| `settings` | 用户设置（API Key 等） |
| `scheduler_tasks` | 定时任务配置 |

### 组件局部 useState

| 状态 | 所在文件 | 用途 |
|------|---------|------|
| `showInputBar` | App.tsx | 控制输入框显隐 |

---

## 新增状态 Checklist

添加新状态时，按以下 5 条规则判断归属：

1. **是否跨组件共享？** — 如果多个组件需要读写同一状态，不应放在组件局部 useState，应提升到 Zustand。
2. **是否跨窗口共享？** — 如果状态需要在不同 WebView 窗口间同步（如主窗口读取子窗口的状态变更），必须放 Zustand（通过事件通知写入）。
3. **是否需要持久化？** — 如果状态需要在应用重启后保留，应放 SQLite，而非 Zustand（内存状态重启即丢失）。
4. **是否由后端驱动？** — 如果状态由 Rust 层或外部系统（如 MCP、桥接服务器）推送，通过事件监听写入 Zustand，不在组件内直接管理。
5. **是否已有同类容器可复用？** — 优先复用已有容器。如果 Zustand 已有类似字段，扩展它而非新增独立状态。新增 Zustand 字段的模式：`interface 加字段 + setter` → `create() 加初始值 + 实现` → `不改消费端`。

---

## 禁止事项

- **不在 App.tsx 堆积跨组件业务状态** — App.tsx 是薄协调层，不持有 focusClock、ccActive 等跨组件状态。这些应放 Zustand。
- **不在服务层直接操作 UI 状态** — 服务通过回调向上传递数据，由集成层（hooks）写入 Zustand。
- **不在 UI 组件中直接调用数据服务** — 通过集成层中转。
