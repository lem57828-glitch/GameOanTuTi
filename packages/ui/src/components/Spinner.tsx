import { cn } from '../cn.js';

export function Spinner({
  size = 'md',
  label = 'Đang tải',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const px = size === 'sm' ? 'h-4 w-4 border-2' : size === 'lg' ? 'h-10 w-10 border-4' : 'h-6 w-6 border-2';
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-pulse',
        px,
        className,
      )}
    />
  );
}
