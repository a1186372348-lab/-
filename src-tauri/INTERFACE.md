# Rust 系统层 — 接口契约

> 此文件由 Rust 系统工程师维护，每次新增或修改 Tauri command 后更新。
> 集成层（App.tsx）凭此文件完成前端对接，无需双方口头沟通。

---

## 格式模板

```markdown
### command_name
- 状态：active / deprecated
- 签名：`invoke<ReturnType>('command_name', { param: Type })`
- 返回：`Promise<ReturnType>`（JS 侧）
- 用途：说明
- 集成层需做：[ ] 具体操作
- 变更日期：YYYY-MM-DD
```

---

## 当前已暴露接口

### get_cursor_position
- 状态：active
- 签名：`invoke<[number, number]>('get_cursor_position')`
- 返回：`[x, y]` 物理像素坐标
- 用途：光标轮询，检测鼠标是否在子窗口区域内
- 变更日期：2026-02-28

### set_window_passthrough
- 状态：active
- 签名：`invoke('set_window_passthrough', { passthrough: boolean })`
- 返回：`Promise<void>`
- 用途：控制主窗口是否允许鼠标点击穿透
- 变更日期：2026-03-02

### get_fullscreen_mode
- 状态：active
- 签名：`invoke<0 | 1 | 2>('get_fullscreen_mode')`
- 返回：`0`=正常，`1`=最大化应用（半透），`2`=无边框全屏游戏（隐藏）
- 用途：低干扰模式三级检测，前端 500ms 轮询
- 变更日期：2026-03-02

### take_screenshot
- 状态：active
- 签名：`invoke<string>('take_screenshot')`
- 返回：base64 编码的 JPEG 截图字符串
- 用途：屏幕监控，供 Gemini/GLM 视觉分析
- 变更日期：2026-03-17

---

## 待集成层处理的变更

> 新增条目在此，集成层处理后移入「当前已暴露接口」并删除此条

<!-- 在此追加 -->
