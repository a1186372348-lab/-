# 根目录结构盘点

> 本文档盘点仓库根目录下所有顶层目录和关键散落文件，记录其用途和处理结论。

---

## 顶层目录

| 目录 | 用途 | 状态 | 处理结论 |
|---|---|---|---|
| `src/` | 主应用 React/TypeScript 前端源码，包含组件、服务、hooks、状态管理 | 活跃 | **保留** — 项目核心源码 |
| `src-tauri/` | Tauri/Rust 后端工程，包含命令、数据库操作、窗口管理、原生能力 | 活跃 | **保留** — 项目核心源码 |
| `docs/` | 项目文档，包含协作模板、项目概述、开发清单、会话日志等 | 活跃 | **保留** — 后续 US 会重组目录结构 |
| `public/` | Vite 静态资源目录，包含表情资源和 SVG | 活跃 | **保留** — 构建时由 Vite 引用 |
| `scripts/` | 项目脚本工具，当前包含 `ralph/` 自动化 agent | 活跃 | **保留** — 自动化工具链 |
| `cloudpet-mcp/` | 独立 Node.js 子项目，提供 MCP (Model Context Protocol) 服务，连接 OpenClaw 和云朵助手 | 活跃 | **保留** — 独立子项目，与主应用同仓维护 |
| `node_modules/` | NPM 依赖 | 生成 | **gitignore** — 不入库 |
| `dist/` | Vite 构建产物 | 生成 | **gitignore** — 不入库 |
| `.git/` | Git 仓库数据 | 基础设施 | **保留** |
| `.vscode/` | VS Code 编辑器配置 | 编辑器 | **gitignore** — 仅保留 `extensions.json` |
| `.claude/` | Claude Code 本地配置（含 skills、hooks、settings） | 工具 | **gitignore** — 本地配置不入库 |
| `.agents/` | AI agent 技能配置目录（非 Claude） | 工具 | **忽略** — 本地 AI 工具目录，不入库 |
| `.cursor/` | Cursor 编辑器技能配置目录 | 编辑器 | **忽略** — 本地编辑器配置，不入库 |

## 顶层文件

| 文件 | 用途 | 处理结论 |
|---|---|---|
| `package.json` | NPM 包配置，定义依赖和脚本命令 | **保留** |
| `package-lock.json` | NPM 依赖锁定文件 | **保留** |
| `tsconfig.json` | TypeScript 编译配置 | **保留** |
| `tsconfig.node.json` | Node 环境 TS 配置 | **保留** |
| `vite.config.ts` | Vite 构建配置 | **保留** |
| `index.html` | Vite 入口 HTML | **保留** |
| `.gitignore` | Git 忽略规则 | **保留** |
| `CLAUDE.md` | Claude 项目指令（check-in 版本） | **保留** |
| `AGENTS.md` | AI agent 技术架构指导说明 | **保留** |
| `README.md` | 项目说明文档 | **保留** |
| `DEVELOPMENT_GUIDE.md` | 开发指南文档 | **保留** |
| `MISTAKES.md` | 团队共享错误库，记录历史踩坑 | **保留** |
| `Prd.md` | 原始产品需求文档 | **保留** |
| `PRD-project-structure-cleanup.md` | 本轮结构清理的 PRD | **保留** |
| `openclaw-cloudpet-skill.md` | OpenClaw CloudPet 桥接技能说明 | **保留** — 与 `cloudpet-mcp` 配套 |
| `ralph.log` | Ralph agent 运行日志 | **gitignore** — 临时产物 |
| `nul` | Windows NUL 重定向误创建的空文件 | **gitignore** — 无用途，已在 .gitignore 中 |

## 特定资产处理结论

### `__MACOSX/`

**结论：不存在。** 该目录在当前仓库中未找到，无需处理。macOS 压缩包解压时可能产生此目录，但当前仓库未受影响。

### `.agents/`

**结论：忽略。** 该目录包含非 Claude 系列 AI agent 的技能配置文件（含 `.DS_Store` macOS 元数据），属于本地工具目录，已被 `.gitignore` 覆盖（通过 `*.local` 等规则）。不纳入仓库治理范围。

### `.cursor/`

**结论：忽略。** 该目录包含 Cursor 编辑器的技能配置文件，属于本地编辑器配置，已被 `.gitignore` 覆盖。不纳入仓库治理范围。

### `scripts/ralph/`

**结论：保留。** Ralph 是本项目的自动化编码 agent 工具链，包含 PRD 管理、进度追踪、仪表板等功能。属于项目长期维护工具，保留在 `scripts/ralph/` 路径下。

目录内的临时文件（`__pycache__/`、`*.pyc.*`、`_start_process_test*.log`、`agent-output.log`）应通过 `.gitignore` 规则排除，不进入版本控制。

### `test-bubble.ps1`

**结论：不存在。** 该文件在当前仓库中未找到，无需处理。可能已被删除或从未创建。

## `cloudpet-mcp/` 定位

**定位：独立子项目，与主应用同仓维护。**

依据：
- 拥有独立的 `package.json`、`package-lock.json` 和 `node_modules/`
- 实现独立的 MCP (Model Context Protocol) 服务，对外暴露 API
- 与主桌面应用之间通过协议接口交互，不直接共享代码
- 有独立的配置目录 `config/`

关系说明：
- `cloudpet-mcp/` 是云朵助手的 AI 能力桥接层，负责连接 OpenClaw 等外部 AI 服务
- 主桌面应用（Tauri 2 + React）通过标准化接口与 `cloudpet-mcp/` 通信
- 两者可以独立开发、独立部署，但当前选择同仓维护以简化协作
- `openclaw-cloudpet-skill.md` 是该子项目的配套技能说明文档

## 仓库边界总结

```
zhushou/
├── src/              # 主应用前端源码（React + TypeScript）
├── src-tauri/        # 主应用后端源码（Tauri 2 + Rust + SQLite）
├── public/           # 静态资源（构建时引用）
├── docs/             # 项目文档
├── scripts/ralph/    # 自动化工具链
├── cloudpet-mcp/     # 独立子项目：MCP AI 桥接服务
├── package.json      # 主应用依赖与脚本
├── CLAUDE.md         # Claude 协作指令
├── AGENTS.md         # AI agent 架构指导
├── *.md              # 项目文档散落文件
└── 配置文件           # vite, tsconfig, gitignore
```

## 处理后的边界清晰度

结构清理后，以下边界比当前更清晰：
- **主应用源码**：`src/` + `src-tauri/` — 明确的前后端分工
- **构建配置**：`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`
- **文档**：`docs/` — 后续 US 会重组
- **工具**：`scripts/ralph/` — 自动化 agent
- **子项目**：`cloudpet-mcp/` — 独立 MCP 服务
