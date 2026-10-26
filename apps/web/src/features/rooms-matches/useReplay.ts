// Replay presentation never changes a match, its selection state or its saved moves.
import { useEffect, useMemo, useReducer } from 'react';
import type { Board, MoveRecord, RoomSnapshot } from '@arena/contracts';
import {
  clampPly,
  initialReplayState,
  replayReducer,
  replayTravelMs,
  type ReplayIntent,
} from './replay-state';
export const SPEEDS = [
  { label: '0.5×', ms: 1200 },
  { label: '1×', ms: 600 },
  { label: '2×', ms: 300 },
  { label: '4×', ms: 120 },
] as const;

/** Bàn cờ sau `n` nước đầu tiên. Nước ăn quân: quân đi đè lên ô của quân bị ăn. */
export function boardAt(initial: Board, history: readonly MoveRecord[], n: number): Board {
  const board: Board = { ...initial };
  for (const m of history.slice(0, Math.max(0, Math.min(n, history.length)))) {
    const piece = board[m.from];
    if (!piece) continue;
    delete board[m.from];
    board[m.to] = m.promoted ? { ...piece, type: m.promoted } : piece;
  }
  return board;
}

export interface Replay {
  available: boolean;
  streamKey: string | null;
  cursor: number;
  total: number;
  seen: number;
  history: readonly MoveRecord[];
  playing: boolean;
  following: boolean;
  speedMs: number;
  travelMs: number;
  intent: ReplayIntent;
  live: boolean;
  atEnd: boolean;
  board: Board;
  lastMove: MoveRecord | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (n: number) => void;
  step: (delta: number) => void;
  setSpeed: (ms: number) => void;
  followLive: () => void;
}
export type ReplaySource = Pick<RoomSnapshot, 'streamId' | 'history' | 'status' | 'initialBoard' | 'board'>;
export function useReplay(s: ReplaySource | null, followByDefault = false): Replay {
  const stream = s?.streamId ?? null;
  const [saved, dispatch] = useReducer(replayReducer, undefined, () =>
    initialReplayState(stream, followByDefault),
  );
  // Derive a clean frame immediately on a source change, before effects run.
  const state =
    saved.stream === stream
      ? saved
      : { ...initialReplayState(stream, followByDefault), speedMs: saved.speedMs };
  const history = useMemo(() => s?.history ?? [], [s?.history]);
  const total = history.length;
  const cursor = clampPly(state.following ? total : state.position, total);
  const live = s?.status === 'running' || s?.status === 'waiting';
  useEffect(() => {
    dispatch({ type: 'source', stream, follow: followByDefault });
  }, [stream, followByDefault]);
  useEffect(() => {
    dispatch({ type: 'seen', cursor });
  }, [cursor, stream]);
  useEffect(() => {
    if (!state.playing) return;
    if (cursor >= total) {
      if (!live) dispatch({ type: 'pause', cursor, total, live });
      return;
    }
    const timer = setTimeout(() => dispatch({ type: 'tick', total, stream }), state.speedMs);
    return () => clearTimeout(timer);
  }, [state.playing, state.speedMs, cursor, total, live, stream]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden && state.playing) dispatch({ type: 'pause', cursor, total, live });
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [cursor, total, live, state.playing]);
  const board = useMemo(
    () => (s?.initialBoard ? boardAt(s.initialBoard, history, cursor) : (s?.board ?? {})),
    [s?.initialBoard, s?.board, history, cursor],
  );
  return {
    available: !!s?.initialBoard,
    streamKey: stream,
    cursor,
    total,
    history,
    seen: Math.min(total, Math.max(state.seen, cursor)),
    playing: state.playing,
    following: state.following,
    speedMs: state.speedMs,
    travelMs: replayTravelMs(state.speedMs),
    intent: state.following ? 'forward' : state.intent,
    live,
    atEnd: cursor >= total,
    board,
    lastMove: cursor > 0 ? (history[cursor - 1] ?? null) : null,
    play: () => dispatch({ type: 'play', cursor, total, live }),
    pause: () => dispatch({ type: 'pause', cursor, total, live }),
    toggle: () => dispatch({ type: 'toggle', cursor, total, live }),
    seek: (value) => dispatch({ type: 'seek', value, cursor, total }),
    step: (value) => dispatch({ type: 'step', value, cursor, total }),
    setSpeed: (value) => dispatch({ type: 'speed', value }),
    followLive: () => dispatch({ type: 'follow', total }),
  };
}
