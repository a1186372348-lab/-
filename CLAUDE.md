# 云朵助手 — 项目公共规范

所有分层的 Claude 均须遵守本文件。各层专属职责见各自目录下的 CLAUDE.md。

---

## 项目背景

- 技术栈：Tauri 2 + React + TypeScript + Framer Motion
- 多窗口：`main` / `todo-manager` / `settings` / `focus` / `speech-bubble`
- 样式：各组件独立 CSS，全局变量在 `App.css`
- 远程仓库：https://github.com/a1186372348-lab/-（所有 push 推送此仓库，不得修改 remote 地址）

---

## MISTAKES.md 机制（必须执行）

- **每次任务开始前必须读 `MISTAKES.md`**，检查是否命中历史错误
- 命中时在回复开头声明，避免重蹈覆辙
- 发现 Claude 做错事 → 立刻追加到 `MISTAKES.md`，不要等到周末
- 此文件 check in 到 git，所有分支同步可见

---

## Plan 模式协议（所有层通用）

> 简单任务 = 单文件、逻辑清晰、改动 < 20 行、无跨层影响
> **其余一律先进 Plan 模式**

**流程：**
1. 进入 Plan 模式，列出所有受影响文件和改动步骤
2. 与用户反复讨论，直到方案令双方满意
3. 确认后切换自动接受编辑模式，一次性执行完成
4. 执行后运行验证命令，结果反馈给用户

---

## Tauri 技术约束（高频错误防护）

- 新增 Tauri command 后必须在 `lib.rs` 的 `invoke_handler![]` 中注册，并在 `capabilities/default.json` 添加对应权限
- 多窗口事件通信用 `emitTo(windowLabel, event)`，不用 `emit`（emit 只在当前窗口广播）
- 窗口标签必须与 tauri.conf.json 定义一致：`main` / `todo-manager` / `settings` / `focus` / `speech-bubble`
- `useEffect` 监听必须成对注册/解绑，防止内存泄漏
- 失焦检测用 `getCurrentWindow().onFocusChanged()`，不用 `window.blur`（WebView2 中不可靠）
- Rust command 错误必须返回 `Result<T, String>`，不能 `unwrap()` / `panic!()`

---

## Tauri 事件命名规范

命名格式：`<domain>:<action>`

**已登记事件表（新增事件必须在此登记，避免命名冲突）：**

| 事件名 | 方向 | 用途 |
|---|---|---|
| `settings-changed` | SettingsPage → main | 设置保存后通知 |
| `all-todos-complete` | TodoPage → main | 所有待办完成 |
| `cc-event` | bridge_server → main | Claude Code Hooks |
| `speech:show` | main → speech-bubble | 显示气泡 |
| `speech:append` | main → speech-bubble | 流式追加文字 |
| `speech:done` | main → speech-bubble | 启动关闭计时 |
| `focus-start` | main → focus | 专注开始 |
| `focus-pause` | main → focus | 专注暂停 |
| `focus-reset` | main → focus | 专注重置 |
| `focus-phase-change` | main ↔ focus | 阶段切换 |

---

## 验证标准

```bash
npx tsc --noEmit    # TS 变更后必须通过
cargo check         # Rust 变更后必须通过
```

UI 效果（动画/透明/位置）需用户肉眼确认，Claude 不自主声明通过。

---

## 动画规范

- 状态改变 → 驱动动画播放
- 禁止动画完成度驱动状态改变

---

## 开发规范

- 修改前必须先 Read 文件，不读不改
- 不新增文件，优先编辑已有文件
- 提交前用 `git diff` 确认改动范围
- 只修改本层文件所有权范围内的文件，跨层需求通过 INTERFACE.md 提交给对应层
