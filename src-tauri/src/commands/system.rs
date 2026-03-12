#[cfg(target_os = "windows")]
mod gdi {
    use std::ffi::c_void;
    type HWND = *mut c_void;
    type HDC = *mut c_void;

    #[link(name = "gdi32")]
    extern "system" {
        fn GetDC(hwnd: HWND) -> HDC;
        fn ReleaseDC(hwnd: HWND, hdc: HDC) -> i32;
        fn GetPixel(hdc: HDC, x: i32, y: i32) -> u32;
    }

    pub fn sample(x: i32, y: i32) -> (u8, u8, u8) {
        unsafe {
            let hdc = GetDC(std::ptr::null_mut());
            let color = GetPixel(hdc, x, y);
            ReleaseDC(std::ptr::null_mut(), hdc);
            // CLR_INVALID (0xFFFFFFFF) 表示坐标越界，返回中性灰
            if color == 0xFFFF_FFFF {
                return (128, 128, 128);
            }
            // Windows COLORREF: 低字节=R, 次字节=G, 高字节=B
            let r = (color & 0xFF) as u8;
            let g = ((color >> 8) & 0xFF) as u8;
            let b = ((color >> 16) & 0xFF) as u8;
            (r, g, b)
        }
    }
}

#[cfg(target_os = "windows")]
mod cursor {
    #[repr(C)]
    struct POINT { x: i32, y: i32 }

    #[link(name = "user32")]
    extern "system" { fn GetCursorPos(point: *mut POINT) -> i32; }

    pub fn get_pos() -> (i32, i32) {
        let mut p = POINT { x: 0, y: 0 };
        unsafe { GetCursorPos(&mut p); }
        (p.x, p.y)
    }
}

#[tauri::command]
pub fn get_cursor_position() -> (i32, i32) {
    #[cfg(target_os = "windows")]
    return cursor::get_pos();
    #[cfg(not(target_os = "windows"))]
    (0, 0)
}

#[tauri::command]
pub fn sample_pixel_color(x: i32, y: i32) -> (u8, u8, u8) {
    #[cfg(target_os = "windows")]
    return gdi::sample(x, y);
    #[cfg(not(target_os = "windows"))]
    (128, 128, 128)
}

#[cfg(target_os = "windows")]
mod fullscreen {
    use std::ffi::c_void;
    type HWND = *mut c_void;
    type HMONITOR = *mut c_void;

    #[repr(C)]
    struct RECT { left: i32, top: i32, right: i32, bottom: i32 }

    #[repr(C)]
    struct MONITORINFO {
        cb_size: u32,
        rc_monitor: RECT,
        rc_work: RECT,
        dw_flags: u32,
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHQueryUserNotificationState(state: *mut i32) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetTopWindow(hwnd: HWND) -> HWND;   // NULL → 整个桌面的顶层窗口
        fn GetWindow(hwnd: HWND, cmd: u32) -> HWND;
        fn IsWindowVisible(hwnd: HWND) -> i32;
        fn IsIconic(hwnd: HWND) -> i32;         // 窗口是否最小化
        fn MonitorFromWindow(hwnd: HWND, flags: u32) -> HMONITOR;
        fn GetMonitorInfoW(hmonitor: HMONITOR, lpmi: *mut MONITORINFO) -> i32;
        fn GetWindowThreadProcessId(hwnd: HWND, pid: *mut u32) -> u32;
        fn GetClassNameW(hwnd: HWND, class_name: *mut u16, max: i32) -> i32;
        fn GetWindowLongW(hwnd: HWND, index: i32) -> i32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmGetWindowAttribute(
            hwnd: HWND,
            dw_attribute: u32,
            pv_attribute: *mut RECT,
            cb_attribute: u32,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcessId() -> u32;
    }

    const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;
    const QUNS_BUSY: i32 = 2;
    const QUNS_RUNNING_D3D_FULL_SCREEN: i32 = 3;
    const QUNS_PRESENTATION_MODE: i32 = 4;
    const GWL_EXSTYLE: i32 = -20;
    const GWL_STYLE: i32   = -16;
    const WS_EX_TOOLWINDOW: i32  = 0x00000080;
    const WS_EX_TOPMOST: i32     = 0x00000008;
    const WS_MAXIMIZE: i32       = 0x0100_0000u32 as i32;
    const GW_HWNDNEXT: u32       = 2;

    // 系统桌面/Shell 窗口黑名单（用户在桌面时的前景窗口类名）
    fn is_system_window(hwnd: HWND) -> bool {
        let mut buf = [0u16; 64];
        let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) } as usize;
        let class = String::from_utf16_lossy(&buf[..len]);
        matches!(class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd" | "DV2ControlHost"
            | "Windows.UI.Core.CoreWindow"
        )
    }

    /// 从系统 Z-order 顶部向下找到第一个用户可见的普通窗口（非TOPMOST层、非云宝、非系统），
    /// 它就是用户当前实际看到的窗口，与焦点/前景无关。
    /// 返回：0=正常，1=半透（最大化应用），2=隐藏（无边框全屏游戏）
    pub fn get_mode() -> u8 {
        unsafe {
            // 快速路径：SHQuery 检测 D3D 独占全屏 / PPT 演示
            let mut quns: i32 = 0;
            if SHQueryUserNotificationState(&mut quns) == 0
                && (quns == QUNS_BUSY
                    || quns == QUNS_RUNNING_D3D_FULL_SCREEN
                    || quns == QUNS_PRESENTATION_MODE)
            {
                return 2;
            }

            let our_pid = GetCurrentProcessId();

            // 从桌面顶部向下遍历 Z-order
            let mut hwnd = GetTopWindow(std::ptr::null_mut());
            while !hwnd.is_null() {
                // 跳过我们自己进程的窗口（云宝）
                let mut pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                if pid == our_pid {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 跳过不可见窗口
                if IsWindowVisible(hwnd) == 0 {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 跳过最小化窗口（IsIconic=true 时 DWM 会返回还原后的大小，导致误检）
                if IsIconic(hwnd) != 0 {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 跳过 TOPMOST 层的其他应用（如其他桌面 widget）
                let exstyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
                if exstyle & WS_EX_TOPMOST != 0 {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 跳过工具窗口（系统浮层）
                if exstyle & WS_EX_TOOLWINDOW != 0 {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 已进入普通窗口层，第一个即为用户当前看到的窗口
                // 若是系统桌面 → 用户在桌面，不触发
                if is_system_window(hwnd) {
                    return 0;
                }

                // 获取 DWM 实际可见范围（排除隐形边框）
                let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                if DwmGetWindowAttribute(
                    hwnd, DWMWA_EXTENDED_FRAME_BOUNDS,
                    &mut rect, std::mem::size_of::<RECT>() as u32,
                ) != 0 { return 0; }

                // 最小化窗口的 rect 极小，直接跳过（继续找下一个）
                if rect.right - rect.left < 600 || rect.bottom - rect.top < 600 {
                    hwnd = GetWindow(hwnd, GW_HWNDNEXT);
                    continue;
                }

                // 与显示器比较
                let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                if hmon.is_null() { return 0; }

                let mut mi = MONITORINFO {
                    cb_size: std::mem::size_of::<MONITORINFO>() as u32,
                    rc_monitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
                    rc_work:    RECT { left: 0, top: 0, right: 0, bottom: 0 },
                    dw_flags: 0,
                };
                if GetMonitorInfoW(hmon, &mut mi) == 0 { return 0; }

                let t = 10i32;
                let m = &mi.rc_monitor;
                let covers = rect.left   <= m.left   + t
                          && rect.top    <= m.top    + t
                          && rect.right  >= m.right  - t
                          && rect.bottom >= m.bottom - t;

                let style = GetWindowLongW(hwnd, GWL_STYLE);
                let maximized = style & WS_MAXIMIZE != 0;

                return if covers {
                    if maximized { 1 } else { 2 }
                } else {
                    0
                };
            }

            0
        }
    }
}

/// 返回当前低干扰等级：0=正常，1=半透（最大化应用），2=隐藏（无边框全屏游戏）
#[tauri::command]
pub fn get_fullscreen_mode() -> u8 {
    #[cfg(target_os = "windows")]
    return fullscreen::get_mode();
    #[cfg(not(target_os = "windows"))]
    0
}

#[tauri::command]
pub fn set_window_passthrough(window: tauri::Window, passthrough: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(passthrough)
        .map_err(|e| e.to_string())
}
