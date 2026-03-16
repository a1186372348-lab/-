import { useState, useRef, KeyboardEvent } from 'react';
import './index.css';

interface InputBarProps {
  onSend: (text: string) => void;
  isProcessing: boolean;
  visible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}

export default function InputBar({
  onSend,
  isProcessing,
  visible,
  onMouseEnter,
  onMouseLeave,
  onInputFocus,
  onInputBlur,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (isRecording) {
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      setIsRecording(false);
    } else {
      setIsRecording(true);
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      recordingTimer.current = setTimeout(() => setIsRecording(false), 5000);
    }
  };

  const isActive = visible || isRecording;

  return (
    <div
      className="input-bar"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="inputbox">
        <input
          ref={inputRef}
          className="input-field"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isProcessing ? '思考中...' : ''}
          disabled={isProcessing}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
        />
        <div className={`input-border ${isActive ? 'input-border--visible' : ''}`} />
      </div>

      <div className={`mic-wrap ${isActive ? 'mic-wrap--visible' : ''}`}>
        <label className="mic-container">
          <input
            type="checkbox"
            checked={isRecording}
            onChange={handleMic}
          />
          <span className="mic-checkmark">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
              stroke="#f0f0f0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="9" y1="22" x2="15" y2="22" />
            </svg>
          </span>
        </label>
      </div>
    </div>
  );
}
