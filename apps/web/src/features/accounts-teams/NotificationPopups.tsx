// Thông báo mới bật lên góc màn hình (vẫn nằm trong mục Thông báo để xem lại). Bấm vào: đánh dấu đã đọc và mở trang.
// Chỉ hiện thông báo đến SAU khi mở trang; thông báo cũ không bật lại. Tự ẩn sau vài giây.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn, focusRing } from '@arena/ui';
import type { NotificationView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const SHOW_MS = 9000;
const MAX_SHOWN = 3;

export function NotificationPopups() {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const seen = useRef<Set<string> | null>(null);
  const [shown, setShown] = useState<NotificationView[]>([]);
  const q = useQuery({
    queryKey: ['notifications', user?.id, 'popup'],
    queryFn: () => api<{ items: NotificationView[]; unread: number }>('/notifications'),
    enabled: !!user,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const items = q.data?.items;
    if (!items) return;
    if (!seen.current) {
      seen.current = new Set(items.map((n) => n.id)); // lần tải đầu: không bật thông báo cũ
      return;
    }
    const fresh = items.filter((n) => !n.readAt && !seen.current!.has(n.id)).reverse();
    if (!fresh.length) return;
    for (const n of fresh) seen.current.add(n.id);
    setShown((list) => [...list, ...fresh].slice(-MAX_SHOWN));
    void qc.invalidateQueries({ queryKey: ['notifications', user?.id, 'badge'] });
    for (const n of fresh) setTimeout(() => setShown((list) => list.filter((x) => x.id !== n.id)), SHOW_MS);
  }, [q.data, qc, user?.id]);

  // Đổi tài khoản: bắt đầu lại.
  useEffect(() => {
    seen.current = null;
    setShown([]);
  }, [user?.id]);

  if (!shown.length) return null;
  const open = (n: NotificationView) => {
    setShown((list) => list.filter((x) => x.id !== n.id));
    void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() =>
      qc.invalidateQueries({ queryKey: ['notifications'] }),
    );
    if (n.href) navigate(n.href);
  };
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:w-96"
    >
      {shown.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-3 rounded-lg border border-accent/40 bg-surface p-3 text-sm shadow-deep"
        >
          <button type="button" onClick={() => open(n)} className={cn('min-w-0 flex-1 text-left', focusRing)}>
            <span className="block font-semibold text-ink">{n.title}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>
            {n.href && <span className="mt-1 block text-xs font-semibold text-accent">Mở →</span>}
          </button>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setShown((list) => list.filter((x) => x.id !== n.id))}
            className={cn('text-ink-muted hover:text-ink', focusRing)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
