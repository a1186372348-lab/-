import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CloudExpression, WeatherCondition } from '../../types';
import './index.css';

interface CloudPetProps {
  expression: CloudExpression;
  weather: WeatherCondition;
  isProcessing: boolean;
}

// 表情 → 图片映射（暂时全部使用 default.png，后续补充其他表情图）
const EXPRESSION_IMAGE: Record<CloudExpression, string> = {
  default:  '/expressions/default.png',
  thinking: '/expressions/thinking.png',
  happy:    '/expressions/happy.png',
  worried:  '/expressions/worried.png',
  rainy:    '/expressions/worried.png',
  sleepy:   '/expressions/sleepy.png',
  sadly:    '/expressions/sadly.png',
  proudly:  '/expressions/proudly.png',
};

// 动画 variants
const petVariants: Variants = {
  float: {
    y: [0, -10, 0],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  thinking: {
    rotate: [0, -3, 3, -2, 2, 0],
    y: [0, -5, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
  worried: {
    rotate: [0, -2, 2, -2, 2, 0],
    transition: { duration: 0.4, repeat: Infinity, ease: 'easeInOut' },
  },
  happy: {
    y: [0, -20, 0],
    transition: { duration: 0.4, repeat: 2, ease: 'easeOut' },
  },
  proudly: {
    scale: [1, 1.12, 1, 1.08, 1],
    y: [0, -16, 0],
    transition: { duration: 0.5, repeat: 2, ease: 'easeOut' },
  },
  sleepy: {
    rotate: [0, -4, 0, 4, 0],
    y: [0, 4, 0],
    transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
  },
};

function getAnimateKey(expression: CloudExpression): string {
  if (expression === 'worried' || expression === 'rainy' || expression === 'sadly') return 'worried';
  if (expression === 'happy') return 'happy';
  if (expression === 'proudly') return 'proudly';
  if (expression === 'thinking') return 'thinking';
  if (expression === 'sleepy') return 'sleepy';
  return 'float';
}

export default function CloudPet({
  expression,
  weather,
  isProcessing,
}: CloudPetProps) {
  const animateKey = getAnimateKey(expression);

  return (
    <div className="cloud-pet-wrapper">
      <motion.div
        className="cloud-pet"
        variants={petVariants}
        animate={animateKey}
      >
        <img
          src={EXPRESSION_IMAGE[expression]}
          alt={expression}
          className="cloud-img"
          draggable={false}
          style={{
            filter: weather === 'rainy' || expression === 'rainy'
              ? 'drop-shadow(0 4px 12px rgba(100,120,160,0.3)) grayscale(0.3)'
              : 'drop-shadow(0 8px 24px rgba(180,200,255,0.4))',
          }}
        />

        {/* 思考中：加载转圈动画（头顶左上角） */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              className="cloud-loader"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.18 }}
            >
              <div className="loader">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className={`bar${i + 1}`} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 雨天：雨滴动画 */}
        <AnimatePresence>
          {(weather === 'rainy' || expression === 'rainy') && (
            <div className="rain-container">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="raindrop"
                  style={{ left: `${15 + i * 16}%` }}
                  animate={{ y: [0, 40], opacity: [0.8, 0] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'linear',
                  }}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
