import * as RTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn, focusRing } from '../cn.js';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

/** Tab điều khiển bằng phím mũi tên (Radix Tabs). */
export function Tabs({
  items,
  defaultValue,
  label,
  className,
}: {
  items: TabItem[];
  defaultValue?: string;
  label: string;
  className?: string;
}) {
  return (
    <RTabs.Root defaultValue={defaultValue ?? items[0]?.value} className={cn('ui-tabs', className)}>
      <RTabs.List aria-label={label} className="ui-tab-list flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              'ui-tab -mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-ink-muted',
              'hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink',
              focusRing,
            )}
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className={cn('ui-tab-panel pt-5', focusRing)}>
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
