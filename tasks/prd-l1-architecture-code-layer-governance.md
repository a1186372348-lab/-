# PRD: L1 架构与代码层治理落地

## 1. 介绍 / 概述

`zhushou` 当前的 `src/App.tsx` 约 900 行，承担了窗口编排、运行时服务、事件桥接、低干扰模式、穿透控制、气泡展示、输入交互等多类职责。虽然现有行为已经通过上一轮 Layer 1 边界定义得到澄清，但代码结构仍然过重，后续维护、定位问题和继续迭代的成本较高。

本 PRD 的目标是在**行为不变**的前提下，把 `App.tsx` 收敛为薄协调层，并将主要职责迁移到两个新的自定义 hook：

- `src/hooks/useWindowOrchestration.ts`
- `src/hooks/useAppRuntime.ts`

整个迁移过程必须按既定依赖顺序串行推进；每个 story 的改动量应控制在单次专注会话内可完成；每个 story 完成后都必须通过 `npm run check`；涉及窗口、透明、穿透、位置联动、气泡和事件桥接的关键切换点，必须通过 `npm run tauri -- dev` 做人工回归。

## 2. 目标

- 将 `src/App.tsx` 从重型协调器收敛为薄协调层，最终目标为 `<= 150` 行。
- 将窗口编排相关职责集中到 `useWindowOrchestration`，避免 `App.tsx` 继续堆积 Tauri 窗口逻辑。
- 将运行时服务、事件桥接与空闲计时集中到 `useAppRuntime`，避免页面层直接管理服务生命周期。
- 在整个迁移过程中保持现有用户可感知行为不变，包括窗口 show/hide、拖动联动、低干扰、Ctrl 穿透、气泡输出、AI 流式回复、专注事件、待办事件、CC 事件与空闲切换。
- 保持现有事件命名、窗口标签、服务接线方式和手工验收路径可继续使用。
- 为后续协作补齐 hook 接口文档，使新结构可被初级开发者或 AI agent 直接接手。

## 3. User Stories

### US-001: 冻结 `App.tsx` 的职责边界
**描述：** 作为后续维护者，我希望先在 `src/App.tsx` 顶部冻结职责归属，这样后续迁移时不会继续把业务逻辑堆进这个文件。

**Acceptance Criteria：**
- [ ] `src/App.tsx` 顶部新增职责冻结注释块
- [ ] 注释明确区分薄协调层保留职责、迁往 `useWindowOrchestration` 的职责、迁往 `useAppRuntime` 的职责
- [ ] 除新增注释外，本 story 不改变 `src/App.tsx` 的运行时代码
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-002: 建立窗口编排 hook 骨架
**描述：** 作为开发者，我希望先创建 `useWindowOrchestration` 的最小骨架和 ref 容器，这样窗口编排逻辑可以逐步迁移且不会立即切换入口。

**Acceptance Criteria：**
- [ ] `src/hooks/useWindowOrchestration.ts` 存在并导出 `useWindowOrchestration`
- [ ] 文件中定义子窗口可见性、窗口边界缓存、光标轮询计时器和 hover 计时器所需的基础 refs
- [ ] 本 story 中 `src/App.tsx` 不导入也不调用 `useWindowOrchestration`
- [ ] `git diff -- src/App.tsx` 只包含 US-001 引入的职责冻结注释
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-003: 将光标轮询与子窗口 show/hide 逻辑迁入窗口编排 hook
**描述：** 作为开发者，我希望先把光标轮询和四组子窗口的 show/hide 逻辑复制到 hook 中，为后续切换窗口编排入口做好准备。

**Acceptance Criteria：**
- [ ] `useWindowOrchestration` 中定义 `startCursorPoll`、`stopCursorPoll`，以及 `todo`、`settings`、`focus`、`scheduler` 的 8 个 show/hide helper
- [ ] 迁入 hook 的轮询与 show/hide 逻辑统一读写 hook 内部 refs，而不是继续使用 `App.tsx` 模块级变量
- [ ] hook 保留过渡期所需的交互回调 ref，例如 `onInteractionChangeRef` 或等价机制
- [ ] 本 story 完成后 `src/App.tsx` 仍继续使用旧的窗口编排路径
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-004: 将位置同步与主窗口联动监听迁入窗口编排 hook
**描述：** 作为用户，我希望重构过程中主窗口与子窗口的位置联动保持不变，因此需要先把 `initWindows`、移动监听和聚焦监听迁入 hook 并完成编译验证。

**Acceptance Criteria：**
- [ ] `useWindowOrchestration` 包含用于子窗口初始化、主窗口移动监听和聚焦变化监听的 `useEffect`，且每个监听都有 cleanup
- [ ] hook 接收 `onInteractionChange` 或等价参数，以保持过渡期的低干扰状态同步能力
- [ ] hook 内部持有主窗口与气泡窗口联动所需的常量和 refs
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useWindowOrchestration`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-005: 将气泡展示与 hover handlers 迁入窗口编排 hook
**描述：** 作为用户，我希望重构后仍可通过悬停触发菜单和子窗口，也能继续看到 AI 气泡输出，因此需要把这些交互函数迁入 hook。

**Acceptance Criteria：**
- [ ] `useWindowOrchestration` 对外返回 `showSpeech`
- [ ] `useWindowOrchestration` 对外返回 `todo`、`settings`、`focus`、`scheduler` 按钮的 enter/leave handlers，以及菜单区域的 enter/leave handlers
- [ ] hover handlers 使用 hook 管理的延时计时器和子窗口动作，而不是依赖 `App.tsx` 的模块级变量
- [ ] hook 接收驱动 `setShowHoverMenu` 所需的 setter 或等价回调
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useWindowOrchestration`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-006: 在 `App.tsx` 中接入窗口编排 hook 并删除第一批窗口编排代码
**描述：** 作为维护者，我希望把 `App.tsx` 正式切换到 `useWindowOrchestration` 的主路径，让窗口 show/hide、气泡和 hover 交互先离开页面协调层。

**Acceptance Criteria：**
- [ ] `src/App.tsx` 导入并调用 `useWindowOrchestration`
- [ ] `src/App.tsx` 的 HoverMenu、按钮和输入区绑定改为读取 `winOrch` 或等价返回对象
- [ ] `src/App.tsx` 不再声明 `startCursorPoll`、`stopCursorPoll`、`showSpeech`、子窗口 show/hide helpers 以及 hover handlers
- [ ] `src/App.tsx` 不再保留与上述逻辑对应的模块级计时器和边界缓存
- [ ] 本 story 结束后，低干扰模式、Ctrl 穿透和宠物/输入栏 hover 逻辑仍可暂时留在 `App.tsx`，等待后续 stories 迁移
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-007: 将低干扰、穿透与宠物输入交互迁入窗口编排 hook
**描述：** 作为用户，我希望重构后低干扰模式、Ctrl 穿透和宠物区输入栏交互保持一致，因此这些交互计算也需要收敛到窗口编排 hook。

**Acceptance Criteria：**
- [ ] `useWindowOrchestration` 接管低干扰模式计算、全屏轮询、Ctrl 穿透、mousemove 兜底，以及宠物区和输入栏的 enter/leave/focus/blur handlers
- [ ] hook 对外返回 `petAreaRef`、`inputBarRef`、`displayDisturbMode`、`isPassthrough` 及相关交互 handlers
- [ ] 迁入 hook 的低干扰和穿透逻辑不再依赖 `App.tsx` 中的旧 refs
- [ ] 本 story 完成后 `src/App.tsx` 仍可暂时保留旧的低干扰绑定，尚未切换到 hook 返回值
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-008: 在 `App.tsx` 中接入低干扰与穿透 hook 结果并删除旧实现
**描述：** 作为维护者，我希望将 `App.tsx` 的低干扰、穿透和宠物/输入栏交互正式切换到 `useWindowOrchestration`，让页面层不再拥有这部分行为决策。

**Acceptance Criteria：**
- [ ] `src/App.tsx` 的样式计算和事件绑定改为读取 `useWindowOrchestration` 返回的 `displayDisturbMode`、`isPassthrough`、`petAreaRef`、`inputBarRef` 及对应 handlers
- [ ] `src/App.tsx` 不再保留 `applyDim`、`disturbModeRef`、`isPetHoveredRef`、`isInputHoveredRef`、`isInputFocusedRef`、`petAreaRef`、`inputBarRef` 的原始实现
- [ ] `src/App.tsx` 不再保留为低干扰或穿透服务的本地轮询、键盘或鼠标兜底逻辑
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-009: 建立运行时 hook 骨架
**描述：** 作为开发者，我希望先创建 `useAppRuntime` 的骨架和 callback 契约，这样运行时职责可以按服务和事件逐步迁移。

**Acceptance Criteria：**
- [ ] `src/hooks/useAppRuntime.ts` 存在并导出 `useAppRuntime`
- [ ] hook 接收明确的跨层 callbacks，包括 weather、expression、speech、disturb mode 查询、typing 状态查询及当前行为所需的其他回调
- [ ] 文件中定义服务清理和事件清理所需的基础 refs 或局部状态容器
- [ ] 本 story 完成后 `src/App.tsx` 仍未导入或调用 `useAppRuntime`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-010: 将常驻运行时服务迁入 `useAppRuntime`
**描述：** 作为开发者，我希望先把常驻服务的生命周期迁入 `useAppRuntime`，从而在不切换入口的情况下先收拢稳定的运行时能力。

**Acceptance Criteria：**
- [ ] `useAppRuntime` 包含 `weather`、`timeCycle` 和 `colorSampler` 的启动与清理逻辑
- [ ] 这些服务的启动和 cleanup 统一在 hook 内完成，而不是继续散落在 `App.tsx`
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useAppRuntime`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-011: 将条件运行时服务与设置监听迁入 `useAppRuntime`
**描述：** 作为开发者，我希望将 reminder、scheduler、screenMonitor 及 `settings-changed` 响应迁入 `useAppRuntime`，这样条件服务的生命周期也能统一治理。

**Acceptance Criteria：**
- [ ] `useAppRuntime` 包含 `reminder`、`scheduler`、`screenMonitor` 的启动与清理逻辑
- [ ] `useAppRuntime` 监听 `settings-changed`，并在现有行为约束下更新 reminder 或其他相关运行时配置
- [ ] 这些服务和监听迁入后仍通过 hook 参数访问现有的查询和回调能力
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useAppRuntime`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-012: 将待办、专注与 CC 事件桥接迁入 `useAppRuntime`
**描述：** 作为用户，我希望待办完成、专注阶段切换和 CC 事件的表现保持不变，因此这些事件桥接需要迁移到统一的运行时 hook。

**Acceptance Criteria：**
- [ ] `useAppRuntime` 监听 `all-todos-complete`、`focus-phase-change`、`focus-start`、`focus-pause`、`focus-reset`、`focus-tick`、`focus-mouse-enter`、`focus-mouse-leave` 和 `cc-event`
- [ ] hook 注册的所有事件监听都在 cleanup 中统一释放
- [ ] hook 保留当前行为所需的 CC 事件内部状态跟踪，例如权限等待标记或等价机制
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useAppRuntime`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-013: 将空闲计时与 `resetIdle` 迁入 `useAppRuntime`
**描述：** 作为用户，我希望长时间空闲后的 sleepy 表现保持不变，因此空闲计时和重置接口也需要收敛到运行时 hook。

**Acceptance Criteria：**
- [ ] `useAppRuntime` 内部管理空闲计时，并在现有超时后将表情切换为 `sleepy`
- [ ] `useAppRuntime` 对外返回 `resetIdle`
- [ ] hook 内部的空闲计时实现不再依赖 `App.tsx` 中的旧 timer ref 或常量
- [ ] 本 story 完成后 `src/App.tsx` 仍未切换到 `useAppRuntime`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-014: 在 `App.tsx` 中接入运行时 hook 并删除已迁出的运行时代码
**描述：** 作为维护者，我希望将 `App.tsx` 正式切换到 `useAppRuntime`，使服务生命周期、事件桥接和空闲计时离开页面协调层。

**Acceptance Criteria：**
- [ ] `src/App.tsx` 导入并调用 `useAppRuntime`
- [ ] `src/App.tsx` 不再保留运行时初始化 `useEffect`、服务启动与清理、事件监听、`resetIdle`、空闲计时 refs 或常量
- [ ] `handleSend` 仍通过 hook 提供的接口重置空闲计时
- [ ] `useWindowOrchestration` 对外暴露运行时 hook 所需的意图级隐藏或焦点窗口控制接口
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-015: 清理 `App.tsx` 残留职责并确认薄协调层目标
**描述：** 作为项目维护者，我希望在两次切换完成后对 `App.tsx` 做最终核查，确保它只保留页面组装、用户交互入口、AI 表现协调和本地 UI state。

**Acceptance Criteria：**
- [ ] `src/App.tsx` 只保留薄协调层所需 imports，且没有 unused imports
- [ ] `src/App.tsx` 模块级区域只保留 `thunderSound` 或其他明确属于展示层的少量常量
- [ ] `src/App.tsx` 中不再出现 `useEffect`
- [ ] `src/App.tsx` 中不再出现 `useRef`
- [ ] 搜索 `src/App.tsx` 时不再找到 `WebviewWindow`、`getCurrentWindow`、`LogicalPosition` 或 `invoke`
- [ ] `src/App.tsx` 总行数不超过 150 行
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-016: 回归窗口联动与悬停交互
**描述：** 作为用户，我希望窗口编排迁移完成后，悬停菜单、子窗口 show/hide、拖动联动和气泡窗口行为都保持不变。

**Acceptance Criteria：**
- [ ] 使用 `npm run tauri -- dev` 成功启动桌面应用并进入回归流程
- [ ] 悬停主菜单触发区约 600ms 后，HoverMenu 出现
- [ ] 悬停待办按钮约 200ms 后，`todo-manager` 窗口出现且 `scheduler` 隐藏
- [ ] 鼠标移出 todo 窗口约 500ms 后，todo 窗口隐藏
- [ ] 悬停专注按钮时，`focus` 窗口出现
- [ ] 悬停设置按钮时，`settings` 窗口出现在主窗口右侧
- [ ] 悬停定时按钮时，`scheduler` 窗口出现且 `todo-manager` 隐藏
- [ ] 拖动主窗口时，所有子窗口同步跟随
- [ ] 输入文字并发送后，气泡弹出且 AI 回复继续流式输出
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-017: 回归低干扰、穿透与运行时事件行为
**描述：** 作为用户，我希望低干扰模式、Ctrl 穿透、待办完成、专注事件、CC 事件和空闲状态在迁移后仍保持原有表现。

**Acceptance Criteria：**
- [ ] 使用 `npm run tauri -- dev` 成功启动桌面应用并进入回归流程
- [ ] 点击其他桌面程序后，hover 状态被重置且低干扰状态不会卡住
- [ ] 按住 Ctrl 时进入穿透与半透明状态，松开后恢复
- [ ] 模拟全屏场景时，宠物隐藏并在约 1 秒悬停后恢复显示
- [ ] 鼠标进出宠物区域和输入栏时，低干扰状态响应保持正确
- [ ] 待办全部完成时仍会出现预期表情变化
- [ ] 专注模式阶段切换时仍会出现预期表情和气泡
- [ ] 触发 `cc-event` 时仍会出现预期表情和气泡
- [ ] 空闲超时后，表情切换为 `sleepy`
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-018: 冻结 hook 接口文档
**描述：** 作为后续协作者，我希望在代码收薄完成后可以直接查看两个 hook 的对外接口和集成方式，而不需要重新阅读大段实现代码。

**Acceptance Criteria：**
- [ ] `src/components/INTERFACE.md` 新增 `集成层 Hook 接口` 章节
- [ ] 文档明确列出 `useWindowOrchestration(opts)` 的参数和返回值
- [ ] 文档明确列出 `useAppRuntime(callbacks)` 的参数和返回值
- [ ] 文档内容与当前实现一致，不包含已删除或未实现接口
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

### US-019: 更新仓库协作文档并解除临时冻结标记
**描述：** 作为团队成员，我希望迁移完成后同步更新协作文档，使仓库中的关键文件和职责说明与实际代码结构保持一致。

**Acceptance Criteria：**
- [ ] `CLAUDE.md` 的关键文件表包含 `src/hooks/useWindowOrchestration.ts` 和 `src/hooks/useAppRuntime.ts`
- [ ] `src/App.tsx` 顶部冻结注释从临时冻结描述更新为已迁出至 `useWindowOrchestration` / `useAppRuntime` 的最终状态描述
- [ ] 本 story 只修改文档或注释，不改变运行时逻辑
- [ ] `npm run check` succeeds
- [ ] Typecheck passes

## 4. Functional Requirements

- FR-1: 系统必须在整个治理过程中保持现有用户可感知行为不变。
- FR-2: 系统必须在 `src/App.tsx` 顶部显式冻结职责边界，防止继续向该文件新增业务逻辑。
- FR-3: 系统必须提供 `useWindowOrchestration` 作为窗口编排层唯一入口，承接子窗口 show/hide、位置同步、气泡显示、低干扰、穿透和 hover 交互。
- FR-4: 系统必须提供 `useAppRuntime` 作为应用运行时层唯一入口，承接服务启停、事件桥接、屏幕监控与空闲计时。
- FR-5: 在切换到 hook 之前，迁移中的新 hook 必须能单独通过 TypeScript 编译，且不改变 `App.tsx` 当前运行路径。
- FR-6: `src/App.tsx` 在窗口编排切换完成后，不得继续保留旧的窗口编排函数、模块级计时器、边界缓存或位置同步实现。
- FR-7: `src/App.tsx` 在运行时切换完成后，不得继续保留服务启动、事件监听、空闲计时和相关清理逻辑。
- FR-8: 所有关键切换点必须通过 `npm run check` 验证，涉及桌面交互的 story 还必须通过 `npm run tauri -- dev` 完成人工验证。
- FR-9: 最终 `src/App.tsx` 必须只保留页面组装、用户交互入口、AI 表现协调和本地 UI state，且行数不超过 150 行。
- FR-10: `useWindowOrchestration` 与 `useAppRuntime` 的对外接口必须被记录到仓库文档中，供后续协作直接使用。
- FR-11: 现有事件名称、窗口标签、窗口互斥规则和气泡展示机制必须继续兼容现有实现。
- FR-12: 此次治理必须严格限制在主桌面应用内，不得把 `cloudpet-mcp/` 与本次改动混在一起。

## 5. Non-Goals

- 不新增任何用户可见功能。
- 不调整现有事件命名、窗口标签或多窗口产品交互设计。
- 不改造数据库 schema，不引入新的持久化结构。
- 不为此次治理补写系统化自动化测试框架。
- 不修改 `cloudpet-mcp/` 子项目。
- 不顺带进行视觉改版、文案改写或 AI 能力增强。

## 6. Design Considerations

- `App.tsx` 最终应表现为“薄协调层”，保留 JSX 组装和少量 UI state，而不是继续承接副作用和系统能力调用。
- `showSpeech` 虽然直接影响用户视觉反馈，但因其核心职责是定位和控制 Tauri 气泡窗口，因此归入窗口编排层。
- `thunderSound` 属于展示层效果，可继续由 `App.tsx` 持有，并通过 callback 方式由运行时 hook 触发。
- hover handlers 的 JSX 绑定点保留在 `App.tsx`，但实现逻辑收敛到 hook，保证边界清晰。

## 7. Technical Considerations

- 迁移必须遵守仓库现有约定：新增 hook 不应破坏现有 Tauri 窗口标签、事件名和服务初始化路径。
- `useWindowOrchestration` 需要管理大量 `useRef`、`useEffect` 和意图级接口；`useAppRuntime` 需要管理服务生命周期与事件监听清理。
- 整个过程建议严格按照既定串行依赖推进，避免跨阶段并行修改导致行为漂移。
- 每个 story 的改动量目标为 `<= 150` 行，便于单次 review 和回滚定位。
- 桌面特有行为如透明、穿透、拖动联动、气泡显示和低干扰模式，无法仅靠静态检查保证正确，必须辅以人工运行验证。
- 文档更新必须与代码落地同步完成，避免后续协作者继续根据旧结构改动。

## 8. Success Metrics

- `src/App.tsx` 最终行数 `<= 150`。
- `useWindowOrchestration` 与 `useAppRuntime` 成为对应职责的唯一入口，且 `App.tsx` 不再保留同类残留逻辑。
- 所有 story 完成后，`npm run check` 持续通过。
- US-016 与 US-017 的分组回归全部通过，无新增可见行为回归。
- 文档中能够直接找到两个 hook 的对外接口和仓库中的关键文件位置。

## 9. Open Questions

- `npm run check` 在当前仓库中应精确覆盖哪些检查项，是否需要在文档中补充其等价命令说明？
- `src/components/INTERFACE.md` 当前是否已存在稳定结构，是否需要先确认追加章节的落点格式？
- 回归清单中的“模拟全屏模式”是否已有统一复现方法，还是依赖人工环境判断？
- 若 `App.tsx` 最终略高于 150 行，但职责边界已经达标，是否允许作为例外接受，还是必须继续压缩？

