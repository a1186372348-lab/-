# 云宝助手 — 团队共享错误库

> **维护规则**
> - 发现 Claude 做错事 → 立刻追加，不要等到周末
> - 格式固定（见下方），方便 Claude 解析
> - 每条记录标注【适用层】，跨层错误标 ALL
> - 此文件 check in 到 git，所有分支都能看到
> - **每次任务开始前必须读此文件**，命中历史错误时在回复开头声明

---

## 格式模板

```
### [错误标题]
- 层级：ALL / Rust层 / 数据层 / AI层 / 服务层 / UI层 / 集成层
- 现象：[Claude 做了什么错误的事]
- 根因：[为什么会出现这个错误]
- 正确做法：[应该怎么做]
- 日期：YYYY-MM-DD
```

---

## 错误记录

### window.blur 在 Tauri/WebView2 中不可靠
- 层级：集成层 / UI层
- 现象：用 `window.blur` 事件监听窗口失焦，在 Tauri 中最小化或切换到其他 Tauri 子窗口时不触发
- 根因：WebView2 的 `window.blur` 是浏览器事件，不等同于原生窗口失焦。多 WebView 进程间切换焦点时不会触发
- 正确做法：使用 `getCurrentWindow().onFocusChanged()` Tauri 原生事件，可靠捕获所有失焦场景
- 日期：2026-03-18

---

### Tauri command 新增后忘记注册
- 层级：Rust层
- 现象：前端调用新 command 时报 "command not found" 错误
- 根因：Rust 侧写了 `#[tauri::command]` 但没有在 `lib.rs` 的 `invoke_handler![]` 中注册
- 正确做法：新增 command 后立即同步更新 `lib.rs` 注册 + `capabilities/default.json` 权限
- 日期：2026-03-18

---

### Tauri command 权限未授权
- 层级：Rust层 / 集成层
- 现象：command 已注册但调用时被 Tauri 安全层拦截，前端收到权限错误
- 根因：`capabilities/default.json` 没有显式声明该 command 的权限
- 正确做法：每个新 command 必须在 `capabilities/default.json` 中添加对应的 `core:invoke:allow-XXX` 条目
- 日期：2026-03-18

---

### emit 替代 emitTo 导致跨窗口事件丢失
- 层级：集成层 / UI层
- 现象：从子窗口发送事件，主窗口收不到
- 根因：用了 `emit(event, payload)` 而非 `emitTo('main', event, payload)`，emit 只在当前窗口广播
- 正确做法：跨窗口通信一律用 `emitTo(windowLabel, event, payload)`，窗口标签与 tauri.conf.json 保持一致
- 日期：2026-03-18

---

### 低干扰模式仅检测 WS_MAXIMIZE 标志
- 层级：Rust层
- 现象：部分铺满屏幕的应用（Electron、无边框应用）不触发低干扰模式
- 根因：`get_fullscreen_mode` 要求同时满足 `covers_work && is_maximized`，但无边框应用铺满屏幕时无 WS_MAXIMIZE 标志
- 正确做法：根据实际需求决定是否去掉 is_maximized 条件，或改为覆盖面积百分比判断
- 日期：2026-03-18

---

### useCallback 依赖数组遗漏导致 stale closure
- 层级：集成层 / UI层
- 现象：useCallback 内部读取的变量是旧值，行为不符合预期
- 根因：useCallback 依赖数组（deps）没有包含函数内部读取的所有外部变量
- 正确做法：使用 React refs 存储需要在 callback 中读取的可变值；或确保 deps 数组完整。module-level 变量（非 state/ref）可以直接读取，无需加入 deps
- 日期：2026-03-18

---

### AI 记忆提取误将 AI 名字记为用户属性
- 层级：AI层
- 现象："云宝"被记录为用户的名字，subject_role 填了 "user"
- 根因：Prompt 未明确说明"云宝/云朵"是 AI 助手自己的名字，模型根据对话上下文产生误判
- 正确做法：Prompt 中显式声明"'云宝'、'云朵'是 AI 助手自己的名字，绝对不是用户的名字"，并在 subject_role 规则中强调主语判断
- 日期：2026-03-18

---

### 跨 Layer 分支未合并导致后续 Layer 缺失前置代码
- 层级：ALL
- 现象：L2 分支从 main 创建，但 L1 分支从未 merge 到 main，导致 L1 的 hooks 拆分成果（useAppRuntime.ts、useWindowOrchestration.ts、App.tsx 瘦身）在 L2 分支上完全不存在，L2 PRD 引用的目标文件全部找不到，Ralph 反复卡住
- 根因：Ralph agent 只负责在当前分支实现 stories，不负责 PR 和合并。两个 Layer 之间缺少"合并上一层 → 验证 → 再开新分支"的流程步骤
- 正确做法：1) 每个 Layer 完成后必须先 merge 到 main（或创建 PR 合并）；2) 新 Layer 的 branch 必须从上一个 Layer 的 branch（或其已合并的 main）创建；3) 创建新 Layer 分支后，立即验证前置 Layer 的关键文件存在；4) PRD 的前置条件中显式写明"依赖 L(n-1) branch 已合并到 main"
- 日期：2026-04-19

---

<!-- 在此追加新错误，保持格式一致 -->
