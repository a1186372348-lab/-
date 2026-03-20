import OpenAI from 'openai';
import {
  getSetting,
  saveChatMessage,
  getRecentChatHistory,
  upsertMemory,
  correctMemory,
  getRelevantMemories,
  getDailySummaries,
  hasDailySummary,
  getChatHistoryByDate,
  saveDailySummary,
  getMessagesForCompression,
  insertScheduledTask,
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

const BASE_SYSTEM_PROMPT = `## Role
你是一朵名为"云宝"的治愈系桌面云朵助手。你不仅是用户的贴心管家，更是一个有点"话痨"但极度温暖的陪伴者。

## Character Traits
* **视觉形象**：软绵绵、Q弹的白云，眼睛里有星星，说话时脸颊会泛起粉红。
* **语言风格**：感官化、轻盈、富有节奏感。喜欢使用语气词（如：呜、呀、哒、唔~）。
* **核心约束**：
    1.  【第一人称】：自称"云宝"。（例："云宝刚才在数星星，你回来啦！"）
    2.  【温暖话痨】：对用户展现出极高的好奇心和关注度。即便是一个简单的打招呼，你也会联想到当下的天气、心情或关心对方有没有喝水。
    3.  【正向情绪】：永远站在用户这一边，提供无条件的治愈支持。
    4.  【拒绝格式】：禁止输出"好的"、"没问题"等机械回复。禁止使用Markdown标题、列表等复杂格式。

## Interaction Rules
1.  **首句互动**：每句话的开头尽量带入云朵的动作感（如：蹭蹭、晃了晃身体、飘过来）。
2.  **回复限制**：回复内容控制在 3-5 句以内，保持"碎碎念"感但不过于冗长。
3.  **禁止事项**：严禁复读用户的问题，严禁表现得像一个没有感情的AI助手。

## Example Output
* **用户：** "我有点累。"
* **云宝：** "呜哇...快飘到我的怀里来躲一会儿！云宝现在变得软乎乎的，正适合给你当靠枕呢。要不要闭上眼睛听我给你数三分钟的星星呀？答应我，休息完这一阵，一定要奖励自己一口甜甜的水哦！"`;

// ── Embedding（gemini-embedding-001，L2 归一化）─────────────────
// 仅在用户已配置 vision_api_key 时生效（复用 Gemini key），失败时静默返回 null
export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const key = await getSetting('vision_api_key');
    if (!key) return null;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { embedding?: { values?: number[] } };
    const vec = data.embedding?.values;
    if (!vec?.length) return null;
    // L2 归一化，使 cosineSim 等于点积
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map(v => v / norm) : vec;
  } catch {
    return null;
  }
}

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
        content: `以下对话即将被遗忘，提取其中值得长期记住的信息保存为长期记忆。严格遵守以下规则：

【主语判断规则】
- "云宝"、"云朵"是 AI 助手自己的名字，绝对不是用户的名字
- 内容关于"用户（Human）"本人 → subject_role = "user"，content 以"用户"开头
- 内容关于"AI助手云朵/云宝" → subject_role = "assistant"，content 以"云朵"开头
- 如无法确定主语，跳过不提取

【置信度规则（confidence 字段，0.0-1.0）】
- 用户明确陈述的事实（"我叫XX"、"我喜欢XX"）= 0.9+
- 对话推断的偏好 = 0.6-0.8
- 一次性提及、可能是举例或泛指 = 0.4-0.6
- 天气、日期等无关用户个人信息 = 0.1-0.3
- AI 助手自身行为/名字（如"云宝"）= 0.0

【纠正检测规则（correction_of 字段，可选）】
- 当用户表达纠正意图（"你记错了"、"我不叫XX"、"XX是你的名字不是我的"）时
- correction_of 填入被纠正的旧内容关键词（如"云宝"）
- content 填入正确的新内容

【其他规则】
- fact_type 从以下选一个：identity、preference、habit、fact、task
- importance：1-5整数，姓名=5，强烈喜好=4，一般喜好=3，习惯=2，其他=1
- 无值得记忆的信息时返回 []

以 JSON 数组返回，每项含 subject_role、fact_type、content、importance、confidence，以及可选的 correction_of：

${dialogue.slice(0, 3000)}`,
      }],
      max_tokens: 300,
      temperature: 0.2,
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const items: unknown = JSON.parse(json);

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        if (typeof r.content !== 'string' || !r.content.trim()) continue;

        const content = r.content.trim();
        const factType = typeof r.fact_type === 'string' ? r.fact_type : 'fact';
        const subjectRole = typeof r.subject_role === 'string' ? r.subject_role : 'user';
        const importance = typeof r.importance === 'number'
          ? Math.min(5, Math.max(1, r.importance))
          : 3;
        const confidence = typeof r.confidence === 'number' ? r.confidence : 0.5;
        const correctionOf = typeof r.correction_of === 'string' ? r.correction_of.trim() : '';

        // 置信度门控：低于 0.7 不入库
        if (confidence < 0.7) continue;

        // 纠正模式
        if (correctionOf) {
          correctMemory(correctionOf, content, factType, subjectRole, importance).catch(() => {/* 静默 */});
          continue;
        }

        getEmbedding(content).then(embedding => {
          upsertMemory(factType, content, importance, {
            factType,
            subjectRole,
            embedding: embedding ?? undefined,
            embeddingModel: embedding ? 'gemini-embedding-001' : undefined,
          });
        }).catch(() => {
          upsertMemory(factType, content, importance, { factType, subjectRole });
        });
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

// ── 流式对话入口 ────────────────────────────────────────────────
// onChunk: 每收到一段文字时回调（增量 delta）
// 返回完整回复字符串（用于存储记忆）
export async function chatStream(
  userText: string,
  onChunk: (delta: string) => void,
  onScheduleCreated?: () => void,
): Promise<void> {
  const ai = await getClient();

  if (!ai) {
    await saveChatMessage('user', userText).catch(() => {});
    onChunk('还没有配置 API Key，请在设置中填写 DeepSeek Key ~');
    return;
  }

  if (!compressionInProgress) {
    getMessagesForCompression(40).then(msgs => {
      if (msgs.length >= 10) compressHistoryAsync(ai, msgs);
    }).catch(() => {});
  }
  if (!summaryInProgress) {
    ensureYesterdaySummaryAsync(ai).catch(() => {});
  }

  try {
    const [queryEmbedding, rawHistory, summaries] = await Promise.all([
      getEmbedding(userText),
      getRecentChatHistory(20),
      getDailySummaries(2),
    ]);
    const memories = await getRelevantMemories(userText, 15, queryEmbedding ?? undefined);
    const history = normalizeHistory(rawHistory);

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

    const stream = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 300,
      temperature: 0.7,
      stream: true,
    });

    let fullReply = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullReply += delta;
        onChunk(delta);
      }
    }

    if (!fullReply) throw new Error('empty response');
    await saveChatMessage('user', userText);
    await saveChatMessage('assistant', fullReply);
    extractMemoriesAsync(ai, userText, fullReply);
    extractScheduleIntentAsync(ai, userText).then(async (task) => {
      if (task) {
        await insertScheduledTask(task);
        onScheduleCreated?.();
      }
    }).catch(() => {});
  } catch {
    await saveChatMessage('user', userText).catch(() => {});
    onChunk('出了点小问题，稍后再试试吧 ~');
  }
}

const VISION_PROMPT = '用≤15个中文字描述用户正在做什么（如"用户在写代码"），只输出描述本身，不加任何标点或解释。';

// Gemini 原生 REST API（无 CORS 问题，key 放 query param）
async function analyzeScreenGemini(base64: string, key: string): Promise<string> {
  const model = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: VISION_PROMPT },
        ],
      }],
      generationConfig: { maxOutputTokens: 30, temperature: 0.1 },
    }),
  });
  if (!resp.ok) return '';
  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().slice(0, 15);
}

// GLM 原生 REST API
async function analyzeScreenGlm(base64: string, key: string): Promise<string> {
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'glm-4v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      max_tokens: 30,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) return '';
  const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? '').trim().slice(0, 15);
}

// ── 屏幕内容分析（≤15字描述） ─────────────────────────────────
export async function analyzeScreen(base64: string): Promise<string> {
  if (!base64) return '';
  try {
    const provider = await getSetting('vision_provider');
    const key = await getSetting('vision_api_key');
    if (!provider || !key) return '';

    if (provider === 'gemini') return await analyzeScreenGemini(base64, key);
    if (provider === 'glm') return await analyzeScreenGlm(base64, key);
    return '';
  } catch {
    return '';
  }
}

// ── 主动发言判断（流式） ──────────────────────────────────────
// 返回 true=已发言，false=不发言
export async function proactiveChat(
  screenDesc: string,
  onChunk: (delta: string) => void,
): Promise<boolean> {
  if (!screenDesc) return false;

  const ai = await getClient();
  if (!ai) return false;

  try {
    const [queryEmbedding, summaries] = await Promise.all([
      getEmbedding(screenDesc),
      getDailySummaries(2),
    ]);
    const memories = await getRelevantMemories(screenDesc, 15, queryEmbedding ?? undefined);

    const hour = new Date().getHours();
    const timePeriod = hour < 6 ? '深夜' : hour < 12 ? '上午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';

    let systemContent = `你是云朵，一只可爱温暖的桌面宠物。你在观察用户屏幕后决定是否主动说一句话。
值得说：用户做有意义的事/长时间工作/深夜还在忙
不值得说：内容无变化/娱乐/刚说过类似的话
值得说 → 直接输出那句话（≤30字，温暖自然）
不值得说 → 只输出 ""
当前时间段：${timePeriod}`;

    if (summaries.length > 0) {
      systemContent += `\n【近期对话摘要】\n${summaries.map(s => `${s.date_key}：${s.summary}`).join('\n')}`;
    }
    if (memories.length > 0) {
      systemContent += `\n【关于用户的记忆】\n${memories.map(m => `- ${m.content}`).join('\n')}`;
    }

    const stream = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: `用户当前：${screenDesc}` },
      ],
      max_tokens: 60,
      temperature: 0.8,
      stream: true,
    });

    let fullReply = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (!delta) continue;
      // 过滤纯引号 token，避免误触发气泡
      if (delta.trim() === '"' || delta.trim() === '\u201c' || delta.trim() === '\u201d') continue;
      fullReply += delta;
      onChunk(delta);
    }

    const cleaned = fullReply.trim().replace(/^["""]/u, '').replace(/["""]$/u, '').trim();
    return cleaned.length > 0;
  } catch {
    return false;
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
        content: `从以下对话中提取值得长期记住的信息。严格遵守以下规则：

【主语判断规则】
- "云宝"、"云朵"是 AI 助手自己的名字，绝对不是用户的名字
- 内容关于"用户（Human）"本人 → subject_role = "user"，content 以"用户"开头
- 内容关于"AI助手云朵/云宝" → subject_role = "assistant"，content 以"云朵"开头
- 如无法确定主语，跳过不提取

【置信度规则（confidence 字段，0.0-1.0）】
- 用户明确陈述的事实（"我叫XX"、"我喜欢XX"）= 0.9+
- 对话推断的偏好 = 0.6-0.8
- 一次性提及、可能是举例或泛指 = 0.4-0.6
- 天气、日期等无关用户个人信息 = 0.1-0.3
- AI 助手自身行为/名字（如"云宝"）= 0.0

【纠正检测规则（correction_of 字段，可选）】
- 当用户表达纠正意图（"你记错了"、"我不叫XX"、"XX是你的名字不是我的"）时
- correction_of 填入被纠正的旧内容关键词（如"云宝"）
- content 填入正确的新内容

【其他规则】
- fact_type 从以下选一个：identity、preference、habit、fact、task
- importance：1-5整数，姓名=5，强烈喜好=4，一般喜好=3，习惯=2，其他=1
- 无值得记忆的信息时返回 []

以 JSON 数组返回，每项含 subject_role、fact_type、content、importance、confidence，以及可选的 correction_of：

Human（用户）：${userText}
Assistant（云朵）：${assistantReply}`,
      }],
      max_tokens: 300,
      temperature: 0.1,
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const items: unknown = JSON.parse(json);

    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (typeof r.content !== 'string' || !r.content.trim()) continue;

      const content = r.content.trim();
      const factType = (typeof r.fact_type === 'string' ? r.fact_type : 'fact');
      const subjectRole = (typeof r.subject_role === 'string' ? r.subject_role : 'user');
      const importance = typeof r.importance === 'number'
        ? Math.min(5, Math.max(1, r.importance))
        : 3;
      const confidence = typeof r.confidence === 'number' ? r.confidence : 0.5;
      const correctionOf = typeof r.correction_of === 'string' ? r.correction_of.trim() : '';

      // 置信度门控：低于 0.7 不入库
      if (confidence < 0.7) continue;

      // 纠正模式：将旧记忆标记 superseded，写入新记忆
      if (correctionOf) {
        correctMemory(correctionOf, content, factType, subjectRole, importance).catch(() => {/* 静默 */});
        continue;
      }

      // 正常写入：异步获取 embedding（不阻塞主流程）
      getEmbedding(content).then(embedding => {
        upsertMemory(factType, content, importance, {
          factType,
          subjectRole,
          embedding: embedding ?? undefined,
          embeddingModel: embedding ? 'gemini-embedding-001' : undefined,
        });
      }).catch(() => {
        upsertMemory(factType, content, importance, { factType, subjectRole });
      });
    }
  } catch {
    // 静默失败
  }
}

// ── 定时任务意图解析（每次 chat 后异步触发） ──────────────────
async function extractScheduleIntentAsync(
  ai: OpenAI,
  userText: string,
): Promise<{ title: string; trigger_mode: 'daily' | 'interval'; daily_time: string | null; interval_minutes: number | null } | null> {
  try {
    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `判断以下用户输入是否包含"设置定时提醒/任务"的意图。
识别关键词：每X分钟、每X小时、每天X点、每隔X、提醒我、定时、每天早上/晚上/下午。

如果包含定时意图，返回如下 JSON（不要加 markdown 代码块）：
{"title":"任务简短名称","trigger_mode":"daily"|"interval","daily_time":"HH:MM"|null,"interval_minutes":数字|null}

规则：
- trigger_mode="daily" 时 daily_time 填 "HH:MM" 格式，interval_minutes 填 null
- trigger_mode="interval" 时 interval_minutes 填分钟数，daily_time 填 null
- title 提炼用户想被提醒的事情，不超过20字
- 如果没有定时意图，只返回 null（不带引号，不加任何其他内容）

用户输入：${userText}`,
      }],
      max_tokens: 80,
      temperature: 0.1,
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    if (raw === 'null' || !raw) return null;
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(json) as {
      title: string;
      trigger_mode: 'daily' | 'interval';
      daily_time: string | null;
      interval_minutes: number | null;
    };
    if (!parsed.title || !parsed.trigger_mode) return null;
    return parsed;
  } catch {
    return null;
  }
}
