# PRD: Layer 1 架构与代码层实施计划

> 状态：`planned`
> 最后更新：`2026-04-18`
> 文档类型：架构治理 PRD

## 1. 介绍 / 概述

本 PRD 用于定义 `zhushou` 项目的 Layer 1 架构治理方案。它不是终端用户功能文档，也不是实现设计稿，而是一份给后续工程师或 AI 编码代理使用的实施计划。

当前项目已经形成 `UI -> 协调层 -> 服务层 -> Tauri/Rust 层` 的分层意识，但 `src/App.tsx` 仍承担窗口编排、运行时服务生命周期、事件监听、AI 表现协调和部分 UI 状态管理等多重职责。继续在该文件堆积逻辑，会直接提高维护成本、回归风险和后续 Layer 2-5 的推进难度。

本 PRD 的目标是在不改变现有行为的前提下，把当前“主入口集中编排”的结构整理为“薄协调层 + 子系统分层协作”的可执行路线，并为 Layer 2、Layer 3、Layer 4、Layer 5 提供稳定前置条件。

## 2. 目标

- 明确 `src/App.tsx` 当前职责的完整盘点结果，作为 Layer 1 的唯一事实基础。
- 定义未来薄协调层的保留职责白名单和禁入清单，阻止新逻辑继续默认堆进 `App.tsx`。
- 定义独立的窗口编排层边界，使多窗口规则不再直接耦合在主入口。
- 定义独立的应用运行时层边界，使初始化、清理、配置响应和回调派发有稳定归属。
- 给出分阶段实施顺序，确保 Layer 1 可渐进推进，而不是一次性大重构。
- 为 Layer 2-5 提供明确接入前提，但不替代这些层做正文决策。
- 全程保持当前用户可见行为不变。

## 3. User Stories

### US-001: 盘点主协调层职责
**描述：** 作为后续接手重构的工程师，我希望看到 `src/App.tsx` 的职责总表，以便先锁定现状，再决定哪些内容应该迁出。

**Acceptance Criteria：**
- [ ] PRD 中存在一份职责总表，至少覆盖页面组装、用户交互入口、窗口编排、服务启动与清理、运行时配置响应、事件桥接、AI 表现协调、本地 UI state、低干扰/穿透/presence 控制。
- [ ] 职责总表中的每一项都标明唯一的未来主归属，不出现“一项职责同时归属于两个主层”的描述。
- [ ] 文档明确说明此步骤只做职责识别与归类，不包含代码拆分方式、hook 设计或接口命名。
- [ ] 读者仅通过本 story 即可回答“为什么 Layer 1 必须先盘点再拆分”。

### US-002: 定义薄协调层边界
**描述：** 作为后续实现者，我希望知道未来 `App.tsx` 允许保留什么、禁止继续承载什么，以便新增逻辑时不再靠主观判断。

**Acceptance Criteria：**
- [ ] PRD 中存在薄协调层白名单，至少包含页面组装、用户交互总入口、少量纯展示导向的本地 UI state、对子层能力的调用。
- [ ] PRD 中存在禁入清单，至少包含窗口规则本体、服务生命周期本体、长生命周期轮询/监听治理、AI 到表现的协调本体、disturbance/presence/穿透决策本体。
- [ ] 白名单与禁入清单之间不存在互相冲突的条目。
- [ ] 文档明确说明 Layer 1 不要求本轮一次性迁出全部逻辑，只定义保留与迁出边界。
- [ ] 读者仅通过本 story 即可判断一个新增逻辑是否允许进入 `App.tsx`。

### US-003: 定义窗口编排层方案
**描述：** 作为负责多窗口重构的工程师，我希望窗口行为有独立的归属层，以便主协调层只表达意图，不直接承载窗口规则。

**Acceptance Criteria：**
- [ ] PRD 明确列出窗口编排层负责的行为，包括 show/hide、位置同步、bounds 更新、hover 延时、子窗口互斥、光标辅助判断、主从窗口联动。
- [ ] PRD 明确说明窗口编排层对上层暴露的是意图级动作，而不是底层窗口 API 细节。
- [ ] PRD 明确说明本层不新增窗口、不修改窗口标签、不改变现有窗口交互节奏。
- [ ] 文档写清本层对 Layer 2、Layer 3、Layer 4、Layer 5 分别提供的前置条件。
- [ ] 读者仅通过本 story 即可区分“页面渲染逻辑”和“窗口编排规则”。

### US-004: 定义应用运行时层方案
**描述：** 作为负责服务生命周期治理的工程师，我希望常驻能力和条件能力有统一归属，以便启动、清理和配置响应不再散落在主入口。

**Acceptance Criteria：**
- [ ] PRD 明确列出应用运行时层负责初始化、清理、配置变更响应、回调向上派发、运行中能力启停判断。
- [ ] PRD 明确列出当前纳入该层范围的能力集合：`weather`、`reminder`、`scheduler`、`screenMonitor`、`timeCycle`、`colorSampler`。
- [ ] PRD 明确区分“常驻服务”和“条件服务”两类运行时能力。
- [ ] PRD 明确说明该层不改变现有业务行为，不扩展为新的业务总线。
- [ ] 文档写清本层对 Layer 2、Layer 3、Layer 4、Layer 5 分别提供的前置条件。

### US-005: 定义分步实施顺序
**描述：** 作为项目维护者，我希望 Layer 1 有稳定的迁移顺序，以便后续可以按阶段推进，而不是大爆炸式重构。

**Acceptance Criteria：**
- [ ] PRD 至少定义 5 个阶段：职责冻结、窗口编排层迁移、运行时层迁移、主协调层收薄确认、向 Layer 2-5 交付前置条件。
- [ ] 每个阶段都写明阶段目标、阶段输入、阶段输出、必须保持不变的行为、进入下一阶段的前提。
- [ ] 文档明确禁止 Layer 1 与 Layer 2-5 混合推进。
- [ ] 文档明确要求每一步都以“行为不变”为前提。
- [ ] 读者仅通过本 story 即可理解 Layer 1 的推进顺序与阶段边界。

### US-006: 完成 Layer 1 闭环交付定义
**描述：** 作为后续执行 Layer 2-5 的工程师，我希望 Layer 1 的最终交付边界足够清晰，以便不需要重新回头定义基础架构前提。

**Acceptance Criteria：**
- [ ] PRD 明确说明 Layer 1 只覆盖架构与代码层，不展开 Layer 2-6 正文方案。
- [ ] PRD 明确说明 Layer 1 的最终交付物包含职责总表、薄协调层边界、窗口编排层边界、应用运行时层边界、分步实施顺序。
- [ ] PRD 明确说明 Layer 2-5 分别可直接复用哪些前置输入。
- [ ] PRD 明确说明本次不进入数据库、事件语义细化、AI 输出协议和终端用户功能设计。
- [ ] 后续工程师仅阅读本 PRD，即可理解 Layer 1 做什么、不做什么，以及它如何支撑后续层。

## 4. Functional Requirements

- FR-1: 系统必须提供 `src/App.tsx` 当前职责的完整盘点结果，并为每项职责标记唯一未来主归属。
- FR-2: 系统必须定义薄协调层的职责白名单与禁入清单，并保证两者无冲突。
- FR-3: 系统必须将多窗口行为归类到独立的窗口编排层，并明确该层负责的行为边界。
- FR-4: 系统必须将运行中能力的生命周期治理归类到独立的应用运行时层，并明确该层负责的动作边界。
- FR-5: 系统必须给出渐进式实施顺序，至少覆盖职责冻结、窗口编排迁移、运行时迁移、主协调层收薄、向 Layer 2-5 交付前置条件五个阶段。
- FR-6: 系统必须要求 Layer 1 的所有实施都以现有行为不变为前提，不允许因治理而改变终端用户体验。
- FR-7: 系统必须为 Layer 2、Layer 3、Layer 4、Layer 5 分别写明前置铺垫，而不是笼统写“供后续使用”。
- FR-8: 系统必须明确 Layer 1 只产出治理方案，不包含代码实现设计、接口命名细节或底层算法时序。
- FR-9: 系统必须明确当前窗口集合 `main`、`speech-bubble`、`todo-manager`、`settings`、`focus`、`scheduler` 在 Layer 1 中保持不变。
- FR-10: 系统必须明确当前运行时能力集合 `weather`、`reminder`、`scheduler`、`screenMonitor`、`timeCycle`、`colorSampler` 在 Layer 1 中只做归位，不做业务改写。

## 5. Non-Goals

- 不实现 Layer 1 的代码重构。
- 不进入 Layer 2：事件与状态层的正文设计。
- 不进入 Layer 3：AI 交互层的正文设计。
- 不进入 Layer 4：产品体验层的正文设计。
- 不进入 Layer 5：工程与质量层的正文设计。
- 不展开 Layer 6：商业与扩展层。
- 不改数据库 schema、迁移策略或数据流协议。
- 不修改现有 Tauri command 设计、窗口标签或权限模型。
- 不细化事件语义、事件命名改造或 AI 输出协议。
- 不新增终端用户可见功能。

## 6. Design Considerations

- 本文档是工程治理 PRD，不要求新增 UI 或视觉稿。
- 文档结构需要让初级工程师和 AI 代理都能快速理解，因此应优先采用“边界 + 输入 + 输出 + 不做什么 + 完成标志”的表达方式。
- 由于本项目已有 `docs/architecture/PROJECT_OVERVIEW.md` 和 `docs/architecture/ARCHITECTURE.md`，本 PRD 应与现有分层文档保持一致，不制造第二套术语。
- PRD 的文字应直接服务于后续 story 拆分，避免写成泛泛的“架构优化建议”。

## 7. Technical Considerations

- 当前主要治理热点是 [`src/App.tsx`](D:/project/zhushou/src/App.tsx)，其职责过重问题已在 [`docs/architecture/TECH_DEBT.md`](D:/project/zhushou/docs/architecture/TECH_DEBT.md) 中登记为高优先级技术债。
- 当前项目的分层基线以 [`docs/architecture/PROJECT_OVERVIEW.md`](D:/project/zhushou/docs/architecture/PROJECT_OVERVIEW.md) 与 [`docs/architecture/ARCHITECTURE.md`](D:/project/zhushou/docs/architecture/ARCHITECTURE.md) 为准。
- Layer 1 的输入来源以 [`最新需求.md`](D:/project/zhushou/最新需求.md) 中的 Layer 1 五个子任务为准。
- 当前项目缺乏系统化自动化测试，因此 Layer 1 的成功定义必须强调“行为不变”和“可分阶段验证”，否则后续重构会放大回归风险。
- 多窗口、透明、穿透、托盘和位置联动属于高回归风险区域，Layer 1 需要优先把这些行为归属说明写清楚，而不是直接改实现。
- Layer 1 只定义归属与迁移顺序，不定义 hook 名称、controller API、事件时序算法或具体文件拆分方案。

## 8. Success Metrics

- 后续工程师能在只阅读本 PRD 的情况下，准确回答 `App.tsx` 中哪些职责要保留、哪些职责必须迁出。
- 后续工程师能在只阅读本 PRD 的情况下，准确回答窗口编排层和应用运行时层分别负责什么、不负责什么。
- Layer 1 后续实施可以按阶段拆分，不需要重新设计迁移顺序。
- Layer 2-5 的后续 PRD 或实施方案不需要重新盘点 Layer 1 的职责边界。
- 在 Layer 1 进入实施前，团队对“行为不变”约束达成一致，不再把架构治理当作顺手改功能的入口。

## 9. Open Questions

- Layer 1 的正式实施产物最终是否需要同步落位到 `docs/specs/`，以消除当前根目录文件与索引路径不一致的问题？
- 当前 `App.tsx` 内已有的模块级变量，哪些属于窗口编排层，哪些属于应用运行时层，是否需要在职责总表中单独列为一类？
- 进入 Layer 1 实施时，是否需要先补一份固定人工回归清单，作为每阶段迁移的验收前置条件？
- 如果某些职责在盘点时无法稳定归类，是否需要单独建立“待裁决职责清单”，避免带着模糊归属继续推进？

---

## US-001 交付：`src/App.tsx` 职责盘点与归属标记

### 为什么必须先盘点再拆分

`src/App.tsx` 当前约 900 行，是整个应用中最重的单一文件。它同时承担页面组装、窗口编排、服务生命周期、事件监听、AI 表现协调和低干扰控制等多重职责。如果不先锁定"现在到底做了哪些事"，任何拆分都可能遗漏或错误归类职责，导致迁移后行为不一致或回归缺陷。盘点的目的是建立唯一的事实基础：所有后续的边界定义、迁移方案和阶段门禁都基于此表展开，而不是基于模糊印象。

### 职责总表

> **说明**：本步骤只识别和归类职责，不定义 hook 名称、控制器 API、接口命名或文件拆分细节。

| # | 职责类别 | 当前位置（行号范围） | 具体内容 | 未来主归属层 |
|---|---------|---------------------|---------|------------|
| R-01 | **页面组装** | L837-L896（JSX return） | 渲染 `CloudPet`、`InputBar`、`HoverMenu` 三个核心组件，组织 pet-area / menu-trigger / input-bar 的 DOM 结构，绑定鼠标悬停和离开的事件处理器 | **薄协调层**（App.tsx 保留） |
| R-02 | **用户交互入口** | L543-L565（handleSend）、L644-L689（handleXxxBtnEnter/Leave）、L693-L706（resetIdle）、L786-L835（handleInput/Pet/MenuZone Enter/Leave） | 用户输入发送（chatStream 调用）、悬停菜单按钮的进入/离开处理、空闲计时重置、宠物区域悬停交互、输入框聚焦/失焦处理 | **薄协调层**（App.tsx 保留） |
| R-03 | **窗口编排：显示/隐藏** | L125-L241（showXxxWindow / hideXxxWindow × 4 组） | todo-manager、settings、focus、scheduler 四个子窗口的显示和隐藏，包含互斥逻辑（todo ↔ scheduler） | **窗口编排层**（迁出） |
| R-04 | **窗口编排：位置同步** | L568-L626（initWindows + onMoved 监听） | 主窗口移动时实时同步 todo-manager、settings、speech-bubble、scheduler 四个子窗口的位置，根据各窗口与主窗口的相对关系计算逻辑坐标 | **窗口编排层**（迁出） |
| R-05 | **窗口编排：bounds 更新与光标辅助判断** | L59-L123（startCursorPoll / stopCursorPoll） | 150ms 轮询光标物理坐标，判断光标是否在各子窗口 bounds 内，触发延时隐藏或取消隐藏 | **窗口编排层**（迁出） |
| R-06 | **窗口编排：hover 延时与子窗口互斥** | L44-L57（模块级 timer/visible/bounds 变量）、L644-L689（handleXxxBtnEnter/Leave） | 各子窗口的 show/hide 计时器管理（200ms 显示延迟、500ms 隐藏延迟），todo 与 scheduler 的互斥显示逻辑 | **窗口编排层**（迁出） |
| R-07 | **窗口编排：气泡窗口控制** | L256-L285（showSpeech） | speech-bubble 窗口的位置计算、首次显示初始化（等待 WebView2 冷启动 400ms）、通过 `speech:show` 事件传递内容 | **窗口编排层**（迁出） |
| R-08 | **服务启动与清理** | L391-L541（init useEffect） | 初始化数据库（getDb）、启动 weather / reminder / timeCycle / scheduler / colorSampler / screenMonitor 六个运行时能力，注册清理函数（useEffect return） | **应用运行时层**（迁出） |
| R-09 | **运行时配置响应** | L437-L441（listen settings-changed） | 监听 `settings-changed` 事件后重置 AI 客户端缓存（resetClient）、重新读取提醒间隔配置 | **应用运行时层**（迁出） |
| R-10 | **事件桥接：待办与专注** | L443-L480（listen all-todos-complete / focus-*） | 监听 `all-todos-complete` 触发 proudly 表情；监听 `focus-start/pause/reset/tick/phase-change/mouse-enter/mouse-leave` 更新 focusClock 状态和触发气泡 | **应用运行时层**（迁出） |
| R-11 | **事件桥接：CC 工作感知** | L483-L511（listen cc-event） | 监听 Claude Code 的 `cc-event`（PermissionRequest / Stop / PreToolUse / PostToolUse），控制表情变化、气泡显示和 ccActive 状态 | **应用运行时层**（迁出） |
| R-12 | **AI 表现协调** | L517-L531（screenMonitor 回调）、L543-L565（handleSend 中的流式回调） | 屏幕监控主动发言时的表情 + 气泡编排；用户输入后 AI 流式回复时的 thinking→happy→default 表情切换和 speech:show/append/done 事件序列 | **薄协调层**（App.tsx 保留，作为上层调用入口；底层时序可下沉） |
| R-13 | **本地 UI State** | L244-L316（useState / useRef 声明） | expression、weather、showHoverMenu、isProcessing（来自 Zustand）；isPassthrough、focusClock、showInputBar、disturbMode、ccActive（本地 state）；各类 ref（bubbleReady、reminderInterval、petArea、inputBar 等） | **薄协调层**（纯展示导向状态保留；窗口相关 ref 随窗口编排层迁出；服务相关 ref 随运行时层迁出） |
| R-14 | **低干扰模式控制** | L307-L312（disturbModeRef / disturbMode state）、L334-L341（fullscreen_mode 轮询）、L344-L380（disturbance 光标轮询与穿透切换） | 500ms 轮询 `get_fullscreen_mode` 获取全屏状态，根据模式设置透明度和 pointer-events；低干扰模式下启用点击穿透，轮询光标判断是否悬停 1s 后恢复显形 | **窗口编排层**（迁出，属于 presence/穿透决策） |
| R-15 | **手动穿透控制** | L753-L784（Ctrl 键穿透） | 按住 Ctrl 键启用鼠标穿透（set_window_passthrough），松开或失焦恢复 | **窗口编排层**（迁出，属于穿透决策） |
| R-16 | **窗口失焦状态重置** | L628-L638（onFocusChanged） | 主窗口失焦时重置 isPetHovered、isInputHovered、isInputFocused ref，调用 applyDim 防止低干扰模式被卡住 | **窗口编排层**（迁出） |
| R-17 | **空闲计时** | L28-L29（IDLE_MS 常量）、L693-L706（resetIdle useEffect） | 30 分钟无交互后切换为 sleepy 表情；任何交互重置计时器 | **应用运行时层**（迁出，属于运行时状态管理） |

### 归属层汇总

| 未来主归属层 | 职责编号 | 总计 |
|------------|---------|------|
| **薄协调层**（App.tsx 保留） | R-01, R-02, R-12, R-13（部分） | 4 项 |
| **窗口编排层**（迁出） | R-03, R-04, R-05, R-06, R-07, R-14, R-15, R-16 | 8 项 |
| **应用运行时层**（迁出） | R-08, R-09, R-10, R-11, R-17 | 5 项 |

> **归属原则**：每项职责有且只有一个主归属层。R-13（本地 UI State）在迁移实施时会按字段拆分到不同层，但主归属仍为薄协调层——窗口相关 ref 和服务相关 ref 作为子集随各自的目标层迁出，不构成"一项职责两个主归属"。

### 本步骤的边界

- **只做**：识别 `src/App.tsx` 当前承担的全部职责，为每项职责标记唯一的未来主归属层。
- **不做**：不定义 hook 名称、控制器 API、接口命名、文件拆分方案或具体代码变更。
- **不做**：不改变现有代码行为，不删除或新增任何源文件。

---

## US-002 交付：薄协调层白名单与禁入清单

### 定位

薄协调层是未来 `App.tsx` 收薄后的最终形态。它不是业务逻辑的承载者，而是"页面组装 + 用户交互入口 + 展示状态 + 向下调用"的薄壳。本节定义什么允许留在 App.tsx、什么必须迁出，以便新增逻辑时不再靠主观判断。

### 边界声明

Layer 1 只定义「保留 vs 迁出」的分类边界，不要求本轮一次性迁出全部逻辑。实施阶段（US-005 的分步计划）将按阶段门禁逐步迁移，每个阶段完成后用户可见行为必须保持不变。

### 允许保留白名单（Allowlist）

以下职责允许留在 `App.tsx` 中，作为薄协调层的固有职责：

| # | 白名单条目 | 说明 | 对应职责 |
|---|-----------|------|---------|
| A-01 | **页面组装** | 渲染核心组件（CloudPet、InputBar、HoverMenu），组织 DOM 结构，绑定组件级事件处理器（onMouseEnter/Leave） | R-01 |
| A-02 | **用户交互总入口** | 接收用户操作（发送消息、悬停菜单按钮、宠物区域交互、输入框聚焦/失焦），作为事件处理的第一站；实际业务处理应委托给子层 | R-02 |
| A-03 | **少量纯展示导向的本地 UI State** | 仅保留直接驱动渲染的展示状态：`expression`、`weather`、`showHoverMenu`、`isProcessing`（来自 Zustand）、`focusClock`、`showInputBar`、`ccActive`、`disturbMode`、`isPassthrough`；状态的**计算来源**不能包含轮询、服务调用或复杂条件判断 | R-13（展示子集） |
| A-04 | **向子层发起调用** | 调用窗口编排层或应用运行时层暴露的意图级动作（如 `showSpeech(text)`、`setExpression('happy')`），但不拥有被调用逻辑的规则、时序或条件判断 | R-12（调用入口） |

### 必须迁出禁入清单（Denylist）

以下职责禁止留在 `App.tsx` 中，必须迁出到对应的子层。已存在于当前代码中的逻辑将在后续阶段逐步迁移，新增逻辑一律不允许绕过此清单。

| # | 禁入清单条目 | 说明 | 对应职责 | 目标归属层 |
|---|-------------|------|---------|-----------|
| D-01 | **窗口规则本体** | 子窗口的 show/hide 逻辑、位置计算与定位、互斥规则（todo ↔ scheduler）、bounds 缓存更新、光标轮询（150ms）与越界检测 | R-03, R-04, R-05, R-06, R-07 | 窗口编排层 |
| D-02 | **服务生命周期本体** | 运行时能力的启动（getDb → startWeatherSync → startReminderService → …）与清理、配置变更响应（settings-changed 后重置 AI 客户端缓存） | R-08, R-09 | 应用运行时层 |
| D-03 | **长生命周期轮询与监听治理** | 持续运行的定时器（空闲计时 30 分钟、光标轮询 150ms、全屏检测 500ms）和长期事件监听器（all-todos-complete、focus-*、cc-event）的注册、管理与卸载 | R-10, R-11, R-17 | 应用运行时层 |
| D-04 | **AI 到表现的协调本体** | AI 流式回复时的表情切换序列（thinking → happy → default）、speech:show → speech:append → speech:done 事件链的完整编排、屏幕监控主动发言时的表情 + 气泡 + 延时恢复完整表现序列 | R-12（时序编排部分） | 应用运行时层 |
| D-05 | **disturbance / presence / 穿透决策本体** | 低干扰模式的模式检测（全屏检测 500ms 轮询）、穿透状态切换（set_window_passthrough）、失焦重置、Ctrl 键穿透控制、显形/隐形的条件判断与光标悬停计时 | R-14, R-15, R-16 | 窗口编排层 |

### 白名单与禁入清单不冲突原则

白名单中的「向子层发起调用」（A-04）与禁入清单中的各项存在明确的**调用-所有权分离**：

- **A-04 允许**：App.tsx 在用户交互或事件回调中调用 `showSpeech(text)`、`setExpression('happy')` 等意图级动作。
- **D-01 ~ D-05 禁止**：App.tsx 不拥有这些动作背后的规则、时序、轮询或条件判断。

不冲突的具体论证：

| 可能的冲突疑虑 | 不冲突原因 |
|--------------|----------|
| A-03 持有 `disturbMode` 状态 vs D-05 禁止穿透决策本体 | A-03 仅持有展示用的状态值；D-05 禁止的是 `disturbMode` 的**计算逻辑**（全屏检测轮询、模式判断）。两者职责清晰分离：存值 vs 算值。 |
| A-04 调用 `showSpeech` vs D-01 禁止窗口规则本体 | A-04 仅传递意图（文本 + 时长）；D-01 禁止的是 `showSpeech` 背后的窗口定位、WebView 初始化等待、bounds 缓存。App.tsx 只说"显示气泡"，不问"怎么定位"。 |
| A-04 调用 `setExpression('thinking')` vs D-04 禁止 AI 协调本体 | A-04 仅触发单次表情切换；D-04 禁止的是 thinking → happy → default 的**完整时序编排**和 speech:* 事件链的发送逻辑。单次调用 vs 多步编排是不同的粒度。 |

### 新增逻辑判定指南

当需要新增一段逻辑到 `App.tsx` 时，通过以下顺序回答问题，判定是否允许：

**Q1：这段逻辑是否仅组装 JSX 元素或绑定组件级事件处理器（onMouseEnter/Leave、onFocus/onBlur）？**
- **是** → 允许（A-01 页面组装）。到此结束。
- **否** → 继续 Q2。

**Q2：这段逻辑是否仅在用户直接操作（点击、悬停、输入、按键）触发时，作为事件处理的第一站入口？**
- **是** → 允许（A-02 用户交互入口），但实际业务处理应立即委托给子层（窗口编排层或应用运行时层）。到此结束。
- **否** → 继续 Q3。

**Q3：这段逻辑是否声明或更新一个直接驱动 JSX 渲染的展示状态（如表情、可见性开关），且赋值来源是简单字面量或子层返回值？**
- **是** → 允许（A-03 展示状态），但赋值来源不能包含轮询循环、服务直接调用或多条件分支判断。到此结束。
- **否** → 继续 Q4。

**Q4：这段逻辑是否仅调用子层暴露的意图级 API（如 `showSpeech(text)`、`setExpression('happy')`），且不内联被调用方的任何规则或时序？**
- **是** → 允许（A-04 调用入口）。到此结束。
- **否** → **禁止进入 App.tsx**，应归属到窗口编排层（D-01/D-05）或应用运行时层（D-02/D-03/D-04）。

### 模块级变量的归属对照

当前 `App.tsx` 的模块级变量（L21-L57）也需遵循白名单与禁入清单：

| 变量 | 当前用途 | 归属判定 | 目标层 |
|------|---------|---------|-------|
| `idleTimer`、`IDLE_MS` | 空闲计时（30 分钟） | 禁入（D-03 长生命周期轮询） | 应用运行时层 |
| `hoverTimer`、`inputBarTimer` | 菜单/输入栏显示延时 | 允许（A-01 页面组装的延时展示） | 薄协调层 |
| `todoShowTimer`、`todoHideTimer` 等 × 8 个 | 子窗口 show/hide 计时器 | 禁入（D-01 窗口规则本体） | 窗口编排层 |
| `todoVisible`、`settingsVisible` 等 × 4 个 | 子窗口可见状态 | 禁入（D-01 窗口规则本体） | 窗口编排层 |
| `todoBounds`、`settingsBounds` 等 × 4 个 | 子窗口物理边界缓存 | 禁入（D-01 窗口规则本体） | 窗口编排层 |
| `cursorPollTimer` | 光标轮询定时器 | 禁入（D-01 窗口规则本体） | 窗口编排层 |
| `onInteractionChange` | 低干扰模式的交互回调 | 禁入（D-05 穿透决策本体） | 窗口编排层 |

### 本步骤的边界

- **只做**：定义薄协调层的保留白名单与迁出禁入清单，建立新增逻辑判定指南，映射模块级变量归属。
- **不做**：不实施代码迁移、不定义 hook 名称/控制器 API/文件拆分方案、不改变现有代码行为。
- **不做**：不要求一次性迁出全部禁入清单中的逻辑——具体迁移节奏由 US-005 的分步实施计划决定。

---

## US-003 交付：窗口编排层边界与意图级接口

### 定位

窗口编排层是多窗口系统的独立归属层。它负责所有子窗口的显示/隐藏、位置计算、光标辅助判断、hover 延时、子窗口互斥、穿透决策和失焦重置——但不负责页面渲染内容、业务逻辑或服务生命周期。主协调层（App.tsx）通过意图级动作与窗口编排层交互，只表达"做什么"，不关心"怎么做"。

### 窗口编排层职责清单

以下 8 项职责（源自 US-001 职责总表）归属于窗口编排层：

| # | 职责 | 当前位置（App.tsx 行号） | 说明 |
|---|------|------------------------|------|
| R-03 | **窗口编排：显示/隐藏** | L125-L241 | todo-manager、settings、focus、scheduler 四个子窗口的 show/hide，含 todo ↔ scheduler 互斥逻辑 |
| R-04 | **窗口编排：位置同步** | L568-L626 | 主窗口移动时实时同步 todo-manager、settings、speech-bubble、scheduler 的位置，根据各窗口与主窗口的相对关系计算逻辑坐标 |
| R-05 | **窗口编排：bounds 更新与光标辅助判断** | L59-L123 | 150ms 轮询光标物理坐标，判断光标是否在各子窗口 bounds 内，触发延时隐藏或取消隐藏 |
| R-06 | **窗口编排：hover 延时与子窗口互斥** | L44-L57（模块级变量）、L644-L689 | 各子窗口的 show/hide 计时器（200ms 显示延迟、500ms 隐藏延迟），todo 与 scheduler 的互斥显示逻辑 |
| R-07 | **窗口编排：气泡窗口控制** | L256-L285 | speech-bubble 窗口的位置计算、首次显示初始化（WebView2 冷启动等待 400ms）、通过 `speech:show` 事件传递内容 |
| R-14 | **低干扰模式控制** | L307-L341、L344-L380 | 500ms 轮询全屏状态，根据模式设置透明度和 pointer-events；低干扰模式下启用点击穿透，轮询光标判断悬停后恢复显形 |
| R-15 | **手动穿透控制** | L753-L784 | 按住 Ctrl 键启用鼠标穿透（set_window_passthrough），松开或失焦恢复 |
| R-16 | **窗口失焦状态重置** | L628-L638 | 主窗口失焦时重置 isPetHovered、isInputHovered、isInputFocused ref，调用 applyDim 防止低干扰模式卡住 |

> **归属依据**：以上 8 项职责在 US-001 盘点中均被标记为「窗口编排层（迁出）」，对应 US-002 禁入清单中的 D-01（窗口规则本体）和 D-05（disturbance/presence/穿透决策本体）。

### 意图级接口原则

窗口编排层对上层（薄协调层）暴露的是**意图级动作**，而非底层窗口 API 细节。

**意图级动作的定义**：上层调用方只传递"做什么"（如"显示待办窗口"、"隐藏设置窗口"、"显示气泡文本"），不关心窗口定位算法、WebView 初始化等待、bounds 缓存更新、光标轮询频率、scaleFactor 换算等实现细节。

| 意图级动作示例 | 被封装的底层细节 |
|--------------|----------------|
| `showChildWindow('todo')` | 互斥检查（todo ↔ scheduler）、位置计算（mainPos - width - gap）、scaleFactor 换算、bounds 缓存更新、光标轮询启动 |
| `hideChildWindow('settings')` | WebviewWindow.getByLabel + isVisible 检查 + hide 调用、bounds 清空、光标轮询停止判断 |
| `showSpeech(text, duration)` | speech-bubble 窗口定位、WebView2 冷启动等待、`speech:show` 事件发送 |
| `setDisturbMode(mode)` | 全屏检测轮询启停、穿透状态切换、光标悬停计时、透明度/pointer-events 更新 |

**对上层的约束**：薄协调层不允许直接调用 `WebviewWindow.getByLabel()`、`setPosition()`、`invoke('set_window_passthrough')` 等底层 Tauri 窗口 API。所有窗口相关操作必须通过窗口编排层暴露的意图级动作完成。

### 窗口集合不变约束

窗口编排层在 Layer 1 中保持当前窗口集合不变，不新增窗口、不修改窗口标签、不改变窗口交互节奏：

| 窗口标签 | 类型 | 与主窗口的位置关系 |
|---------|------|-----------------|
| `main` | 主窗口 | — |
| `speech-bubble` | 子窗口 | 主窗口正上方，顶部对齐偏移 CLOUD_TOP_OFFSET - BUBBLE_WIN_H |
| `todo-manager` | 子窗口 | 主窗口左侧，间隔 8px，宽度 306px |
| `settings` | 子窗口 | 主窗口右侧，间隔 8px |
| `focus` | 子窗口 | 主窗口正上方居中，间隔 8px，尺寸 240×320 |
| `scheduler` | 子窗口 | 主窗口左侧（与 todo-manager 同位置，互斥显示） |

> **约束声明**：Layer 1 不新增窗口、不修改窗口标签、不改变现有窗口的显示/隐藏时序参数（200ms 显示延迟、500ms 隐藏延迟、150ms 光标轮询、400ms WebView 冷启动等待）。如果后续需要调整这些参数，属于 Layer 2 或更高层的决策，但参数位置应从 App.tsx 迁移到窗口编排层内部。

### 页面渲染逻辑与窗口编排规则的区分指引

读者可通过以下对照表区分「页面渲染逻辑」和「窗口编排规则」：

| 判断维度 | 页面渲染逻辑（薄协调层保留） | 窗口编排规则（窗口编排层迁出） |
|---------|-------------------------|-------------------------|
| **关注点** | 渲染什么内容（组件、状态、DOM 结构） | 窗口在哪里、是否可见、如何交互 |
| **典型代码** | JSX return、useState/useRef 声明、组件 props 绑定 | WebviewWindow.getByLabel、setPosition、show/hide、scaleFactor 计算 |
| **触发来源** | React 状态变更 → 重新渲染 | 鼠标事件、定时器、窗口事件、光标位置 |
| **数据流向** | Store → State → JSX | 窗口坐标/bounds/可见性 → Tauri Window API |
| **可替换性** | 换一套 UI 框架需要重写 | 换窗口管理方式需要重写，但与 UI 框架无关 |

**简单判断法**：如果一段代码调用了 `WebviewWindow`、`LogicalPosition`、`getCurrentWindow()` 或 `invoke('set_window_passthrough'/'get_fullscreen_mode'/'get_cursor_position')`，它属于窗口编排规则而非页面渲染逻辑。

### 对 Layer 2~5 的前置条件

窗口编排层的存在为后续层提供以下明确的前置条件：

| 后续层 | 窗口编排层提供的前置条件 |
|-------|----------------------|
| **Layer 2（事件与状态层）** | 窗口编排层封装了全部窗口 API 调用，Layer 2 可以安全地在窗口事件（如 onMoved、onFocusChanged）上建立状态管理模式，无需担心与 App.tsx 的直接窗口操作冲突。窗口集合和交互节奏在 Layer 1 中冻结，Layer 2 可以在此基础上定义事件语义。 |
| **Layer 3（AI 交互层）** | 气泡窗口的显示/隐藏/定位被窗口编排层统一管理，Layer 3 的 AI 输出协议只需调用意图级 `showSpeech(text, duration)` 接口，无需关心 speech-bubble 的定位算法、WebView 初始化或 `speech:show/append/done` 事件链的发送细节。 |
| **Layer 4（产品体验层）** | 低干扰模式的模式检测、穿透切换、显形/隐形的条件判断全部归属窗口编排层，Layer 4 在设计产品体验时可以直接复用这些能力，不需要重新理解 App.tsx 中的 disturbance 逻辑。窗口交互参数（延迟时间、轮询频率）集中管理，Layer 4 调整体验参数时只需修改一处。 |
| **Layer 5（工程与质量层）** | 窗口编排层的独立边界使得多窗口行为可以被单独测试和回归验证，Layer 5 建立的自动化检查和回归清单可以针对窗口编排层编写，无需穿透整个 App.tsx。bounds 缓存、光标轮询、互斥逻辑等高回归风险区域有明确的归属和边界。 |

### 本步骤的边界

- **只做**：定义窗口编排层的职责清单、意图级接口原则、窗口集合不变约束、页面渲染与窗口编排的区分指引，以及对 Layer 2~5 的前置条件说明。
- **不做**：不实施代码迁移、不定义 hook 名称/控制器 API/文件拆分方案、不改变现有代码行为、不修改窗口交互时序参数。
- **不做**：不展开窗口编排层内部的具体实现设计（如类结构、状态机、事件总线），这些属于 Layer 2 的范围。

---

## 10. 参考输入

- [`最新需求.md`](D:/project/zhushou/最新需求.md)
- [`docs/architecture/PROJECT_OVERVIEW.md`](D:/project/zhushou/docs/architecture/PROJECT_OVERVIEW.md)
- [`docs/architecture/ARCHITECTURE.md`](D:/project/zhushou/docs/architecture/ARCHITECTURE.md)
- [`docs/architecture/TECH_DEBT.md`](D:/project/zhushou/docs/architecture/TECH_DEBT.md)
- [`MISTAKES.md`](D:/project/zhushou/MISTAKES.md)
