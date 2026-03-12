export type CloudExpression =
  | 'default'
  | 'happy'
  | 'thinking'
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
