# 功能状态矩阵

> 统一查看每项功能的当前状态、优先级和关联文档。

---

## 状态定义

| 状态 | 含义 |
|---|---|
| `idea` | 有想法但未规划 |
| `planned` | 已规划但未开始 |
| `in-progress` | 正在开发中 |
| `shipped` | 已上线可用 |
| `paused` | 暂停开发 |

---

## 功能矩阵

| # | 功能名称 | 状态 | 优先级 | 需求卡 | 备注 |
|---|---|---|---|---|---|
| 1 | 主窗口（云朵桌面伴侣） | shipped | P0 | [MAIN-WINDOW.md](./MAIN-WINDOW.md) | 应用核心协调层，管理所有子窗口生命周期 |
| 2 | 语音气泡窗口 | shipped | P0 | [SPEECH-BUBBLE.md](./SPEECH-BUBBLE.md) | AI 对话的主要反馈通道，流式文字展示 |
| 3 | AI 对话 | shipped | P0 | [AI-CHAT.md](./AI-CHAT.md) | DeepSeek 流式对话 + 屏幕感知主动发言 |
| 4 | 设置窗口 | shipped | P1 | [SETTINGS.md](./SETTINGS.md) | SQLite key-value 存储，全局配置中心 |
| 5 | 待办管理 | shipped | P1 | [TODO.md](./TODO.md) | 双表结构（todos + todo_history），支持 AI 创建 |
| 6 | 提醒服务 | shipped | P1 | [REMINDER.md](./REMINDER.md) | 后台服务，按优先级和冷却时间触发提醒 |
| 7 | 定时任务 | shipped | P2 | [SCHEDULER.md](./SCHEDULER.md) | daily/interval 双模式，60 秒轮询 |
| 8 | 专注模式 | shipped | P2 | [FOCUS.md](./FOCUS.md) | 番茄钟计时器，专注/休息双阶段切换，无持久化 |
| 9 | 记忆系统 | shipped | P2 | [MEMORY.md](./MEMORY.md) | 自动提取 + 混合检索 + 去重纠正 + 日摘要 |

---

## 统计

- 总功能数：9
- shipped：9
- in-progress：0
- planned：0
- idea：0
- paused：0

---

## 导航

- [需求卡目录索引](./INDEX.md)
- [项目状态](../PROJECT_STATUS.md)
- [开发指南入口](../../DEVELOPMENT_GUIDE.md)
