import type { ReactNode } from 'react';
import { Icon } from './Icon.js';
import { cn } from '../cn.js';

export function EmptyState({
  icon = <Icon name="empty" />,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'ui-empty flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-10 text-center',
        className,
      )}
    >
      <div
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-xl text-accent"
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <div className="max-w-md text-sm text-ink-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
