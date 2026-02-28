import { create } from 'zustand';
import { CloudExpression, WeatherCondition, Todo } from '../types';

interface SpeechBubble {
  visible: boolean;
  text: string;
}

interface AppState {
  // 云朵状态
  expression: CloudExpression;
  weather: WeatherCondition;

  // UI 状态
  showHoverMenu: boolean;
  speechBubble: SpeechBubble;
  isProcessing: boolean;

  // 数据
  todos: Todo[];

  // Actions
  setExpression: (expr: CloudExpression) => void;
  setWeather: (condition: WeatherCondition) => void;
  setShowHoverMenu: (show: boolean) => void;
  showSpeech: (text: string, durationMs?: number) => void;
  hideSpeech: () => void;
  setTodos: (todos: Todo[]) => void;
  addTodo: (todo: Todo) => void;
  setIsProcessing: (processing: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  expression: 'default',
  weather: 'cloudy',
  showHoverMenu: false,
  speechBubble: { visible: false, text: '' },
  isProcessing: false,
  todos: [],

  setExpression: (expr) => set({ expression: expr }),
  setWeather: (condition) => set({ weather: condition }),
  setShowHoverMenu: (show) => set({ showHoverMenu: show }),

  showSpeech: (text, durationMs = 5000) => {
    set({ speechBubble: { visible: true, text } });
    setTimeout(() => {
      set({ speechBubble: { visible: false, text: '' } });
    }, durationMs);
  },

  hideSpeech: () => set({ speechBubble: { visible: false, text: '' } }),
  setTodos: (todos) => set({ todos }),
  addTodo: (todo) => set((state) => ({ todos: [todo, ...state.todos] })),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
}));
