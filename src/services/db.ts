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
    // 写入 DeepSeek API Key（仅在未设置时写入，避免覆盖用户自定义）
    const existing = await db.select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = 'deepseek_api_key'"
    );
    if (!existing[0]?.value) {
      await db.execute(
        "INSERT INTO settings (key, value) VALUES ('deepseek_api_key', 'sk-3d3490b4bdfa4c209bcf3f4f9b5625cc') ON CONFLICT(key) DO UPDATE SET value = 'sk-3d3490b4bdfa4c209bcf3f4f9b5625cc'"
      );
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
