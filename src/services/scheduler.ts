import { ScheduledTask } from '../types';
import { fetchScheduledTasks, updateScheduledTaskLastTriggered } from './db';

const POLL_INTERVAL_MS = 60_000; // 每 60 秒轮询一次

/** 判断 daily 任务是否应该触发
 *  条件：当前 HH:MM 与 daily_time 匹配，且今日尚未触发 */
function shouldTriggerDaily(task: ScheduledTask): boolean {
  if (!task.daily_time) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== task.daily_time) return false;

  if (!task.last_triggered_at) return true;
  const lastDate = new Date(task.last_triggered_at).toDateString();
  const todayDate = now.toDateString();
  return lastDate !== todayDate; // 今日尚未触发
}

/** 判断 interval 任务是否应该触发
 *  条件：距 last_triggered_at 超过 interval_minutes */
function shouldTriggerInterval(task: ScheduledTask): boolean {
  if (!task.interval_minutes || task.interval_minutes <= 0) return false;
  if (!task.last_triggered_at) return true;
  const elapsed = (Date.now() - new Date(task.last_triggered_at).getTime()) / 60_000;
  return elapsed >= task.interval_minutes;
}

export function startSchedulerService(
  onTrigger: (task: ScheduledTask) => void
): () => void {
  const tick = async () => {
    try {
      const tasks = await fetchScheduledTasks();
      for (const task of tasks) {
        if (!task.is_enabled) continue;
        let triggered = false;
        if (task.trigger_mode === 'daily') {
          triggered = shouldTriggerDaily(task);
        } else if (task.trigger_mode === 'interval') {
          triggered = shouldTriggerInterval(task);
        }
        if (triggered) {
          // 先写 last_triggered_at，防止重复触发
          await updateScheduledTaskLastTriggered(task.id);
          onTrigger({ ...task, last_triggered_at: new Date().toISOString() });
        }
      }
    } catch {
      // 静默失败，下一轮再试
    }
  };

  const timer = setInterval(tick, POLL_INTERVAL_MS);
  // 启动后首次轮询延迟 5 秒，避免冷启动时数据库还未就绪
  const startupTimer = setTimeout(tick, 5_000);

  return () => {
    clearInterval(timer);
    clearTimeout(startupTimer);
  };
}
