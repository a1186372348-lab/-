import { useEffect, useRef } from 'react';
import './index.css';

interface ProgressBarProps {
  visible: boolean;
  progress: number; // 0-100
}

export default function ProgressBar({ visible, progress }: ProgressBarProps) {
  if (!visible) return null;

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="progress-bar-label">{progress}%</span>
    </div>
  );
}
