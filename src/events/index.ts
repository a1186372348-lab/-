// src/events 统一入口 — L2 事件与状态层治理

export { typedEmit, typedEmitTo, typedListen } from './bus';

export type {
  EventMap,
  EventName,
  FocusPhaseChangePayload,
  FocusStartPayload,
  FocusPausePayload,
  FocusResetPayload,
  FocusTickPayload,
  SpeechShowPayload,
  SpeechAppendPayload,
  SpeechDonePayload,
  CcEventPayload,
} from './types';
