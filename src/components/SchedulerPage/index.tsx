import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import {
  fetchScheduledTasks,
  insertScheduledTask,
  updateScheduledTaskTitle,
  deleteScheduledTask,
} from '../../services/db';
import { ScheduledTask, ScheduleTriggerMode } from '../../types';
import './index.css';

function formatTriggerDesc(task: ScheduledTask): string {
  if (task.trigger_mode === 'daily' && task.daily_time) {
    return `每天 ${task.daily_time}`;
  }
  if (task.trigger_mode === 'interval' && task.interval_minutes) {
    const mins = task.interval_minutes;
    if (mins >= 60 && mins % 60 === 0) return `每 ${mins / 60} 小时`;
    return `每 ${mins} 分钟`;
  }
  return '未配置';
}

function SchedulerItem({
  task,
  onDelete,
  onEdit,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  task: ScheduledTask;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditValue(task.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, task.title]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed) onEdit(task.id, trimmed);
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') onStopEdit();
  };

  return (
    <motion.div
      className="sc-item"
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
    >
      <div className="sc-item-left">
        {isEditing ? (
          <input
            ref={inputRef}
            className="sc-edit-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
          />
        ) : (
          <span className="sc-item-title" onClick={() => onStartEdit(task.id)}>
            {task.title}
          </span>
        )}
        <span className="sc-item-desc">{formatTriggerDesc(task)}</span>
      </div>
      <button className="sc-delete" onClick={() => onDelete(task.id)}>×</button>
    </motion.div>
  );
}

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [triggerMode, setTriggerMode] = useState<ScheduleTriggerMode>('daily');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [editingId, setEditingId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const list = await fetchScheduledTasks();
    setTasks(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unlistenPromise = listen('scheduler:reload', () => { load(); });
    return () => { unlistenPromise.then(fn => fn()); };
  }, [load]);

  const handleAdd = async () => {
    const title = titleInput.trim();
    if (!title) return;
    if (triggerMode === 'daily' && !dailyTime) return;
    if (triggerMode === 'interval' && (!intervalMinutes || intervalMinutes <= 0)) return;

    await insertScheduledTask({
      title,
      trigger_mode: triggerMode,
      daily_time: triggerMode === 'daily' ? dailyTime : null,
      interval_minutes: triggerMode === 'interval' ? intervalMinutes : null,
    });
    setTitleInput('');
    titleInputRef.current?.focus();
    await load();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleDelete = async (id: string) => {
    await deleteScheduledTask(id);
    await load();
  };

  const handleEdit = async (id: string, title: string) => {
    await updateScheduledTaskTitle(id, title);
    await load();
  };

  return (
    <div className="sc-root">
      {/* 标题栏 */}
      <div className="sc-titlebar">
        <span className="sc-title">⏰ 云宝定时</span>
        <span className="sc-count">{tasks.length} 条</span>
      </div>

      {/* 添加区 */}
      <div className="sc-add-area">
        <div className="sc-add-row">
          <input
            ref={titleInputRef}
            className="sc-add-input"
            placeholder="任务名称…"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="sc-add-btn" onClick={handleAdd}>+</button>
        </div>
        <div className="sc-mode-row">
          <select
            className="sc-select"
            value={triggerMode}
            onChange={(e) => setTriggerMode(e.target.value as ScheduleTriggerMode)}
          >
            <option value="daily">每天定时</option>
            <option value="interval">间隔循环</option>
          </select>
          {triggerMode === 'daily' ? (
            <input
              type="time"
              className="sc-time-input"
              value={dailyTime}
              onChange={(e) => setDailyTime(e.target.value)}
            />
          ) : (
            <div className="sc-interval-wrap">
              <input
                type="number"
                className="sc-number-input"
                min={1}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
              />
              <span className="sc-unit">分钟</span>
            </div>
          )}
        </div>
      </div>

      {/* 任务列表 */}
      <div className="sc-list">
        {tasks.length === 0 ? (
          <p className="sc-empty">暂无定时任务</p>
        ) : (
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <SchedulerItem
                key={task.id}
                task={task}
                isEditing={editingId === task.id}
                onStartEdit={(id) => setEditingId(id)}
                onStopEdit={() => setEditingId(null)}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
