import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Todo, Priority } from '../../types';
import './index.css';

interface TodoPanelProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  onClose: () => void;
}

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

type SortOrder = 'asc' | 'desc';

function sortTodos(todos: Todo[], order: SortOrder): Todo[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return [...todos].sort((a, b) => {
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    return order === 'asc' ? diff : -diff;
  });
}

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
    if (trimmed) {
      onEdit(todo.id, trimmed);
    }
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      onStopEdit();
    }
  };

  return (
    <motion.div
      className={`todo-item ${todo.is_completed ? 'todo-item--done' : ''}`}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
    >
      {/* 优先级色条 */}
      <span
        className="priority-dot"
        style={{ background: PRIORITY_COLOR[todo.priority] }}
        title={PRIORITY_LABEL[todo.priority]}
      />
      {/* 勾选框 */}
      <button
        className={`check-box ${todo.is_completed ? 'check-box--checked' : ''}`}
        onClick={() => onToggle(todo.id)}
      >
        {todo.is_completed && '✓'}
      </button>
      {/* 任务文字 / 编辑框 */}
      {isEditing ? (
        <input
          ref={inputRef}
          className="todo-edit-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className="todo-text"
          onClick={() => onStartEdit(todo.id)}
          title="单击编辑"
        >
          {todo.title}
        </span>
      )}
      {/* 删除按钮 */}
      <button
        className="delete-btn"
        onClick={() => onDelete(todo.id)}
        title="删除"
      >
        ×
      </button>
    </motion.div>
  );
}

export default function TodoPanel({ todos, onToggle, onDelete, onEdit, onClose }: TodoPanelProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = sortTodos(todos, sortOrder);
  const completedCount = todos.filter((t) => t.is_completed).length;

  return (
    <motion.div
      className="todo-panel"
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      {/* 标题栏 */}
      <div className="todo-header">
        <span className="todo-title">✿ 今日待办</span>
        <span className="todo-count">{completedCount}/{todos.length}</span>
        <button className="todo-close" onClick={onClose}>✕</button>
      </div>

      {/* 排序切换 */}
      <div className="todo-sort">
        <button
          className={`sort-btn ${sortOrder === 'asc' ? 'sort-btn--active' : ''}`}
          onClick={() => setSortOrder('asc')}
        >
          高→低
        </button>
        <span className="sort-divider">↕</span>
        <button
          className={`sort-btn ${sortOrder === 'desc' ? 'sort-btn--active' : ''}`}
          onClick={() => setSortOrder('desc')}
        >
          低→高
        </button>
      </div>

      {/* 任务列表 */}
      <div className="todo-list">
        <AnimatePresence initial={false}>
          {sorted.length === 0 ? (
            <p className="todo-empty">暂无待办，去创建一个吧～</p>
          ) : (
            sorted.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                isEditing={editingId === todo.id}
                onStartEdit={(id) => setEditingId(id)}
                onStopEdit={() => setEditingId(null)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
