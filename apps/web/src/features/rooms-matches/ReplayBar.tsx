import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Button, Icon, cn, focusRing } from '@arena/ui';
import { SPEEDS, type Replay } from './useReplay';

export function ReplayBar({
  r,
  focused,
  onFocusToggle,
}: {
  r: Replay;
  focused?: boolean;
  onFocusToggle?: () => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const helpId = useId();
  if (!r.available) return null;
  const behind = r.live ? Math.max(0, r.total - r.cursor) : 0;
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('input,select,textarea')) return;
    if (event.key === ' ') {
      if (event.target instanceof Element && event.target.closest('button,a')) return;
      event.preventDefault();
      r.toggle();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      r.step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      r.step(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      r.seek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      r.seek(r.total);
    }
  };
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Điều khiển xem ván"
      onKeyDown={onKey}
      className="replay-toolbar replay-deck"
    >
      <div className="replay-deck-status">
        <span>
          <i aria-hidden="true" className={r.playing ? 'is-playing' : ''} />
          {r.following ? 'THEO SÁT TRỰC TIẾP' : r.playing ? 'ĐANG PHÁT LẠI' : 'BÀN ĐIỀU KHIỂN REPLAY'}
        </span>
        <strong>
          Nước <b>{r.cursor}</b>
          <small> / {r.total}</small>
        </strong>
      </div>
      <div
        className="replay-timeline"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPreview(
            Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * r.total),
          );
        }}
        onPointerLeave={() => setPreview(null)}
      >
        {preview !== null && (
          <output
            className="replay-preview"
            style={
              {
                '--preview-at': `${Math.max(6, Math.min(94, r.total ? (preview / r.total) * 100 : 6))}%`,
              } as CSSProperties
            }
          >
            Nước {preview}
          </output>
        )}
        <div className="replay-timeline-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${r.total ? r.cursor / r.total : 0})` }} />
          {r.history
            .filter((move) => move.capture && move.ply <= r.seen)
            .map((move) => (
              <i key={move.ply} style={{ left: `${(move.ply / Math.max(1, r.total)) * 100}%` }} />
            ))}
        </div>
        <input
          type="range"
          min={0}
          max={r.total}
          step={1}
          value={r.cursor}
          onChange={(event) => r.seek(Number(event.target.value))}
          onFocus={() => setPreview(r.cursor)}
          onBlur={() => setPreview(null)}
          onKeyUp={() => setPreview(r.cursor)}
          aria-label="Tua tới nước"
          aria-valuetext={`Nước ${r.cursor} trên ${r.total}`}
          aria-describedby={helpId}
          disabled={r.total === 0}
          className={cn('replay-range', focusRing)}
        />
      </div>
      <div className="replay-control-row">
        <div className="replay-transport">
          <Button
            size="sm"
            variant="ghost"
            data-ui-sound
            aria-label="Về nước đầu"
            onClick={() => r.seek(0)}
            disabled={r.cursor === 0}
          >
            <Icon name="first" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-ui-sound
            aria-label="Lùi một nước"
            onClick={() => r.step(-1)}
            disabled={r.cursor === 0}
          >
            <Icon name="previous" />
          </Button>
          <Button
            size="sm"
            data-ui-sound
            aria-label={r.playing ? 'Dừng phát lại' : 'Phát lại'}
            onClick={r.playing ? r.pause : r.play}
            disabled={r.total === 0 && !r.live}
            className="replay-play"
          >
            <Icon name={r.playing ? 'pause' : 'play'} />
            <span className="replay-play-label">{r.playing ? 'Dừng' : 'Phát lại'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-ui-sound
            aria-label="Tiến một nước"
            onClick={() => r.step(1)}
            disabled={r.atEnd}
          >
            <Icon name="next" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-ui-sound
            aria-label="Tới nước cuối"
            onClick={() => r.seek(r.total)}
            disabled={r.atEnd}
          >
            <Icon name="last" />
          </Button>
        </div>
        <label className="replay-speed">
          <span>Tốc độ</span>
          <select
            data-ui-sound
            value={r.speedMs}
            onChange={(event) => r.setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((speed) => (
              <option key={speed.ms} value={speed.ms}>
                {speed.label}
              </option>
            ))}
          </select>
        </label>
        {onFocusToggle && (
          <Button size="sm" variant="secondary" data-ui-sound aria-pressed={focused} onClick={onFocusToggle}>
            <svg
              className="ui-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path
                d={focused ? 'M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6' : 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6'}
              />
            </svg>
            {focused ? 'Thu gọn' : 'Tập trung'}
          </Button>
        )}
        {r.live && (
          <Button
            size="sm"
            variant={r.following ? 'secondary' : 'ghost'}
            data-ui-sound
            aria-pressed={r.following}
            onClick={r.followLive}
          >
            Theo dõi trực tiếp
          </Button>
        )}
      </div>
      <div className="replay-deck-footer">
        <p id={helpId}>
          Space: phát/dừng · ← →: từng nước
          {r.history.some((move) => move.capture && move.ply <= r.seen)
            ? ' · Mốc cam: nước ăn quân đã xem'
            : ''}
        </p>
      </div>
      {behind > 0 && (
        <p className="replay-behind">
          Có {behind} nước mới phía sau.{' '}
          <button type="button" data-ui-sound onClick={r.followLive}>
            Theo kịp trận đang diễn ra <Icon name="arrow" />
          </button>
        </p>
      )}
    </div>
  );
}
