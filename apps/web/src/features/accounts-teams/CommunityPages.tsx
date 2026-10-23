import { TEAM_MEMBER_LIMIT } from '@arena/contracts';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '@arena/ui';
import type { NotificationView, PublicationView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { ActionButton, ErrorMessage } from './Forms';

export function NotificationsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['notifications', user?.id, page],
    queryFn: () =>
      api<{ items: NotificationView[]; unread: number; total: number }>('/notifications?page=' + page),
    enabled: !!user,
    refetchInterval: 10000,
  });
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  }
  if (!user)
    return (
      <EmptyState
        title="Đăng nhập để xem thông báo"
        action={<Link to="/login?next=/notifications">Đăng nhập</Link>}
      />
    );
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">
          Thông báo {q.data && <span className="text-accent">({q.data.unread})</span>}
        </h1>
        <ActionButton run={() => api('/notifications/read-all', { method: 'POST' })} onDone={refresh}>
          Đọc tất cả
        </ActionButton>
      </div>
      <ErrorMessage error={q.error} />
      {q.isLoading && <Spinner />}
      {q.data?.items.length === 0 && <EmptyState title="Chưa có thông báo" />}
      {q.data?.items.map((n) => (
        <Card key={n.id}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-bold">{n.title}</h2>
            {!n.readAt && <Badge tone="accent">Mới</Badge>}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{n.body}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            {n.href && (
              <Link className="text-accent underline" to={n.href}>
                Xem chi tiết
              </Link>
            )}
            {!n.readAt && (
              <ActionButton
                run={() => api(`/notifications/${n.id}/read`, { method: 'POST' })}
                onDone={refresh}
              >
                Đánh dấu đã đọc
              </ActionButton>
            )}
            <time className="text-xs text-ink-muted">{new Date(n.createdAt).toLocaleString('vi-VN')}</time>
          </div>
        </Card>
      ))}
      <div className="flex gap-3">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Trang trước
        </Button>
        <Button
          variant="secondary"
          disabled={!q.data || page * 25 >= q.data.total}
          onClick={() => setPage(page + 1)}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}
export function NewsPage({ kind }: { kind?: 'guide' }) {
  const q = useQuery({ queryKey: ['publications'], queryFn: () => api<PublicationView[]>('/publications') });
  const [filter, setFilter] = useState('all');
  const items = q.data?.filter((p) => (kind ? p.kind === 'guide' : filter === 'all' || p.kind === filter));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl font-black">{kind ? 'Hướng dẫn tham gia' : 'Thông báo và tài liệu BTC'}</h1>
      {kind && (
        <Card>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-muted">
            <li>
              Điền họ tên, email mssv@vnu.edu.vn, lớp, khoa và mật khẩu. MSSV được lấy tự động từ email.
            </li>
            <li>
              Bấm Gửi mã xác minh, nhập mã 6 chữ số nhận qua email trong 120 giây rồi bấm Đăng ký. Hết giờ bấm
              Gửi lại mã. Sau đó đăng nhập để tham gia đội.
            </li>
            <li>
              Vào Đội của tôi để lập đội hoặc nhập mã tham gia. Mỗi đội từ 2 đến {TEAM_MEMBER_LIMIT} người khi
              chốt đội hình.
            </li>
            <li>
              Đội trưởng chia sẻ mã tham gia, loại thành viên hoặc chuyển quyền đội trưởng cho thành viên
              trong đội.
            </li>
            <li>
              Thành viên có thể rời đội. Đội trưởng phải chuyển quyền trước khi rời đội nếu còn thành viên
              khác. Việc khóa theo lịch giải và quyền BTC vẫn được áp dụng.
            </li>
            <li>
              Xem các mốc tại trang Giải đấu; theo dõi trung tâm Thông báo để nhận lịch, hiệp và kết quả.
            </li>
            <li>
              Quên mật khẩu: dùng liên kết ở trang Đăng nhập. Đổi hoặc đặt lại mật khẩu sẽ đăng xuất mọi phiên
              cũ.
            </li>
          </ol>
          <Alert title="Các module thi đấu">
            Tính năng nộp bot, chạy bot thật và điều hành thi đấu do các module khác phụ trách.
          </Alert>
        </Card>
      )}
      {!kind && (
        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'Tất cả'],
            ['announcement', 'Thông báo'],
            ['document', 'Tài liệu'],
            ['guide', 'Hướng dẫn'],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={filter === value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(value!)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      <ErrorMessage error={q.error} />
      {q.isLoading && <Spinner />}
      {items?.length === 0 && <EmptyState title="Chưa có nội dung được công bố" />}
      {items?.map((p) => (
        <Card key={p.id} id={p.id}>
          <Badge>{p.kind === 'document' ? 'Tài liệu' : p.kind === 'guide' ? 'Hướng dẫn' : 'Thông báo'}</Badge>
          <h2 className="mt-3 text-xl font-bold">{p.title}</h2>
          <time className="text-xs text-ink-muted">{new Date(p.updatedAt).toLocaleString('vi-VN')}</time>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{p.body}</p>
          {p.linkUrl && (
            <a
              href={p.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-accent underline"
            >
              Mở tài liệu đính kèm
            </a>
          )}
        </Card>
      ))}
    </div>
  );
}
