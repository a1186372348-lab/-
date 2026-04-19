# 关键数据流文档

> 本文档描述 Todo、Reminder、Scheduler、Chat、Memory 五个核心模块的运行时数据流。
> 每个流程标注：主要输入、处理层、持久化/副作用、可观察输出。

---

## 1. Todo 数据流

### 1.1 用户创建待办

```
输入:  用户在 TodoPage 输入标题 + 选择优先级，点击添加
处理:  handleAdd() -> insertTodo(title, priority)
       db.ts 生成 UUID，INSERT INTO todos
持久化: SQLite todos 表 (id, title, priority, is_completed=0, created_at)
输出:  TodoPage 立即刷新列表渲染新条目
```

### 1.2 用户完成/取消待办

```
输入:  用户点击 checkbox
处理:  handleToggle() -> 乐观更新本地状态
       updateTodoCompletion(id, isCompleted)
持久化: UPDATE todos SET is_completed, completed_at (完成时写入当前时间)
输出:  UI 勾选状态切换
       若全部完成 -> emit('all-todos-complete') -> 主窗口切换"自豪"表情
```

### 1.3 轮询同步（每秒）

```
输入:  无（setInterval 1秒自动触发）
处理:  fetchTodos() -> SELECT * FROM todos ORDER BY priority, created_at
       签名比对 (id+is_completed)，无变化则保持 prev 引用避免重渲染
持久化: 只读，无写入
输出:  列表更新（可感知外部直接写入 SQLite 的新待办）
```

### 1.4 跨日归档（凌晨 5:00）

```
输入:  TodoPage 初始化 + 每分钟检查当前时间
处理:  clearOutdatedTodos()
       以 05:00 为日切分点计算"今日起点"
       SELECT 过期待办 -> INSERT INTO todo_history (加 date_key)
       -> DELETE FROM todos WHERE created_at < todayStart
持久化: todos -> todo_history 表迁移，原记录删除
输出:  TodoPage 列表清空过期项
       Calendar 组件消费 todo_history 标记历史日期小圆点
```

### 1.5 关键文件

| 文件 | 职责 |
|------|------|
| `src/components/TodoPage/index.tsx` | CRUD UI + 1 秒轮询 + 归档触发 |
| `src/services/db.ts` | todos/todo_history 表 CRUD |
| `src/App.tsx` | 监听 all-todos-complete 事件 |

---

## 2. Reminder 数据流

### 2.1 定时提醒调度

```
输入:  无（setTimeout 递归自动运行）
处理:  startReminderService(onRemind, getIntervalMinutes)
       每轮: fetchTodos() -> 过滤未完成 -> shouldRemind() 冷却检查
       -> 按优先级排序 (high > medium > low) -> 取最高优先级项
       冷却规则: last_reminded_at 为空 或 距上次 >= intervalMs
       每轮最多提醒一条
持久化: updateReminderTime(id) -> UPDATE todos SET last_reminded_at = now
输出:  onRemind(todo) 回调 -> App.tsx:
       setExpression('worried') + 播放音效 + 气泡提示 "{title} is still pending."
       3 秒后恢复默认表情
```

### 2.2 设计要点

- 间隔 = 冷却：调度间隔与冷却阈值共用同一数值，无法独立配置
- 动态间隔：通过 `getIntervalMinutes()` 函数每轮重新读取，可运行时调整
- 单轮单提醒：即使多条待办通过冷却检查，每轮也只提醒优先级最高的一条

### 2.3 关键文件

| 文件 | 职责 |
|------|------|
| `src/services/reminder.ts` | setTimeout 递归调度 + 冷却/优先级逻辑 |
| `src/services/db.ts` | fetchTodos, updateReminderTime |
| `src/App.tsx` | 注册 onRemind 回调，展示表情/音效/气泡 |

---

## 3. Scheduler 数据流

### 3.1 创建定时任务

```
输入:  用户在 SchedulerPage 输入标题 + 选择触发模式 (daily/interval) + 时间参数
处理:  handleAdd() -> insertScheduledTask({title, trigger_mode, daily_time, interval_minutes})
       生成 UUID，action='notify' (硬编码)，is_enabled=1
       interval 模式: last_triggered_at=now (等完整间隔才首次触发)
       daily 模式: last_triggered_at=null (今日到时间即触发)
持久化: INSERT INTO scheduled_tasks
输出:  SchedulerPage load() 刷新列表
```

### 3.2 触发轮询（每 60 秒）

```
输入:  无（setInterval 60秒 + 启动后 5 秒首次执行）
处理:  startSchedulerService(onTrigger)
       tick(): fetchScheduledTasks() -> 遍历每个任务:
         is_enabled==0 -> 跳过
         daily: 当前 HH:MM == daily_time 且今日未触发
         interval: elapsed >= interval_minutes
持久化: 触发时 UPDATE scheduled_tasks SET last_triggered_at = now (防重复)
输出:  onTrigger(task) 回调 -> App.tsx:
       setExpression('happy') + showSpeech("⏰ 提醒：{title}", 7000ms)
       3 秒后恢复默认表情
```

### 3.3 事件：scheduler:reload

```
监听端: SchedulerPage -> load() 刷新列表
发送端: 当前无（孤立监听，预留跨窗口通信接口）
```

### 3.4 关键文件

| 文件 | 职责 |
|------|------|
| `src/components/SchedulerPage/index.tsx` | 任务管理 UI |
| `src/services/scheduler.ts` | 60 秒轮询 + daily/interval 判定 |
| `src/services/db.ts` | scheduled_tasks 表 CRUD |
| `src/App.tsx` | 注册 onTrigger 回调，展示表情/气泡 |

---

## 4. Chat 数据流

### 4.1 用户发送消息

```
输入:  用户在 InputBar 输入文本，按 Enter 或点击发送
处理:  App.handleSend(text) -> chatStream(text, onChunk)
       1. 并行准备上下文:
          - getEmbedding(userText)           -- Gemini API 生成向量
          - getRecentChatHistory(20)         -- 最近 20 条对话
          - getDailySummaries(2)             -- 最近 2 天日摘要
          - getRelevantMemories(text, 15)    -- 混合检索记忆
       2. 拼装 system prompt: 角色卡 + 近期摘要 + 用户记忆
       3. normalizeHistory() 确保角色交替
       4. DeepSeek API 流式调用 (stream: true)
持久化: 流结束后:
          saveChatMessage('user', text)      -- 保留最近 60 条
          saveChatMessage('assistant', reply)
          [后台] extractMemoriesAsync         -- 提取记忆
          [后台] extractScheduleIntentAsync   -- 检测定时意图
          [后台] compressHistoryAsync         -- 旧消息压缩为长期记忆
输出:  流式气泡渲染:
          first chunk  -> emit('speech:show', {text, duration:0})
          subsequent   -> emit('speech:append', {delta})
          流结束       -> emit('speech:done', {duration:5000})
       2 秒后恢复默认表情
```

### 4.2 屏幕感知主动发言

```
输入:  无（setInterval 30 秒自动触发）
处理:  startScreenMonitor(callbacks)
       前置检查: 全屏不打扰 / 用户输入中不打扰 / 正在处理不打扰
       1. invoke('take_screenshot') -> base64 (Rust 侧截图)
       2. quickHash 去重 (静止屏幕跳过)
       3. 距上次发言 < 3 分钟 -> 跳过
       4. analyzeScreen(base64) -> Gemini/GLM 视觉模型 -> 屏幕描述 (<=15字)
       5. 每 10 分钟: maybeStoreScreenMemory -> upsertMemory('screen_habit', ...)
       6. proactiveChat(screenDesc) -> DeepSeek (max_tokens=60, temperature=0.8)
持久化: 屏幕习惯写入 user_memories 表 (importance=2)
输出:  若有内容: onSpeak(chunks.join('')) -> showSpeech (一次性完整文本)
       5 秒后自动关闭气泡
```

### 4.3 关键文件

| 文件 | 职责 |
|------|------|
| `src/services/ai.ts` | chatStream, proactiveChat, analyzeScreen, 记忆提取 |
| `src/services/screenMonitor.ts` | 30 秒截图 + 主动发言调度 |
| `src/services/db.ts` | chat_history, daily_summaries, settings 表 |
| `src/App.tsx` | handleSend 入口, showSpeech, 事件编排 |
| `src/components/InputBar/index.tsx` | 文本输入触发 |
| `src/components/SpeechBubblePage/index.tsx` | 气泡渲染 (跨窗口) |

---

## 5. Memory 数据流

### 5.1 实时记忆提取

```
输入:  chatStream 完成后的 userText + assistantReply
处理:  extractMemoriesAsync()
       DeepSeek (max_tokens=300, temperature=0.1)
       -> JSON: [{subject_role, fact_type, content, importance, confidence}]
       置信度门控: confidence < 0.7 丢弃
       纠正模式: correction_of 非空 -> correctMemory (旧标记 superseded)
       正常写入: getEmbedding(content) -> upsertMemory
持久化: user_memories 表 (id, fact_type, subject_role, content, importance, embedding, status)
输出:  无直接可观察输出（异步后台写入）
```

### 5.2 历史压缩

```
输入:  chatStream 发现将被淘汰的旧消息 >= 10 条
处理:  compressHistoryAsync()
       getMessagesForCompression(40) -> 取将淘汰的旧消息
       DeepSeek 压缩为长期记忆事实
       -> upsertMemory 写入
持久化: user_memories 表
输出:  无直接可观察输出
```

### 5.3 记忆检索（混合打分）

```
输入:  用户消息文本 + queryEmbedding
处理:  getRelevantMemories(query, limit=15, embedding)
       取所有 active 状态记忆
       有 embedding:  向量相似度×0.50 + 重要性×0.25 + 近期度×0.15 + 关键词×0.10
       无 embedding:  关键词×0.40 + 重要性×0.35 + 近期度×0.25
       identity/preference 类型近期度恒为 1.0 (不衰减)
       confirmed_count 加成: min(count-1, 5) × 0.02
持久化: 只读
输出:  top 15 条记忆 -> 注入 Chat 的 system prompt【关于用户的记忆】段
```

### 5.4 记忆去重（upsertMemory 三阶段）

```
阶段 1 - 精确匹配: content 完全相同 -> confirmed_count++, importance 取 max
阶段 2 - 语义匹配 (有 embedding):
         subject_role + fact_type 不同 -> 跳过
         cosineSim >= 0.90 -> 合并 (取更长 content), confirmed_count++
         cosineSim >= 0.80 -> 更新 importance, confirmed_count++
阶段 3 - 新增插入: 无匹配则 INSERT 新记录
```

### 5.5 日摘要

```
输入:  chatStream 时检测昨天有 >= 5 条对话且尚未生成摘要
处理:  ensureYesterdaySummaryAsync()
       DeepSeek 压缩为 2-3 句话
持久化: daily_summaries 表 (date_key UNIQUE, summary)
输出:  下次对话时注入 system prompt【近期对话摘要】段
```

### 5.6 关键文件

| 文件 | 职责 |
|------|------|
| `src/services/ai.ts` | 记忆提取 (实时+压缩), 嵌入生成, 对话上下文组装 |
| `src/services/db.ts` | user_memories 去重/检索/纠正, daily_summaries |
| `src/services/screenMonitor.ts` | 屏幕习惯记忆 (每 10 分钟) |
| `src/App.tsx` | 集成层，调用 chatStream 启动全链路 |

---

## 6. 跨模块数据流总览

```
                    ┌─────────────────────────────────┐
                    │           SQLite (zhushou.db)    │
                    │  todos | todo_history            │
                    │  scheduled_tasks                 │
                    │  chat_history | daily_summaries  │
                    │  user_memories | settings        │
                    └──────────┬──────────────────────┘
                               │ tauri-plugin-sql (JS 直连)
          ┌────────────────────┼───────────────────────┐
          v                    v                       v
   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  TodoPage    │  │  App.tsx         │  │  ai.ts           │
   │  (CRUD+轮询) │  │  (事件编排)      │  │  (Chat+Memory)   │
   └──────┬───────┘  └──┬───────────────┘  └──┬───────────────┘
          │             │                      │
          │ emit        │ emit/emitTo          │ 流式回调
          │ all-todos-  │ speech:show/append/  │ onChunk
          │ complete    │ done                 │
          v             v                      v
   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ App.tsx      │  │ SpeechBubblePage │  │ screenMonitor.ts │
   │ (表情切换)   │  │ (气泡渲染)       │  │ (截图+视觉分析)  │
   └──────────────┘  └──────────────────┘  └──────────────────┘
```

**关键约束：**
- 所有数据库操作由 JS 侧 `src/services/db.ts` 通过 `tauri-plugin-sql` 完成，Rust 侧不直接操作数据库
- 跨窗口通信使用 `emitTo(windowLabel, event)`，气泡窗口为 `speech-bubble`
- App.tsx 作为集成层编排所有模块回调，但业务逻辑在各自服务中
