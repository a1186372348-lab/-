import { Todo } from '../types';
import { updateReminderTime } from './db';

const COOLDOWN_MS = 60 * 60 * 1000; // 60分钟冷却

function randomIntervalMs(): number {
  // 30~90 分钟随机
  const minutes = 30 + Math.random() * 60;
  return minutes * 60 * 1000;
}

function shouldRemind(todo: Todo): boolean {
  if (!todo.last_reminded_at) return true;
  const age = Date.now() - new Date(todo.last_reminded_at).getTime();
  return age >= COOLDOWN_MS;
}

export function startReminderService(
  getTodos: () => Todo[],
  onRemind: (todo: Todo) => void
) {
  let timer: ReturnType<typeof setTimeout>;

  const schedule = () => {
    timer = setTimeout(async () => {
      const todos = getTodos();
      const pending = todos.filter((t) => !t.is_completed);

      if (pending.length > 0) {
        // 取最高优先级
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const target = pending
          .filter(shouldRemind)
          .sort(
            (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
          )[0];

        if (target) {
          await updateReminderTime(target.id);
          onRemind(target);
        }
      }

      schedule(); // 重新排队
    }, randomIntervalMs());
  };

  schedule();

  return () => clearTimeout(timer);
}
