import OpenAI from 'openai';

let client: OpenAI | null = null;

// 重置客户端（修改 API Key 后调用）
export function resetClient() {
  client = null;
}
