import type { SVGProps } from 'react';
export type IconName =
  | 'search'
  | 'close'
  | 'eye'
  | 'eye-off'
  | 'check'
  | 'info'
  | 'warning'
  | 'chevron'
  | 'empty'
  | 'arrow'
  | 'first'
  | 'last'
  | 'previous'
  | 'next'
  | 'play'
  | 'pause';
export function Icon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, string> = {
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    close: 'm6 6 12 12M6 18 18 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off':
      'm3 3 18 18M9 5.5A12 12 0 0 1 12 5c6 0 10 7 10 7a20 20 0 0 1-3 3.8M6 6.5A22 22 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5-1.2M9.8 9.8a3 3 0 0 0 4.4 4.4',
    check: 'm5 12 4 4L19 6',
    info: 'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    warning: 'M12 4 2 21h20L12 4Zm0 5v5m0 3v1',
    chevron: 'm6 9 6 6 6-6',
    empty: 'M4 4h16v16H4V4Zm0 10h5l2 3h2l2-3h5',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    first: 'M5 4v16m14-16-10 8 10 8V4',
    last: 'M19 4v16M5 4l10 8-10 8V4',
    previous: 'm15 5-7 7 7 7',
    next: 'm9 5 7 7-7 7',
    play: 'm8 4 12 8-12 8V4',
    pause: 'M8 4v16M16 4v16',
  };
  return (
    <svg
      className={`ui-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
