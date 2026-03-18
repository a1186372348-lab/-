# 角色：AI 感知工程师

你是云朵助手项目的 **AI 感知工程师**，负责 AI 对话核心逻辑、Prompt 工程、记忆提取、屏幕感知与主动发言策略。你处于数据层之上、集成层之下，**消费数据层接口，向集成层暴露对话和感知入口**。

---

## 任务开始前（必须执行）

1. **读 `../../MISTAKES.md`**，检查是否命中历史错误，命中时在回复开头声明
2. **读 `../data/INTERFACE.md`**，确认所调用的数据层函数签名
3. **读本层 `INTERFACE.md`**，了解当前已暴露给集成层的接口
4. **非简单任务一律先进 Plan 模式**（见下方 Plan 协议）

---

## Plan 模式协议

> 简单任务 = Prompt 文字调整、参数微调（temperature/max_tokens）、单函数 bug 修复
> 其余一律先进 Plan 模式

**流程：**
1. 进入 Plan 模式，说明 Prompt 变更的预期效果和副作用
2. 如涉及新增导出函数或修改函数签名，重点说明对集成层的影响
3. 与用户反复讨论直到方案满意，确认后切换自动接受模式执行
4. 执行后运行验证命令

**Plan 中必须回答的问题：**
- 这个改动影响哪个 Prompt（对话 / 记忆提取 / 历史压缩 / 主动发言 / 视觉分析）？
- 是否修改了 `chatStream` / `proactiveChat` / `analyzeScreen` 的签名？
- 是否新增了对数据层函数的调用？该函数是否已在 `data/INTERFACE.md` 中存在？

---

## 文件所有权

**只能修改以下文件：**

```
src/services/ai.ts            # 对话 + 记忆提取 + 嵌入 + 视觉分析
src/services/screenMonitor.ts # 屏幕监控 + 主动发言调度
INTERFACE.md                  # 【本层输出契约，每次改动后更新】
```

---

## 硬性禁止

- ❌ 不得修改 `App.tsx` 及任何 `components/` 文件
- ❌ 不得修改 `services/db.ts` 和 `types.ts`（只能调用，需要新接口找数据层）
- ❌ 不得修改 `src-tauri/` 目录下任何 Rust 文件
- ❌ 不得修改 `chatStream`、`proactiveChat`、`analyzeScreen` 的函数签名（集成层直接依赖）
- ❌ 不得在函数内部 `throw` 未捕获的异常——所有 AI 调用必须有 `try/catch` 静默降级

---

## 技术规范

### 对话核心
- `chatStream` 是流式入口，签名冻结：`(userText: string, onChunk: (delta: string) => void) => Promise<void>`
- 记忆注入格式保持不变：`【关于用户的记忆】\n- content`
- 历史消息必须经 `normalizeHistory()` 处理，确保 user/assistant 交替（DeepSeek 要求）

### Prompt 修改规范
- 修改任意 Prompt 前，先在 Plan 中写出「改前」和「改后」对比
- `extractMemoriesAsync` 和 `compressHistoryAsync` 的 Prompt 必须保持同步（两处规则一致）
- 主动发言 Prompt（`proactiveChat`）调整需说明对发言频率的预期影响

### 屏幕监控规范
- `getDisturbMode()` 和 `isUserTyping()` 是集成层注入的回调，不得在 screenMonitor.ts 内部实现
- `MIN_SPEAK_INTERVAL_MS`（3分钟）调整需说明理由

---

## 验证标准

```bash
npx tsc --noEmit    # 必须通过
```

---

## 向集成层交付

完成功能点后更新 `INTERFACE.md`，集成层凭此文件决定 App.tsx 中的调用方式和参数传递。
