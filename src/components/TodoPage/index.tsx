import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { emitTo } from '@tauri-apps/api/event';
import {
  getDb,
  fetchTodos,
  insertTodo,
  updateTodoCompletion,
  deleteTodo as dbDeleteTodo,
  updateTodoTitle as dbUpdateTodoTitle,
  clearOutdatedTodos,
} from '../../services/db';
import { Todo, Priority } from '../../types';
import Calendar from './Calendar';
import './index.css';

const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ff6b6b',
  medium: '#ffd93d',
  low: '#6bcb77',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(todo.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditValue(todo.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed) onEdit(todo.id, trimmed);
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') onStopEdit();
  };

  return (
    <motion.div
      className="tp-item"
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
    >
      <span
        className="tp-priority-dot"
        style={{ background: PRIORITY_COLOR[todo.priority] }}
        title={PRIORITY_LABEL[todo.priority]}
      />
      {/* input + label 必须相邻，CSS :checked + label 选择器才生效 */}
      <input
        type="checkbox"
        className="tp-checkbox"
        checked={todo.is_completed}
        onChange={() => onToggle(todo.id)}
      />
      {isEditing ? (
        <input
          ref={inputRef}
          className="tp-edit-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <label
          className="tp-label"
          onClick={() => onStartEdit(todo.id)}
          title="单击编辑"
        >
          {todo.title}
        </label>
      )}
      <button className="tp-delete" onClick={() => onDelete(todo.id)} title="删除">
        ×
      </button>
    </motion.div>
  );
}

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [addPriority, setAddPriority] = useState<Priority>('medium');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await getDb();
      // 启动时清理过期任务（非今天 05:00 后创建的）
      await clearOutdatedTodos();
      const loaded = await fetchTodos();
      setTodos(loaded);
      setIsLoading(false);
    };
    init();

    // 每分钟检查一次是否跨过了今天 05:00，到点后自动清理
    const timer = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 5 && now.getMinutes() === 0) {
        await clearOutdatedTodos();
        const loaded = await fetchTodos();
        setTodos(loaded);
      }
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  const handleAdd = useCallback(async () => {
    const title = addTitle.trim();
    if (!title) return;
    const newTodo = await insertTodo(title, addPriority);
    setTodos((prev) => {
      const updated = [...prev, newTodo];
      const order = { high: 0, medium: 1, low: 2 };
      return updated.sort((a, b) => order[a.priority] - order[b.priority]);
    });
    setAddTitle('');
  }, [addTitle, addPriority]);

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleToggle = useCallback(async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const newCompleted = !todo.is_completed;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_completed: newCompleted } : t))
    );
    await updateTodoCompletion(id, newCompleted);
  }, [todos]);

  const handleDelete = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await dbDeleteTodo(id);
  }, []);

  const handleEdit = useCallback(async (id: string, newTitle: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t))
    );
    await dbUpdateTodoTitle(id, newTitle);
  }, []);

  const completedCount = todos.filter((t) => t.is_completed).length;

  return (
    <div
      className="tp-root"
      onMouseEnter={() => emitTo('main', 'todo-mouse-enter')}
      onMouseLeave={() => emitTo('main', 'todo-mouse-leave')}
    >
      {/* 标题栏（可拖拽） */}
      <div className="tp-titlebar">
        <span className="tp-title">✿ 云宝待办</span>
        <span className="tp-count">{completedCount}/{todos.length}</span>
      </div>

      {/* 快速添加 */}
      <div className="tp-add-bar">
        <input
          className="tp-add-input"
          placeholder="添加待办..."
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        <select
          className="tp-priority-select"
          value={addPriority}
          onChange={(e) => setAddPriority(e.target.value as Priority)}
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <button className="tp-add-btn" onClick={handleAdd}>+</button>
      </div>

      {/* 列表 */}
      <div className="tp-list">
        {isLoading ? (
          <p className="tp-empty">加载中...</p>
        ) : (
          <AnimatePresence initial={false}>
            {todos.length === 0 ? (
              <motion.p
                className="tp-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                暂无待办，快来添加一个吧～
              </motion.p>
            ) : (
              todos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  isEditing={editingId === todo.id}
                  onStartEdit={(id) => setEditingId(id)}
                  onStopEdit={() => setEditingId(null)}
                />
              ))
            )}
          </AnimatePresence>
        )}
      </div>

      {/* 日历：悬停日期查看当日任务 */}
      <Calendar todos={todos} />
    </div>
  );
}
