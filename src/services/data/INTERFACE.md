# 数据基础层 — 接口契约

> 此文件由数据基础工程师维护，每次新增或修改导出函数后更新。
> 上层模块（ai.ts / screenMonitor / reminder / weather / SettingsPage）凭此文件调用，不得假设未在此记录的内部实现。

---

## 格式模板

```markdown
### functionName
- 状态：active / deprecated
- 签名：`functionName(param: Type): Promise<ReturnType>`
- 用途：说明
- 调用方：[ai.ts / screenMonitor / reminder / weather / SettingsPage / App.tsx]
- 变更日期：YYYY-MM-DD
```

---

## 当前已发布接口

### 设置相关

#### getSetting
- 状态：active
- 签名：`getSetting(key: string): Promise<string | null>`
- 用途：读取键值对设置
- 调用方：ai.ts / App.tsx / SettingsPage

#### setSetting
- 状态：active
- 签名：`setSetting(key: string, value: string): Promise<void>`
- 用途：写入键值对设置
- 调用方：SettingsPage

### 对话历史

#### saveChatMessage
- 状态：active
- 签名：`saveChatMessage(role: 'user' | 'assistant', content: string): Promise<void>`
- 用途：保存一条对话记录

#### getRecentChatHistory
- 状态：active
- 签名：`getRecentChatHistory(limit: number): Promise<Array<{role: string; content: string}>>`
- 用途：获取最近 N 条对话历史

#### getChatHistoryByDate
- 状态：active
- 签名：`getChatHistoryByDate(dateKey: string): Promise<Array<{role: string; content: string}>>`
- 用途：获取指定日期的对话记录

#### getMessagesForCompression
- 状态：active
- 签名：`getMessagesForCompression(keepRecent: number): Promise<Array<{role: string; content: string}>>`
- 用途：获取待压缩的旧消息（超出 keepRecent 条的历史）

### 长期记忆

#### upsertMemory
- 状态：active
- 签名：`upsertMemory(category: string, content: string, importance?: number, opts?: { factType?: string; subjectRole?: string; embedding?: number[]; embeddingModel?: string }): Promise<void>`
- 用途：写入或更新长期记忆（两阶段去重）
- 调用方：ai.ts / screenMonitor.ts

#### correctMemory
- 状态：active
- 签名：`correctMemory(oldKeyword: string, newContent: string, factType: string, subjectRole: string, importance: number): Promise<void>`
- 用途：对话驱动的记忆纠正，将旧记忆标记 superseded 并写入新记忆
- 调用方：ai.ts

#### getRelevantMemories
- 状态：active
- 签名：`getRelevantMemories(query: string, limit?: number, queryEmbedding?: number[]): Promise<Array<{id: number; category: string; content: string}>>`
- 用途：Hybrid 检索相关记忆（向量+关键词+importance+近期度）
- 调用方：ai.ts / screenMonitor.ts

#### cosineSim
- 状态：active
- 签名：`cosineSim(a: number[], b: number[]): number`
- 用途：余弦相似度计算（L2 归一化向量）
- 调用方：ai.ts（内部）

### 日摘要

#### hasDailySummary
- 状态：active
- 签名：`hasDailySummary(dateKey: string): Promise<boolean>`
- 用途：检查指定日期是否已有摘要
- 调用方：ai.ts

#### getDailySummaries
- 状态：active
- 签名：`getDailySummaries(limit: number): Promise<Array<{date_key: string; summary: string}>>`
- 用途：获取最近 N 天的日摘要
- 调用方：ai.ts

#### saveDailySummary
- 状态：active
- 签名：`saveDailySummary(dateKey: string, summary: string): Promise<void>`
- 用途：保存日摘要
- 调用方：ai.ts

---

## DB Schema 快照

```sql
-- 设置
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

-- 对话历史
CREATE TABLE chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 长期记忆
CREATE TABLE user_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  fact_type TEXT,
  subject_role TEXT DEFAULT 'user',
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 3,
  embedding TEXT,
  embedding_model TEXT,
  confirmed_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',  -- active / superseded
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 日摘要
CREATE TABLE daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 待集成层处理的变更

<!-- 在此追加新接口，集成层确认后移入上方「当前已发布接口」 -->
