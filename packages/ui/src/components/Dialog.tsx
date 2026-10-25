import * as RDialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { cn, focusRing } from '../cn.js';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Hộp thoại có bẫy focus, đóng bằng Esc, trả focus về nút mở (Radix Dialog). */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  const returnTarget = useRef<HTMLElement | null>(null);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="ui-dialog-overlay fixed inset-0 z-40 bg-bg-deep/80 backdrop-blur-sm animate-fade-in" />
        <RDialog.Content
          onOpenAutoFocus={() => {
            returnTarget.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const previous = returnTarget.current;
            if (previous?.isConnected && !previous.matches(':disabled')) {
              previous.focus();
              return;
            }
            const fallback =
              document.querySelector<HTMLElement>('main h1') ??
              document.querySelector<HTMLElement>('header button');
            if (fallback) {
              if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
              fallback.focus();
            }
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-lg max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain -translate-x-1/2 -translate-y-1/2',
            'ui-dialog rounded-lg border border-line bg-surface p-6 shadow-deep animate-fade-in focus:outline-none',
            className,
          )}
        >
          <RDialog.Title className="pr-10 text-lg font-bold text-ink">{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="mt-1 text-sm text-ink-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          <RDialog.Close
            aria-label="Đóng"
            className={cn(
              'absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink',
              focusRing,
            )}
          >
            ✕
          </RDialog.Close>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
