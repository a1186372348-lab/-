/**
 * CloudRenderer — 渲染层
 *
 * 只负责"如何画云宝"，不包含任何业务逻辑。
 * 后期替换为 Rive / 3D 形象时，只需重写此文件，
 * CloudPet（逻辑层）和所有表情/动画状态保持不变。
 *
 * Props 契约（稳定，不随渲染技术变化）：
 *   expression        — 当前表情状态
 *   weather           — 当前天气
 *   isProcessing      — AI 处理中
 *   autonomousTrigger — 自主行为触发（调度器注入，Rive 时改为 trigger 输入）
 *   onAutonomousDone  — 行为播完回调
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { CloudExpression, WeatherCondition, FocusClockState } from '../../types';
import { AutonomousBehavior } from '../../services/behaviorScheduler';
import './index.css';

export interface CloudRendererProps {
  expression: CloudExpression;
  weather: WeatherCondition;
  isProcessing: boolean;
  autonomousTrigger?: AutonomousBehavior | null;
  onAutonomousDone?: () => void;
  focusClock?: FocusClockState | null;
}

// ── 表情 → 图片映射 ──────────────────────────────────────────
// 替换 Rive 时：删除此映射，改用 rive.useStateMachine() 驱动
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

// ── 外层主循环 variants ───────────────────────────────────────
// 替换 Rive 时：删除此 variants，由 Rive 状态机内置动画接管
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

// ── 自主行为动画序列 ──────────────────────────────────────────
// 替换 Rive 时：删除此函数，改为向 Rive StateMachine 发送对应 Trigger Input
async function playAutonomousBehavior(
  controls: ReturnType<typeof useAnimation>,
  behavior: AutonomousBehavior,
): Promise<void> {
  const RESET = { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 };

  switch (behavior) {
    case 'blink':
      // 快速眼皮压缩：0.08s 压下 + 0.08s 弹回
      await controls.start({ scaleY: 0.65, transition: { duration: 0.08, ease: 'easeIn' } });
      await controls.start({ scaleY: 1,    transition: { duration: 0.08, ease: 'easeOut' } });
      break;

    case 'stretch':
      // 吸气：拉高身体；呼气：略压扁；弹回
      await controls.start({ scaleY: 1.18, y: -8, transition: { duration: 0.35, ease: 'easeOut' } });
      await controls.start({ scaleY: 0.88, y:  4, transition: { duration: 0.25, ease: 'easeIn'  } });
      await controls.start({ ...RESET,            transition: { duration: 0.3,  ease: 'easeOut' } });
      break;

    case 'glanceLeft':
      await controls.start({ rotate: -9, x: -4, transition: { duration: 0.2, ease: 'easeOut' } });
      await controls.start({ rotate: -9, x: -4, transition: { duration: 0.5 } }); // 保持
      await controls.start({ ...RESET,           transition: { duration: 0.25, ease: 'easeOut' } });
      break;

    case 'glanceRight':
      await controls.start({ rotate: 9, x: 4, transition: { duration: 0.2, ease: 'easeOut' } });
      await controls.start({ rotate: 9, x: 4, transition: { duration: 0.5 } }); // 保持
      await controls.start({ ...RESET,          transition: { duration: 0.25, ease: 'easeOut' } });
      break;

    case 'yawn':
      // 缓慢"张嘴"：略宽 + 微转；保持；慢慢合上
      await controls.start({ scaleX: 1.06, rotate: 2,  transition: { duration: 0.6, ease: 'easeOut' } });
      await controls.start({ scaleX: 1.06, rotate: 2,  transition: { duration: 0.8 } }); // 保持
      await controls.start({ ...RESET,                  transition: { duration: 0.7, ease: 'easeInOut' } });
      break;
  }
}

// ── 渲染入口 ─────────────────────────────────────────────────
export default function CloudRenderer({
  expression,
  weather,
  isProcessing,
  autonomousTrigger,
  onAutonomousDone,
  focusClock,
}: CloudRendererProps) {
  const animateKey = getAnimateKey(expression);
  const isRainy = weather === 'rainy' || expression === 'rainy';

  // 内层：控制自主行为叠加动画
  const autonomousControls = useAnimation();
  // 防重入：正在播放时跳过新 trigger
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!autonomousTrigger || isPlayingRef.current) return;

    isPlayingRef.current = true;

    playAutonomousBehavior(autonomousControls, autonomousTrigger).finally(() => {
      isPlayingRef.current = false;
      onAutonomousDone?.();
    });
  }, [autonomousTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const clockRadius = 8.5;
  const clockCircumference = 2 * Math.PI * clockRadius;
  const clockProgress = focusClock
    ? Math.max(0, Math.min(1, focusClock.remainSecs / Math.max(1, focusClock.totalSecs)))
    : 0;
  const clockArcColor = focusClock?.phase === 'rest' ? '#4A9060' : '#C94040';
  const clockMins = focusClock ? Math.floor(focusClock.remainSecs / 60) : 0;
  const clockSecs = focusClock ? focusClock.remainSecs % 60 : 0;
  const clockTimeStr = `${String(clockMins).padStart(2, '0')}:${String(clockSecs).padStart(2, '0')}`;

  return (
    <div className="cloud-pet-wrapper">
      {/* 番茄时钟 — 专注运行时显示在左上角 */}
      {focusClock && (
        <div className={`cloud-tomato-clock${focusClock.running ? ' cloud-tomato-clock--visible' : ''}`}>
          <svg viewBox="0 0 44 50" width="44" height="50">
            {/* 左叶（短圆） */}
            <path d="M 20 19 C 15 16 9 11 11 7 C 13 4 19 14 20 19 Z" fill="#5A9E6E" />
            {/* 右叶（略大，轻微不对称） */}
            <path d="M 24 19 C 29 15 35 10 33 6 C 31 3 25 13 24 19 Z" fill="#4B8C5F" />
            {/* 茎 */}
            <path d="M 22 19 Q 21.5 15 21 13" stroke="#4A7A5A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            {/* 番茄体 */}
            <circle cx="22" cy="33" r="16" fill="#E8514A" />
            {/* 微高光 */}
            <ellipse cx="17" cy="27" rx="4" ry="2.5" fill="rgba(255,255,255,0.12)" transform="rotate(-20 17 27)" />
            {/* 白色表盘（暖白） */}
            <circle cx="22" cy="33" r="11" fill="#FFFEF8" />
            {/* 进度底轨 */}
            <circle cx="22" cy="33" r={clockRadius} fill="none" stroke="#EDE8E0" strokeWidth="2" />
            {/* 进度弧 */}
            <circle
              cx="22" cy="33" r={clockRadius}
              fill="none"
              stroke={clockArcColor}
              strokeWidth="2"
              strokeDasharray={`${clockCircumference}`}
              strokeDashoffset={`${clockCircumference * (1 - clockProgress)}`}
              strokeLinecap="round"
              transform="rotate(-90 22 33)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
            {/* 时间文字 MM:SS */}
            <text
              x="22" y="35.5"
              textAnchor="middle"
              fontSize="5"
              fontWeight="600"
              fill="#5A3535"
              fontFamily="'SF Mono', 'Consolas', monospace"
              style={{ fontVariantNumeric: 'tabular-nums' } as React.CSSProperties}
            >{clockTimeStr}</text>
          </svg>
        </div>
      )}
      {/* 外层：主循环动画（float / thinking / sleepy...） */}
      <motion.div
        className="cloud-pet"
        variants={petVariants}
        animate={animateKey}
      >
        {/* 内层：叠加一次性自主行为（Rive 时替换为发送 Trigger Input） */}
        <motion.div animate={autonomousControls} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* 主图片 — 替换 Rive 时换成 <RiveCanvas stateMachine={expression} /> */}
          <img
            src={EXPRESSION_IMAGE[expression]}
            alt={expression}
            className="cloud-img"
            draggable={false}
            style={{
              filter: isRainy
                ? 'drop-shadow(0 4px 12px rgba(100,120,160,0.3)) grayscale(0.3)'
                : 'drop-shadow(0 8px 24px rgba(180,200,255,0.4))',
            }}
          />
        </motion.div>

        {/* 思考中加载圈 — 替换 Rive 时由状态机内置动画处理 */}
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

        {/* 雨滴动画 — 替换 Rive 时由粒子层或状态机处理 */}
        <AnimatePresence>
          {isRainy && (
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
