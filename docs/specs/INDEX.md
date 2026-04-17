# 功能需求卡目录

本目录是所有功能需求卡的统一存放位置。每项功能的规格说明以独立 Markdown 文件的形式存放在此。

---

## 规范模板

新增需求卡时，使用 [功能需求模板](../FEATURE_SPEC_TEMPLATE.md) 作为基础结构。

## 必含字段

每张需求卡必须包含以下字段（对应模板中的章节）：

| 字段 | 对应模板章节 | 说明 |
|---|---|---|
| 目标 | 第 2 节 | 本次改动解决什么问题、目标用户、期望结果 |
| 用户路径 | 第 3 节 | 用户从触发到看到结果的完整操作链路 |
| 输入 | 第 4 节 | 用户输入、上游事件、依赖数据 |
| 输出 | 第 4 节 | UI 变化、数据写入、外部调用、日志提示 |
| 业务规则 | 第 6 节 | 正常规则、优先级、去重、冲突处理、默认值 |
| 边界与异常 | 第 7 节 | 空输入、重复操作、外部失败、数据不存在、多窗口冲突 |
| 当前状态 | 卡片头部 | 使用以下状态值：`idea` / `planned` / `in-progress` / `shipped` / `paused` |
| 验收清单 | 第 9 节 | 至少 5 条可执行检查项 |

## 文件命名规范

- 使用大写英文加连字符：`FEATURE-NAME.md`
- 示例：`MAIN-WINDOW.md`、`TODO-MANAGER.md`、`FOCUS-TIMER.md`

## 需求卡索引

> 以下列表在实际需求卡创建后逐步补充。

| 需求卡 | 功能名称 | 状态 |
|---|---|---|
| [MAIN-WINDOW.md](./MAIN-WINDOW.md) | 主窗口（云朵桌面伴侣） | shipped |
| [SPEECH-BUBBLE.md](./SPEECH-BUBBLE.md) | 语音气泡窗口 | shipped |
| [SETTINGS.md](./SETTINGS.md) | 设置窗口 | shipped |
| [TODO.md](./TODO.md) | 待办管理 | shipped |
| [SCHEDULER.md](./SCHEDULER.md) | 定时任务 | shipped |
| [REMINDER.md](./REMINDER.md) | 提醒服务 | shipped |
| [FOCUS.md](./FOCUS.md) | 专注模式 | shipped |
| [AI-CHAT.md](./AI-CHAT.md) | AI 对话 | shipped |
| [MEMORY.md](./MEMORY.md) | 记忆系统 | shipped |

---

## 导航

- [返回项目状态](../PROJECT_STATUS.md)
- [开发成长入口](../../DEVELOPMENT_GUIDE.md)
- [功能需求模板](../FEATURE_SPEC_TEMPLATE.md)
