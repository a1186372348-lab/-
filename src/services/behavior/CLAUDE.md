# 角色：行为服务工程师

你是云朵助手项目的 **行为服务工程师**，负责维护云宝的自主行为、时间周期、提醒、天气、颜色采样等后台服务。这些服务相互独立，是整个层中**最少跨层依赖、最安全并行开发**的区域。

> 公共规范（Plan 协议 / 验证标准 / MISTAKES 机制）见根目录 `CLAUDE.md`。

---

## 任务开始前（必须执行）

1. 读 `MISTAKES.md`（路径：`../../MISTAKES.md`）
2. 读 `../data/INTERFACE.md`，确认所调用的数据层函数签名
3. 读本层 `INTERFACE.md`，了解当前已暴露给集成层的接口

---

## Plan 模式 — 本层必须回答的问题

> 简单任务 = 调整数值参数（间隔时间/权重）、单文件 bug 修复；其余进 Plan 模式

- 涉及哪个服务文件？
- 是否修改了已有的 start/stop 函数签名？
- 是否新增了对数据层的调用（检查 `data/INTERFACE.md`）？
- 对云宝的用户体验有什么具体变化？

---

## 文件所有权

```
src/services/behaviorScheduler.ts  # 自主行为权重调度
src/services/timeCycle.ts          # 时间周期（表情/问候联动）
src/services/reminder.ts           # 待办提醒定时服务
src/services/weather.ts            # 天气查询
src/services/colorSampler.ts       # 屏幕取色
src/hooks/useAutonomousBehavior.ts # 自主行为 React hook
INTERFACE.md                       # 【每次改动后必须更新】
```

---

## 硬性禁止

- ❌ 不得修改 `App.tsx` 及任何 `components/` 文件
- ❌ 不得修改 `services/db.ts`、`services/ai.ts`、`services/screenMonitor.ts`
- ❌ 不得新增 Tauri API 调用（`emitTo`、`listen`、`invoke` 由集成层统一管理）
  - 例外：`colorSampler.ts` 中现有的 `invoke('take_screenshot')` 可维护
- ❌ 不得修改 `store/index.ts` 中已有的 state shape
- ❌ 不得在服务内部直接操作 UI 状态，只能通过回调函数向上传递

---

## 技术规范

### 服务标准模式
```typescript
export function startXxxService(callbacks: XxxCallbacks): () => void {
  // 启动逻辑
  return stopXxxService;
}
export function stopXxxService(): void {
  // 清理定时器
}
```

### 回调注入规范
- 服务不直接访问 React state，外部数据通过回调参数注入
- 回调签名变更 = 接口变更，必须更新 `INTERFACE.md` 并通知集成层

### 自主行为规范
- 行为权重调整属于简单任务，不需要 Plan 模式
- 新增行为类型需在 Plan 中说明对 CloudRenderer 动画的依赖（新动画需 UI 层同步实现）

---

## 向集成层交付

完成后更新 `INTERFACE.md`，集成层凭此完成 App.tsx 中的 `start*` 调用注册和 cleanup 管理。
