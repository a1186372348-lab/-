import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

export default function SpeechBubblePage() {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
    getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
  }, []);

  // 文字更新后滚动到底部（裁切顶部内容，保留最新文字）
  const scrollToBottom = () => {
    const el = textRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

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

  // text 变化时滚到底部
  useEffect(() => {
    scrollToBottom();
  }, [text]);

  return (
    <div className="bubble-window">
      <AnimatePresence>
        {visible && (
          <motion.div
            className="speech-bubble"
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={dismiss}
          >
            <p className="speech-text" ref={textRef}>{text}</p>
            <div className="bubble-tail" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
