## 项目：云朵助手（zhushou）
- 技术栈：Tauri 2 + React + TypeScript + Framer Motion
- 窗口通信：Tauri emitTo / listen 事件系统
- 多窗口：main / todo-manager / settings / focus
- 样式：各组件独立 CSS，全局变量在 App.css

## 开发规范
- 修改前必须先 Read 文件
- 不新增文件，优先编辑已有文件
- 提交前用 git diff 确认改动范围

## Tauri 技术约束（高频错误防护）
- 新增 Tauri command 后必须在 lib.rs 的 invoke_handler 中注册
- capabilities/default.json 必须显式授权对应权限才能调用
- 多窗口事件通信用 emitTo(windowLabel, event)，不用 emit
- Rust command 错误必须返回 Result<T, String>，不能 panic
- 窗口标签必须与 tauri.conf.json 定义一致：main / todo-manager / settings / focus

## 事件通信规范
- 事件 = 通知变化；状态 = 单一数据来源（SSOT）
- 数据流：操作 → 修改状态源 → emit 广播 → 各窗口 listen → 主动拉取 → 更新UI
- 禁止：emit 直接携带完整复杂数据；窗口间私下共享状态
- 事件命名：<domain>:<action>（todo:updated, settings:changed, focus:started）
- useEffect 监听必须成对注册/解绑，防止内存泄漏

## Plan 模式触发条件
- 跨 2 个以上文件的修改 → 进 Plan 模式
- Rust + 前端双侧联动 → 进 Plan 模式
- 架构或通信协议变更 → 进 Plan 模式
- 单文件小改动（样式/参数/bug修复）→ 直接执行

## 验证规范
- Rust 变更后运行 cargo check 验证编译
- TS 变更后运行 tsc --noEmit 验证类型
- UI效果（动画/透明/位置）需用户肉眼确认，Claude 不自主声明通过

## mistake.md 机制
- 每次遇到非预期错误，追加到根目录 mistake.md
- 格式：错误现象 + 根因 + 正确做法
- 新任务开始前先读 mistake.md，命中历史错误时在回复中声明

## 动画规范
- 状态改变 → 驱动动画播放
- 禁止动画完成度驱动状态改变

## 远程仓库
- 线上 GitHub 仓库固定为：https://github.com/a1186372348-lab/-
- 所有 push / 更新操作均推送到此仓库，不得修改 remote 地址
