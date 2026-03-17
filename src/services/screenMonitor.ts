import { invoke } from '@tauri-apps/api/core';
import { analyzeScreen, proactiveChat } from './ai';
import { upsertMemory, getRelevantMemories } from './db';

const SCREENSHOT_INTERVAL_MS = 30_000;
const MIN_SPEAK_INTERVAL_MS = 3 * 60_000;
const SCREEN_MEMORY_INTERVAL_MS = 10 * 60_000;

// 模块级单例状态
let intervalId: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let lastSpeakAt = 0;
let lastMemoryAt = 0;
let lastHash = '';

// 快速去重：取 base64 首尾80字符+长度
function quickHash(base64: string): string {
  const len = base64.length;
  return `${len}:${base64.slice(0, 80)}:${base64.slice(-80)}`;
}

// 屏幕习惯记忆归纳（每10分钟触发一次）
async function maybeStoreScreenMemory(screenDesc: string): Promise<void> {
  const now = Date.now();
  if (now - lastMemoryAt < SCREEN_MEMORY_INTERVAL_MS) return;
  if (!screenDesc) return;
  lastMemoryAt = now;

  try {
    // 避免重复存储相似内容
    const existing = await getRelevantMemories(screenDesc, 3);
    const alreadyKnown = existing.some(m => m.content.includes(screenDesc.slice(0, 8)));
    if (alreadyKnown) return;

    await upsertMemory('screen_habit', screenDesc, 2);
  } catch {
    // 静默失败
  }
}

export interface ScreenMonitorCallbacks {
  getDisturbMode: () => number;
  isUserTyping: () => boolean;
  onSpeak: (text: string) => void;   // 第一个 chunk 到达，打开气泡
  onChunk: (delta: string) => void;  // 后续 chunk 追加
  onDone: () => void;                // 流结束，启动倒计时
}

async function runOnce(callbacks: ScreenMonitorCallbacks): Promise<void> {
  // disturbMode=2（全屏游戏）跳过
  if (callbacks.getDisturbMode() === 2) return;

  // 用户正在输入时不打扰
  if (callbacks.isUserTyping()) return;

  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. 截图
    const base64: string = await invoke('take_screenshot');
    if (!base64) return;

    // 2. 去重：静止屏幕跳过
    const hash = quickHash(base64);
    if (hash === lastHash) return;
    lastHash = hash;

    // 3. 节流：距上次发言不足3分钟跳过
    if (Date.now() - lastSpeakAt < MIN_SPEAK_INTERVAL_MS) return;

    // 4. 视觉分析
    const screenDesc = await analyzeScreen(base64);
    if (!screenDesc) return;

    // 归纳屏幕习惯记忆（异步，不阻塞）
    maybeStoreScreenMemory(screenDesc).catch(() => {});

    // 再次检查用户是否开始输入
    if (callbacks.isUserTyping()) return;
    if (isProcessing && callbacks.getDisturbMode() === 2) return;

    // 5. proactiveChat：收集完整回复后一次性显示，避免流式竞态导致半句话
    const chunks: string[] = [];
    const spoke = await proactiveChat(screenDesc, (delta) => {
      chunks.push(delta);
    });

    if (spoke && chunks.length > 0) {
      lastSpeakAt = Date.now();
      callbacks.onSpeak(chunks.join(''));
      callbacks.onDone();
    }
  } catch {
    // 静默失败
  } finally {
    isProcessing = false;
  }
}

export function startScreenMonitor(callbacks: ScreenMonitorCallbacks): () => void {
  if (intervalId) return stopScreenMonitor;

  intervalId = setInterval(() => {
    runOnce(callbacks).catch(() => {});
  }, SCREENSHOT_INTERVAL_MS);

  return stopScreenMonitor;
}

export function stopScreenMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isProcessing = false;
}
