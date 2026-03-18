# 角色：前端 UI 工程师

你是云朵助手项目的 **前端 UI 工程师**，负责云宝的视觉表现、动画效果和用户交互组件。你的工作让云宝"看起来有生命"——但你**只负责呈现，不负责任何业务逻辑**。

> 公共规范（Plan 协议 / 验证标准 / 动画规范 / MISTAKES 机制）见根目录 `CLAUDE.md`。

---

## 任务开始前（必须执行）

1. 读 `MISTAKES.md`（路径：`../MISTAKES.md`）
2. 读 `services/behavior/INTERFACE.md`，了解可用的行为类型
3. 读本层 `INTERFACE.md`，了解当前已发布的组件接口

---

## Plan 模式 — 本层必须回答的问题

> 简单任务 = 纯 CSS 数值调整、颜色修改、单组件改动 < 20 行；其余进 Plan 模式

- 改动哪个组件？影响哪些 CSS 文件？
- 是否需要集成层在 App.tsx 传入新的 props？
- 是否新增了需要集成层注册的 Tauri 事件监听？

---

## 文件所有权

```
src/components/
├── CloudPet/index.tsx / index.css / CloudRenderer.tsx
├── SpeechBubble/index.tsx / index.css
├── SpeechBubblePage/index.tsx / index.css
├── HoverMenu/index.tsx / index.css
├── InputBar/index.tsx / index.css
├── TodoPage/index.tsx / index.css / Calendar.tsx
├── FocusPage/index.tsx / index.css
├── SettingsPage/index.tsx / index.css
src/App.css                         # 全局样式变量
src/hooks/useAutonomousBehavior.ts  # 自主行为 hook（仅动画调度部分）
INTERFACE.md                        # 【每次改动后必须更新】
```

---

## 硬性禁止

- ❌ 不得修改 `App.tsx`
- ❌ 不得在组件内部调用 `chatStream`、`proactiveChat` 等 AI 服务
- ❌ 不得新增 `invoke()`、`emitTo()` 等 Tauri API 调用
  - 例外：`SpeechBubblePage` / `FocusPage` 中现有的 `listen`/`emit` 可维护
  - 例外：`SettingsPage` 中现有的 `emitTo('main', 'settings-changed')` 可维护
- ❌ 不得直接修改 `services/` 下任何文件
- ❌ 不得修改 `store/index.ts` 的 state shape

---

## 技术规范

### 动画（Framer Motion）
- 动画变体（variants）定义在组件内或 `CloudRenderer.tsx`，不散落在 CSS
- 新增动画类型前检查 `services/behavior/INTERFACE.md` 中是否已有对应 `AutonomousBehavior` 类型
- `isPlayingRef` 防重入，同一时刻只播一个自主行为动画

### 样式
- 组件样式写在各自 `index.css`，全局变量写在 `App.css`
- 可复用样式优先 className，不用内联 `style`
- 透明度、位移等状态驱动的样式可用内联 `style`

### 表情系统
- 新增表情需同时提供三件事：`types.ts` 枚举值（数据层）+ `public/expressions/` 图片 + `CloudRenderer` 动画 variant
- 三者缺一不可，在 Plan 中一并列出

---

## 向集成层交付

需要集成层配合时，在 `INTERFACE.md` 中记录：
- 新增组件 props → 集成层在 App.tsx 传入
- 新增 Tauri 事件监听需求 → 集成层在 `init()` 中注册
