# AI 感知层 — 接口契约

> 此文件由 AI 感知工程师维护，每次新增或修改导出函数后更新。
> 集成层（App.tsx）凭此文件调用，签名冻结的函数标注 🔒。

---

## 当前已发布接口

### chatStream 🔒（签名冻结，不得修改）
- 状态：active
- 签名：`chatStream(userText: string, onChunk: (delta: string) => void): Promise<void>`
- 用途：流式 AI 对话入口，每收到一段回复触发 onChunk
- 调用方：App.tsx（handleSend）
- 内部行为：注入记忆 + 历史 + 日摘要；对话结束后异步触发记忆提取

### proactiveChat 🔒（签名冻结，不得修改）
- 状态：active
- 签名：`proactiveChat(screenDesc: string, onChunk: (delta: string) => void): Promise<boolean>`
- 返回：`true`=已发言，`false`=不发言
- 用途：根据屏幕描述决定是否主动说话
- 调用方：screenMonitor.ts（内部调用）→ App.tsx（通过 callbacks.onSpeak）

### analyzeScreen
- 状态：active
- 签名：`analyzeScreen(base64: string): Promise<string>`
- 返回：≤15字的屏幕描述，失败返回空字符串
- 用途：调用 Gemini/GLM 视觉模型分析屏幕截图
- 调用方：screenMonitor.ts

### getEmbedding
- 状态：active
- 签名：`getEmbedding(text: string): Promise<number[] | null>`
- 返回：L2 归一化的向量，无 key 时返回 null
- 用途：生成文本的语义向量，供记忆检索使用
- 调用方：ai.ts（内部）/ screenMonitor.ts

### resetClient
- 状态：active
- 签名：`resetClient(): void`
- 用途：清除 DeepSeek 客户端缓存，设置变更后调用
- 调用方：App.tsx（settings-changed 事件处理）

### startScreenMonitor 🔒（签名冻结，callbacks 结构不得修改）
- 状态：active
- 签名：
```typescript
startScreenMonitor(callbacks: {
  getDisturbMode: () => 0 | 1 | 2;
  isUserTyping: () => boolean;
  onSpeak: (text: string) => void;
  onChunk: (delta: string) => void;
  onDone: () => void;
}): () => void
```
- 返回：stop 函数
- 用途：启动屏幕监控定时器（每30s），返回 cleanup 函数
- 调用方：App.tsx（初始化时调用）

### stopScreenMonitor
- 状态：active
- 签名：`stopScreenMonitor(): void`
- 用途：停止屏幕监控
- 调用方：App.tsx（cleanup）

---

## 当前 Prompt 版本快照

> 记录每个 Prompt 的核心规则，方便追踪变更

| Prompt | 版本 | 最后修改 |
|---|---|---|
| BASE_SYSTEM_PROMPT（云宝人设） | v2 — 完整角色卡 | 2026-03-18 |
| extractMemoriesAsync（实时记忆提取） | v2 — confidence+correction_of+subject_role加固 | 2026-03-18 |
| compressHistoryAsync（历史压缩） | v2 — 与实时提取同步 | 2026-03-18 |
| ensureYesterdaySummaryAsync（日摘要） | v1 | 2026-03-16 |
| proactiveChat（主动发言） | v1 | 2026-03-17 |
| analyzeScreen（视觉分析） | v1 — ≤15字描述 | 2026-03-17 |

---

## 待集成层处理的变更

<!-- 在此追加新接口，集成层确认后移入上方「当前已发布接口」 -->
