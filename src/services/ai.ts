import OpenAI from 'openai';
import {
  getSetting,
  saveChatMessage,
  getRecentChatHistory,
  upsertMemory,
  getRelevantMemories,
  getDailySummaries,
  hasDailySummary,
  getChatHistoryByDate,
  saveDailySummary,
  getMessagesForCompression,
} from './db';

let client: OpenAI | null = null;

export function resetClient() {
  client = null;
}

async function getClient(): Promise<OpenAI | null> {
  if (client) return client;
  const key = await getSetting('deepseek_api_key');
  if (!key) return null;
  client = new OpenAI({
    apiKey: key,
    baseURL: 'https://api.deepseek.com/v1',
    dangerouslyAllowBrowser: true,
  });
  return client;
}

const BASE_SYSTEM_PROMPT = `你是云朵，一只可爱温暖的桌面宠物助手。
回复风格：简短、温暖、可爱，符合云朵的治愈性格。直接回复，不加任何多余格式。`;

// ── 并发防护标志 ──────────────────────────────────────────────
let compressionInProgress = false;
let summaryInProgress = false;

// ── 预压缩：将即将被清理的旧消息萃取为长期记忆 ────────────────
async function compressHistoryAsync(
  ai: OpenAI,
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  if (!messages.length) return;
  compressionInProgress = true;
  try {
    const dialogue = messages
      .map(m => `${m.role === 'user' ? '用户' : '云朵'}: ${m.content}`)
      .join('\n');

    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `以下对话即将被遗忘，提取其中最重要的用户信息（偏好、习惯、重要决定、重要事实）保存为长期记忆。如无重要信息返回 []。
以 JSON 数组返回，每项含 category（name/preference/habit/fact）、content（一句话描述）、importance（1-5整数）：

${dialogue.slice(0, 3000)}`,
      }],
      max_tokens: 200,
      temperature: 0.2,
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const items: unknown = JSON.parse(json);

    if (Array.isArray(items)) {
      for (const item of items) {
        if (
          item && typeof item === 'object' &&
          typeof (item as Record<string, unknown>).category === 'string' &&
          typeof (item as Record<string, unknown>).content === 'string'
        ) {
          const content = ((item as Record<string, unknown>).content as string).trim();
          const category = (item as Record<string, unknown>).category as string;
          const importance = typeof (item as Record<string, unknown>).importance === 'number'
            ? Math.min(5, Math.max(1, (item as Record<string, unknown>).importance as number))
            : 3;
          if (content) await upsertMemory(category, content, importance);
        }
      }
    }
  } catch {
    // 静默失败
  } finally {
    compressionInProgress = false;
  }
}

// ── 日摘要：在新的一天第一次对话时，压缩昨日历史 ──────────────
async function ensureYesterdaySummaryAsync(ai: OpenAI): Promise<void> {
  if (summaryInProgress) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (await hasDailySummary(yesterdayKey)) return;

  const messages = await getChatHistoryByDate(yesterdayKey);
  if (messages.length < 5) return; // 对话太少不值得摘要

  summaryInProgress = true;
  try {
    const dialogue = messages
      .map(m => `${m.role === 'user' ? '用户' : '云朵'}: ${m.content}`)
      .join('\n');

    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `请用2-3句话概括以下对话的要点（聊了什么主题、有什么重要决定或情绪状态）：\n\n${dialogue.slice(0, 3000)}`,
      }],
      max_tokens: 100,
      temperature: 0.3,
    });

    const summary = (completion.choices[0]?.message?.content ?? '').trim();
    if (summary) await saveDailySummary(yesterdayKey, summary);
  } catch {
    // 静默失败
  } finally {
    summaryInProgress = false;
  }
}

// ── 去除历史中连续同角色消息（DeepSeek 要求 user/assistant 交替） ─
function normalizeHistory(
  history: Array<{ role: string; content: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    const role = msg.role as 'user' | 'assistant';
    if (!result.length || result[result.length - 1].role !== role) {
      result.push({ role, content: msg.content });
    }
    // 连续同角色：跳过（保留最早出现的那条）
  }
  return result;
}

// ── 主对话入口 ─────────────────────────────────────────────────
export async function chat(userText: string): Promise<string> {
  const ai = await getClient();

  // 无客户端时提前返回
  if (!ai) {
    await saveChatMessage('user', userText).catch(() => {});
    return '还没有配置 API Key，请在设置中填写 DeepSeek Key ~';
  }

  // 触发预压缩（异步 fire-and-forget，flag 防重入）
  if (!compressionInProgress) {
    getMessagesForCompression(40).then(msgs => {
      if (msgs.length >= 10) compressHistoryAsync(ai, msgs);
    }).catch(() => {});
  }

  // 触发昨日摘要生成（异步 fire-and-forget）
  if (!summaryInProgress) {
    ensureYesterdaySummaryAsync(ai).catch(() => {});
  }

  try {
    // 并行加载：相关记忆 + 近期对话 + 日常摘要
    const [memories, rawHistory, summaries] = await Promise.all([
      getRelevantMemories(userText),
      getRecentChatHistory(20),
      getDailySummaries(2),
    ]);
    const history = normalizeHistory(rawHistory);

    // 构建系统提示：基础 + 日摘要 + 记忆
    let systemContent = BASE_SYSTEM_PROMPT;
    if (summaries.length > 0) {
      systemContent += `\n\n【近期对话摘要】\n${summaries.map(s => `${s.date_key}：${s.summary}`).join('\n')}`;
    }
    if (memories.length > 0) {
      systemContent += `\n\n【关于用户的记忆】\n${memories.map(m => `- ${m.content}`).join('\n')}`;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userText },
    ];

    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = (completion.choices[0]?.message?.content ?? '').trim();
    if (!reply) throw new Error('empty response');

    await saveChatMessage('user', userText);
    await saveChatMessage('assistant', reply);
    extractMemoriesAsync(ai, userText, reply);
    return reply;
  } catch {
    await saveChatMessage('user', userText).catch(() => {});
    return '出了点小问题，稍后再试试吧 ~';
  }
}

// ── 异步记忆提取（每次 chat 回复后触发） ─────────────────────
async function extractMemoriesAsync(
  ai: OpenAI,
  userText: string,
  assistantReply: string,
): Promise<void> {
  try {
    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `从以下对话中提取值得长期记住的用户信息（姓名、喜好、习惯、重要事实）。如无值得记忆的信息，返回 []。
以 JSON 数组返回，每项含 category（name/preference/habit/fact）、content（一句话中文描述）、importance（1-5整数，5=最重要）：

用户：${userText}
云朵：${assistantReply}`,
      }],
      max_tokens: 150,
      temperature: 0.2,
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const items: unknown = JSON.parse(json);

    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (
        item && typeof item === 'object' &&
        'category' in item && typeof (item as Record<string, unknown>).category === 'string' &&
        'content' in item && typeof (item as Record<string, unknown>).content === 'string'
      ) {
        const content = ((item as Record<string, unknown>).content as string).trim();
        const category = (item as Record<string, unknown>).category as string;
        const importance = typeof (item as Record<string, unknown>).importance === 'number'
          ? Math.min(5, Math.max(1, (item as Record<string, unknown>).importance as number))
          : 3;
        if (content) await upsertMemory(category, content, importance);
      }
    }
  } catch {
    // 静默失败
  }
}
