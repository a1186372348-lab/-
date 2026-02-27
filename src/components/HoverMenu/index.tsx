import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

interface HoverMenuProps {
  visible: boolean;
  onSelectTodo: () => void;
  onSelectSettings: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export default function HoverMenu({
  visible,
  onSelectTodo,
  onSelectSettings,
  onMouseEnter,
  onMouseLeave,
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
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <button className="menu-item" onClick={onSelectTodo} title="待办">
            <span className="menu-icon">☑</span>
          </button>
          <button className="menu-item" onClick={onSelectSettings} title="设置">
            <span className="menu-icon">⚙</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
