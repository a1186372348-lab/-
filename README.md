# 云宝助手

一只始终陪伴在桌面的云朵宠物助手，用温度与智能把日常琐事变得轻盈有趣。

## 简介

云宝助手是一款基于 **Tauri 2 + React + TypeScript** 开发的桌面宠物应用。云朵形象常驻桌面右上角，支持自然语言对话、智能待办管理、天气联动动态形象，以及低干扰自动半透明模式。

## 功能特性

- **云朵角色** — 始终置顶、透明背景窗口，支持拖拽与屏幕边缘吸附
- **动态表情系统** — 6 种表情状态（默认 / 开心 / 担忧 / 说话 / 雨天 / 困倦），framer-motion 动画驱动
- **AI 对话** — 接入 DeepSeek-V3 API，自然语言识别待办意图，自动提炼任务与优先级
- **智能待办** — 三级优先级（高/中/低）、完成勾选、随机间隔提醒（30~90 分钟）
- **天气联动** — 接入 OpenWeatherMap，晴天顶着太阳 / 雨天变灰+雨滴动画
- **低干扰模式** — 全屏应用激活时自动半透明（透明度降至 20%）
- **本地存储** — 所有数据存于本地 SQLite，无需联网同步

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x（Rust） |
| 前端框架 | React 18 + TypeScript |
| 动画引擎 | Framer Motion |
| AI 接口 | DeepSeek-V3 API |
| 天气服务 | OpenWeatherMap API |
| 本地数据库 | SQLite（tauri-plugin-sql） |
| 状态管理 | Zustand |

## 快速开始

### 环境要求

- Node.js 18+
- Rust（stable）
- Tauri CLI

### 安装依赖

```bash
npm install
```

### 配置 API Key

在设置面板中填入：
- DeepSeek API Key（AI 对话）
- OpenWeatherMap API Key（天气联动）

### 启动开发模式

```bash
npm run tauri dev
```

### 构建发布包

```bash
npm run tauri build
```

## 项目结构

```
zhushou/
├── src/                    # 前端 React 源码
│   ├── components/
│   │   ├── CloudPet/       # 云朵角色核心组件（表情 + 动画）
│   │   ├── InputBar/       # 输入框 + 麦克风按钮
│   │   ├── HoverMenu/      # 悬停召出的圆形菜单
│   │   ├── TodoPanel/      # 待办清单浮窗
│   │   └── SpeechBubble/   # 说话气泡
│   ├── services/           # AI / 天气 / 提醒等服务
│   ├── store/              # Zustand 全局状态
│   └── App.tsx
├── src-tauri/              # Rust 后端（数据库 / 提醒定时器 / 天气拉取）
└── public/
    └── expressions/        # 云朵表情图片资源
```

## 路线图

- **V1（当前）** — 桌面云朵形象、AI 对话、待办管理、天气联动
- **V2** — 专注模式（番茄钟）、进度可视化、时段表情、云端同步
- **V3** — 手机 APP、定时自动化任务引擎、音乐节奏联动
