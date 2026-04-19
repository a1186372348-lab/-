# 新增 finalizer 执行方案

## 1. 背景

本次结构清理暴露出的核心问题，不是主体工作没做完，而是“最后收口”没有形成独立、稳定、可重复的检查机制。

当前 Ralph 流程大致是：

- developer agent 开发当前 story
- validator 验证当前 story
- 所有 story 通过后，直接视为完成

这会导致以下问题：

- `prd.json` 已标记通过，但入口文档状态未同步
- 文档迁移已做，但旧路径未彻底清理
- 工作区混入缓存文件、无关改动、后续脚本演进
- “story 验证通过”被误认为“整个 initiative 已闭环”

因此需要新增一个独立阶段：`finalizer`。

---

## 2. 本次新增目标

新增一个只读、只查、不修复的 `finalizer`，作为 initiative 级别的最终收口检查器。

它的目标不是替代 developer 或 validator，而是补齐“最后一公里”：

- 检查整个 initiative 是否真的达到可交付状态
- 如果没有达到，只输出 note / 问题清单
- 由下一次迭代的 developer agent 按 note 修复
- 修复后重新进入 finalizer
- 反复循环直到最终通过

---

## 3. finalizer 的核心原则

### 3.1 只读

finalizer 只读取仓库状态，不主动修改任何业务文件。

### 3.2 只检查

finalizer 只负责发现问题，不负责修问题。

### 3.3 不回滚 story 状态

story 通过就是通过。
finalizer 失败，不代表 story 失败。

### 3.4 输出 note，交给下一轮修复

finalizer 失败后，只记录：

- 哪些地方没收口
- 证据是什么
- 下一轮应该修什么

由 developer agent 下一轮解决。

### 3.5 只有 finalizer 通过，initiative 才算真正完成

所有 story 通过，不等于最终完成。
只有 finalizer 通过，才允许输出最终完成标记。

---

## 4. finalizer 的职责边界

### 4.1 finalizer 负责什么

finalizer 只负责以下 5 类检查：

1. 检查所有 story 是否已经结束
   - `passes: true`
   - 或 `blocked: true`

2. 检查入口文档状态是否同步
   - `docs/PROJECT_STATUS.md`
   - `docs/specs/ROADMAP.md`
   - 其他明确作为状态入口的文档

3. 检查文档迁移是否还有残留
   - 新路径是否存在
   - 旧路径是否仍被引用
   - 是否存在新旧双份真相

4. 检查工作区卫生
   - 是否存在缓存文件
   - 是否存在会污染交付结论的本地文件
   - 是否存在明显无关改动

5. 检查最终 diff 范围是否超出本轮任务
   - 例如本轮只应包含文档/流程改动
   - 不应混入无关的主业务源码大改

### 4.2 finalizer 不负责什么

finalizer 明确不做以下事情：

- 不实现 story
- 不修复代码
- 不修正文档正文
- 不自动删除文件
- 不修改 `passes`
- 不修改 `retryCount`
- 不修改 `blocked`
- 不决定 story 顺序
- 不替代 validator
- 不自动重试开发逻辑

一句话：

- finalizer 负责“能不能交卷”
- 不负责“替你改卷子”

---

## 5. 新流程设计

新增 finalizer 后，整体流程调整为：

1. developer agent 开发当前 story
2. validator 验证当前 story
3. 所有 story 结束后，进入 finalizer
4. finalizer 只读检查 initiative 是否达到最终交付态
5. 若失败，只写 note
6. 下一轮 developer agent 优先修复这些 note
7. 修复后重新运行 finalizer
8. 直到 finalizer 通过，才允许最终完成

### 5.1 流程图

```text
开始
  ↓
开发当前 story
  ↓
验证当前 story
  ↓
当前 story 是否通过？
  ├─ 否 → 继续修当前 story
  └─ 是 → 下一个 story
              ↓
     所有 story 是否都结束？
         ├─ 否 → 继续循环
         └─ 是 → 进入 finalizer
                      ↓
             finalizer 只读检查
                      ↓
              finalizer 是否通过？
                ├─ 否 → 输出 note
                │       ↓
                │   下一轮 developer agent 修复
                │       ↓
                │   再次进入 finalizer
                └─ 是 → 输出 COMPLETE
```

---

## 6. 状态设计

为了避免“story 全通过”和“initiative 真完成”混淆，需要把状态拆成两层。

### 6.1 story 级状态

- `developing`
- `validating`
- `story_passed`
- `story_failed`
- `story_blocked`

### 6.2 initiative 级状态

- `in_progress`
- `stories_complete`
- `finalizing`
- `finalize_failed`
- `finalized`

### 6.3 状态含义

- `stories_complete`
  - 所有 story 都结束了
  - 但还没做最终收口检查

- `finalizing`
  - 正在执行 finalizer

- `finalize_failed`
  - finalizer 检查发现 initiative 还不能交付
  - 会输出 note，等待下一轮修复

- `finalized`
  - 收口检查全部通过
  - 可以宣布真正完成

---

## 7. finalizer 的输出格式

建议 finalizer 不写复杂状态，只追加一段结构化记录，供 developer agent 下一轮使用。

推荐格式：

```text
### Finalization [YYYY-MM-DD HH:mm] - [PASS/FAIL]
- Summary: ...
- Checks:
  - Stories complete: PASS/FAIL
  - Status sync: PASS/FAIL
  - Migration residue: PASS/FAIL
  - Worktree hygiene: PASS/FAIL
  - Scope check: PASS/FAIL
- Blocking issues:
  - ...
- Next iteration should fix:
  - ...
---
```

### 7.1 输出要求

- 必须指出失败项
- 必须给出可执行的下一轮修复建议
- 必须阻止最终完成
- 不允许模糊描述，例如“还有一些问题”
- 必须写清楚具体文件或具体类型的问题

---

## 8. finalizer 第一版检查规则

为了便于初级程序员实现，第一版只覆盖已经暴露出的典型问题，不做复杂抽象。

### 8.1 状态同步检查

检查规则示例：

- 如果 `US-018` 已通过，则 `docs/PROJECT_STATUS.md` 中不能再出现“验收中”
- 如果 initiative 已完成，则 `docs/specs/ROADMAP.md` 中不应再把当前收口项写成 `planned`
- 如果阶段已完成，则“下一步最小动作”不应仍写“完成本次验收”

### 8.2 迁移残留检查

先维护一份固定迁移表，例如：

- `docs/PROJECT_OVERVIEW.md -> docs/architecture/PROJECT_OVERVIEW.md`
- `docs/SESSION_LOG.md -> docs/logs/SESSION_LOG.md`

逐条检查：

- 新路径是否存在
- 旧路径是否还被引用
- 旧路径是否仍在不该保留的跟踪状态中

### 8.3 工作区卫生检查

至少检查：

- `__pycache__/`
- `*.pyc`
- 本地临时日志
- 明显无关的本地设置改动
- 会污染本轮结论的无关脚本改动

### 8.4 交付范围检查

例如本轮是“结构清理与文档闭环”，则 finalizer 需要检查：

- 是否混入主业务源码无关改动
- 是否混入不在本轮任务内的大范围工具演进

---

## 9. finalizer 失败后的处理规则

### 9.1 不回滚 story

finalizer 失败时：

- 不把 `passes` 改回 `false`
- 不清空已通过记录
- 不重写 validator 结果

原因：

- story 已通过是 story 级真相
- finalizer 失败只是 initiative 级未完成

### 9.2 只生成 note

失败后只做一件事：

- 追加 finalization note

### 9.3 下一轮优先修收口问题

developer agent 下一轮执行优先级：

1. 如果存在未解决 finalizer note，先修 finalizer note
2. 不继续扩 scope
3. 不新增无关功能
4. 修完后重新跑 finalizer

### 9.4 直到通过前都不允许 COMPLETE

只有在 finalizer 返回 PASS 后，才允许输出最终完成标记。

---

## 10. 与现有角色的关系

### 10.1 developer agent

负责：

- 实现 story
- 修复 validator note
- 修复 finalizer note

### 10.2 validator

负责：

- 验证当前 story 的 acceptance criteria 是否成立

不负责：

- initiative 是否真正完成

### 10.3 finalizer

负责：

- 验证整个 initiative 是否达到最终交付态

不负责：

- 修问题
- 改代码
- 改 story 状态

---

## 11. 后续实施建议

### 11.1 推荐改动文件

必改：

- `scripts/ralph/ralph.py`
- `scripts/ralph/CLAUDE.md`
- `scripts/ralph/VALIDATOR.md`
- `scripts/ralph/progress.txt`
- `scripts/ralph/start-ralph.ps1`

推荐补充：

- `.gitignore`
- `DEVELOPMENT_GUIDE.md`

可选新增：

- `scripts/ralph/FINALIZER.md`

### 11.2 预计文件量

- 最小集：5 个文件
- 推荐集：7 个文件
- 若新增独立 finalizer 指令文件：8 个文件

### 11.3 工程规模

- 规模：中等偏小
- 复杂度：中等
- 风险：可控

原因：

- 不动主业务代码
- 主要改自动化流程和指令文件
- 难点在状态边界和失败处理，不在业务逻辑

---

## 12. 实施原则

本次新增 finalizer 必须遵守以下原则：

1. 先追求低侵入，不追求万能
2. 先只读，不自动修
3. 先挡住已暴露问题，不做过度抽象
4. 先保证状态不乱，再考虑体验优化
5. 把收口失败交给下一轮 developer agent，而不是让 finalizer 自己变成万能补丁器

---

## 13. 成功标准

新增 finalizer 后，系统应能满足以下结果：

- story 全部通过后，不会直接误判为完成
- 入口文档状态不一致时，能被拦下
- 文档迁移残留时，能被拦下
- 工作区有缓存产物或无关改动时，能被拦下
- finalizer 失败后，会留下明确 note
- 下一轮 developer agent 能按 note 修复
- 多轮循环后，直到 finalizer PASS，才允许真正完成

---

## 14. 结论

本方案不是新增一个“万能 agent”，而是新增一个“只读收口守门员”。

它的价值在于：

- 补足现有流程缺失的最后一公里
- 避免“story 通过 ≠ initiative 完成”的混淆
- 用最小侵入方式提高交付一致性
- 把修复责任继续交给 developer agent
- 让整个流程可以稳定循环，直到真正完成

---
---

# 第二部分：闭环审查与优化方案

> 以下内容基于 Claude 对现有 developer / validator 完整闭环机制的逐项对照审查。
> 目标：补齐方案中缺失的"怎么跑起来"层面的设计，使 finalizer 与现有角色达到同等闭环细度。

---

## 15. 闭环差距分析

对照 developer 和 validator 的完整闭环，原方案缺失 6 项关键机制：

| 闭环要素 | Developer | Validator | 原方案 Finalizer |
|----------|-----------|-----------|-----------------|
| 指令文件 | `CLAUDE.md` — 详细定义工作步骤、输出格式、停止条件 | `VALIDATOR.md` — 定义验证步骤、写入规则 | 第 11.1 节写"可选新增 FINALIZER.md"，**无内容定义** |
| ralph.py 运行函数 | `run_developer()` + DEV_* 常量 | `run_validator()` + VAL_* 常量 | **完全缺失** |
| 完成性校验函数 | `validate_developer_completion()` | `validate_validator_completion()` | **完全缺失** |
| Prompt 注入 | ralph.py 读 CLAUDE.md → 拼 action_directive | 读 VALIDATOR.md → 拼 action_directive + story_hint | **缺失** |
| 失败后重入机制 | validator notes → developer 下轮读取修复 | 自身 INCOMPLETE → ralph.py 自动重跑 | 描述"交给 developer"但**未定义感知路径** |
| Dashboard 集成 | `phase="developing"` | `phase="validating"` | **缺失** |

**结论：** 方案完成了"为什么做"和"检查什么"的设计，"怎么跑"基本是空白。

---

## 16. 状态模型优化：砍到最小

### 16.1 问题

原方案第 6 节引入 story 级 5 种状态 + initiative 级 5 种状态，共 10 种新状态枚举。

当前 prd.json 的 story 状态只有 `passes` + `blocked` 两个布尔值，ralph.py 用函数返回值常量而非持久化状态。引入 10 种新状态等于重写核心状态机和数据结构。

### 16.2 优化方案

不引入新状态枚举。在 prd.json 根级加 4 个字段即可：

```json
{
  "statusDocPaths": ["docs/PROJECT_STATUS.md", "docs/specs/ROADMAP.md"],
  "finalizerStatus": "",
  "finalizerNotes": "",
  "finalizerRetryCount": 0
}
```

| 字段 | 类型 | 初始值 | 说明 |
|------|------|--------|------|
| `statusDocPaths` | `string[]` | 用户预设 | 需要状态同步检查的入口文档列表（可配置，不硬编码） |
| `finalizerStatus` | `string` | `""` | 空 / `"passed"` / `"failed"` |
| `finalizerNotes` | `string` | `""` | 失败详情 |
| `finalizerRetryCount` | `int` | `0` | 失败重试次数 |

各角色写权限矩阵：

| 字段 | Developer | Validator | Finalizer |
|------|-----------|-----------|-----------|
| story.passes | W | W | - |
| story.notes | W | W | - |
| story.retryCount | - | W | - |
| story.blocked | - | W | - |
| finalizerStatus | - | - | W |
| finalizerNotes | W(清空) | - | W |
| finalizerRetryCount | - | - | W |
| statusDocPaths | - | - | - |

Developer 对 `finalizerNotes` 有清空权（与 story.notes 清空逻辑一致，参照 CLAUDE.md 第 8 步）。

---

## 17. FINALIZER.md 指令文件完整设计

参照 VALIDATOR.md 的风格（角色定位 → 信息来源 → 工作步骤 → 写入规则 → 追加记录 → 约束），完整结构如下：

```markdown
# Finalizer Agent 指令

你是一个专职负责 initiative 级别收口检查的 QA Agent。你的唯一职责是：
在所有 user story 通过验收后，对整个 initiative 做一次全局交付质量检查。

## 你能看到的信息

1. `scripts/ralph/prd.json` — PRD + 所有 story 状态 + statusDocPaths
2. `scripts/ralph/progress.txt` — 全部开发和验证日志
3. 项目根目录下的全部文件（只读检查，不修改）

## 你的工作步骤

### 检查一：入口文档状态同步
1. 读 prd.json 的 statusDocPaths 数组（如 docs/PROJECT_STATUS.md、docs/specs/ROADMAP.md）
2. 对每个入口文档：
   - 检查是否有"验收中"/"进行中"/"planned"描述指向已完成的 story
   - 检查"下一步"/"next action"是否仍指向已完成 story
   - 检查进度条/阶段状态是否与 prd.json 完成情况一致
3. 不一致 → FAIL，记录具体文件、行号、当前内容、期望内容

### 检查二：文档迁移残留
1. 从 progress.txt 搜索"移动"/"迁移"/"→"记录，提取 [旧路径, 新路径] 对
2. 对每个旧路径：运行 `git ls-files <旧路径>`，检查是否仍在 git index 中
3. 对每个新路径：检查文件是否实际存在
4. 旧路径仍在 index（双源真相）→ FAIL
5. 新路径不存在（迁移丢失）→ FAIL

### 检查三：.gitignore 覆盖
1. 检查 __pycache__/、*.pyc 等模式是否在 .gitignore 中
2. 运行 `git ls-files --others --exclude-standard` 检查未忽略的缓存产物
3. 应忽略但被 track 或残留 → FAIL

### 检查四：交付范围纯净度
1. 从 prd.json 读取 branchName
2. 运行 `git diff main...<branchName> --stat` 获取变更列表
3. 变更中出现无法归属到任何 story 且不属于 prd 管理文件的源码变更 → FAIL

### 检查五：Typecheck
1. 运行 `npx tsc --noEmit`
2. 非零退出码 → FAIL

## 验证结果写入规则

**全部 5 项检查都通过时：**
- finalizerStatus = "passed"
- finalizerNotes = ""

**任何一项检查未通过时：**
- finalizerStatus = "failed"
- finalizerNotes 写入失败详情，格式：
  [Finalizer 失败] YYYY-MM-DD HH:mm
  - [检查一] docs/PROJECT_STATUS.md 第 32 行：当前写"US-018 验收中"，应为"已完成"
  - [检查二] git rm docs/PROJECT_OVERVIEW.md（旧路径仍在 index 中）
  - [检查三] .gitignore 缺少 __pycache__/ 和 *.pyc
  - 建议修复：逐条执行以上操作
- finalizerRetryCount += 1

**notes 格式要求：必须具体到可直接执行，写明 git rm <path>、.gitignore 加什么行、
哪个文件哪一行改什么。禁止模糊描述如"还有一些问题"。**

## 追加记录到 progress.txt

无论通过还是失败，都追加（四级标题，与 developer 二级、validator 三级区分）：

#### Finalizer YYYY-MM-DD HH:mm - PASS/FAIL
- 检查一（入口文档状态同步）：PASS/FAIL - 详情
- 检查二（文档迁移残留）：PASS/FAIL - 详情
- 检查三（.gitignore 覆盖）：PASS/FAIL - 详情
- 检查四（交付范围纯净度）：PASS/FAIL - 详情
- 检查五（Typecheck）：PASS/FAIL
---

## 重要约束

- 只读，不修改任何业务文件（.ts/.tsx/.rs/.md 等）
- 只能写入 prd.json 的 finalizer* 字段和 progress.txt 的追加记录
- 不修改任何 story 级字段（passes/notes/retryCount/blocked）
- 检查完成后正常结束，不输出任何特殊标记
```

---

## 18. ralph.py 具体改动设计

### 18.1 新增常量（对标 DEV_*/VAL_* 第 30-42 行）

```python
FINAL_PASSED = "final_passed"
FINAL_FAILED_RECORDED = "final_failed_recorded"
FINAL_INCOMPLETE = "final_incomplete"
FINAL_TIMED_OUT = "final_timed_out"
FINAL_FATAL = "final_fatal"

FINALIZER_INSTRUCTION_FILE = SCRIPT_DIR / "FINALIZER.md"
FINALIZER_HEADER_PREFIX = "#### Finalizer "
```

### 18.2 新增 extract_latest_finalizer_record()

对标 `extract_latest_validation_record()`（第 216-234 行）：

```python
def extract_latest_finalizer_record(progress_text: str | None) -> str | None:
    """Extract the latest finalizer outcome (PASS/FAIL) from progress.txt."""
    if not progress_text:
        return None
    latest_result: str | None = None
    for raw_line in progress_text.splitlines():
        line = raw_line.strip()
        if not line.startswith(FINALIZER_HEADER_PREFIX):
            continue
        parts = line.split(" - ")
        if len(parts) < 2:
            continue
        latest_result = parts[-1].strip() or None
    return latest_result
```

### 18.3 新增 validate_finalizer_completion()

对标 `validate_validator_completion()`（第 254-329 行）：

```python
def validate_finalizer_completion(
    progress_before: tuple[bool, int | None, int | None],
    prd_before: dict | None,
) -> tuple[str, list[str]]:
    reasons: list[str] = []

    # 1. progress.txt 必须有新增
    progress_path = SCRIPT_DIR / "progress.txt"
    progress_after_state = capture_file_state(progress_path)
    if not progress_after_state[0]:
        return (FINAL_INCOMPLETE, ["终验阶段找不到 progress.txt"])
    if progress_after_state == progress_before:
        return (FINAL_INCOMPLETE, ["Finalizer 没有追加终验记录"])

    # 2. 提取最后一条 #### Finalizer 记录
    progress_text = read_utf8_text(progress_path)
    finalizer_result = extract_latest_finalizer_record(progress_text)
    if finalizer_result is None:
        return (FINAL_INCOMPLETE, ["无法提取 Finalizer 记录"])

    # 3. 检查 prd.json finalizerStatus
    prd_after = load_prd_state()
    if prd_after is None:
        return (FINAL_FATAL, ["无法读取 prd.json"])
    finalizer_status = prd_after.get("finalizerStatus", "")
    if not finalizer_status:
        return (FINAL_INCOMPLETE, ["未设置 finalizerStatus"])

    # 4. 一致性校验
    normalized = finalizer_result.upper()
    if finalizer_status == "passed" and not normalized.startswith("PASS"):
        return (FINAL_INCOMPLETE, ["finalizerStatus=passed 但记录非 PASS"])
    if finalizer_status == "failed" and not normalized.startswith("FAIL"):
        return (FINAL_INCOMPLETE, ["finalizerStatus=failed 但记录非 FAIL"])

    if finalizer_status == "passed":
        return (FINAL_PASSED, reasons)
    return (FINAL_FAILED_RECORDED, reasons)
```

### 18.4 新增 run_finalizer()

对标 `run_validator()`（第 512-626 行），结构完全一致：

- 读 FINALIZER.md → 拼 action_directive → 启子进程 → 返回 FINAL_* 状态
- action_directive: `"[Finalization task] All user stories have passed. Perform initiative-level final checks..."`
- 超时 = TIMEOUT_SECONDS * 2（与 validator 一致）
- 完成性校验调用 `validate_finalizer_completion()`

### 18.5 修改 validate_developer_completion()（第 173-193 行）

新增分支：所有 story 已 passes:true 时，finalizerNotes 从非空变为空也算有效进展。

```python
# 在现有 "prd.json 无 story 状态变化" 判断之后追加：
before_fn = (prd_before or {}).get("finalizerNotes", "")
after_fn = (prd_after or {}).get("finalizerNotes", "")
if before_fn and not after_fn:
    pass  # finalizerNotes 被清空 → 有效进展
else:
    reasons.append("没有任何 story 状态变化")
```

### 18.6 修改 main() 退出逻辑

**核心改动**：`all_stories_resolved()` 之后不直接 `exit(0)`，而是：

```python
if all_stories_resolved():
    prd_check = load_prd_state()
    finalizer_status = (prd_check or {}).get("finalizerStatus", "")

    # 已通过 → 退出
    if finalizer_status == "passed":
        dashboard.set_state(phase="done", current_story=None)
        safe_print("所有任务已完成，终验通过!")
        sys.exit(0)

    # 未通过或未运行 → 执行 finalizer
    dashboard.set_state(phase="finalizing", current_story=None)
    finalizer_result = run_finalizer(i)

    if finalizer_result == FINAL_PASSED:
        sys.exit(0)
    elif finalizer_result == FINAL_FAILED_RECORDED:
        # 终验失败 → 下一轮 developer 修复 finalizerNotes
        next_action = NEXT_ACTION_DEVELOP
        continue
    elif finalizer_result in (FINAL_TIMED_OUT, FINAL_INCOMPLETE):
        # 重试 finalizer
        continue
    else:
        # FINAL_FATAL
        sys.exit(1)
```

循环开头 `get_current_story_id() == None` 时也需同样逻辑（第 682 行）。

### 18.7 Finalizer 失败后的完整回路

```
finalizer FAIL → finalizerNotes 写入具体问题
  → 主循环继续 → get_current_story_id() = None
  → 检测 finalizerStatus="failed" + finalizerNotes 非空
  → run_developer()（developer 读 finalizerNotes，修复问题，清空 notes）
  → validate_developer_completion()（finalizerNotes 清空 = 有效进展）
  → 回到循环顶部 → get_current_story_id() = None
  → finalizerStatus 仍为 "failed"（developer 不改 status）
  → run_finalizer()（重新检查）
  → FINAL_PASSED → exit(0)
```

---

## 19. CLAUDE.md 改动

### 19.1 新增 finalizerNotes 感知规则

在第 4 步（选择 story）之后新增：

```markdown
   如果所有 story 的 `passes` 都为 `true`，检查 prd.json 顶层的 `finalizerNotes` 字段。
   如果 `finalizerNotes` 不为空，说明 Finalizer 终验发现了 initiative 级别的问题。
   请优先阅读 finalizerNotes 中的失败原因，针对性地进行修复。
   修复完成后，必须将 `finalizerNotes` 清空为 `""`。
   不要修改 `finalizerStatus` 或 `finalizerRetryCount`。
```

### 19.2 修改 run_developer() 的 action_directive

```python
action_directive = (
    "[Task] Read scripts/ralph/prd.json and scripts/ralph/progress.txt "
    "(if present), then implement the next unfinished user story. "
    "If all stories are already done but finalizerNotes is not empty, "
    "fix the issues described in finalizerNotes instead. "
    "If all stories are done and finalizerNotes is empty, exit normally. "
    "Do not chat or ask follow-up questions.\n\n"
    "=== Base rules and project context ===\n"
)
```

---

## 20. Dashboard 集成

- `dashboard.py` 第 27 行注释改为：`# idle | developing | validating | finalizing | done | error`
- `dashboard.html` 和 `dashboard-p.html` 为 `finalizing` phase 新增显示文案和颜色

---

## 21. progress.txt 格式扩展

标题层级约定：

| 角色 | 前缀 | 层级 | ralph.py 提取常量 |
|------|------|------|-------------------|
| Developer | `## ` | 二级 | 按 `## ` 匹配 |
| Validator | `### Validation ` | 三级 | `VALIDATION_HEADER_PREFIX` |
| Finalizer | `#### Finalizer ` | 四级 | `FINALIZER_HEADER_PREFIX`（新增） |

---

## 22. 状态同步检查的通用化

### 22.1 问题

原方案第 8.1 节的规则是"如果 US-018 已通过，则 PROJECT_STATUS.md 中不能出现'验收中'"——只对当前 PRD 有效。

### 22.2 优化

通过 prd.json 的 `statusDocPaths` 字段让检查目标可配置。Finalizer 的通用规则变为：

- 所有 story 已通过时，statusDocPaths 列出的文档中不应出现 `验收中`、`进行中`、`planned`（当指向已完成 story 时）
- 不硬编码 story ID，按关键词匹配即可
- 下一个 PRD 只需在 prd.json 中设置不同的 statusDocPaths

---

## 23. 迁移残留检查的通用化

### 23.1 问题

原方案第 8.2 节建议维护硬编码迁移表，只对当前 PRD 有效。

### 23.2 优化

不维护静态表，从 progress.txt 动态提取迁移记录（搜索 "→"/"移动" 关键词），再用 git 命令验证。对任何 PRD 都通用。

---

## 24. 实施顺序

1. **创建 `scripts/ralph/FINALIZER.md`** — 纯新文件，无依赖
2. **扩展 `scripts/ralph/prd.json`** — 添加 4 个顶层字段
3. **ralph.py 添加常量和辅助函数** — FINAL_* / FINALIZER_HEADER_PREFIX / extract_latest_finalizer_record()
4. **实现 `validate_finalizer_completion()`** — 对标 validate_validator_completion()
5. **实现 `run_finalizer()`** — 对标 run_validator()
6. **修改 `main()` 退出逻辑** — 在 all_stories_resolved() 之后插入 finalizer 入口
7. **修改 `validate_developer_completion()`** — 支持 finalizerNotes 清空作为有效进展
8. **修改 `CLAUDE.md`** — 添加 finalizerNotes 感知指令和 action_directive
9. **更新 dashboard.html / dashboard-p.html** — 添加 finalizing phase 显示

---

## 25. 验证方案

### 单元验证
1. prd.json 加新字段后 ralph.py 能正常加载
2. FINALIZER.md 创建后 run_finalizer() 能读取拼接 prompt
3. progress.txt 追加 `#### Finalizer` 记录后 extract_latest_finalizer_record() 能正确提取

### 集成验证
1. 全部 story 通过的 prd.json → 确认进入 finalizer 而非直接退出
2. 设 finalizerStatus="failed" + finalizerNotes 非空 → 确认 developer 被触发修复
3. 清空 finalizerNotes → 确认 finalizer 被重新触发
4. finalizer 通过后确认正常 exit(0)

### Dashboard 验证
1. 确认页面显示 finalizing 状态
2. 确认 developing → validating → finalizing → done 流转正确
