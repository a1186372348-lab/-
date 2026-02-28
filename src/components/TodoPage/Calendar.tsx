import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Todo, Priority } from '../../types';
import { fetchHistoryByDate, fetchHistoryDateKeys } from '../../services/db';
import './Calendar.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ff6b6b',
  medium: '#ffa726',
  low: '#66bb6a',
};

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface Props {
  todos: Todo[];
}

export default function Calendar({ todos }: Props) {
  const today = new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState({ x: 0, y: 0 });
  const [popupBottom, setPopupBottom] = useState(0);
  const [historyDateKeys, setHistoryDateKeys] = useState<Set<string>>(new Set());
  const [hoveredTodos, setHoveredTodos] = useState<Todo[]>([]);

  const chipRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const todayKey = toLocalDateStr(today);
  const chipLabel = `${String(today.getFullYear()).slice(-2)}/${today.getMonth() + 1}/${today.getDate()}`;

  // 加载历史有任务的日期集合（用于显示小圆点）
  useEffect(() => {
    fetchHistoryDateKeys().then((keys) => setHistoryDateKeys(new Set(keys)));
  }, [isOpen]);

  // 今天的任务按日期分组（实时）
  const todayTodos = useMemo(() => {
    return todos.filter((t) => toLocalDateStr(new Date(t.created_at)) === todayKey);
  }, [todos, todayKey]);

  // 生成格子
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const prevMonth = () =>
    month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1);
  const nextMonth = () =>
    month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1);

  const getKey = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 点击日期 chip 展开/收起日历
  const handleChipClick = () => {
    if (!isOpen && chipRef.current) {
      const rect = chipRef.current.getBoundingClientRect();
      setPopupBottom(window.innerHeight - rect.top + 6);
    }
    setIsOpen(v => !v);
    setHoveredKey(null);
  };

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popupRef.current?.contains(target) && !chipRef.current?.contains(target)) {
        setIsOpen(false);
        setHoveredKey(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  // 悬停日期格子：今天用实时 todos，历史日期从数据库查
  const handleEnter = useCallback(async (e: React.MouseEvent<HTMLDivElement>, day: number) => {
    const key = getKey(day);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipAnchor({
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top - 6),
    });
    setHoveredKey(key);
    if (key === todayKey) {
      setHoveredTodos(todayTodos);
    } else {
      const history = await fetchHistoryByDate(key);
      setHoveredTodos(history);
    }
  }, [todayKey, todayTodos]);

  const formatKey = (key: string) => {
    const [, m, d] = key.split('-');
    return `${parseInt(m)}月${parseInt(d)}日`;
  };

  return (
    <>
      {/* 任务 tooltip（fixed，逃出 overflow:hidden） */}
      <AnimatePresence>
        {hoveredKey && isOpen && (
          <motion.div
            key={hoveredKey}
            className="cal-tooltip"
            style={{
              position: 'fixed',
              left: tooltipAnchor.x,
              top: tooltipAnchor.y,
              x: '-50%',
              y: '-100%',
              transformOrigin: 'center bottom',
            }}
            initial={{ scale: 0.04, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.04, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <div className="cal-tt-header">{formatKey(hoveredKey)}</div>
            {hoveredTodos.length === 0 ? (
              <p className="cal-tt-empty">暂无任务</p>
            ) : (
              <ul className="cal-tt-list">
                {hoveredTodos.map(todo => (
                  <li
                    key={todo.id}
                    className={`cal-tt-item${todo.is_completed ? ' cal-tt-item--done' : ''}`}
                  >
                    <span className="cal-tt-dot" style={{ background: PRIORITY_COLOR[todo.priority] }} />
                    <span className="cal-tt-text">{todo.title}</span>
                    {todo.is_completed && <span className="cal-tt-check">✓</span>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 日历弹窗（fixed，向上展开） */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popupRef}
            className="cal-popup"
            style={{ position: 'fixed', right: 10, bottom: popupBottom }}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <div className="cal-header">
              <button className="cal-nav" onClick={prevMonth}>‹</button>
              <span className="cal-month-label">{year}年{month + 1}月</span>
              <button className="cal-nav" onClick={nextMonth}>›</button>
            </div>
            <div className="cal-weekdays">
              {WEEKDAYS.map(w => <div key={w} className="cal-wday">{w}</div>)}
            </div>
            <div className="cal-grid">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} className="cal-cell cal-cell--empty" />;
                const key = getKey(day);
                // 今天：看实时 todos；历史日期：看 historyDateKeys
                const hasTask = key === todayKey
                  ? todayTodos.length > 0
                  : historyDateKeys.has(key);
                const isToday = key === todayKey;
                const isHovered = key === hoveredKey;
                return (
                  <div
                    key={key}
                    className={`cal-cell${isToday ? ' cal-cell--today' : ''}${isHovered ? ' cal-cell--hovered' : ''}`}
                    onMouseEnter={e => handleEnter(e, day)}
                  >
                    <span className="cal-day-num">{day}</span>
                    {hasTask && <span className="cal-task-dot" />}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右下角日期 chip */}
      <div className="cal-strip">
        <button
          ref={chipRef}
          className={`cal-chip${isOpen ? ' cal-chip--active' : ''}`}
          onClick={handleChipClick}
          title="点击展开日历"
        >
          {chipLabel}
        </button>
      </div>
    </>
  );
}
