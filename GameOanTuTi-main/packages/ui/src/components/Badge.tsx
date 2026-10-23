import type { ReactNode } from 'react';
import { cn } from '../cn.js';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'blue' | 'pink';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-muted border-line',
  accent: 'bg-accent/15 text-accent-strong border-accent/40',
  success: 'bg-success/15 text-success border-success/40',
  warning: 'bg-warning/15 text-warning border-warning/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
  blue: 'bg-team-blue/15 text-team-blue border-team-blue/40',
  pink: 'bg-team-pink/15 text-team-pink border-team-pink/40',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
