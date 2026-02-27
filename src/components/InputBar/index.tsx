import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import './index.css';

interface InputBarProps {
  onSend: (text: string) => void;
  isProcessing: boolean;
}

export default function InputBar({ onSend, isProcessing }: InputBarProps) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isProcessing) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleMic = () => {
    // 语音录入占位（Whisper API 集成在后续版本）
    setIsRecording((prev) => !prev);
    if (!isRecording) {
      // 开始录音提示
      setTimeout(() => setIsRecording(false), 5000);
    }
  };

  return (
    <div className="input-bar">
      <input
        ref={inputRef}
        className="input-field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isProcessing ? '思考中...' : '说点什么吧～'}
        disabled={isProcessing}
      />
      <motion.button
        className={`mic-btn ${isRecording ? 'mic-btn--recording' : ''}`}
        onClick={handleMic}
        whileTap={{ scale: 0.9 }}
        title="语音输入"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke={isRecording ? '#ff6b6b' : 'var(--ui-fg)'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="9" y1="22" x2="15" y2="22" />
        </svg>
      </motion.button>
    </div>
  );
}
