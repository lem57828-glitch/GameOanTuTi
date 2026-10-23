import * as RToast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn, focusRing } from '../cn.js';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}
interface ToastApi {
  toast: (t: { title: string; description?: string; tone?: Tone }) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let nextId = 1;

const toneClass: Record<Tone, string> = {
  info: 'border-line',
  success: 'border-success/60',
  error: 'border-danger/70',
};
const toneIcon: Record<Tone, string> = { info: 'ℹ', success: '✓', error: '!' };

/** Thông báo ngắn ở góc màn hình; trình đọc màn hình đọc qua vùng live của Radix Toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback<ToastApi['toast']>(({ title, description, tone = 'info' }) => {
    setItems((list) => [...list.slice(-3), { id: nextId++, title, description, tone }]);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={api}>
      <RToast.Provider swipeDirection="right" duration={5000} label="Thông báo">
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            type={t.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => !open && setItems((list) => list.filter((x) => x.id !== t.id))}
            className={cn(
              'flex items-start gap-3 rounded-md border bg-surface p-4 shadow-deep animate-pop-in',
              toneClass[t.tone],
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold',
                t.tone === 'error'
                  ? 'bg-danger text-bg'
                  : t.tone === 'success'
                    ? 'bg-success text-bg'
                    : 'bg-surface-2 text-ink',
              )}
            >
              {toneIcon[t.tone]}
            </span>
            <div className="min-w-0 flex-1">
              <RToast.Title className="text-sm font-semibold text-ink">{t.title}</RToast.Title>
              {t.description && (
                <RToast.Description className="mt-0.5 text-sm text-ink-muted">
                  {t.description}
                </RToast.Description>
              )}
            </div>
            <RToast.Close
              aria-label="Đóng thông báo"
              className={cn('rounded-sm px-1 text-ink-muted hover:text-ink', focusRing)}
            >
              ✕
            </RToast.Close>
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2 outline-none" />
      </RToast.Provider>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>');
  return ctx;
}
