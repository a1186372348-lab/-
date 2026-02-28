import OpenAI from 'openai';
import { AiResponse } from '../types';
import { getSetting } from './db';

let client: OpenAI | null = null;

async function getClient(): Promise<OpenAI | null> {
  if (!client) {
    const apiKey = await getSetting('deepseek_api_key');
    if (!apiKey) return null;
    client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  return client;
}

// 重置客户端（修改 API Key 后调用）
export function resetClient() {
  client = null;
}

const SYSTEM_PROMPT = `你是一只可爱的云朵桌面宠物助手，名字叫"云宝"。你的任务是：
1. 理解用户的意图，判断是：创建待办(create_todo)、查询待办(query_todo)、还是普通闲聊(chat)
2. 用温暖、可爱、简短的语气回复（不超过40字）

请严格按照以下 JSON 格式回复，不要添加任何其他文字：
{
  "intent": "create_todo" | "query_todo" | "chat",
  "reply": "你的回复文字",
  "todo": {
    "title": "任务标题（仅 intent 为 create_todo 时必填）",
    "priority": "high" | "medium" | "low"
  }
}

优先级判断规则：
- 含"紧急"、"马上"、"立刻"、"今天必须"、"ASAP" → high
- 含"重要"、"尽快"、"这周"→ medium
- 其他 → low`;

export async function processInput(userText: string): Promise<AiResponse> {
  const ai = await getClient();
  if (!ai) {
    return { intent: 'chat', reply: '请先在设置中填入 DeepSeek API Key，才能和我对话哦～' };
  }

  const completion = await ai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    temperature: 0.7,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(raw);
    return {
      intent: parsed.intent ?? 'chat',
      reply: parsed.reply ?? '嗯嗯，我听到啦～',
      todo: parsed.todo,
    };
  } catch {
    return {
      intent: 'chat',
      reply: '哎呀，我有点没听清，再说一遍？',
    };
  }
}
