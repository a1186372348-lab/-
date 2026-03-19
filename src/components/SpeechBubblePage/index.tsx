import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

// 气泡尾巴高度 + 窗口与气泡之间的留白
const TAIL_HEIGHT = 8;
const WINDOW_PADDING = 4;

export default function SpeechBubblePage() {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
    getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
  }, []);

  // 根据气泡实际 DOM 尺寸同步窗口大小
  const syncWindowSize = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = Math.ceil(rect.width) + WINDOW_PADDING * 2;
    const h = Math.ceil(rect.height) + TAIL_HEIGHT + WINDOW_PADDING * 2;
    getCurrentWindow().setSize(new LogicalSize(w, h)).catch(() => {});
  }, []);

  // 用 ResizeObserver 监听气泡尺寸变化（流式追加文字时实时响应）
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (visible) syncWindowSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, syncWindowSize]);

  useEffect(() => {
    getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});

    const unsubs: Promise<() => void>[] = [
      // 新一条回复开始：重置内容，立刻显示
      listen<{ text: string; duration?: number }>('speech:show', ({ payload }) => {
        clearTimer();
        setText(payload.text);
        setVisible(true);
        getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {});
        // duration=0 表示流式期间不自动关闭
        if (payload.duration && payload.duration > 0) {
          timerRef.current = setTimeout(dismiss, payload.duration);
        }
      }),

      // 流式追加
      listen<{ delta: string }>('speech:append', ({ payload }) => {
        setText(prev => prev + payload.delta);
      }),

      // 流结束，启动自动关闭计时
      listen<{ duration: number }>('speech:done', ({ payload }) => {
        clearTimer();
        timerRef.current = setTimeout(dismiss, payload.duration ?? 5000);
      }),

      listen('speech:hide', dismiss),
    ];

    return () => {
      clearTimer();
      unsubs.forEach(p => p.then(fn => fn()).catch(() => {}));
    };
  }, [dismiss]);

  return (
    <div className="bubble-window">
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={bubbleRef}
            className="speech-bubble"
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onAnimationComplete={syncWindowSize}
            onClick={dismiss}
          >
            <p className="speech-text">{text}</p>
            <div className="bubble-tail" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
