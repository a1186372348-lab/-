# 项目状态

> 这是项目当前状态的单一事实来源。新接手开发者阅读本文档即可理解项目阶段和下一步动作。

---

## 项目概述

**项目名称**：云朵助手（Zhushou）
**定位**：桌面宠物助手 MVP
**技术栈**：Tauri 2 + React + TypeScript + Rust + SQLite
**仓库地址**：https://github.com/a1186372348-lab/-

---

## 当前目标

1. **项目结构清理已完成**（2026-04-18）：18 个 User Story 已全部通过，文档体系、检查入口和治理规则已完成收口
2. **回到下一轮治理 / 功能迭代**：优先从 `src/App.tsx` 治理或轮询替换中选择一个最小切口推进

---

## 当前进行中

**分支**：`ralph/project-structure-cleanup`
**任务**：结构清理 PRD 已收口完成，当前仓库进入“选择下一轮最小动作”的过渡阶段

| 阶段 | Story 范围 | 状态 |
|---|---|---|
| Phase 1: 结构盘点与顶层清理 | US-001 ~ US-002 | 已完成 |
| Phase 2: 文档体系补齐 | US-003 ~ US-012 | 已完成 |
| Phase 3: 检查入口与治理规则固化 | US-013 ~ US-018 | 已完成 |

---

## 近期已完成

- **结构清理 initiative 收口完成**：US-001 ~ US-018 全部通过，交付基线见 `docs/specs/PROJECT-STRUCTURE-CLEANUP-PRD.md`
- **文档体系补齐**：`docs/specs/`、`docs/architecture/`、`docs/process/`、`docs/logs/` 已形成稳定入口，`DEVELOPMENT_GUIDE.md` 可作为统一导航
- **验证路径统一**：`package.json`、`docs/process/TEST_STRATEGY.md`、`docs/process/REGRESSION_CHECKLIST.md` 已定义最小自动检查和人工回归路径
- **Ralph 收口卫生已处理**：结构清理状态已同步到入口文档，Python 缓存产物已清理，正式流程文档已归档

---

## 下一步最小动作

1. 从 `docs/architecture/TECH_DEBT.md` 中选择下一项治理主题，优先评估 `src/App.tsx` 拆分
2. 如果继续做新功能，先使用 `docs/specs/FEATURE_SPEC_TEMPLATE.md` 补需求卡，再进入实现

---

## 主要风险或阻塞

| 风险 | 影响 | 当前状态 |
|---|---|---|
| `src/App.tsx` 过重 | 新逻辑默认堆入主入口，增加维护成本 | 已识别，下一轮优先考虑拆分协调逻辑 |
| 无自动化测试 | 功能回归全靠人工，改一处可能隐性破坏他处 | 已建立最小回归文档，但仍需人工验收 |
| 轮询偏多 | Scheduler、页面同步使用轮询，有重复触发和性能风险 | 已识别，后续逐步替换为事件驱动 |
| 文档入口需要持续维护 | 新文档若不及时挂到入口会再次分散 | 本轮已统一导航，后续新增文档需同步更新 `DEVELOPMENT_GUIDE.md` |

---

## 导航

- [开发成长入口](../DEVELOPMENT_GUIDE.md) — 完整文档导航
- [根目录结构说明](./architecture/ROOT_STRUCTURE.md)
- [项目总览](./architecture/PROJECT_OVERVIEW.md)
- [架构分层说明](./architecture/ARCHITECTURE.md)
- [技术债登记](./architecture/TECH_DEBT.md)
- [功能需求卡目录](./specs/INDEX.md)
- [功能状态矩阵](./specs/FEATURE_MATRIX.md)
- [测试策略](./process/TEST_STRATEGY.md)
- [最小回归清单](./process/REGRESSION_CHECKLIST.md)
- [会话日志](./logs/SESSION_LOG.md)
