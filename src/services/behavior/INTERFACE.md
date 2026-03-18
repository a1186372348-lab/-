# 行为服务层 — 接口契约

> 此文件由行为服务工程师维护。
> 集成层（App.tsx）凭此文件在 useEffect 中注册和清理各服务。

---

## 当前已发布接口

### startTimeCycleService
- 状态：active
- 签名：`startTimeCycleService(onPeriod: (period: { expression: CloudExpression; greeting?: string }) => void): () => void`
- 返回：stop 函数
- 用途：按时段切换表情和问候语（早/午/晚/深夜）
- 调用方：App.tsx（init useEffect）

### startReminderService
- 状态：active
- 签名：`startReminderService(onRemind: (text: string) => void, getInterval: () => number): () => void`
- 返回：stop 函数
- 用途：定时读取 DB 待办，触发提醒气泡
- 调用方：App.tsx（init useEffect）

### startWeatherSync
- 状态：active
- 签名：`startWeatherSync(onUpdate: (condition: WeatherCondition) => void): ReturnType<typeof setInterval>`
- 返回：interval ID（用于 clearInterval）
- 用途：定时同步天气状态
- 调用方：App.tsx（init useEffect）

### startColorSampler / stopColorSampler
- 状态：active
- 签名：`startColorSampler(): void` / `stopColorSampler(): void`
- 用途：定时采样屏幕颜色，驱动背景渐变
- 调用方：App.tsx（init useEffect）

### startBehaviorScheduler（通过 hook 使用）
- 状态：active
- 签名：`startBehaviorScheduler(onBehavior: (b: AutonomousBehavior) => void): () => void`
- 用途：权重随机调度自主行为
- 调用方：hooks/useAutonomousBehavior.ts → CloudPet/index.tsx

---

## AutonomousBehavior 类型

```typescript
type AutonomousBehavior = 'blink' | 'stretch' | 'glanceLeft' | 'glanceRight' | 'yawn';
```

> UI 层实现新动画时，必须先在此处新增类型，集成层和 UI 层同步确认后生效。

---

## 待集成层处理的变更

<!-- 在此追加，集成层确认后移入上方 -->
