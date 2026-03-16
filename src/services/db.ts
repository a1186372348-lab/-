import Database from '@tauri-apps/plugin-sql';
import { Todo, Priority } from '../types';

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
`;

// 已有数据库的列补丁（ALTER TABLE IF NOT EXISTS 不支持，用 try/catch）
const COLUMN_MIGRATIONS = [
  "ALTER TABLE user_memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 3",
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

export async function upsertMemory(
  category: string,
  content: string,
  importance = 3,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO user_memories (category, content, importance, updated_at)
     VALUES ($1, $2, $3, datetime('now','localtime'))
     ON CONFLICT(content) DO UPDATE SET
       category   = $1,
       importance = MAX(importance, $3),
       updated_at = datetime('now','localtime')`,
    [category, content, importance]
  );
}

/** 按查询相关性返回最多 limit 条记忆（JS 层评分：关键词命中×3 + importance + 近期度） */
export async function getRelevantMemories(
  query: string,
  limit = 8,
): Promise<Array<{ id: number; category: string; content: string }>> {
  const database = await getDb();
  const all = await database.select<{
    id: number; category: string; content: string;
    importance: number; updated_at: string;
  }[]>(
    'SELECT id, category, content, importance, updated_at FROM user_memories ORDER BY updated_at DESC'
  );
  if (!all.length) return [];

  // 提取中文（2字符+）和英文（3字符+）关键词，最多取前8个
  const keywords = (query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) ?? []).slice(0, 8);
  const now = Date.now();

  const scored = all.map(m => {
    const keyHits = keywords.filter(k => m.content.includes(k)).length;
    const daysSince = (now - new Date(m.updated_at).getTime()) / 86400000;
    const recency = Math.max(0, 1 - daysSince / 30); // 30天内线性衰减
    return { id: m.id, category: m.category, content: m.content, score: keyHits * 3 + m.importance + recency };
  });

  return scored
    .sort((a, b) => b.score - a.score)
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
