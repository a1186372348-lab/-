import { create } from 'zustand';
import { CloudExpression, WeatherCondition } from '../types';

interface AppState {
  expression: CloudExpression;
  weather: WeatherCondition;
  showHoverMenu: boolean;
  isProcessing: boolean;
  setExpression: (expr: CloudExpression) => void;
  setWeather: (condition: WeatherCondition) => void;
  setShowHoverMenu: (show: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  expression: 'default',
  weather: 'cloudy',
  showHoverMenu: false,
  isProcessing: false,

  setExpression: (expr) => set({ expression: expr }),
  setWeather: (condition) => set({ weather: condition }),
  setShowHoverMenu: (show) => set({ showHoverMenu: show }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
}));

