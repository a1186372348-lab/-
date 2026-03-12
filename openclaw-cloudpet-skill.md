# OpenClaw CloudPet Bridge Skill

这是一个连接 OpenClaw 和云朵助手的桥接 skill。

## 安装方法

1. 在 OpenClaw 中创建新的 skill
2. 将以下代码保存为 skill 文件

## Skill 代码示例

```typescript
// cloudpet-bridge.ts
import { defineSkill } from '@openclaw/sdk';

export default defineSkill({
  name: 'cloudpet-bridge',
  description: '连接到云朵助手，让 OpenClaw 能够控制桌面宠物',

  async execute(context) {
    const { message } = context.params;

    // 发送消息到云朵助手
    const response = await fetch('http://127.0.0.1:3456/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'chat',
        payload: { message }
      })
    });

    const result = await response.json();

    if (result.success) {
      return {
        success: true,
        message: '已发送到云朵助手'
      };
    } else {
      throw new Error('发送失败');
    }
  }
});
```

## 使用方法

在 OpenClaw 中调用：

```
使用 cloudpet-bridge skill 发送消息 "你好"
```

## API 端点

云朵助手提供以下端点：

- `GET /health` - 健康检查
- `POST /task` - 提交任务
  ```json
  {
    "action": "chat",
    "payload": { "message": "你好" }
  }
  ```
- `GET /tasks` - 获取待处理任务

## 下一步

1. 在云朵前端添加轮询逻辑，定期获取 `/tasks` 中的任务
2. 处理任务并显示在云朵界面
3. 完善 skill 功能，支持更多操作（创建待办、查询天气等）
