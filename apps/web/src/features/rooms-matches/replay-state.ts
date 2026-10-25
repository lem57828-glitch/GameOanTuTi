export const REPLAY_SPEEDS = [1200, 600, 300, 120] as const;
export type ReplayIntent = 'forward' | 'seek' | 'none';
export interface ReplayState {
  stream: string | null;
  position: number;
  playing: boolean;
  following: boolean;
  speedMs: number;
  seen: number;
  intent: ReplayIntent;
}
export type ReplayAction =
  | { type: 'source'; stream: string | null; follow: boolean }
  | { type: 'play' | 'toggle' | 'pause'; cursor: number; total: number; live: boolean }
  | { type: 'seek' | 'step'; value: number; cursor: number; total: number }
  | { type: 'tick'; total: number; stream: string | null }
  | { type: 'follow'; total: number }
  | { type: 'seen'; cursor: number }
  | { type: 'speed'; value: number };
export function initialReplayState(stream: string | null, follow: boolean): ReplayState {
  return { stream, position: 0, playing: false, following: follow, speedMs: 600, seen: 0, intent: 'none' };
}
export const clampPly = (value: number, total: number) =>
  Math.max(0, Math.min(Math.max(0, total), Number.isFinite(value) ? Math.round(value) : 0));
export function replayTravelMs(speedMs: number) {
  return Math.round(Math.min(380, Math.max(60, speedMs * 0.68)));
}
export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'source':
      return state.stream === action.stream
        ? state
        : { ...initialReplayState(action.stream, action.follow), speedMs: state.speedMs };
    case 'speed':
      return REPLAY_SPEEDS.some((speed) => speed === action.value)
        ? { ...state, speedMs: action.value }
        : state;
    case 'seen':
      return action.cursor > state.seen ? { ...state, seen: action.cursor } : state;
    case 'follow':
      return {
        ...state,
        position: action.total,
        seen: Math.max(state.seen, action.total),
        following: true,
        playing: false,
        intent: 'none',
      };
    case 'pause':
      return {
        ...state,
        position: clampPly(action.cursor, action.total),
        following: false,
        playing: false,
        intent: 'none',
      };
    case 'toggle':
    case 'play': {
      if (action.type === 'toggle' && state.playing)
        return {
          ...state,
          position: clampPly(action.cursor, action.total),
          following: false,
          playing: false,
          intent: 'none',
        };
      return {
        ...state,
        position: action.cursor >= action.total && !action.live ? 0 : clampPly(action.cursor, action.total),
        following: false,
        playing: action.total > 0 || action.live,
        intent: 'none',
      };
    }
    case 'seek':
      return {
        ...state,
        position: clampPly(action.value, action.total),
        playing: false,
        following: false,
        intent: 'seek',
      };
    case 'step':
      return {
        ...state,
        position: clampPly(action.cursor + action.value, action.total),
        playing: false,
        following: false,
        intent: action.value === 1 ? 'forward' : 'seek',
      };
    case 'tick':
      if (!state.playing || state.following || action.stream !== state.stream) return state;
      return { ...state, position: clampPly(state.position + 1, action.total), intent: 'forward' };
  }
}
