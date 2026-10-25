import type { PieceType } from '@arena/contracts';

export function HomeIcon({ name }: { name: 'arrow' | 'play' | 'reset' | 'menu' | 'chevron' | 'close' }) {
  const paths = {
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    play: 'm8 4 12 8-12 8V4z',
    reset: 'M20 11a8 8 0 1 0-2 6m2-13v7h-7',
    menu: 'M4 6h16M4 12h16M4 18h16',
    chevron: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return (
    <svg
      className="od-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function PieceGlyph({ type }: { type: PieceType }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {type === 'ROCK' && (
        <path d="M6 13V8a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v3a2 2 0 0 1 3 1v5l-3 5H9l-5-6a2 2 0 0 1 2-3l4 3M10 7v4m4-5v5m4-3v4" />
      )}
      {type === 'PAPER' && (
        <path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v6c0 5-2 8-6 8h-2c-2 0-3-1-4-3l-4-6a1.5 1.5 0 0 1 2-2l3 4" />
      )}
      {type === 'SCISSORS' && (
        <>
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="m8 16 11-13M16 16 5 3" />
        </>
      )}
    </g>
  );
}
