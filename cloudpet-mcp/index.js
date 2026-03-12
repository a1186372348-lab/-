import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BRIDGE_URL = 'http://127.0.0.1:3456';

const server = new McpServer({
  name: 'cloudpet',
  version: '1.0.0',
});

// 工具1：获取云朵用户的输入消息
server.tool(
  'get_user_input',
  '获取来自云朵助手的用户输入消息。当用户在云朵输入框发送消息时，通过此工具获取消息内容并进行处理。',
  {},
  async () => {
    const res = await fetch(`${BRIDGE_URL}/user-input`);
    const inputs = await res.json();

    if (inputs.length === 0) {
      return {
        content: [{ type: 'text', text: '当前没有待处理的用户消息' }],
      };
    }

    const messages = inputs.map(i => i.message).join('\n');
    return {
      content: [{ type: 'text', text: messages }],
    };
  }
);

// 工具2：将回复推送到云朵显示
server.tool(
  'send_reply',
  '将回复消息推送到云朵助手，以气泡形式显示给用户。处理完用户请求后，调用此工具返回结果。',
  { message: z.string().describe('要在云朵气泡中显示的回复内容') },
  async ({ message }) => {
    await fetch(`${BRIDGE_URL}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', payload: { message } }),
    });

    return {
      content: [{ type: 'text', text: `已发送到云朵：${message}` }],
    };
  }
);

// 启动 stdio 传输
const transport = new StdioServerTransport();
await server.connect(transport);
