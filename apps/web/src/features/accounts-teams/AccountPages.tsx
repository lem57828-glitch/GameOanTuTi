import { FeatureHero, IdentityMark } from '../../components/WorkspaceVisuals';
import { LoadingState } from '@arena/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState } from '@arena/ui';
import type { ProfileView, MailView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession, sessionKey } from '../../lib/session';
import { ActionButton, ActionForm, ErrorMessage } from './Forms';

export function ProfilePage() {
  const { user, isLoading } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => api<ProfileView>('/profile'),
    enabled: !!user,
  });
  const options = useQuery({
    queryKey: ['auth-options'],
    queryFn: () => api<{ localMailbox: boolean }>('/auth/options'),
  });
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['profile'] });
    await qc.invalidateQueries({ queryKey: sessionKey });
  }
  if (isLoading || (user && q.isLoading)) return <LoadingState />;
  if (!user)
    return <EmptyState title="Cần đăng nhập" action={<Link to="/login?next=/profile">Đăng nhập</Link>} />;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <FeatureHero variant="account" compact slogan="Dấu ấn của bạn trong từng cuộc đấu.">
        <div>
          <p className="feature-eyebrow">BOT ARENA / TÀI KHOẢN</p>
          <h1 className="text-3xl font-black">Hồ sơ của tôi</h1>
        </div>
      </FeatureHero>
      <ErrorMessage error={q.error} />
      {q.data && (
        <>
          <Card>
            <div className="profile-identity mb-5 flex flex-wrap items-center gap-3">
              <IdentityMark seed={user.id} label={user.displayName} />
              <strong className="break-all">{q.data.email}</strong>
              <Badge tone={q.data.emailVerified ? 'success' : 'warning'}>
                {q.data.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
              </Badge>
            </div>
            {!q.data.emailVerified && (
              <div className="mb-5 flex flex-col gap-3">
                <p className="text-sm text-ink-muted">Xác minh email để lập hoặc tham gia đội.</p>
                <ActionButton run={() => api('/auth/resend-verification', { method: 'POST' })}>
                  Gửi lại email xác minh
                </ActionButton>
              </div>
            )}
            {options.data?.localMailbox && (
              <Link className="mb-5 inline-block text-accent underline" to="/mailbox">
                Mở hộp thư thử nghiệm
              </Link>
            )}
            <ActionForm
              key={JSON.stringify(q.data)}
              disabled={q.data.isDemo}
              fields={[
                { name: 'fullName', label: 'Họ tên', value: q.data.fullName, maxLength: 120 },
                {
                  name: 'username',
                  label: 'Tên đăng nhập',
                  value: q.data.username,
                  maxLength: 80,
                  minLength: 3,
                },
                { name: 'studentId', label: 'MSSV', value: q.data.studentId, maxLength: 50 },
                { name: 'className', label: 'Lớp', value: q.data.className, maxLength: 100 },
                { name: 'faculty', label: 'Khoa', value: q.data.faculty, maxLength: 150 },
              ]}
              submit="Lưu hồ sơ"
              onSubmit={(values) => api('/profile', { method: 'PATCH', json: values })}
              onDone={refresh}
              success="Đã lưu hồ sơ"
            />
            {q.data.isDemo && (
              <p className="mt-4 text-sm text-ink-muted">Tài khoản mẫu không sửa hồ sơ hoặc mật khẩu.</p>
            )}
          </Card>
          {!q.data.isDemo && (
            <Card>
              <h2 className="mb-5 text-xl font-bold">Đổi mật khẩu</h2>
              <ActionForm
                fields={[
                  { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password' },
                  { name: 'password', label: 'Mật khẩu mới', type: 'password', minLength: 8, maxLength: 128 },
                ]}
                submit="Đổi mật khẩu"
                onSubmit={(values) => api('/profile/password', { method: 'POST', json: values })}
                onDone={() => {
                  qc.clear();
                  nav('/login?passwordChanged=1');
                }}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
export function RecoveryPage({ mode }: { mode: 'forgot' | 'reset' | 'verify' }) {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const title =
    mode === 'forgot' ? 'Quên mật khẩu' : mode === 'reset' ? 'Đặt lại mật khẩu' : 'Xác minh email';
  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <p className="mb-5 text-sm text-ink-muted">
        {mode === 'forgot'
          ? 'Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu.'
          : mode === 'verify'
            ? 'Bấm xác nhận để hoàn tất xác minh email của bạn.'
            : 'Liên kết chỉ dùng một lần và có hạn 30 phút.'}
      </p>
      {mode !== 'forgot' && !/^[a-f0-9]{64}$/.test(token) ? (
        <Alert tone="error" title="Liên kết không hợp lệ" />
      ) : (
        <ActionForm
          fields={
            mode === 'forgot'
              ? [{ name: 'email', label: 'Email', type: 'email', maxLength: 254 }]
              : mode === 'reset'
                ? [
                    {
                      name: 'password',
                      label: 'Mật khẩu mới',
                      type: 'password',
                      minLength: 8,
                      maxLength: 128,
                    },
                  ]
                : []
          }
          submit={
            mode === 'verify' ? 'Xác nhận email' : mode === 'reset' ? 'Lưu mật khẩu mới' : 'Gửi liên kết'
          }
          onSubmit={(values) =>
            api(
              `/auth/${mode === 'forgot' ? 'forgot-password' : mode === 'reset' ? 'reset-password' : 'verify-email'}`,
              { method: 'POST', json: mode === 'forgot' ? values : { ...values, token } },
            )
          }
          onDone={async () => {
            if (mode === 'reset') {
              qc.clear();
            } else await qc.invalidateQueries({ queryKey: sessionKey });
          }}
          success={
            mode === 'forgot'
              ? 'Nếu tài khoản hợp lệ, email hướng dẫn sẽ được gửi.'
              : mode === 'verify'
                ? 'Đã xác minh email. Bạn có thể quản lý đội.'
                : 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.'
          }
        />
      )}
      <div className="mt-5 flex flex-wrap gap-4 text-sm text-accent">
        <Link to="/login">Đăng nhập</Link>
        <Link to="/profile">Hồ sơ của tôi</Link>
      </div>
    </Card>
  );
}
export function MailboxPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ['mailbox', user?.id],
    queryFn: () => api<MailView[]>('/dev/mailbox'),
    enabled: !!user,
    refetchInterval: 3000,
  });
  if (!user)
    return (
      <EmptyState
        title="Đăng nhập để xem hộp thư thử nghiệm của bạn"
        action={<Link to="/login?next=/mailbox">Đăng nhập</Link>}
      />
    );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <FeatureHero variant="library" compact slogan="Theo dõi email trong môi trường thử nghiệm.">
        <h1 className="text-3xl font-black">Hộp thư thử nghiệm</h1>
      </FeatureHero>
      <Alert title="Email trên máy phát triển">
        Email được lưu tại đây khi chạy cục bộ. Khi cấu hình SMTP, hệ thống gửi tới email thật và đóng hộp thư
        này.
      </Alert>
      <ErrorMessage error={q.error} />
      {q.isLoading && <LoadingState />}
      {q.data?.length === 0 && <EmptyState title="Chưa có email" />}
      {q.data?.map((mail) => (
        <Card key={mail.id}>
          <h2 className="font-bold">{mail.subject}</h2>
          <p className="mt-2 text-xs text-ink-muted">
            {new Date(mail.createdAt).toLocaleString('vi-VN')} · {mail.status}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {mail.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
              let url: URL;
              try {
                url = new URL(part);
              } catch {
                return part;
              }
              return url.origin === window.location.origin &&
                ['/verify-email', '/reset-password'].includes(url.pathname) ? (
                <Link key={i} className="text-accent underline" to={url.pathname + url.search}>
                  Mở liên kết {url.pathname === '/verify-email' ? 'xác minh' : 'đặt lại mật khẩu'}
                </Link>
              ) : (
                part
              );
            })}
          </p>
        </Card>
      ))}
    </div>
  );
}
