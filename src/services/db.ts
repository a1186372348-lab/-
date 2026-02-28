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
`;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load(DB_PATH);
    // 建表
    for (const stmt of MIGRATIONS.split(';').filter((s) => s.trim())) {
      await db.execute(stmt + ';');
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
