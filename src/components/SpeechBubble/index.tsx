import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

interface SpeechBubbleProps {
  visible: boolean;
  text: string;
  onClose: () => void;
}

export default function SpeechBubble({ visible, text, onClose }: SpeechBubbleProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="speech-bubble"
          initial={{ opacity: 0, y: 10, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.92 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={onClose}
        >
          <p className="speech-text">{text}</p>
          <div className="bubble-tail" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
