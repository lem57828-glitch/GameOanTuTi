import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn.js';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface/80 p-5 shadow-deep', className)} {...rest} />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type AlertTone = 'info' | 'warning' | 'error' | 'success';
const alertTone: Record<AlertTone, string> = {
  info: 'border-line bg-surface-2/60',
  warning: 'border-warning/50 bg-warning/10',
  error: 'border-danger/60 bg-danger/10',
  success: 'border-success/50 bg-success/10',
};
const alertIcon: Record<AlertTone, string> = { info: 'ℹ', warning: '⚠', error: '✕', success: '✓' };

/** Khối thông báo trong trang (lỗi tải dữ liệu, cảnh báo demo...). */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-wrap items-start gap-3 rounded-md border p-4', alertTone[tone], className)}
    >
      <span aria-hidden className="mt-0.5 text-sm font-bold">
        {alertIcon[tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
