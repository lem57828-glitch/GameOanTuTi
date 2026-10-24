import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { ProfilePage, RecoveryPage, MailboxPage } from './features/accounts-teams/AccountPages';
import { NewsPage, NotificationsPage } from './features/accounts-teams/CommunityPages';
import { Tv1Admin } from './features/accounts-teams/Tv1Admin';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, Spinner } from '@arena/ui';
import { AuthPage } from './features/accounts-teams/AuthPage';
import { DemoLoginPage } from './features/accounts-teams/DemoLoginPage';
import { MyTeamPage } from './features/accounts-teams/MyTeamPage';
import { MyBotsPage } from './features/bots-runner/MyBotsPage';
import { TournamentPage } from './features/tournaments/TournamentPage';
import { TeamCompetitionPage } from './features/tournaments/TeamCompetitionPage';
import { RoomPage } from './features/rooms-matches/RoomPage';
import { RoomsPage } from './features/rooms-matches/RoomsPage';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { ROLE_LABEL, useLogout, useSession } from './lib/session';
import { usePublicHealth } from './lib/health';

export function App() {
  const { user } = useSession();
  const logout = useLogout();
  const health = usePublicHealth();
  const notifications = useQuery({
    queryKey: ['notifications', user?.id, 'badge'],
    queryFn: () => api<{ unread: number }>('/notifications'),
    enabled: !!user,
    refetchInterval: 10000,
  });
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 bg-accent p-3 text-bg focus:not-sr-only">
        Đến nội dung
      </a>
      <header className="border-b border-line bg-bg-deep/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link to="/" className="text-xl font-black tracking-tight">
            BOT<span className="text-accent"> ARENA</span>
          </Link>
          <nav aria-label="Điều hướng chính" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
            {(
              [
                ['/competition', 'Thi đấu của đội'],
                ['/tournament', 'Giải đấu'],
                ['/rooms', 'Phòng đấu'],
                ['/team', 'Đội của tôi'],
                ['/bots', 'Bot của tôi'],
                ['/guide', 'Hướng dẫn'],
                ['/news', 'Thông báo BTC'],
              ] as const
            ).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'text-accent' : 'text-ink-muted hover:text-ink')}
              >
                {label}
              </NavLink>
            ))}
            {(user?.role === 'admin' || user?.role === 'referee') && (
              <NavLink to="/admin">Khu vực BTC</NavLink>
            )}
            {user && (
              <>
                <NavLink to="/profile">Hồ sơ</NavLink>
                <NavLink to="/notifications">Thông báo ({notifications.data?.unread ?? 0})</NavLink>
              </>
            )}
            {user?.role === 'admin' && <NavLink to="/admin/accounts">Quản trị TV1</NavLink>}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            {user ? (
              <>
                <span>
                  {user.displayName} · {ROLE_LABEL[user.role]}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => logout.mutate()}
                  loading={logout.isPending}
                >
                  Đăng xuất
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/login">Đăng nhập / Đăng ký</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
        {health.data?.demoMode && (
          <div className="mb-6">
            <Badge tone="warning">Môi trường demo · Dữ liệu mô phỏng</Badge>
          </div>
        )}
        {user && !user.emailVerified && !user.demo && (
          <div className="mb-6">
            <Alert tone="warning" title="Email chưa được xác minh">
              <Link className="text-accent underline" to="/profile">
                Mở Hồ sơ để gửi lại email và hoàn tất xác minh trước khi quản lý đội.
              </Link>
            </Alert>
          </div>
        )}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage key="login" />} />
          <Route path="/register" element={<AuthPage key="register" register />} />
          <Route
            path="/demo-login"
            element={
              health.data?.demoMode ? (
                <DemoLoginPage />
              ) : (
                <EmptyState
                  title="Đăng nhập mẫu không khả dụng"
                  action={<Link to="/login">Đăng nhập</Link>}
                />
              )
            }
          />
          <Route path="/team" element={<MyTeamPage />} />
          <Route path="/competition" element={<TeamCompetitionPage />} />
          <Route path="/bots" element={<MyBotsPage />} />
          <Route path="/tournament" element={<TournamentPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="/guide" element={<NewsPage kind="guide" />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/mailbox"
            element={
              health.data?.demoMode ? (
                <MailboxPage />
              ) : (
                <EmptyState title="Hộp thư thử nghiệm không khả dụng" />
              )
            }
          />
          <Route path="/forgot-password" element={<RecoveryPage mode="forgot" />} />
          <Route path="/reset-password" element={<RecoveryPage mode="reset" />} />
          <Route path="/verify-email" element={<RecoveryPage mode="verify" />} />
          <Route path="/admin/accounts" element={<Tv1Admin />} />
          <Route path="/admin" element={<StaffPage />} />
          <Route
            path="*"
            element={<EmptyState title="Không tìm thấy trang" action={<Link to="/">Về trang chủ</Link>} />}
          />
        </Routes>
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-ink-muted">
        Bot Arena ·{' '}
        {health.data?.demoMode ? 'Môi trường demo · Dữ liệu mô phỏng' : 'Đấu trường lập trình bot'}
      </footer>
    </div>
  );
}

function StaffPage() {
  const { user, isLoading } = useSession();
  if (isLoading) return <Spinner label="Kiểm tra phiên" />;
  if (!user)
    return <EmptyState title="Cần đăng nhập" action={<Link to="/login?next=/admin">Đăng nhập</Link>} />;
  if (user.role === 'student')
    return (
      <Alert tone="error" title="Không có quyền truy cập">
        Khu vực này dành cho BTC và trọng tài.
      </Alert>
    );
  return <AdminPage />;
}
