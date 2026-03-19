import Database from '@tauri-apps/plugin-sql';
import { Todo, Priority, ScheduledTask } from '../types';

let db: Database | null = null;

const DB_PATH = 'sqlite:zhushou.db';

const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    last_reminded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS todo_history (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    date_key TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weather_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    condition TEXT NOT NULL DEFAULT 'cloudy',
    updated_at TEXT NOT NULL,
    raw_data TEXT
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    content TEXT NOT NULL UNIQUE,
    importance INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_key TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    trigger_mode TEXT NOT NULL DEFAULT 'daily',
    daily_time TEXT,
    interval_minutes INTEGER,
    action TEXT NOT NULL DEFAULT 'notify',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_triggered_at TEXT
  );
`;

// 已有数据库的列补丁（ALTER TABLE IF NOT EXISTS 不支持，用 try/catch）
const COLUMN_MIGRATIONS = [
  "ALTER TABLE user_memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 3",
  "ALTER TABLE user_memories ADD COLUMN subject_role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE user_memories ADD COLUMN fact_type TEXT NOT NULL DEFAULT 'preference'",
  "ALTER TABLE user_memories ADD COLUMN embedding TEXT",
  "ALTER TABLE user_memories ADD COLUMN embedding_model TEXT",
  "ALTER TABLE user_memories ADD COLUMN confirmed_count INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE user_memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
];

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load(DB_PATH);
    // 建表
    for (const stmt of MIGRATIONS.split(';').filter((s) => s.trim())) {
      await db.execute(stmt + ';');
    }
    // 列迁移：老数据库补新列，重复执行时静默忽略
    for (const stmt of COLUMN_MIGRATIONS) {
      try { await db.execute(stmt); } catch { /* 列已存在，忽略 */ }
    }
  }
  return db;
}

// ── Todo CRUD ──────────────────────────────────────────────

export async function fetchTodos(): Promise<Todo[]> {
  const database = await getDb();
  const rows = await database.select<any[]>(
    'SELECT * FROM todos ORDER BY CASE priority WHEN "high" THEN 1 WHEN "medium" THEN 2 ELSE 3 END, created_at DESC'
  );
  return rows.map((r) => ({
    ...r,
    is_completed: Boolean(r.is_completed),
  }));
}

export async function insertTodo(
  title: string,
  priority: Priority
): Promise<Todo> {
  const database = await getDb();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    priority,
    is_completed: false,
    created_at: new Date().toISOString(),
    completed_at: null,
    last_reminded_at: null,
  };
  await database.execute(
    'INSERT INTO todos (id, title, priority, is_completed, created_at) VALUES ($1, $2, $3, $4, $5)',
    [todo.id, todo.title, todo.priority, 0, todo.created_at]
  );
  return todo;
}

export async function updateTodoCompletion(
  id: string,
  isCompleted: boolean
): Promise<void> {
  const database = await getDb();
  const completedAt = isCompleted ? new Date().toISOString() : null;
  await database.execute(
    'UPDATE todos SET is_completed = $1, completed_at = $2 WHERE id = $3',
    [isCompleted ? 1 : 0, completedAt, id]
  );
}

export async function updateReminderTime(id: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    'UPDATE todos SET last_reminded_at = $1 WHERE id = $2',
    [new Date().toISOString(), id]
  );
}

// ── 每日清理：归档后删除过期待办 ──────────────────────────
export async function clearOutdatedTodos(): Promise<void> {
  const database = await getDb();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(5, 0, 0, 0);

  let todayStart: Date;
  if (now < cutoff) {
    todayStart = new Date(now);
    todayStart.setDate(todayStart.getDate() - 1);
    todayStart.setHours(5, 0, 0, 0);
  } else {
    todayStart = cutoff;
  }

  // 查询所有过期任务
  const outdated = await database.select<any[]>(
    'SELECT * FROM todos WHERE created_at < $1',
    [todayStart.toISOString()]
  );

  // 逐条归档到 todo_history（跳过已归档的）
  for (const row of outdated) {
    const dateKey = row.created_at.slice(0, 10); // "YYYY-MM-DD"
    await database.execute(
      `INSERT OR IGNORE INTO todo_history (id, title, priority, is_completed, created_at, completed_at, date_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.title, row.priority, row.is_completed, row.created_at, row.completed_at ?? null, dateKey]
    );
  }

  // 归档完成后删除过期任务
  await database.execute(
    'DELETE FROM todos WHERE created_at < $1',
    [todayStart.toISOString()]
  );
}

// ── 历史记录：按日期查询 ───────────────────────────────────
export async function fetchHistoryByDate(dateKey: string): Promise<Todo[]> {
  const database = await getDb();
  const rows = await database.select<any[]>(
    'SELECT * FROM todo_history WHERE date_key = $1 ORDER BY CASE priority WHEN "high" THEN 1 WHEN "medium" THEN 2 ELSE 3 END',
    [dateKey]
  );
  return rows.map((r) => ({
    ...r,
    is_completed: Boolean(r.is_completed),
    last_reminded_at: null,
  }));
}

// ── 历史记录：查询所有有任务的日期 ────────────────────────
export async function fetchHistoryDateKeys(): Promise<string[]> {
  const database = await getDb();
  const rows = await database.select<{ date_key: string }[]>(
    'SELECT DISTINCT date_key FROM todo_history'
  );
  return rows.map((r) => r.date_key);
}

export async function deleteTodo(id: string): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM todos WHERE id = $1', [id]);
}

export async function updateTodoTitle(id: string, title: string): Promise<void> {
  const database = await getDb();
  await database.execute('UPDATE todos SET title = $1 WHERE id = $2', [title, id]);
}

// ── Settings ───────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDb();
  const rows = await database.select<{ value: string }[]>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, value]
  );
}

// ── Weather Cache ──────────────────────────────────────────

export async function saveWeatherCache(
  condition: string,
  rawData: string
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO weather_cache (id, condition, updated_at, raw_data) VALUES (1, $1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET condition = $1, updated_at = $2, raw_data = $3`,
    [condition, new Date().toISOString(), rawData]
  );
}

export async function loadWeatherCache(): Promise<{
  condition: string;
  updated_at: string;
} | null> {
  const database = await getDb();
  const rows = await database.select<{ condition: string; updated_at: string }[]>(
    'SELECT condition, updated_at FROM weather_cache WHERE id = 1'
  );
  return rows[0] ?? null;
}

// ── 对话历史 ────────────────────────────────────────────────

export async function saveChatMessage(
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const database = await getDb();
  await database.execute(
    'INSERT INTO chat_history (role, content) VALUES ($1, $2)',
    [role, content]
  );
  // 只保留最近 60 条
  await database.execute(
    'DELETE FROM chat_history WHERE id NOT IN (SELECT id FROM chat_history ORDER BY id DESC LIMIT 60)'
  );
}

export async function getRecentChatHistory(
  limit = 20
): Promise<Array<{ role: string; content: string }>> {
  const database = await getDb();
  // 取最近 limit 条后按时间正序排列（旧 → 新）
  const rows = await database.select<{ role: string; content: string }[]>(
    'SELECT role, content FROM (SELECT id, role, content FROM chat_history ORDER BY id DESC LIMIT $1) ORDER BY id ASC',
    [limit]
  );
  return rows;
}

// ── 用户记忆 ────────────────────────────────────────────────

export interface MemoryRow {
  id: number;
  category: string;       // 兼容旧字段
  fact_type: string;      // identity/preference/habit/fact/task/screen_habit
  subject_role: string;   // user/assistant
  content: string;
  importance: number;
  confirmed_count: number;
  status: string;         // active/superseded
  embedding: string | null;
  embedding_model: string | null;
  updated_at: string;
}

/** 余弦相似度（两个已 L2 归一化向量） */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** 写入或更新记忆（两阶段去重：embedding 候选 + 规则判重） */
export async function upsertMemory(
  category: string,
  content: string,
  importance = 3,
  opts: {
    factType?: string;
    subjectRole?: string;
    embedding?: number[];
    embeddingModel?: string;
  } = {},
): Promise<void> {
  const database = await getDb();
  const factType = opts.factType ?? category;
  const subjectRole = opts.subjectRole ?? 'user';
  const embeddingJson = opts.embedding ? JSON.stringify(opts.embedding) : null;
  const embeddingModel = opts.embeddingModel ?? null;

  // 1. 精确内容去重（原有逻辑）
  const exact = await database.select<{ id: number }[]>(
    'SELECT id FROM user_memories WHERE content = $1 AND status = $2',
    [content, 'active']
  );
  if (exact.length > 0) {
    await database.execute(
      `UPDATE user_memories SET
         importance = MAX(importance, $1),
         confirmed_count = confirmed_count + 1,
         updated_at = datetime('now','localtime')
       WHERE id = $2`,
      [importance, exact[0].id]
    );
    return;
  }

  // 2. 语义去重（仅在有 embedding 时执行）
  if (opts.embedding) {
    const candidates = await database.select<{
      id: number; content: string; fact_type: string;
      subject_role: string; embedding: string | null;
    }[]>(
      `SELECT id, content, fact_type, subject_role, embedding
       FROM user_memories WHERE status = 'active' AND embedding IS NOT NULL`
    );

    for (const c of candidates) {
      if (!c.embedding) continue;
      // 规则门控：subject_role 和 fact_type 不同 → 直接跳过，不视为重复
      if (c.subject_role !== subjectRole || c.fact_type !== factType) continue;

      const sim = cosineSim(opts.embedding, JSON.parse(c.embedding) as number[]);

      if (sim >= 0.90) {
        // duplicate：confirmed_count++，保留更长/更新的 content
        const merged = content.length > c.content.length ? content : c.content;
        await database.execute(
          `UPDATE user_memories SET
             content = $1,
             importance = MAX(importance, $2),
             confirmed_count = confirmed_count + 1,
             updated_at = datetime('now','localtime')
           WHERE id = $3`,
          [merged, importance, c.id]
        );
        return;
      }

      if (sim >= 0.80) {
        // update：新内容更细化则更新，否则仅增加 confirmed_count
        await database.execute(
          `UPDATE user_memories SET
             importance = MAX(importance, $1),
             confirmed_count = confirmed_count + 1,
             updated_at = datetime('now','localtime')
           WHERE id = $2`,
          [importance, c.id]
        );
        return;
      }
    }
  }

  // 3. 无重复 → 新增
  await database.execute(
    `INSERT INTO user_memories
       (category, fact_type, subject_role, content, importance,
        embedding, embedding_model, confirmed_count, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'active', datetime('now','localtime'))`,
    [factType, factType, subjectRole, content, importance, embeddingJson, embeddingModel]
  );
}

/** 对话驱动的记忆纠正：将含 oldKeyword 的旧记忆标记为 superseded，写入新记忆 */
export async function correctMemory(
  oldKeyword: string,
  newContent: string,
  factType: string,
  subjectRole: string,
  importance: number,
): Promise<void> {
  const database = await getDb();

  // 将含旧关键词的 active 记忆标记为 superseded
  if (oldKeyword.trim()) {
    await database.execute(
      `UPDATE user_memories
         SET status = 'superseded', updated_at = datetime('now','localtime')
       WHERE status = 'active' AND content LIKE $1`,
      [`%${oldKeyword.trim()}%`]
    );
  }

  // 写入新记忆，confirmed_count=2 表示已由用户明确确认
  await database.execute(
    `INSERT INTO user_memories
       (category, fact_type, subject_role, content, importance,
        embedding, embedding_model, confirmed_count, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, 2, 'active', datetime('now','localtime'))`,
    [factType, factType, subjectRole, newContent.trim(), Math.min(5, importance + 1)]
  );
}

/** Hybrid 检索：向量相似 × 0.50 + importance × 0.25 + 近期度 × 0.15 + 关键词 × 0.10
 *  identity/preference 类近期度恒为 1.0，候选池 30 条去重后取 limit 条 */
export async function getRelevantMemories(
  query: string,
  limit = 15,
  queryEmbedding?: number[],
): Promise<Array<{ id: number; category: string; content: string }>> {
  const database = await getDb();
  const all = await database.select<MemoryRow[]>(
    `SELECT id, category, fact_type, subject_role, content, importance,
            confirmed_count, status, embedding, embedding_model, updated_at
     FROM user_memories WHERE status = 'active' ORDER BY updated_at DESC`
  );
  if (!all.length) return [];

  const keywords = (query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) ?? []).slice(0, 8);
  const now = Date.now();
  const LONG_TERM_TYPES = new Set(['identity', 'preference', 'name']);

  const scored = all.map(m => {
    // 关键词分
    const keyScore = keywords.filter(k => m.content.includes(k)).length /
                     Math.max(keywords.length, 1);

    // 近期度：长期事实不衰减
    const daysSince = (now - new Date(m.updated_at).getTime()) / 86400000;
    const recency = LONG_TERM_TYPES.has(m.fact_type)
      ? 1.0
      : Math.max(0, 1 - daysSince / 30);

    // 向量相似度
    let vecSim = 0;
    if (queryEmbedding && m.embedding) {
      try { vecSim = cosineSim(queryEmbedding, JSON.parse(m.embedding) as number[]); }
      catch { vecSim = 0; }
    }

    // importance 归一化（1-5 → 0-1）
    const imp = (m.importance - 1) / 4;

    // confirmed_count 加成（多次确认的事实更可靠，最多 +0.1）
    const confirmBonus = Math.min(m.confirmed_count - 1, 5) * 0.02;

    const score = queryEmbedding
      ? vecSim * 0.50 + imp * 0.25 + recency * 0.15 + keyScore * 0.10 + confirmBonus
      : keyScore * 0.40 + imp * 0.35 + recency * 0.25 + confirmBonus; // 无 embedding 降级公式

    return { id: m.id, category: m.category ?? m.fact_type, content: m.content, score };
  });

  // 候选池 30 → 排序 → 取 limit
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limit, 30))
    .slice(0, limit)
    .map(({ id, category, content }) => ({ id, category, content }));
}

export async function deleteMemory(id: number): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM user_memories WHERE id = $1', [id]);
}

// ── 日常摘要（每日对话压缩） ────────────────────────────────

export async function saveDailySummary(dateKey: string, summary: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO daily_summaries (date_key, summary)
     VALUES ($1, $2)
     ON CONFLICT(date_key) DO UPDATE SET summary = $2`,
    [dateKey, summary]
  );
}

export async function hasDailySummary(dateKey: string): Promise<boolean> {
  const database = await getDb();
  const rows = await database.select<{ c: number }[]>(
    'SELECT COUNT(*) as c FROM daily_summaries WHERE date_key = $1',
    [dateKey]
  );
  return (rows[0]?.c ?? 0) > 0;
}

/** 返回最近 limit 天的摘要（按日期倒序） */
export async function getDailySummaries(
  limit = 2,
): Promise<Array<{ date_key: string; summary: string }>> {
  const database = await getDb();
  return await database.select<{ date_key: string; summary: string }[]>(
    'SELECT date_key, summary FROM daily_summaries ORDER BY date_key DESC LIMIT $1',
    [limit]
  );
}

/** 获取昨天的对话记录（用于生成日摘要） */
export async function getChatHistoryByDate(
  dateKey: string,
): Promise<Array<{ role: string; content: string }>> {
  const database = await getDb();
  return await database.select<{ role: string; content: string }[]>(
    "SELECT role, content FROM chat_history WHERE date(created_at) = $1 ORDER BY id ASC",
    [dateKey]
  );
}

/** 获取即将被清理的旧消息（id 不在最近 keepCount 条内） */
export async function getMessagesForCompression(
  keepCount: number,
): Promise<Array<{ role: string; content: string }>> {
  const database = await getDb();
  return await database.select<{ role: string; content: string }[]>(
    `SELECT role, content FROM chat_history
     WHERE id NOT IN (SELECT id FROM chat_history ORDER BY id DESC LIMIT $1)
     ORDER BY id ASC`,
    [keepCount]
  );
}

// ── 定时任务 CRUD ────────────────────────────────────────────

export async function fetchScheduledTasks(): Promise<ScheduledTask[]> {
  const database = await getDb();
  const rows = await database.select<any[]>(
    'SELECT * FROM scheduled_tasks ORDER BY created_at ASC'
  );
  return rows.map((r) => ({
    ...r,
    interval_minutes: r.interval_minutes ?? null,
    daily_time: r.daily_time ?? null,
    last_triggered_at: r.last_triggered_at ?? null,
  }));
}

export async function insertScheduledTask(task: {
  title: string;
  trigger_mode: 'daily' | 'interval';
  daily_time: string | null;
  interval_minutes: number | null;
}): Promise<ScheduledTask> {
  const database = await getDb();
  const now = new Date().toISOString();
  const newTask: ScheduledTask = {
    id: crypto.randomUUID(),
    title: task.title,
    trigger_mode: task.trigger_mode,
    daily_time: task.daily_time,
    interval_minutes: task.interval_minutes,
    action: 'notify',
    is_enabled: 1,
    created_at: now,
    // interval 模式：预填 last_triggered_at 为当前时间，等待完整间隔后首次触发
    // daily 模式：null，今日到时间即可触发
    last_triggered_at: task.trigger_mode === 'interval' ? now : null,
  };
  await database.execute(
    `INSERT INTO scheduled_tasks
       (id, title, trigger_mode, daily_time, interval_minutes, action, is_enabled, created_at, last_triggered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newTask.id, newTask.title, newTask.trigger_mode,
      newTask.daily_time, newTask.interval_minutes,
      newTask.action, newTask.is_enabled,
      newTask.created_at, newTask.last_triggered_at,
    ]
  );
  return newTask;
}

export async function updateScheduledTaskTitle(id: string, title: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    'UPDATE scheduled_tasks SET title = $1 WHERE id = $2',
    [title, id]
  );
}

export async function updateScheduledTaskLastTriggered(id: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    'UPDATE scheduled_tasks SET last_triggered_at = $1 WHERE id = $2',
    [new Date().toISOString(), id]
  );
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM scheduled_tasks WHERE id = $1', [id]);
}
