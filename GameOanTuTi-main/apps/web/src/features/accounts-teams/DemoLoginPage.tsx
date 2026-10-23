// Đăng nhập mẫu — CHỈ dùng khi phát triển (DEMO_MODE). Đăng nhập thật (email trường) là việc của TV1 sau M0.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, Spinner, useToast } from '@arena/ui';
import type { DemoAccount, SessionUser } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { ROLE_LABEL, sessionKey, useSession } from '../../lib/session';

const ROLE_HINT: Record<DemoAccount['role'], string> = {
  admin: 'Xem sức khỏe dịch vụ, tạo ván mô phỏng.',
  referee: 'Xem sức khỏe dịch vụ và tiến độ job.',
  student: 'Xem đội và bot của mình; không vào được khu vực BTC.',
};

export function DemoLoginPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const { user } = useSession();
  const accounts = useQuery({
    queryKey: ['dev-accounts'],
    queryFn: () => api<DemoAccount[]>('/dev/accounts'),
    retry: 0,
  });
  const login = useMutation({
    mutationFn: (accountId: string) =>
      api<{ user: SessionUser }>('/dev/session', { method: 'POST', json: { accountId } }),
    onSuccess: ({ user }) => {
      qc.setQueryData(sessionKey, { user });
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      toast({ title: `Đã đăng nhập: ${user.displayName}`, tone: 'success' });
      const next = params.get('next');
      nav(
        next && next.startsWith('/') ? next : user.role === 'admin' ? '/admin' : user.teamId ? '/team' : '/',
      );
    },
    onError: (e) =>
      toast({ title: 'Không đăng nhập được', description: (e as Error).message, tone: 'error' }),
  });

  const disabled = isApiError(accounts.error, 'DEMO_DISABLED');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Phát triển</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Đăng nhập mẫu</h1>
      </header>
      <Alert tone="warning" title="Chỉ dùng khi phát triển">
        Các tài khoản dưới đây là dữ liệu mẫu, không có mật khẩu và chỉ hoạt động khi máy chủ bật{' '}
        <code className="font-mono">DEMO_MODE</code> ở môi trường development/test. Môi trường production từ
        chối khởi động nếu bật chế độ này.
      </Alert>
      {user && (
        <p className="text-sm text-ink-muted">
          Đang đăng nhập: <strong className="text-ink">{user.displayName}</strong> ({ROLE_LABEL[user.role]}).
          Chọn tài khoản khác để đổi.
        </p>
      )}
      {accounts.isLoading && <Spinner label="Đang tải tài khoản mẫu" />}
      {disabled && (
        <EmptyState
          icon="⏻"
          title="Đăng nhập mẫu đang tắt"
          description="Máy chủ không bật DEMO_MODE. Đăng nhập thật chưa được triển khai ở M0 (TV1)."
        />
      )}
      {accounts.error && !disabled && (
        <Alert tone="error" title="Không tải được tài khoản mẫu">
          {(accounts.error as Error).message}
        </Alert>
      )}
      {accounts.data && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {accounts.data.map((a) => (
            <li key={a.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{a.displayName}</p>
                    <p className="text-xs text-ink-muted">
                      {a.teamName ?? (a.role === 'student' ? 'Chưa có đội' : 'Không thuộc đội')}
                    </p>
                  </div>
                  <Badge tone={a.role === 'admin' ? 'accent' : a.role === 'referee' ? 'blue' : 'neutral'}>
                    {ROLE_LABEL[a.role]}
                  </Badge>
                </div>
                <p className="flex-1 text-xs text-ink-muted">{ROLE_HINT[a.role]}</p>
                <Button
                  variant={user?.id === a.id ? 'secondary' : 'primary'}
                  size="sm"
                  loading={login.isPending && login.variables === a.id}
                  disabled={login.isPending}
                  onClick={() => login.mutate(a.id)}
                  aria-label={`Đăng nhập bằng ${a.displayName}`}
                >
                  {user?.id === a.id ? 'Đang dùng' : 'Đăng nhập'}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
