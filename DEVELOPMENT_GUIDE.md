# 开发成长入口

这份文档是这个项目的工程化入口，目标不是介绍功能，而是帮你建立一套可以反复执行的开发闭环。

## 文档导航

### 项目状态与总览

1. [项目状态](./docs/PROJECT_STATUS.md) — 项目当前阶段、进度、风险和下一步动作的单一事实来源
2. [项目总览](./docs/architecture/PROJECT_OVERVIEW.md) — 系统分层、数据流与工程风险说明
3. [根目录结构说明](./docs/architecture/ROOT_STRUCTURE.md) — 仓库顶层目录和文件的用途盘点

### 功能需求卡（docs/specs/）

4. [功能需求卡目录](./docs/specs/INDEX.md) — 所有功能需求卡的索引和命名规范
5. [功能状态矩阵](./docs/specs/FEATURE_MATRIX.md) — 每项功能的当前状态和优先级
6. [项目路线图](./docs/specs/ROADMAP.md) — 当前阶段重点、暂不做事项、下一阶段候选
7. [功能需求模板](./docs/specs/FEATURE_SPEC_TEMPLATE.md) — 创建新需求卡的统一模板

### 架构文档（docs/architecture/）

8. [架构分层说明](./docs/architecture/ARCHITECTURE.md) — UI 层 / 协调层 / 服务层 / Tauri 层 / MCP 的职责边界
9. [事件文档](./docs/architecture/EVENTS.md) — 关键事件的发送方、接收方、Payload 和用途
10. [关键数据流](./docs/architecture/DATA_FLOW.md) — Todo / Reminder / Scheduler / Chat / Memory 的运行时链路
11. [技术债登记](./docs/architecture/TECH_DEBT.md) — 已知工程风险、严重程度和治理方向

### 开发流程（docs/process/）

12. [开发检查清单](./docs/process/DEV_CHECKLIST.md) — 开发前/开发后的固定检查步骤
13. [测试策略](./docs/process/TEST_STRATEGY.md) — 自动检查、人工验收和暂不覆盖的边界
14. [最小回归清单](./docs/process/REGRESSION_CHECKLIST.md) — 常规改动后的固定人工回归步骤
15. [问题排查模板](./docs/process/BUG_TRIAGE_TEMPLATE.md) — 定位问题的标准流程
16. [AI 协作手册](./docs/process/AI_COLLAB_PLAYBOOK.md) — 与 AI 协作的需求→方案→实现→review 四轮拆分
17. [换机启动清单](./docs/process/SETUP_CHECKLIST.md) — 换电脑后恢复开发环境的固定步骤

### 过程日志（docs/logs/）

18. [会话日志](./docs/logs/SESSION_LOG.md) — 协作过程记录

## 每次开发的固定顺序

1. 先用"功能需求模板"写清楚目标、边界、验收标准。
2. 再读"项目总览"，确认这次改动会动到哪些模块。
3. 实现前先写"开发前检查"。
4. 实现后按"开发后检查"和"最小回归清单"逐项验证。
5. 出问题时，不直接重写，先按"问题排查模板"定位。
6. 使用 AI 时，按"AI 协作手册"拆分成需求、方案、实现、review 四轮。

## 代码治理规则

以下规则是项目协作的强制约束，所有贡献者（包括 AI）必须遵守：

1. **新功能必须先写需求卡再动手实现。** 使用 `docs/specs/FEATURE_SPEC_TEMPLATE.md` 模板，明确目标、边界和验收标准后，才进入编码阶段。

2. **跨模块改动必须在同一次变更中同步更新相关文档。** 如果一次改动涉及两个以上模块（如 Rust + 前端、多个窗口、新增事件），必须在同一次提交中更新对应的架构文档、事件文档、需求卡或流程文档。不允许"先改代码，文档以后补"。

3. **新业务逻辑必须放入 service 或对应模块，不得默认堆进 App.tsx。** App.tsx 是页面协调层，只负责状态编排和多窗口联动。业务规则、数据处理、外部 API 调用属于 service 层（`src/services/`）。

4. **每次提交前必须运行最小检查并检查 git diff。** 执行 `npm run check` 确认编译通过，用 `git diff` 确认改动范围符合预期，不包含意外文件。

## 当前阶段最重要的原则

- 不把"代码写出来了"当作"功能完成了"。
- 不让 AI 同时扮演产品、架构、实现、测试四个角色。
- 不一次叠很多功能，优先做最小可验证版本。
- 不带着脏工作区继续开发。
- 每次改动后都要留下可复用的结论：需求卡、验收结果、复盘记录。

## 跨电脑协作

换电脑时，不靠聊天记录延续上下文，靠仓库文档延续上下文。

### 需要同步的核心文档

1. `CLAUDE.md`
2. `DEVELOPMENT_GUIDE.md`
3. `docs/logs/SESSION_LOG.md`
4. 当前任务相关模板或记录

### 换机前固定动作

1. 先看 `git status`
2. 提交或明确记录未提交改动
3. 更新 `docs/logs/SESSION_LOG.md`
4. 记下当前分支和下一步最小动作

### 新电脑启动顺序

1. 拉取最新代码
2. 安装项目依赖
3. 读取 `CLAUDE.md`
4. 读取 `DEVELOPMENT_GUIDE.md`
5. 读取 `docs/logs/SESSION_LOG.md`
6. 再开始与导师协作

### 新电脑开场提示词

```text
这是云宝助手项目，请先按仓库内的 CLAUDE.md、DEVELOPMENT_GUIDE.md 和 docs/logs/SESSION_LOG.md 恢复上下文。你继续作为我的导师，按 8 周训练计划协助我完成项目，并训练我的开发能力。先总结当前状态，再告诉我下一步。
```
