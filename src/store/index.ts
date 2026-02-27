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
  showTodoPanel: boolean;
  speechBubble: SpeechBubble;
  isProcessing: boolean;

  // 数据
  todos: Todo[];

  // Actions
  setExpression: (expr: CloudExpression) => void;
  setWeather: (condition: WeatherCondition) => void;
  setShowHoverMenu: (show: boolean) => void;
  setShowTodoPanel: (show: boolean) => void;
  showSpeech: (text: string, durationMs?: number) => void;
  hideSpeech: () => void;
  setTodos: (todos: Todo[]) => void;
  addTodo: (todo: Todo) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodoTitle: (id: string, title: string) => void;
  setIsProcessing: (processing: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  expression: 'default',
  weather: 'cloudy',
  showHoverMenu: false,
  showTodoPanel: false,
  speechBubble: { visible: false, text: '' },
  isProcessing: false,
  todos: [],

  setExpression: (expr) => set({ expression: expr }),
  setWeather: (condition) => set({ weather: condition }),
  setShowHoverMenu: (show) => set({ showHoverMenu: show }),
  setShowTodoPanel: (show) => set({ showTodoPanel: show }),

  showSpeech: (text, durationMs = 5000) => {
    set({ speechBubble: { visible: true, text } });
    setTimeout(() => {
      set({ speechBubble: { visible: false, text: '' } });
    }, durationMs);
  },

  hideSpeech: () => set({ speechBubble: { visible: false, text: '' } }),
  setTodos: (todos) => set({ todos }),

  addTodo: (todo) =>
    set((state) => ({ todos: [todo, ...state.todos] })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === id
          ? {
              ...t,
              is_completed: !t.is_completed,
              completed_at: !t.is_completed
                ? new Date().toISOString()
                : null,
            }
          : t
      ),
    })),

  deleteTodo: (id) =>
    set((state) => ({ todos: state.todos.filter((t) => t.id !== id) })),

  updateTodoTitle: (id, title) =>
    set((state) => ({
      todos: state.todos.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setIsProcessing: (processing) => set({ isProcessing: processing }),
}));
