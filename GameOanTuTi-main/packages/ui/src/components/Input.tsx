import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn, focusRing } from '../cn.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Ẩn nhãn khỏi màn hình nhưng vẫn đọc được bằng trình đọc màn hình. */
  hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy =
    [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 rounded-md border bg-bg-deep/60 px-3 text-sm text-ink placeholder:text-ink-muted/70',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-danger' : 'border-line hover:border-ink-muted/60',
          focusRing,
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
