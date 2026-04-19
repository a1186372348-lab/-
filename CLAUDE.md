# CLAUDE.md

该文件为 AI 编码代理处理此仓库代码时提供指导。

---

## 项目概览

云宝助手（Zhushou）是一个基于 Tauri 2 + React 19 的桌面宠物应用。它以一朵可爱的云朵形态常驻桌面，具备 AI 对话、待办管理、屏幕感知、天气联动、自主行为等能力。目标是成为用户桌面上"有生命感"的智能伴侣。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Tauri 2 | 桌面应用框架（Rust 后端） |
| React 19 | 前端 UI 框架 |
| TypeScript 5.8 | 类型安全 |
| Vite 7 | 前端构建工具 |
| Zustand 5 | 全局状态管理 |
| Framer Motion 12 | 动画引擎 |
| SQLite (tauri-plugin-sql) | 本地数据库 |
| DeepSeek API (OpenAI SDK) | AI 对话 |
| Rust + Tokio + Axum | 系统命令 + 桥接服务器 |
| Howler.js | 音效播放 |

---

## 命令

```bash
# 开发（Tauri 热重载）
npm run tauri dev

# 前端开发服务器（:1420）
npm run dev

# 构建打包（exe + msi）
npm run tauri build

# 类型检查（TS + Rust）
npm run check

# 仅 TS 类型检查
npm run check:ts

# 仅 Rust 编译检查
npm run check:rust

# 验证（等同 check）
npm run verify
```

> 注意：项目未配置单元测试框架。

---

## 项目结构

```
zhushou/
├── src/                          # 前端 React 源码
│   ├── main.tsx                  # 入口（路由分发器，按 ?page= 渲染）
│   ├── App.tsx                   # 薄协调层（页面组装 + 用户交互入口）
│   ├── types.ts                  # 全局类型定义
│   ├── App.css                   # 全局样式变量
│   ├── store/index.ts            # Zustand 状态（表情/天气/菜单/处理中）
│   ├── hooks/                    # React hooks
│   ├── components/               # UI 组件（CloudPet/InputBar/TodoPage/...）
│   └── services/                 # 后端服务（ai/db/weather/reminder/...）
├── src-tauri/                    # Rust 后端
│   ├── src/commands/             # Tauri 系统命令（截图/光标/设置/...）
│   ├── src/lib.rs                # 应用初始化 + 插件注册
│   ├── src/bridge_server.rs      # CC 事件桥接服务器（:3456）
│   ├── tauri.conf.json           # 窗口配置
│   └── capabilities/default.json # 权限声明
├── cloudpet-mcp/                 # MCP 服务器（独立子项目）
└── public/sounds/                # 音效资源
```

---

## 架构

### 分层模型

```
UI 层（components/）         ← 纯展示 + 动画，不含业务逻辑
    ↓ props + callbacks
集成层（App.tsx + hooks）      ← 薄协调：页面组装、用户交互入口、AI 表现协调
  ├── useWindowOrchestration   ← 窗口编排（子窗口、光标、低干扰、穿透、hover）
  └── useAppRuntime            ← 运行时（服务生命周期、事件桥接、空闲计时）
    ↓ invoke / emit / callbacks
服务层
  ├── AI 感知（ai.ts / screenMonitor.ts）
  ├── 行为服务（reminder / scheduler / timeCycle / weather / behaviorScheduler）
  └── 数据层（db.ts）        ← 所有 SQLite 操作
    ↓
Rust 系统层（src-tauri/commands/）  ← 截图、光标、窗口穿透等 OS API
    ↓
SQLite 数据库 + Windows 系统调用
```

### 多窗口架构

应用由 6 个独立 WebView 窗口组成，通过 `emitTo()` 事件通信：

| 窗口 | 页面参数 | 用途 |
|------|---------|------|
| `main` | - | 云朵 + 输入框（始终置顶） |
| `todo-manager` | `?page=todos` | 待办清单 |
| `settings` | `?page=settings` | API Key 设置 |
| `focus` | `?page=focus` | 专注时钟 |
| `scheduler` | `?page=scheduler` | 定时任务 |
| `speech-bubble` | `?page=speech-bubble` | 气泡显示（流式） |

### 事件通信

- **向下**：React props 传递
- **跨窗口**：Tauri `emitTo('label', 'event-name', payload)`
- **服务回调**：回调函数注入（服务不直接访问 React state）

---

## 角色分工与文件所有权

项目采用严格的角色分工 + 接口契约模式，每层有独立的 `CLAUDE.md`（角色说明）和 `INTERFACE.md`（公共 API 契约）。

| 角色 | 文件所有权 | CLAUDE.md 位置 |
|------|-----------|---------------|
| 前端 UI 工程师 | `src/components/`、`src/App.css`、`src/hooks/` | `src/components/CLAUDE.md` |
| 数据基础工程师 | `src/services/db.ts`、`src/types.ts` | `src/services/data/CLAUDE.md` |
| AI 感知工程师 | `src/services/ai.ts`、`src/services/screenMonitor.ts` | `src/services/ai/CLAUDE.md` |
| 行为服务工程师 | `src/services/` 中的行为服务文件 | `src/services/behavior/CLAUDE.md` |
| Rust 系统工程师 | `src-tauri/` | `src-tauri/CLAUDE.md` |
| 集成工程师 | `src/App.tsx`、`src/main.tsx`、`src/store/` | （由根 CLAUDE.md 覆盖） |

**关键规则**：修改任何层的文件前，先读该层的 `CLAUDE.md` 和 `INTERFACE.md`。

---

## 代码模式

### 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase | `CloudPet`、`TodoPage` |
| 函数 | camelCase | `startReminderService`、`chatStream` |
| 常量 | UPPER_SNAKE_CASE | `IDLE_MS`、`PRIORITY_COLOR` |
| 类型/接口 | PascalCase | `CloudExpression`、`Todo` |
| CSS 类名 | 短前缀 + 蛇形 | `sp-root`、`tp-item`、`fm-visible` |
| Rust command | snake_case | `take_screenshot`、`get_cursor_position` |

### 文件组织

- 组件就近原则：`Component/index.tsx` + `Component/index.css`
- 服务按功能分离：`src/services/` 下每个文件一个职责
- 类型集中管理：`src/types.ts` 统一定义
- 样式变量集中：`src/App.css` 定义全局 CSS 变量

### 错误处理

- AI 调用必须 `try/catch` 静默降级，不得向上抛未捕获异常
- 天气等外部服务使用缓存回退策略
- Rust command 统一返回 `Result<T, String>`，禁止 `unwrap()` / `panic!()`

### 服务标准模式

```typescript
// 启动服务，返回 stop 函数
export function startXxxService(callbacks: XxxCallbacks): () => void {
  return stopXxxService;
}
```

服务不直接访问 React state，外部数据通过回调参数注入。

---

## 接口契约规范

每层维护一个 `INTERFACE.md`，记录该层向外暴露的公共 API。

- 接口签名一旦发布，**不得随意修改参数类型或返回类型**
- 已发布的导出函数**不得删除**（可标记废弃）
- 任何签名变更都需要先进 Plan 模式评估影响范围
- **每次改动后必须更新对应的 `INTERFACE.md`**

---

## 验证清单

提交前执行：

```bash
npm run check          # TS + Rust 类型检查
```

### Rust 层新增 Command 检查清单

- [ ] 在 `lib.rs` 的 `invoke_handler![]` 中注册
- [ ] 在 `capabilities/default.json` 中添加权限
- [ ] 在 `src-tauri/INTERFACE.md` 中记录

### DB Schema 变更检查清单

- [ ] 通过 `COLUMN_MIGRATIONS` 增量迁移，不得 DROP 列
- [ ] migration key 格式：`add_columnname_to_tablename`
- [ ] 在 `src/services/data/INTERFACE.md` 中记录 schema

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/App.tsx` | 薄协调层，页面组装 + 用户交互入口 + AI 表现协调（~96 行） |
| `src/hooks/useWindowOrchestration.ts` | 窗口编排（子窗口 show/hide、光标轮询、低干扰、穿透、hover 交互） |
| `src/hooks/useAppRuntime.ts` | 运行时 hook（服务生命周期、事件桥接、空闲计时） |
| `src/types.ts` | 全局类型定义（表情/天气/待办/定时任务） |
| `src/store/index.ts` | Zustand 全局状态 |
| `src/services/db.ts` | SQLite 数据层（CRUD + 迁移） |
| `src/services/ai.ts` | AI 对话 + 记忆压缩 + 嵌入 |
| `src/services/screenMonitor.ts` | 屏幕感知 + 主动交互 |
| `src-tauri/src/lib.rs` | Tauri 初始化 + 命令注册 |
| `src-tauri/tauri.conf.json` | 窗口配置 |

---

## 按需上下文

| 主题 | 文件 |
|------|------|
| UI 组件规范 | `src/components/CLAUDE.md` + `INTERFACE.md` |
| 数据层接口 | `src/services/data/CLAUDE.md` + `INTERFACE.md` |
| AI 感知规范 | `src/services/ai/CLAUDE.md` + `INTERFACE.md` |
| 行为服务规范 | `src/services/behavior/CLAUDE.md` + `INTERFACE.md` |
| Rust 系统层 | `src-tauri/CLAUDE.md` + `INTERFACE.md` |

---

## 全局禁止事项

- 跨层修改文件前必须确认角色所有权（见上方角色分工表）
- 不得在 UI 组件中直接调用 AI 服务或 Tauri API（通过集成层中转）
- 不得在服务层直接操作 UI 状态（通过回调向上传递）
- 不得修改 `store/index.ts` 的 state shape（除非集成层明确需要）
- 修改 Prompt 前必须写出改前/改后对比
- 新增表情必须同时提供：`types.ts` 枚举值 + `public/expressions/` 图片 + `CloudRenderer` 动画 variant
