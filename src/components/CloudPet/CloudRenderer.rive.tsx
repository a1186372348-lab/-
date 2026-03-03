// @ts-nocheck — 备用文件，需先 npm install @rive-app/react-canvas 后再启用
/**
 * CloudRenderer (Phase 2 — Rive 版)
 *
 * 启用前提：
 *   1. public/rive/cloudpet.riv 已就位（State Machine 名称：PetController）
 *   2. npm install @rive-app/react-canvas
 *
 * 切换方式：
 *   将此文件重命名为 CloudRenderer.tsx（覆盖 Phase 1 版本）
 *   其余文件无需任何改动：
 *     - CloudPet/index.tsx          ✓ 不变
 *     - useAutonomousBehavior.ts    ✓ 不变
 *     - behaviorScheduler.ts        ✓ 不变
 *     - App.tsx / store             ✓ 不变
 *
 * Props 契约与 Phase 1 完全一致（CloudRendererProps 接口不变）。
 *
 * Rive State Machine 约定（PetController）：
 *   Number  inputs : expression (0-7), 见 EXPRESSION_NUM
 *   Boolean inputs : isProcessing, isRainy, hovered
 *   Trigger inputs : idleBlink, idleStretch, idleGlanceLeft, idleGlanceRight,
 *                    idleYawn, clicked
 */

import { useEffect } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudExpression, WeatherCondition } from '../../types';
import { AutonomousBehavior } from '../../services/behaviorScheduler';
import './index.css';

export interface CloudRendererProps {
  expression: CloudExpression;
  weather: WeatherCondition;
  isProcessing: boolean;
  autonomousTrigger?: AutonomousBehavior | null;
  onAutonomousDone?: () => void;
}

// ── expression → Rive Number Input 映射 ─────────────────────
// 与 Rive 编辑器中 expression Number Input 的值域约定一致
const EXPRESSION_NUM: Record<CloudExpression, number> = {
  default:  0,
  thinking: 1,
  happy:    2,
  worried:  3,
  rainy:    4,
  sleepy:   5,
  sadly:    6,
  proudly:  7,
};

// ── AutonomousBehavior → Rive Trigger Input 名称 ─────────────
const BEHAVIOR_TRIGGER: Record<AutonomousBehavior, string> = {
  blink:       'idleBlink',
  stretch:     'idleStretch',
  glanceLeft:  'idleGlanceLeft',
  glanceRight: 'idleGlanceRight',
  yawn:        'idleYawn',
};

const STATE_MACHINE = 'PetController';
const RIV_SRC = '/rive/cloudpet.riv';

// ── 渲染入口 ─────────────────────────────────────────────────
export default function CloudRenderer({
  expression,
  weather,
  isProcessing,
  autonomousTrigger,
  onAutonomousDone,
}: CloudRendererProps) {
  const isRainy = weather === 'rainy' || expression === 'rainy';

  // ── Rive 初始化 ──────────────────────────────────────────
  const { RiveComponent, rive } = useRive({
    src: RIV_SRC,
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });

  // ── State Machine Inputs ──────────────────────────────────
  // Number
  const inputExpression  = useStateMachineInput(rive, STATE_MACHINE, 'expression');
  // Boolean
  const inputProcessing  = useStateMachineInput(rive, STATE_MACHINE, 'isProcessing');
  const inputRainy       = useStateMachineInput(rive, STATE_MACHINE, 'isRainy');
  // Triggers（自主行为）
  const inputBlink       = useStateMachineInput(rive, STATE_MACHINE, 'idleBlink');
  const inputStretch     = useStateMachineInput(rive, STATE_MACHINE, 'idleStretch');
  const inputGlanceLeft  = useStateMachineInput(rive, STATE_MACHINE, 'idleGlanceLeft');
  const inputGlanceRight = useStateMachineInput(rive, STATE_MACHINE, 'idleGlanceRight');
  const inputYawn        = useStateMachineInput(rive, STATE_MACHINE, 'idleYawn');

  // ── 同步 expression ───────────────────────────────────────
  useEffect(() => {
    if (inputExpression) inputExpression.value = EXPRESSION_NUM[expression];
  }, [expression, inputExpression]);

  // ── 同步 isProcessing ─────────────────────────────────────
  useEffect(() => {
    if (inputProcessing) inputProcessing.value = isProcessing;
  }, [isProcessing, inputProcessing]);

  // ── 同步 isRainy ──────────────────────────────────────────
  // Rive 内的 Idle_Rainy 状态会处理雨滴粒子，无需 HTML 雨滴层
  useEffect(() => {
    if (inputRainy) inputRainy.value = isRainy;
  }, [isRainy, inputRainy]);

  // ── 触发自主行为 ──────────────────────────────────────────
  // Rive Trigger 是单次信号：fire() 后状态机自动跑完动画再回 Idle
  // onAutonomousDone 在 fire() 后立即回调，让调度器继续排队
  // （Rive 内部管理动画时长，无需 isPlayingRef 防重入）
  useEffect(() => {
    if (!autonomousTrigger) return;

    const inputMap: Record<AutonomousBehavior, typeof inputBlink> = {
      blink:       inputBlink,
      stretch:     inputStretch,
      glanceLeft:  inputGlanceLeft,
      glanceRight: inputGlanceRight,
      yawn:        inputYawn,
    };

    const input = inputMap[autonomousTrigger];
    if (input) {
      input.fire();
    }
    // 无论 input 是否就绪（rive 尚在加载时），都清除 trigger 避免积压
    onAutonomousDone?.();
  }, [autonomousTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 渲染 ──────────────────────────────────────────────────
  return (
    <div className="cloud-pet-wrapper">
      <div className="cloud-pet">
        {/*
          Rive Canvas
          - Phase 1 的外层 motion.div（float/thinking 等循环动画）由 Rive 状态机接管
          - Phase 1 的内层 motion.div（自主行为叠加）由 Rive Trigger 接管
          - 雨滴粒子由 Rive 内 Idle_Rainy 状态处理，无需 HTML 层
        */}
        <RiveComponent
          style={{ width: 190, height: 140 }}
          aria-label={expression}
        />

        {/*
          思考加载圈保留 HTML 版。
          如果 Rive 文件内置了 isProcessing 动画，可删除此 AnimatePresence 块。
        */}
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
      </div>
    </div>
  );
}
