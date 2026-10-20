// Bàn cờ 9×9 tái sử dụng cho phòng trực tiếp, replay và minh họa trang chủ.
// Chỉ hiển thị trạng thái nhận từ server; không tự suy ra thắng thua hay luật.
// Hai bên phân biệt bằng cả màu, hình dạng (Xanh: tròn, Hồng: vuông xoay) và nhãn đọc màn hình.
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
}

export function Board({
  board,
  lastMove,
  label = 'Bàn cờ',
  size = 'md',
  showCoords = true,
  className,
}: BoardProps) {
  const rows = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const glyph =
    size === 'sm' ? 'text-[11px] sm:text-sm' : size === 'lg' ? 'text-base sm:text-2xl' : 'text-sm sm:text-xl';
  return (
    <figure className={cn('w-full', className)} aria-label={label}>
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
          className="grid aspect-square grid-cols-9 grid-rows-9 overflow-hidden rounded-md border border-line bg-bg-deep shadow-deep"
        >
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
                  role="gridcell"
                  aria-label={desc}
                  className={cn(
                    'relative grid place-items-center',
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
                      className={cn(
                        'grid h-[78%] w-[78%] place-items-center leading-none transition-transform duration-200',
                        glyph,
                        piece.side === 'blue'
                          ? 'rounded-full border-2 border-team-blue bg-team-blue/25'
                          : 'rotate-45 rounded-[22%] border-2 border-team-pink bg-team-pink/25',
                      )}
                    >
                      <span className={cn(piece.side === 'pink' && '-rotate-45')}>
                        {PIECE_GLYPH[piece.type]}
                      </span>
                    </span>
                  )}
                </div>
              );
            }),
          )}
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
