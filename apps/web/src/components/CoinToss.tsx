// Đồng xu giữa màn hình: hoạt ảnh rồi mới hiện kết quả. Kết quả LUÔN là giá trị server đã lưu (coinResult);
// component không tự quyết định ai thắng. Tôn trọng prefers-reduced-motion: bỏ hoạt ảnh, hiện ngay kết quả.
import { useEffect, useRef, useState } from 'react';
import { Button, cn } from '@arena/ui';
import type { CoinResult } from '@arena/contracts';

const FLIP_MS = 1600;

export function CoinToss({
  coin,
  teamName,
  onDone,
}: {
  coin: CoinResult;
  teamName: (id: string) => string;
  onDone: () => void;
}) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [revealed, setRevealed] = useState(reduced);
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const t1 = reduced ? undefined : setTimeout(() => setRevealed(true), FLIP_MS);
    const t2 = setTimeout(() => done.current(), (reduced ? 0 : FLIP_MS) + 3500);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done.current();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('keydown', onKey);
    };
  }, [reduced]);

  useEffect(() => {
    if (revealed) closeRef.current?.focus();
  }, [revealed]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-bg-deep/75 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Tung đồng xu"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-line bg-surface p-8 text-center shadow-deep">
        <div className="[perspective:600px]">
          <div
            aria-hidden
            className={cn(
              'grid h-28 w-28 place-items-center rounded-full border-4 border-accent bg-gradient-to-br from-accent-strong to-accent text-4xl font-black text-accent-on shadow-glow',
              !reduced && !revealed && 'animate-coin-flip',
            )}
          >
            {revealed ? '★' : '?'}
          </div>
        </div>
        <div aria-live="polite" className="min-h-[64px]">
          {revealed ? (
            <>
              <p className="text-lg font-bold text-ink">{teamName(coin.winnerTeamId)} thắng tung xu</p>
              <p className="mt-1 text-sm text-ink-muted">
                Cầm quân <span className="font-semibold text-team-blue">Xanh</span> và đi trước.{' '}
                {teamName(coin.pinkTeamId)} cầm <span className="font-semibold text-team-pink">Hồng</span>.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Đang tung đồng xu…</p>
          )}
        </div>
        <Button ref={closeRef} variant="secondary" size="sm" onClick={onDone}>
          Xem bàn cờ
        </Button>
      </div>
    </div>
  );
}
