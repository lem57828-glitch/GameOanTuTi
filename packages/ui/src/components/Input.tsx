import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cn, focusRing } from '../cn.js';
import { Icon } from './Icon.js';
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    hideLabel,
    id,
    className,
    type = 'text',
    'aria-describedby': described,
    disabled,
    ...rest
  },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const [shown, setShown] = useState(false);
  const password = type === 'password';
  const describedBy =
    [error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined, described]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="ui-field flex flex-col gap-1.5">
      <label htmlFor={inputId} className={cn('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="ui-input-wrap">
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={password && shown ? 'text' : type}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'ui-input h-11 w-full rounded-md border bg-bg-deep/60 px-3 text-sm text-ink placeholder:text-ink-muted/70 disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger' : 'border-line hover:border-ink-muted/60',
            password && 'ui-input-password',
            focusRing,
            className,
          )}
        />
        {password && (
          <button
            className="ui-password-toggle"
            type="button"
            disabled={disabled}
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={shown}
            aria-controls={inputId}
          >
            <Icon name={shown ? 'eye-off' : 'eye'} />
          </button>
        )}
      </div>
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
