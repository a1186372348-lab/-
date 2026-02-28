import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

interface HoverMenuProps {
  visible: boolean;
  onTodoBtnEnter: () => void;
  onTodoBtnLeave: () => void;
  onSettingsBtnEnter: () => void;
  onSettingsBtnLeave: () => void;
}

export default function HoverMenu({
  visible,
  onTodoBtnEnter,
  onTodoBtnLeave,
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
          <button
            className="menu-item"
            onMouseEnter={onTodoBtnEnter}
            onMouseLeave={onTodoBtnLeave}
            title="待办"
          >
            <span className="menu-icon">☑</span>
          </button>
          <button
            className="menu-item"
            onMouseEnter={onSettingsBtnEnter}
            onMouseLeave={onSettingsBtnLeave}
            title="设置"
          >
            <span className="menu-icon">⚙</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
