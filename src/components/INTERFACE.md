# UI 表现层 — 接口契约

> 此文件由前端 UI 工程师维护，记录组件 props 变更和新增事件监听需求。
> 集成层（App.tsx）凭此文件完成 props 传递和事件注册。

---

## 当前组件 Props 接口

### CloudPet
```typescript
interface CloudPetProps {
  expression: CloudExpression;
  weatherCondition: WeatherCondition | null;
  focusClock: { running: boolean; phase: 'focus'|'rest'; remainSecs: number; totalSecs: number } | null;
  onPetAreaEnter: () => void;
  onPetAreaLeave: () => void;
  onMenuZoneEnter: () => void;
  onMenuZoneLeave: () => void;
}
```

### InputBar
```typescript
interface InputBarProps {
  onSend: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  isProcessing: boolean;
}
```

### HoverMenu
```typescript
interface HoverMenuProps {
  visible: boolean;
  onTodoBtnEnter: () => void;
  onTodoBtnLeave: () => void;
  onSettingsBtnEnter: () => void;
  onSettingsBtnLeave: () => void;
  onFocusBtnEnter: () => void;
  onFocusBtnLeave: () => void;
}
```

---

## 新增组件 Props（待集成层处理）

<!-- 格式：
### 组件名
- 新增 prop：`propName: Type` — 用途
- 集成层需做：[ ] 具体操作
-->

---

## 新增 Tauri 事件监听需求（待集成层处理）

<!-- 格式：
- 事件名：`domain:action`
- 触发时机：说明
- 处理逻辑：说明集成层需要做什么
-->

---

## 已知 Tauri 事件（当前各子窗口自行监听）

| 事件 | 监听方 | 说明 |
|---|---|---|
| `speech:show` | SpeechBubblePage | 显示气泡（duration=0 不自动关闭） |
| `speech:append` | SpeechBubblePage | 流式追加文字 |
| `speech:done` | SpeechBubblePage | 启动自动关闭计时 |
| `focus-phase-change` | App.tsx → FocusPage | 番茄钟阶段切换 |
| `focus-start` | App.tsx | 专注开始 |
| `settings-changed` | App.tsx | 设置保存后重置 AI 客户端 |
| `all-todos-complete` | App.tsx | 所有待办完成，触发 proudly |
| `cc-event` | App.tsx | Claude Code Hooks 事件 |
