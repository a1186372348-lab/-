import { create } from 'zustand';
import { CloudExpression, FocusClockState, WeatherCondition } from '../types';

interface AppState {
  expression: CloudExpression;
  weather: WeatherCondition;
  showHoverMenu: boolean;
  isProcessing: boolean;
  focusClock: FocusClockState | null;
  setExpression: (expr: CloudExpression) => void;
  setWeather: (condition: WeatherCondition) => void;
  setShowHoverMenu: (show: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setFocusClock: (updater: FocusClockState | null | ((prev: FocusClockState | null) => FocusClockState | null)) => void;
}

export const useAppStore = create<AppState>((set) => ({
  expression: 'default',
  weather: 'cloudy',
  showHoverMenu: false,
  isProcessing: false,
  focusClock: null,

  setExpression: (expr) => set({ expression: expr }),
  setWeather: (condition) => set({ weather: condition }),
  setShowHoverMenu: (show) => set({ showHoverMenu: show }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  setFocusClock: (updater) =>
    set((state) => ({
      focusClock: typeof updater === 'function' ? updater(state.focusClock) : updater,
    })),
}));

