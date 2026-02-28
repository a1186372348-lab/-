import { Todo } from '../types';
import { updateReminderTime, fetchTodos } from './db';

function shouldRemind(todo: Todo, cooldownMs: number): boolean {
  if (!todo.last_reminded_at) return true;
  const age = Date.now() - new Date(todo.last_reminded_at).getTime();
  return age >= cooldownMs;
}

export function startReminderService(
  onRemind: (todo: Todo) => void,
  getIntervalMinutes: () => number
) {
  let timer: ReturnType<typeof setTimeout>;

  const schedule = () => {
    const intervalMs = getIntervalMinutes() * 60 * 1000;
    timer = setTimeout(async () => {
      const todos = await fetchTodos();
      const pending = todos.filter((t) => !t.is_completed);

      if (pending.length > 0) {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const target = pending
          .filter((t) => shouldRemind(t, intervalMs))
          .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])[0];

        if (target) {
          await updateReminderTime(target.id);
          onRemind(target);
        }
      }

      schedule();
    }, intervalMs);
  };

  schedule();

  return () => clearTimeout(timer);
}
