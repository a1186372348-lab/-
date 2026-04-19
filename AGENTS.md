# AGENTS.md

本文件为在此仓库中协作的 AI 编码代理提供最小必要上下文。目标是快速理解项目结构、遵循现有约定，并避免重复踩坑。

## 项目概览

`zhushou` 是一个基于 `Tauri 2 + React + TypeScript + Rust + SQLite` 的桌面宠物助手应用。主体验是一个常驻桌面的云朵窗口，配套待办、设置、专注计时、定时提醒和气泡子窗口，并通过本地数据库保存待办、设置、对话历史、记忆和定时任务。

项目类型应视为：

- Tauri 桌面应用
- 单仓库前后端混合项目
- 附带一个独立的 `cloudpet-mcp/` Node MCP 服务

## 技术栈

| 技术 | 用途 |
|------|------|
| Tauri 2 | 桌面壳、多窗口、系统能力、托盘 |
| Rust | 原生命令、窗口控制、桥接服务 |
| React 19 + TypeScript | 前端 UI 与页面逻辑 |
| Vite | 前端开发与构建 |
| Zustand | 轻量全局状态 |
| tauri-plugin-sql + SQLite | 本地数据存储 |
| Framer Motion | 云朵与界面动画 |
| Howler | 音效播放 |
| OpenAI SDK | AI 能力接入 |
| Axum | Rust 侧桥接服务 |

## 常用命令

```bash
# 前端开发服务器
npm run dev

# 前端构建
npm run build

# 启动 Tauri CLI（常用为 dev/build 子命令）
npm run tauri -- dev
npm run tauri -- build

# TypeScript 校验
npx tsc --noEmit

# Rust 校验
cargo check --manifest-path src-tauri/Cargo.toml

# MCP 服务
npm --prefix cloudpet-mcp start
```

说明：

- 根目录 `package.json` 当前没有独立的 `test` 或 `lint` 脚本。
- 对前端改动，至少运行 `npx tsc --noEmit`。
- 对 Rust 或 Tauri 改动，至少再运行 `cargo check --manifest-path src-tauri/Cargo.toml`。
- 需要验证多窗口、透明、穿透、托盘、位置联动时，以 `npm run tauri -- dev` 进行人工验收。

## 项目结构

```text
zhushou/
├── src/                    # React 前端源码
│   ├── components/         # 主窗口与子窗口页面组件
│   ├── services/           # AI、数据库、天气、提醒、调度等服务
│   ├── store/              # Zustand 状态
│   ├── types.ts            # 前端共享类型
│   ├── main.tsx            # 根据 ?page=... 选择渲染窗口页面
│   └── App.tsx             # 主窗口协调层，多窗口与服务编排中心
├── src-tauri/              # Rust/Tauri 工程
│   ├── src/commands/       # Tauri commands
│   ├── src/lib.rs          # Tauri builder 与 invoke_handler 注册
│   ├── src/bridge_server.rs# 桥接服务
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # 多窗口与构建配置
├── public/                 # 静态资源
├── docs/                   # 项目说明、流程模板、协作与排查文档
├── scripts/                # 辅助脚本
├── cloudpet-mcp/           # 独立 MCP 服务
├── CLAUDE.md               # 仓库级协作规范
├── DEVELOPMENT_GUIDE.md    # 开发闭环与文档入口
└── MISTAKES.md             # 历史失误记录
```

## 架构与数据流

- `src/main.tsx` 通过 `?page=todos|settings|focus|speech-bubble|scheduler` 复用同一前端入口，为不同 Tauri 窗口渲染不同页面。
- `src/App.tsx` 是当前最重的协调层，负责主窗口状态、多窗口位置联动、事件监听、气泡输出、服务启动与清理。
- UI 层只负责展示和轻量交互；业务规则优先下沉到 `src/services/`。
- 本地状态的轻量 UI 真相在 Zustand；持久化真相在 SQLite。
- 原生系统能力统一放在 `src-tauri/src/commands/`，通过 Tauri `invoke` 暴露给前端。
- Rust 侧数据库初始化目前由 JS 侧 `src/services/db.ts` 中的 migration 负责，`src-tauri/src/db.rs` 只保留说明。

## 代码模式与约定

### 命名与组织

- React 组件目录采用 `src/components/<Name>/index.tsx` 搭配同目录 `index.css`。
- 页面级子窗口组件包括 `TodoPage`、`SettingsPage`、`FocusPage`、`SpeechBubblePage`、`SchedulerPage`。
- 服务文件按能力拆分，如 `ai.ts`、`db.ts`、`reminder.ts`、`scheduler.ts`、`screenMonitor.ts`。
- 类型集中在 `src/types.ts`，跨模块数据结构优先复用现有类型。

### 前端约定

- `App.tsx` 负责协调，不应继续堆积具体业务判断。
- `useEffect` 中注册的监听或轮询必须有对应 cleanup。
- 多窗口联动优先复用现有模式，不要新造并行机制。
- 页面不要私自维护与数据库重复的真相状态，写入后应以服务层和持久层为准。

### Tauri/Rust 约定

- 新增 command 后，必须同步更新：
  - `src-tauri/src/commands/mod.rs`
  - `src-tauri/src/lib.rs` 中的 `invoke_handler![]`
  - `src-tauri/capabilities/default.json` 中的权限声明
- 多窗口标签必须与 `src-tauri/tauri.conf.json` 保持一致：
  - `main`
  - `speech-bubble`
  - `todo-manager`
  - `settings`
  - `focus`
  - `scheduler`
- Rust command 应返回 `Result<T, String>`，避免 `unwrap()` 和 `panic!()`。

### 事件约定

- 事件命名优先采用 `<domain>:<action>`。
- 已存在的重要事件包括：
  - `settings-changed`
  - `all-todos-complete`
  - `cc-event`
  - `speech:show`
  - `speech:append`
  - `speech:done`
  - `focus-start`
  - `focus-pause`
  - `focus-reset`
  - `focus-phase-change`
  - `scheduler:reload`
- 新增事件前，先检查 `CLAUDE.md` 中的事件表，避免冲突。

### 动画与窗口行为

- 状态变化驱动动画，不要反过来让动画结果决定状态。
- 透明、穿透、拖拽、浮窗位置联动已形成既有模式；修改前先读 `src/App.tsx` 和相关页面。

## 文档与协作要求

- 开始较大任务前先读：
  - `MISTAKES.md`
  - `CLAUDE.md`
  - `DEVELOPMENT_GUIDE.md`
- 需要理解系统分层时，优先读 `docs/architecture/PROJECT_OVERVIEW.md`。
- 需要澄清需求、排查问题或做回归时，使用 `docs/` 下模板文档。
- 读取中文文档时显式按 UTF-8 处理，避免把乱码写回仓库文件。

## 验证

建议按改动范围选择最小验证集：

```bash
npx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri -- dev
```

说明：

- 当前仓库没有系统化自动化测试；UI、动画、透明度、穿透、窗口定位需要人工确认。
- 提交前应查看 `git diff`，确认没有把构建产物、临时文件或无关改动带入提交。

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/App.tsx` | 主窗口协调层，理解项目行为的首要入口 |
| `src/main.tsx` | 多窗口页面入口分发 |
| `src/services/db.ts` | SQLite schema、migration 与主要数据访问 |
| `src/store/index.ts` | 全局 UI 状态 |
| `src/types.ts` | 共享类型定义 |
| `src-tauri/src/lib.rs` | Tauri 启动、托盘、command 注册 |
| `src-tauri/src/commands/system.rs` | 系统级能力入口 |
| `src-tauri/tauri.conf.json` | 窗口标签、尺寸和构建配置 |
| `CLAUDE.md` | 项目级协作与事件规范 |
| `docs/architecture/PROJECT_OVERVIEW.md` | 分层、数据流与工程风险说明 |

## 额外说明

- 仓库中存在 `dist/`、`node_modules/`、`src-tauri/target-*`、`__MACOSX/` 等非核心目录；分析代码时应主动忽略构建产物和临时文件。
- `cloudpet-mcp/` 是独立子项目，除非任务明确涉及 MCP 服务，否则不要把它与主桌面应用改动混在一起。
