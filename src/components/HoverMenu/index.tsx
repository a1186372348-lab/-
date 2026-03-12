import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

interface HoverMenuProps {
  visible: boolean;
  onTodoBtnEnter: () => void;
  onTodoBtnLeave: () => void;
  onFocusBtnEnter: () => void;
  onFocusBtnLeave: () => void;
  onSettingsBtnEnter: () => void;
  onSettingsBtnLeave: () => void;
}

export default function HoverMenu({
  visible,
  onTodoBtnEnter,
  onTodoBtnLeave,
  onFocusBtnEnter,
  onFocusBtnLeave,
  onSettingsBtnEnter,
  onSettingsBtnLeave,
}: HoverMenuProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="hover-menu"
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* 待办 */}
          <button
            className="menu-item"
            data-label="待办"
            onMouseEnter={onTodoBtnEnter}
            onMouseLeave={onTodoBtnLeave}
          >
            <svg className="menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4h2v2H3V4zm4 1h14v2H7V5zm-4 6h2v2H3v-2zm4 1h14v2H7v-2zm-4 6h2v2H3v-2zm4 1h14v2H7v-2z"/>
            </svg>
          </button>

          {/* 专注 */}
          <button
            className="menu-item"
            data-label="专注"
            onMouseEnter={onFocusBtnEnter}
            onMouseLeave={onFocusBtnLeave}
          >
            <svg className="menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
            </svg>
          </button>

          {/* 设置 */}
          <button
            className="menu-item"
            data-label="设置"
            onMouseEnter={onSettingsBtnEnter}
            onMouseLeave={onSettingsBtnLeave}
          >
            <svg className="menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41L9.25 5.35c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94L2.86 14.52c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
