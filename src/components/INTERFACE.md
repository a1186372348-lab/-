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

## 集成层 Hook 接口

以下两个 hook 由集成层（App.tsx）调用，将窗口编排与应用运行时职责从页面协调层迁出。

### `useWindowOrchestration(opts?)`

**位置**：`src/hooks/useWindowOrchestration.ts`

#### 参数（可选）

```typescript
interface WindowOrchestrationOpts {
  /** 低干扰模式状态变化回调（保留过渡期兼容） */
  onInteractionChange?: () => void;
  /** 控制悬停菜单显示/隐藏 */
  setShowHoverMenu?: (show: boolean) => void;
  /** 控制输入栏显示/隐藏（传入即激活低干扰/穿透/全屏等 guarded effects） */
  setShowInputBar?: (show: boolean) => void;
  /** 用户活动回调（如重置空闲计时） */
  onActivity?: () => void;
}
```

#### 返回值

| 分类 | 字段 | 类型 | 说明 |
|------|------|------|------|
| **低干扰展示状态** | `displayDisturbMode` | `0 \| 1 \| 2` | 当前低干扰模式展示级别（0=正常） |
| **Ctrl 穿透状态** | `isPassthrough` | `boolean` | 是否处于 Ctrl 穿透模式 |
| **DOM refs** | `petAreaRef` | `React.RefObject<HTMLDivElement>` | 宠物区域 DOM 引用 |
| | `inputBarRef` | `React.RefObject<HTMLDivElement>` | 输入栏区域 DOM 引用 |
| **气泡展示** | `showSpeech` | `(text: string, durationMs?: number) => Promise<void>` | 在气泡窗口显示文字 |
| **子窗口 show/hide** | `showTodoWindow` | `() => Promise<void>` | 显示待办窗口（互斥隐藏 scheduler） |
| | `hideTodoWindow` | `() => Promise<void>` | 隐藏待办窗口 |
| | `showSettingsWindow` | `() => Promise<void>` | 显示设置窗口 |
| | `hideSettingsWindow` | `() => Promise<void>` | 隐藏设置窗口 |
| | `showFocusWindow` | `() => Promise<void>` | 显示专注窗口 |
| | `hideFocusWindow` | `() => Promise<void>` | 隐藏专注窗口 |
| | `showSchedulerWindow` | `() => Promise<void>` | 显示定时任务窗口（互斥隐藏 todo） |
| | `hideSchedulerWindow` | `() => Promise<void>` | 隐藏定时任务窗口 |
| **按钮 hover handlers** | `handleTodoBtnEnter` | `() => void` | 待办按钮悬停进入 |
| | `handleTodoBtnLeave` | `() => void` | 待办按钮悬停离开 |
| | `handleSettingsBtnEnter` | `() => void` | 设置按钮悬停进入 |
| | `handleSettingsBtnLeave` | `() => void` | 设置按钮悬停离开 |
| | `handleFocusBtnEnter` | `() => void` | 专注按钮悬停进入 |
| | `handleFocusBtnLeave` | `() => void` | 专注按钮悬停离开 |
| | `handleSchedulerBtnEnter` | `() => void` | 定时按钮悬停进入 |
| | `handleSchedulerBtnLeave` | `() => void` | 定时按钮悬停离开 |
| **菜单区域 hover** | `handleMenuZoneEnter` | `() => void` | 菜单触发区悬停进入（~200ms 后显示菜单） |
| | `handleMenuZoneLeave` | `() => void` | 菜单触发区悬停离开（~50ms 后隐藏菜单） |
| **宠物/输入栏交互** | `handlePetAreaEnter` | `() => void` | 宠物区域鼠标进入 |
| | `handlePetAreaLeave` | `() => void` | 宠物区域鼠标离开 |
| | `handleInputBarEnter` | `() => void` | 输入栏鼠标进入 |
| | `handleInputBarLeave` | `() => void` | 输入栏鼠标离开 |
| | `handleInputFocus` | `() => void` | 输入栏获得焦点 |
| | `handleInputBlur` | `() => void` | 输入栏失去焦点 |
| **低干扰模式 refs** | `disturbModeRef` | `MutableRefObject<0\|1\|2>` | 当前低干扰模式原始值 |
| | `isInputFocusedRef` | `MutableRefObject<boolean>` | 输入栏是否聚焦 |
| **内部 refs（跨 hook 协作用）** | `focusHideTimerRef` | `MutableRefObject<Timeout\|null>` | 专注窗口隐藏计时器 |
| **光标轮询** | `startCursorPoll` | `() => void` | 启动光标位置轮询 |
| | `stopCursorPoll` | `() => void` | 停止光标位置轮询 |

> hook 还返回若干内部 refs（visibility/bounds/timer/unlisten），主要用于跨 hook 协作，集成层一般不需要直接使用。

---

### `useAppRuntime(callbacks)`

**位置**：`src/hooks/useAppRuntime.ts`

#### 参数（必需）

```typescript
interface AppRuntimeCallbacks {
  /** 天气变化回调 */
  onWeather: (condition: string) => void;
  /** 设置宠物表情 */
  setExpression: (expr: CloudExpression) => void;
  /** 显示气泡文字，duration=0 不自动关闭 */
  showSpeech: (text: string, duration: number) => void;
  /** 获取当前低干扰模式（0/1/2） */
  getDisturbMode: () => number;
  /** 用户是否正在输入 */
  isUserTyping: () => boolean;
  /** 设置专注时钟状态（支持直接赋值或函数式更新） */
  setFocusClock: (
    stateOrUpdater: FocusClockState | null |
      ((prev: FocusClockState | null) => FocusClockState | null)
  ) => void;
  /** 设置 CC 工作感知状态 */
  setCcActive: (active: boolean) => void;
  /** 设置 AI 处理中状态 */
  setIsProcessing: (processing: boolean) => void;
  /** 播放雷声音效 */
  playThunder: () => void;
  /** 专注窗口隐藏计时器 ref（来自 useWindowOrchestration） */
  focusHideTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** 隐藏专注窗口函数（来自 useWindowOrchestration） */
  hideFocusWindow: () => void;
}
```

其中 `FocusClockState` 类型：

```typescript
type FocusClockState = {
  running: boolean;
  phase: 'focus' | 'rest';
  remainSecs: number;
  totalSecs: number;
};
```

#### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `resetIdle` | `() => void` | 重置空闲计时器，若当前为 sleepy 则恢复 default 表情 |

#### 管理的运行时服务

| 服务 | 启动方式 | 说明 |
|------|---------|------|
| 天气同步 | `startWeatherSync` → `clearInterval` | 定时更新天气状态 |
| 时间周期 | `startTimeCycleService` → 调用 stop 函数 | 按时段切换表情和气泡 |
| 颜色采样 | `startColorSampler` / `stopColorSampler` | 背景色感知 |
| 提醒服务 | `startReminderService` → 调用 stop 函数 | 条件启动（需 DB 初始化） |
| 定时任务 | `startSchedulerService` → 调用 stop 函数 | 条件启动 |
| 屏幕感知 | `startScreenMonitor` / `stopScreenMonitor` | 条件启动 |
| 设置监听 | `listen('settings-changed')` | 重置 AI 客户端 + 更新提醒间隔 |

#### 监听的 Tauri 事件

| 事件 | 说明 |
|------|------|
| `all-todos-complete` | 全部待办完成 → proudly 表情 |
| `focus-phase-change` | 专注阶段切换 → 更新时钟 + 表情 |
| `focus-start` | 专注开始 → 初始化时钟状态 |
| `focus-pause` | 专注暂停 → 更新时钟 |
| `focus-reset` | 专注重置 → 清空时钟 |
| `focus-tick` | 专注计时 → 更新剩余秒数 |
| `focus-mouse-enter` | 专注窗口鼠标进入 → 取消隐藏计时 |
| `focus-mouse-leave` | 专注窗口鼠标离开 → 500ms 后隐藏 |
| `cc-event` | Claude Code 事件 → 表情 + 气泡 |
| `settings-changed` | 设置变更 → 重置 AI 客户端 + 更新提醒间隔 |

#### 空闲计时

- 超时阈值：`IDLE_MS = 30 * 60 * 1000`（30 分钟）
- 超时后切换表情为 `sleepy`，调用 `resetIdle` 恢复为 `default`

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
