import { LedAccent } from './LedAccent';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ReplayBoardEngraving, ReplayCombatFX, type CombatEffect } from './ReplayCombatFX';
import { useArenaMotion } from './MotionSystem';
import { boardMoveOffset } from '../lib/board-motion';
// Bàn cờ 9×9 tái sử dụng cho phòng trực tiếp, replay và minh họa trang chủ.
// Chỉ hiển thị trạng thái nhận từ server; không tự suy ra thắng thua hay luật.
// Hai bên phân biệt bằng cả màu, hình dạng (Xanh: tròn, Hồng: vuông xoay) và nhãn đọc màn hình.
import { PieceGlyph } from './HomeGraphics';
import { cn } from '@arena/ui';
import type { Board as BoardState, MoveRecord, PieceType, Side } from '@arena/contracts';

const COLS = 'ABCDEFGHI';
export const PIECE_LABEL: Record<PieceType, string> = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo' };
export const PIECE_GLYPH: Record<PieceType, string> = { ROCK: '✊', PAPER: '✋', SCISSORS: '✌' };
export const SIDE_LABEL: Record<Side, string> = { blue: 'Xanh', pink: 'Hồng' };
const GOALS: Record<string, Side> = { I9: 'blue', A1: 'pink' };

export interface BoardProps {
  board: BoardState;
  lastMove?: Pick<MoveRecord, 'from' | 'to'> | null;
  /** Nhãn cho trình đọc màn hình. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showCoords?: boolean;
  className?: string;
  motion?: { streamKey: string | null; durationMs: number; animate: boolean };
}

export function Board({
  board,
  lastMove,
  label = 'Bàn cờ',
  size = 'md',
  showCoords = true,
  className,
  motion,
}: BoardProps) {
  const { enabled } = useArenaMotion();
  const figure = useRef<HTMLElement>(null);
  const previous = useRef<{ board: BoardState; stream: string | null; stamp: string } | null>(null);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [effects, setEffects] = useState<CombatEffect[]>([]);
  const stamp = Object.entries(board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, piece]) => `${square}:${piece.side}:${piece.type}`)
    .join('|');
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);
  useLayoutEffect(() => {
    const before = previous.current;
    const stream = motion?.streamKey ?? null;
    previous.current = { board, stream, stamp };
    const clearEffects = () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      setEffects([]);
    };
    if (!enabled || motion?.animate === false || document.hidden) {
      clearEffects();
      return;
    }
    if (before?.stream !== stream) {
      clearEffects();
      return;
    }
    if (before.stamp === stamp) return;
    const offset = boardMoveOffset(before.board, board, lastMove);
    if (!offset || !figure.current || !lastMove) {
      clearEffects();
      return;
    }
    const bounds = figure.current.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
      clearEffects();
      return;
    }
    const piece = figure.current.querySelector<HTMLElement>(
      `[data-square="${lastMove.to}"] .arena-game-piece`,
    );
    if (!piece?.animate) return;
    const moving = board[lastMove.to]!;
    const rotation = moving.side === 'pink' ? ' rotate(45deg)' : '';
    const duration = Math.max(60, Math.min(380, motion?.durationMs ?? 240));
    const captured = before.board[lastMove.to] ?? null;
    const id = ++sequence.current;
    const lifetime = duration + (captured ? 300 : 120);
    setEffects((list) =>
      [
        ...list.filter((item) => item.captured),
        {
          id,
          from: lastMove.from,
          to: lastMove.to,
          side: moving.side,
          type: moving.type,
          captured,
          duration,
          lifetime,
        },
      ].slice(-4),
    );
    const animation = piece.animate(
      [
        { transform: `translate(${offset.x}%,${offset.y}%)${rotation} scale(.96)` },
        { transform: `translate(0%,0%)${rotation} scale(1)` },
      ],
      { duration, easing: 'cubic-bezier(.18,.72,.28,1)' },
    );
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setEffects((list) => list.filter((item) => item.id !== id));
      }, lifetime),
    );
    // Let localized capture effects finish when the next move starts; only the travelling piece is cancelled.
    return () => animation.cancel();
  }, [stamp, lastMove?.from, lastMove?.to, enabled, motion?.streamKey, motion?.durationMs, motion?.animate]);
  const rows = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const glyph =
    size === 'sm' ? 'text-[11px] sm:text-sm' : size === 'lg' ? 'text-base sm:text-2xl' : 'text-sm sm:text-xl';
  return (
    <figure
      ref={figure}
      className={cn('arena-game-board w-full', motion && 'replay-board-animated led-framed', className)}
      aria-label={label}
      data-motion-stamp={stamp}
      data-combat-state={effects.some((item) => item.captured) ? 'capture' : effects.length ? 'move' : 'idle'}
    >
      {motion && (
        <LedAccent
          frame
          variant="replay"
          side={lastMove ? board[lastMove.to]?.side : undefined}
          captureKey={effects.filter((effect) => effect.captured).at(-1)?.id ?? 0}
          impactDelayMs={motion.durationMs}
        />
      )}
      {motion && (
        <div className="replay-board-head" aria-hidden="true">
          <span>BÀN CỜ CHIẾN THUẬT</span>
          <span className="combat-event-tag">
            {effects.some((item) => item.captured) ? 'VA CHẠM / ĂN QUÂN' : 'BÚA · BAO · KÉO / 9 × 9'}
          </span>
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-1.5">
        {showCoords ? (
          <div aria-hidden className="grid grid-rows-9 text-[10px] font-semibold text-ink-muted sm:text-xs">
            {rows.map((r) => (
              <span key={r} className="grid place-items-center pr-0.5">
                {r}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div
          role="grid"
          aria-label={label}
          className="replay-board-grid relative grid aspect-square grid-cols-9 grid-rows-9 overflow-hidden rounded-md border border-line bg-bg-deep shadow-deep"
        >
          {motion && <ReplayBoardEngraving />}
          {rows.map((r) =>
            COLS.split('').map((c, ci) => {
              const sq = `${c}${r}`;
              const piece = board[sq];
              const dark = (ci + r) % 2 === 0;
              const goal = GOALS[sq];
              const isFrom = lastMove?.from === sq;
              const isTo = lastMove?.to === sq;
              const desc = piece
                ? `${sq}: ${PIECE_LABEL[piece.type]} ${SIDE_LABEL[piece.side]}`
                : `${sq}: trống${goal ? `, đích của bên ${SIDE_LABEL[goal]}` : ''}`;
              return (
                <div
                  key={sq}
                  data-square={sq}
                  data-tile={dark ? 'dark' : 'light'}
                  data-motion-target={isTo || undefined}
                  role="gridcell"
                  aria-label={desc}
                  className={cn(
                    'arena-board-cell relative grid place-items-center',
                    dark ? 'bg-surface-2/55' : 'bg-surface/40',
                    goal === 'blue' && 'bg-team-blue/15',
                    goal === 'pink' && 'bg-team-pink/15',
                    isFrom && 'bg-accent/15',
                    isTo && 'bg-accent/30 ring-1 ring-inset ring-accent',
                  )}
                >
                  {goal && !piece && (
                    <span
                      aria-hidden
                      className={cn(
                        'text-[9px] font-bold uppercase tracking-wide sm:text-[10px]',
                        goal === 'blue' ? 'text-team-blue/80' : 'text-team-pink/80',
                      )}
                    >
                      Đích
                    </span>
                  )}
                  {piece && (
                    <span
                      aria-hidden
                      data-side={piece.side}
                      data-piece={piece.type}
                      className={cn(
                        'arena-game-piece grid h-[78%] w-[78%] place-items-center leading-none transition-transform duration-200',
                        glyph,
                        piece.side === 'blue'
                          ? 'rounded-full border-2 border-team-blue bg-team-blue/25'
                          : 'rotate-45 rounded-[22%] border-2 border-team-pink bg-team-pink/25',
                      )}
                    >
                      <span className={cn(piece.side === 'pink' && '-rotate-45')}>
                        <svg className="piece-glyph" viewBox="0 0 24 24">
                          <PieceGlyph type={piece.type} />
                        </svg>
                        {motion && <small className="replay-piece-name">{PIECE_LABEL[piece.type]}</small>}
                      </span>
                    </span>
                  )}
                </div>
              );
            }),
          )}
          {effects.map((item) => (
            <ReplayCombatFX key={item.id} effect={item} />
          ))}
        </div>
        <span />
        {showCoords && (
          <div
            aria-hidden
            className="grid grid-cols-9 text-center text-[10px] font-semibold text-ink-muted sm:text-xs"
          >
            {COLS.split('').map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

export function SideTag({ side, className }: { side: Side; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold',
        side === 'blue' ? 'text-team-blue' : 'text-team-pink',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-3 w-3 border-2',
          side === 'blue'
            ? 'rounded-full border-team-blue bg-team-blue/40'
            : 'rotate-45 rounded-[2px] border-team-pink bg-team-pink/40',
        )}
      />
      {SIDE_LABEL[side]}
    </span>
  );
}
