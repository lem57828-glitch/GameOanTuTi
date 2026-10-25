import { useId, type CSSProperties } from 'react';
import type { Board, PieceType, Side } from '@arena/contracts';
import { PieceGlyph } from './HomeGraphics';

export interface CombatEffect {
  id: number;
  from: string;
  to: string;
  side: Side;
  type: PieceType;
  captured: Board[string] | null;
  duration: number;
  lifetime: number;
}
const center = (square: string) =>
  [(square.charCodeAt(0) - 65 + 0.5) * 100, (9 - Number(square[1]) + 0.5) * 100] as const;
const cuts = ['M-60-60H0V0h-60z', 'M0-60h60V0H0z', 'M-60 0H0v60h-60z', 'M0 0h60v60H0z'];
const directions = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

function CaptureBody({ side, type }: { side: Side; type: PieceType }) {
  return (
    <g className={`combat-captured-body combat-captured-body--${side}`}>
      {side === 'blue' ? (
        <>
          <circle r="33" />
          <circle r="26" className="combat-piece-inlay" />
        </>
      ) : (
        <>
          <rect x="-33" y="-33" width="66" height="66" rx="12" transform="rotate(45)" />
          <rect
            x="-26"
            y="-26"
            width="52"
            height="52"
            rx="8"
            transform="rotate(45)"
            className="combat-piece-inlay"
          />
        </>
      )}
      <g transform="translate(-18,-18) scale(1.5)">
        <PieceGlyph type={type} />
      </g>
    </g>
  );
}

export function ReplayCombatFX({ effect }: { effect: CombatEffect }) {
  const id = `combat-${useId().replace(/:/g, '')}`;
  const [fromX, fromY] = center(effect.from),
    [toX, toY] = center(effect.to);
  const impact = effect.duration * 0.82;
  return (
    <svg
      className={`replay-board-effects combat-scene${effect.captured ? ' combat-scene--capture' : ''}`}
      viewBox="0 0 900 900"
      width="900"
      height="900"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={
        {
          '--travel-ms': `${effect.duration}ms`,
          '--impact-delay': `${impact}ms`,
          '--impact-ms': `${effect.captured ? 260 : 120}ms`,
          '--effect-life': `${effect.lifetime}ms`,
        } as CSSProperties
      }
    >
      <defs>
        {cuts.map((d, i) => (
          <clipPath id={`${id}-${i}`} key={i} clipPathUnits="userSpaceOnUse">
            <path d={d} />
          </clipPath>
        ))}
      </defs>
      <g className={`combat-route combat-route--${effect.side}`}>
        <line className="combat-route-bed" x1={fromX} y1={fromY} x2={toX} y2={toY} />
        <line className="combat-route-core" x1={fromX} y1={fromY} x2={toX} y2={toY} />
        <circle cx={fromX} cy={fromY} r="18" />
        <path d={`M${fromX - 7} ${fromY}h14m-7-7v14`} />
      </g>
      <g transform={`translate(${toX},${toY})`}>
        {effect.captured && (
          <>
            <circle className="combat-impact-disc" r="44" />
            <g className="combat-shockwave">
              <circle r="32" />
              <circle r="43" strokeDasharray="12 6" />
            </g>
            <g className="combat-shockwave combat-shockwave--echo">
              <circle r="32" />
            </g>
            <path className="combat-hit-star" d="M-12 0h24M0-12v24m-8-8L8 8m-16 0L8-8" />
            {directions.map(([x, y], i) => (
              <g
                className="combat-fragment"
                key={i}
                style={
                  {
                    '--shard-x': `${x * (32 + i * 3)}px`,
                    '--shard-y': `${y * (32 + i * 4)}px`,
                    '--shard-r': `${(i % 2 ? 1 : -1) * (18 + i * 4)}deg`,
                  } as CSSProperties
                }
              >
                <g clipPath={`url(#${id}-${i})`}>
                  <CaptureBody side={effect.captured!.side} type={effect.captured!.type} />
                </g>
              </g>
            ))}
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i * Math.PI) / 4;
              return (
                <g
                  className="combat-spark"
                  key={i}
                  style={
                    {
                      '--spark-x': `${Math.cos(angle) * 76}px`,
                      '--spark-y': `${Math.sin(angle) * 76}px`,
                      '--spark-r': `${i * 45}deg`,
                    } as CSSProperties
                  }
                >
                  <path d="m0-3 8 3-8 3z" />
                </g>
              );
            })}
          </>
        )}
        {!effect.captured && <circle className="combat-arrival" r="34" />}
      </g>
    </svg>
  );
}

export function ReplayBoardEngraving() {
  return (
    <svg
      className="replay-board-engraving"
      viewBox="0 0 900 900"
      width="900"
      height="900"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="board-center-seal">
        <path d="m450 330 120 120-120 120-120-120z" />
        <circle cx="450" cy="450" r="82" />
        <path d="M402 450h96m-48-48v96m-72-72 144 48m-144 0 144-48" />
      </g>
      <g className="board-etched-corners">
        <path d="M12 92V12h80m716 0h80v80M12 808v80h80m716 0h80v-80" />
        <path d="M24 68V24h44m764 0h44v44M24 832v44h44m764 0h44v-44" />
      </g>
      <g className="board-index-ticks">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M${(i + 1) * 100} 3v10m0 874v10M3 ${(i + 1) * 100}h10m874 0h10`} />
        ))}
      </g>
    </svg>
  );
}
