import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 采样窗口内多个位置，返回平均亮度 (0–255)
async function sampleLuminance(): Promise<number> {
  const win = getCurrentWindow();
  const pos = await win.outerPosition();   // 屏幕物理像素坐标
  const size = await win.outerSize();

  // 采样 5 个点：四角 + 中心，跳过云朵本身占据的中上区域
  // 重点采样输入栏附近（窗口底部）和菜单区域（窗口中部）的背景
  const samplePoints: [number, number][] = [
    [pos.x + 10, pos.y + size.height - 15],                        // 左下角
    [pos.x + size.width - 10, pos.y + size.height - 15],           // 右下角
    [pos.x + Math.floor(size.width / 2), pos.y + size.height - 15],// 底部中心
    [pos.x + 10, pos.y + Math.floor(size.height * 0.55)],          // 菜单区左侧
    [pos.x + size.width - 10, pos.y + Math.floor(size.height * 0.55)], // 菜单区右侧
  ];

  let totalLuminance = 0;
  for (const [x, y] of samplePoints) {
    const [r, g, b] = await invoke<[number, number, number]>('sample_pixel_color', { x, y });
    // ITU-R BT.709 感知亮度公式
    totalLuminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return totalLuminance / samplePoints.length;
}

// 根据亮度更新 data-bg-theme 属性
// 亮度 > 140 认为背景偏亮 → UI 用深色(black)
// 亮度 ≤ 140 认为背景偏暗 → UI 用浅色(white)
function applyTheme(luminance: number) {
  const theme = luminance > 140 ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bg-theme', theme);
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startColorSampler() {
  // 立即采样一次
  sampleLuminance().then(applyTheme).catch(() => {
    // 采样失败时默认暗色主题（白色UI）
    document.documentElement.setAttribute('data-bg-theme', 'dark');
  });

  // 每 1 秒采样一次（窗口可能被拖动到不同背景上）
  intervalId = setInterval(() => {
    sampleLuminance().then(applyTheme).catch(() => {});
  }, 1000);
}

export function stopColorSampler() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
