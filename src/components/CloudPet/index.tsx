/**
 * CloudPet — 逻辑层
 *
 * 只负责"决定云宝处于什么状态"，不关心渲染细节。
 * 渲染由 CloudRenderer 负责，替换 3D/Rive 形象时只改 CloudRenderer。
 */

import { CloudExpression, WeatherCondition } from '../../types';
import CloudRenderer from './CloudRenderer';
import { useAutonomousBehavior } from '../../hooks/useAutonomousBehavior';

interface FocusClockState {
  running: boolean;
  phase: 'focus' | 'rest';
  remainSecs: number;
  totalSecs: number;
}

interface CloudPetProps {
  expression: CloudExpression;
  weather: WeatherCondition;
  isProcessing: boolean;
  focusClock?: FocusClockState | null;
}

export default function CloudPet({ expression, weather, isProcessing, focusClock }: CloudPetProps) {
  const { pendingTrigger, clearTrigger } = useAutonomousBehavior();

  return (
    <CloudRenderer
      expression={expression}
      weather={weather}
      isProcessing={isProcessing}
      autonomousTrigger={pendingTrigger}
      onAutonomousDone={clearTrigger}
      focusClock={focusClock}
    />
  );
}
