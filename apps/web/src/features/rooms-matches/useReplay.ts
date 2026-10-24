// Phòng hiện tại theo sát nước mới; replay ván cũ bắt đầu từ nước 0, bấm Play để phát lại.
// Bàn cờ ở nước thứ n được dựng lại từ bàn cờ ban đầu của ván (đã gồm quân thứ 10) + n nước đầu trong lịch sử.
// Chỉ là cách HIỂN THỊ phía trình duyệt: không đổi trạng thái ván trên máy chủ.
import { useEffect, useMemo, useState } from 'react';
import type { Board, MoveRecord, RoomSnapshot } from '@arena/contracts';

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
    board[m.to] = piece;
  }
  return board;
}

export interface Replay {
  available: boolean;
  cursor: number;
  total: number;
  playing: boolean;
  speedMs: number;
  /** Ván còn đang chạy trên máy chủ (có thể có thêm nước mới). */
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
  const streamId = s?.streamId ?? null;
  const history = useMemo(() => s?.history ?? [], [s?.history]);
  const total = history.length;
  const live = !!s && (s.status === 'running' || s.status === 'waiting');
  const [position, setCursor] = useState(0);
  const [following, setFollowing] = useState(followByDefault);
  const cursor = following ? total : position;
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeed] = useState<number>(SPEEDS[1].ms);

  // Ván mới: theo sát trực tiếp hoặc dừng ở nước 0 theo chế độ của màn hình.
  useEffect(() => {
    setCursor(0);
    setPlaying(false);
    setFollowing(followByDefault);
  }, [streamId, followByDefault]);

  // Đang chạy: tiến một nước mỗi `speedMs`. Hết nước: ván xong thì dừng; ván còn chạy thì chờ nước mới.
  useEffect(() => {
    if (!playing) return;
    if (cursor >= total) {
      if (!live) setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => Math.min(c + 1, total)), speedMs);
    return () => clearTimeout(t);
  }, [playing, cursor, total, speedMs, live]);

  const initial = s?.initialBoard;
  const board = useMemo(
    () => (initial ? boardAt(initial, history, cursor) : (s?.board ?? {})),
    [initial, history, cursor, s?.board],
  );
  const clamp = (n: number) => Math.max(0, Math.min(n, total));
  return {
    available: !!initial,
    cursor: Math.min(cursor, total),
    total,
    playing,
    speedMs,
    live,
    atEnd: cursor >= total,
    board,
    lastMove: cursor > 0 ? (history[cursor - 1] ?? null) : null,
    play: () => {
      setFollowing(false);
      setCursor(cursor);
      if (cursor >= total && !live) setCursor(0); // xem lại từ đầu khi đã ở cuối ván đã xong
      setPlaying(true);
    },
    pause: () => {
      setFollowing(false);
      setCursor(cursor);
      setPlaying(false);
    },
    toggle: () => {
      setFollowing(false);
      setCursor(cursor >= total && !live && !playing ? 0 : cursor);
      setPlaying((p) => !p);
    },
    seek: (n) => {
      setFollowing(false);
      setPlaying(false);
      setCursor(clamp(n));
    },
    step: (delta) => {
      setFollowing(false);
      setPlaying(false);
      setCursor(clamp(cursor + delta));
    },
    setSpeed,
    followLive: () => {
      setFollowing(true);
      setPlaying(false);
    },
  };
}
