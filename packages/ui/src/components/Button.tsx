import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn, focusRing } from '../cn.js';
import { Spinner } from './Spinner.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Đang xử lý: khóa nút, hiện vòng quay, báo aria-busy. */
  loading?: boolean;
  /** Dùng phần tử con (ví dụ <Link>) làm nút. */
  asChild?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-on hover:bg-accent-strong shadow-none',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-accent/60 hover:bg-surface-2/80',
  ghost: 'bg-transparent text-ink hover:bg-surface-2/70',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    asChild = false,
    disabled,
    type = 'button',
    icon,
    className,
    children,
    ...rest
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const classes = cn(
    'ui-button inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    focusRing,
    variants[variant],
    sizes[size],
    className,
  );
  if (asChild) {
    return (
      <Comp ref={ref} className={classes} {...rest}>
        {children}
      </Comp>
    );
  }
  return (
    <button
      type={type}
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="Đang xử lý" /> : icon}
      {children}
    </button>
  );
});
