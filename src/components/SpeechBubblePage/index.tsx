import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

export default function SpeechBubblePage() {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setVisible(false);
    setTimeout(() => getCurrentWindow().hide(), 250);
  }, []);

  useEffect(() => {
    const unsubPromises = [
      listen<{ text: string; duration?: number }>('speech:show', ({ payload }) => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setText(payload.text);
        setVisible(true);
        timerRef.current = setTimeout(dismiss, payload.duration ?? 5000);
      }),
      listen('speech:hide', dismiss),
    ];

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubPromises.forEach(p => p.then(fn => fn()));
    };
  }, [dismiss]);

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
            <p className="speech-text">{text}</p>
            <div className="bubble-tail" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
