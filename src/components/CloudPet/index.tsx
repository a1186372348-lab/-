import { motion, AnimatePresence } from 'framer-motion';
import { CloudExpression, WeatherCondition } from '../../types';
import './index.css';

interface CloudPetProps {
  expression: CloudExpression;
  weather: WeatherCondition;
  isProcessing: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// SVG 表情配置
const EYES: Record<CloudExpression, { left: string; right: string }> = {
  default: {
    left: 'M 75 82 m -7,0 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0',
    right: 'M 115 82 m -7,0 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0',
  },
  happy: {
    left: 'M 68 86 Q 75 78 82 86',
    right: 'M 108 86 Q 115 78 122 86',
  },
  talking: {
    left: 'M 75 82 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0',
    right: 'M 115 82 m -6,0 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0',
  },
  worried: {
    left: 'M 68 80 Q 75 86 82 80',
    right: 'M 108 80 Q 115 86 122 80',
  },
  sleepy: {
    left: 'M 68 84 Q 75 84 82 84',
    right: 'M 108 84 Q 115 84 122 84',
  },
  rainy: {
    left: 'M 68 80 Q 75 86 82 80',
    right: 'M 108 80 Q 115 86 122 80',
  },
};

const MOUTHS: Record<CloudExpression, string> = {
  default: 'M 87 98 Q 95 106 113 98',
  happy: 'M 82 96 Q 95 112 118 96',
  talking: 'M 88 96 Q 95 108 112 96',
  worried: 'M 88 102 Q 95 96 112 102',
  sleepy: 'M 88 100 Q 95 104 112 100',
  rainy: 'M 88 102 Q 95 96 112 102',
};

import type { Variants } from 'framer-motion';

// 动画 variants
const petVariants: Variants = {
  float: {
    y: [0, -10, 0],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  worried: {
    rotate: [0, -2, 2, -2, 2, 0],
    transition: { duration: 0.4, repeat: Infinity, ease: 'easeInOut' },
  },
  happy: {
    y: [0, -20, 0],
    transition: { duration: 0.4, repeat: 2, ease: 'easeOut' },
  },
};

function getAnimateKey(expression: CloudExpression): string {
  if (expression === 'worried' || expression === 'rainy') return 'worried';
  if (expression === 'happy') return 'happy';
  return 'float';
}

// 云朵颜色
function getCloudColor(weather: WeatherCondition, expression: CloudExpression) {
  if (weather === 'rainy' || expression === 'rainy') return '#b0b8c9';
  return '#ffffff';
}

export default function CloudPet({
  expression,
  weather,
  isProcessing,
  onMouseEnter,
  onMouseLeave,
}: CloudPetProps) {
  const cloudColor = getCloudColor(weather, expression);
  const eyeStyle = EYES[expression];
  const mouthPath = MOUTHS[expression];
  const isTalkingEyeStyle = expression === 'talking' || expression === 'default';
  const animateKey = getAnimateKey(expression);

  return (
    <div className="cloud-pet-wrapper">
      <motion.div
        className="cloud-pet"
        variants={petVariants}
        animate={animateKey}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <svg
          viewBox="0 0 190 140"
          xmlns="http://www.w3.org/2000/svg"
          className="cloud-svg"
          style={{ filter: weather === 'rainy' ? 'drop-shadow(0 4px 12px rgba(100,120,160,0.3))' : 'drop-shadow(0 8px 24px rgba(180,200,255,0.4))' }}
        >
          {/* 云朵主体 */}
          <ellipse cx="95" cy="98" rx="75" ry="40" fill={cloudColor} />
          {/* 左侧鼓包 */}
          <circle cx="50" cy="82" r="36" fill={cloudColor} />
          {/* 右侧鼓包 */}
          <circle cx="140" cy="82" r="30" fill={cloudColor} />
          {/* 顶部鼓包 */}
          <circle cx="95" cy="62" r="40" fill={cloudColor} />

          {/* 眼睛 */}
          {isTalkingEyeStyle ? (
            <>
              <path d={eyeStyle.left} fill="#4a4a6a" />
              <path d={eyeStyle.right} fill="#4a4a6a" />
              {/* 高光 */}
              <circle cx="72" cy="79" r="2.5" fill="white" opacity="0.8" />
              <circle cx="112" cy="79" r="2.5" fill="white" opacity="0.8" />
            </>
          ) : (
            <>
              <path
                d={eyeStyle.left}
                stroke="#4a4a6a"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={eyeStyle.right}
                stroke="#4a4a6a"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </>
          )}

          {/* 嘴巴 */}
          <path
            d={mouthPath}
            stroke="#4a4a6a"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />

          {/* 晴天：太阳 */}
          {weather === 'sunny' && expression !== 'rainy' && (
            <g transform="translate(18, 18)">
              <circle cx="0" cy="0" r="10" fill="#FFD54F" opacity="0.9" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1={Math.cos((deg * Math.PI) / 180) * 13}
                  y1={Math.sin((deg * Math.PI) / 180) * 13}
                  x2={Math.cos((deg * Math.PI) / 180) * 18}
                  y2={Math.sin((deg * Math.PI) / 180) * 18}
                  stroke="#FFD54F"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              ))}
            </g>
          )}
        </svg>

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
