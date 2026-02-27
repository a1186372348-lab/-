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

#[tauri::command]
pub fn sample_pixel_color(x: i32, y: i32) -> (u8, u8, u8) {
    #[cfg(target_os = "windows")]
    return gdi::sample(x, y);
    #[cfg(not(target_os = "windows"))]
    (128, 128, 128)
}
