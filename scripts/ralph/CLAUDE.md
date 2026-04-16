# Ralph Agent 指令

你是一个在软件项目上工作的自主编码 agent。

以下文件都在 `scripts/ralph` 下：`scripts/ralph/prd.json`、`scripts/ralph/progress.txt`

## 你的任务

1. 读取 `scripts/ralph/prd.json` 中的 PRD
2. 读取 `scripts/ralph/progress.txt` 中的进度日志（首先检查 Codebase Patterns 部分；如果文件不存在则先按空文件处理）
3. 检查你是否在 PRD 中 `branchName` 指定的正确 branch 上。如果不是，checkout 或从 main 创建它。
4. 选择满足以下所有条件的**最高 priority** 的 user story：
   - `passes: false`
   - `blocked: false`（或 blocked 字段不存在）
   
   如果该 story 的 `notes` 字段不为空，说明 Validator 上次验证发现了问题，
   请优先阅读 notes 中的失败原因，针对性地进行修复，而不是重新实现。
5. 实现该单个 user story,只实现这一个user story的内容
6. 运行质量检查（例如，typecheck、lint、test - 使用项目所需的任何工具）
7. 如果检查通过，只提交当前 story 直接相关的更改，消息为：`feat: [Story ID] - [Story Title]`
8. 更新 `scripts/ralph/prd.json`，将已完成的 story 的 `passes` 设置为 `true`
9. 每次完成运行后，将你的进度追加到 `scripts/ralph/progress.txt`

## 进度报告格式

追加到 `scripts/ralph/progress.txt`（永远不要替换，始终追加）：
```
## [日期-时间,格式yyyy-mm-dd HH:mm] - [Story ID]
- 实现了什么
- 更改的文件
- **未来迭代的学习：**
  - 发现的 patterns（例如，"这个 codebase 使用 X 来做 Y"）
  - 遇到的陷阱（例如，"更改 W 时不要忘记更新 Z"）
  - 有用的上下文（例如，"评估面板在 component X 中"）
---
```

学习部分至关重要 - 它帮助未来的迭代避免重复错误并更好地理解 codebase。

## 整合 Patterns

如果你发现未来迭代应该知道的**可重用 pattern**，将其添加到 `scripts/ralph/progress.txt` 顶部的 `## Codebase Patterns` 部分（如果不存在则创建）。此部分应整合最重要的学习：

```
## Codebase Patterns
- 示例：使用 `sql<number>` template 进行聚合
- 示例：migrations 始终使用 `IF NOT EXISTS`
- 示例：从 actions.ts 导出 types 供 UI components 使用
```

只添加**通用且可重用**的 patterns，不要添加 story 特定的细节。

## 质量要求

- 所有 commits 必须通过项目的质量检查（typecheck、lint、test）
- 不要提交损坏的代码
- 保持更改专注且最小化
- 遵循现有的代码 patterns
- 仓库可能已经存在与当前 story 无关的已修改或未跟踪文件；不要回滚它们，也不要把它们混入当前 story 的提交
- 开始前先看 `git status`，提交前再次确认本次提交只包含当前 story 相关文件

## 浏览器测试（如果可用）

对于任何更改 UI 的 story，如果你配置了浏览器测试工具（例如，通过 agent-browser-skill），请在浏览器中验证它是否正常工作。

重要约束：

- 优先复用**已经在运行且可访问**的本地服务；只有在确实无法访问时，才允许自行启动 dev server。
- 如果需要启动 dev server，必须先检查目标端口是否已经可访问；可访问就直接复用，不要重复启动。
- 启动 dev server 时必须使用**后台方式**，避免阻塞当前 agent。应根据当前系统选择命令：
  - macOS/Linux 例如：`nohup npm run dev > /tmp/ralph-dev.log 2>&1 &`
  - Windows PowerShell 优先使用：`powershell -ExecutionPolicy Bypass -File .\scripts\ralph\start-ralph.ps1`
  - 如果这里只是后台启动 dev server，而不是启动 Ralph 主循环，可用：`Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev' -RedirectStandardOutput 'scripts/ralph/ralph-dev.log' -RedirectStandardError 'scripts/ralph/ralph-dev.err.log'`
- 启动后要先轮询确认服务可访问，再进行 agent-browser 验证。
- 除非明确需要清理冲突进程，否则不要随意 `kill -9` 现有服务；不要每次迭代都重启 dev server。

如果没有浏览器工具可用，请在进度报告中注明需要手动浏览器验证。

## 停止条件

完成 user story 后，检查 `scripts/ralph/prd.json` 中所有 stories 的状态。

如果所有的 story 都满足以下任一条件，在你的回复**最后一行**单独输出停止标记（不得有任何前缀或解释文字）：
- `passes: true`（已完成并通过验证）
- `blocked: true`（已超过最大重试次数，被跳过）

停止标记格式（仅在所有 story 真正完成时才输出，且必须是独立的一行）：
<promise>COMPLETE</promise>

⚠️ 重要：**禁止**在任何解释、说明或否定语句中提及或引用停止标记的文字。如果你想表达"任务未完成"，直接结束响应即可，不要写任何与停止标记相关的字样。

如果仍有 `passes: false` 且 `blocked: false` 的 story，正常结束响应，不输出任何标记。

## 重要提示

- 每次迭代只处理一个 story, 记住 只处理一个user story,处理完这个story,你的任务就结束了
- 频繁提交
- 保持 CI 绿色
- 在开始之前阅读 `scripts/ralph/progress.txt` 中的 Codebase Patterns 部分

## 关于该项目的重要注意事项

项目跟路径下读取AGENTS.md, 这是整个项目的技术架构开发指导说明, 也就是harness.
如果需要理解项目分层、工程结构或协作规范，优先阅读仓库根目录的 `AGENTS.md`、`CLAUDE.md`、`DEVELOPMENT_GUIDE.md` 以及 `docs/` 下相关文档。
