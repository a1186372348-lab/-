// OpenClaw 桥接服务
interface BridgeTask {
  action: string;
  payload: any;
}

interface ClaudeEvent {
  hook_event_name: string;
  tool_name?: string | null;
  tool_input?: any;
}

let pollingInterval: number | null = null;
let lastReplyTime = 0;
const REPLY_DEDUP_MS = 5000; // 5 秒内的重复回复丢弃

// 处理来自 OpenClaw 的任务
function processBridgeTask(task: BridgeTask) {
  switch (task.action) {
    case 'chat':
      if (task.payload?.message) {
        const now = Date.now();
        if (now - lastReplyTime < REPLY_DEDUP_MS) break; // 去重
        lastReplyTime = now;
        window.dispatchEvent(new CustomEvent('bridge-message', {
          detail: { message: task.payload.message }
        }));
      }
      break;

    default:
      console.warn('[Bridge] 未知任务类型:', task.action);
  }
}

// 轮询获取任务
async function pollTasks() {
  try {
    const response = await fetch('http://127.0.0.1:3456/tasks');
    if (!response.ok) return;

    const tasks: BridgeTask[] = await response.json();
    for (const task of tasks) {
      processBridgeTask(task);
    }
  } catch {
    // 静默失败
  }
}

// 轮询获取 Claude Code 工作状态事件
async function pollClaudeEvents() {
  try {
    const response = await fetch('http://127.0.0.1:3456/claude-events');
    if (!response.ok) return;

    const events: ClaudeEvent[] = await response.json();
    for (const event of events) {
      window.dispatchEvent(new CustomEvent('claude-event', { detail: event }));
    }
  } catch {
    // 静默失败
  }
}

// 启动桥接服务
export function startBridgeService() {
  if (pollingInterval) return;
  pollingInterval = window.setInterval(() => {
    pollTasks();
    pollClaudeEvents();
  }, 2000);
}

// 停止桥接服务
export function stopBridgeService() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

