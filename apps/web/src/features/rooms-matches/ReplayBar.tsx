// Thanh điều khiển xem ván: Play/Pause, lùi/tiến một nước, về đầu/cuối, thanh tua, tốc độ.
// Phím tắt khi thanh đang được focus: Space = chạy/dừng, ←/→ = lùi/tiến một nước, Home/End = đầu/cuối.
import { Button, cn, focusRing } from '@arena/ui';
import { SPEEDS, type Replay } from './useReplay';

export function ReplayBar({ r }: { r: Replay }) {
  if (!r.available) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.key !== ' ') return; // thanh tua tự xử lý phím mũi tên
    if (e.key === ' ') {
      e.preventDefault();
      r.toggle();
    } else if (e.key === 'ArrowLeft') r.step(-1);
    else if (e.key === 'ArrowRight') r.step(1);
    else if (e.key === 'Home') r.seek(0);
    else if (e.key === 'End') r.seek(r.total);
  };
  const behind = r.live && r.total > r.cursor ? r.total - r.cursor : 0;
  return (
    <div
      role="group"
      aria-label="Điều khiển xem ván"
      onKeyDown={onKey}
      className="mt-3 flex flex-col gap-2 rounded-md border border-line bg-bg-deep/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Về nước đầu"
          onClick={() => r.seek(0)}
          disabled={r.cursor === 0}
        >
          ⏮
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Lùi một nước"
          onClick={() => r.step(-1)}
          disabled={r.cursor === 0}
        >
          ◀
        </Button>
        <Button
          size="sm"
          aria-label={r.playing ? 'Dừng' : 'Chạy'}
          onClick={r.playing ? r.pause : r.play}
          disabled={r.total === 0 && !r.live}
          className="min-w-[88px]"
        >
          {r.playing ? '⏸ Dừng' : '▶ Chạy'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Tiến một nước"
          onClick={() => r.step(1)}
          disabled={r.atEnd}
        >
          ▶
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Tới nước cuối"
          onClick={() => r.seek(r.total)}
          disabled={r.atEnd}
        >
          ⏭
        </Button>
        <span className="ml-auto font-mono text-sm" aria-live="polite">
          Nước {r.cursor}/{r.total}
        </span>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          Tốc độ
          <select
            value={r.speedMs}
            onChange={(e) => r.setSpeed(Number(e.target.value))}
            className={cn('rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink', focusRing)}
          >
            {SPEEDS.map((s) => (
              <option key={s.ms} value={s.ms}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(r.total, 0)}
        step={1}
        value={r.cursor}
        onChange={(e) => r.seek(Number(e.target.value))}
        aria-label="Tua tới nước"
        aria-valuetext={`Nước ${r.cursor} trên ${r.total}`}
        disabled={r.total === 0}
        className={cn('w-full accent-[rgb(var(--c-accent))]', focusRing)}
      />
      {behind > 0 && (
        <p className="text-xs text-ink-muted">
          Ván đang diễn ra: còn {behind} nước mới phía sau.{' '}
          <button
            type="button"
            className={cn('font-semibold text-accent underline', focusRing)}
            onClick={() => r.seek(r.total)}
          >
            Tới nước mới nhất
          </button>
        </p>
      )}
    </div>
  );
}
