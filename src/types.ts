export type CloudExpression =
  | 'default'
  | 'happy'
  | 'talking'
  | 'worried'
  | 'sleepy'
  | 'rainy'
  | 'sadly'
  | 'proudly';

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy';

export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: string;
  title: string;
  priority: Priority;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
  last_reminded_at: string | null;
}

export interface AiResponse {
  intent: 'create_todo' | 'query_todo' | 'chat';
  reply: string;
  todo?: {
    title: string;
    priority: Priority;
  };
}
