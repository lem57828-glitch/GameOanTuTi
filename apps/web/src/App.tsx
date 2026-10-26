import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { ProfilePage, RecoveryPage, MailboxPage } from './features/accounts-teams/AccountPages';
import { NewsPage, NotificationsPage } from './features/accounts-teams/CommunityPages';
import { Tv1Admin } from './features/accounts-teams/Tv1Admin';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, Spinner } from '@arena/ui';
import { AuthPage } from './features/accounts-teams/AuthPage';
import { DemoLoginPage } from './features/accounts-teams/DemoLoginPage';
import { MyTeamPage } from './features/accounts-teams/MyTeamPage';
import { MyBotsPage } from './features/bots-runner/MyBotsPage';
import { TournamentPage } from './features/tournaments/TournamentPage';
import { TeamCompetitionPage } from './features/tournaments/TeamCompetitionPage';
import { RoomPage } from './features/rooms-matches/RoomPage';
import { RoomsPage } from './features/rooms-matches/RoomsPage';
import { LiveMatchBanner } from './features/rooms-matches/LiveMatchBanner';
import { NotificationPopups } from './features/accounts-teams/NotificationPopups';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { SiteBrand, SiteHeader } from './components/SiteHeader';
import './pages/home.css';
import './workspace.css';
import './sectors.css';
import './motion.css';
import './replay.css';
import './search.css';
import './led.css';
import { MotionProvider } from './components/MotionSystem';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { CommandMenu } from './components/CommandMenu';
import { useLogout, useSession } from './lib/session';
import { usePublicHealth } from './lib/health';

export function App() {
  return (
    <MotionProvider>
      <ArenaApp />
    </MotionProvider>
  );
}

function ArenaApp() {
  const { user } = useSession();
  const logout = useLogout();
  const [commandsOpen, setCommandsOpen] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const isHome = useLocation().pathname === '/';
  const health = usePublicHealth();
  const qc = useQueryClient();
  async function reconnect() {
    const result = await health.refetch();
    if (result.isSuccess) await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'health' });
  }
  const notifications = useQuery({
    queryKey: ['notifications', user?.id, 'badge'],
    queryFn: () => api<{ unread: number }>('/notifications'),
    enabled: !!user,
    refetchInterval: 10000,
  });
  return (
    <div className="arena-app flex min-h-screen flex-col" data-arena-root>
      <a href="#main" className="sr-only z-50 bg-accent p-3 text-bg focus:not-sr-only">
        Đến nội dung
      </a>
      <SiteHeader
        user={user}
        unread={notifications.data?.unread ?? 0}
        loggingOut={logout.isPending}
        onLogout={() => logout.mutate()}
        onSearch={() => setCommandsOpen(true)}
        searchRef={searchButton}
        demo={health.data?.demoMode === true}
      />
      <CommandMenu
        open={commandsOpen}
        onOpenChange={setCommandsOpen}
        user={user}
        demo={health.data?.demoMode === true}
        returnRef={searchButton}
      />
      <main id="main" className={isHome ? 'w-full flex-1' : 'workspace-main flex-1'}>
        {health.error && (
          <div className={isHome ? 'ba-home-alert' : 'mb-6'}>
            <Alert
              tone="error"
              title="Chưa kết nối được dịch vụ"
              action={
                <Button size="sm" variant="secondary" onClick={() => void reconnect()}>
                  Thử kết nối lại
                </Button>
              }
            >
              Chưa thể xác định chế độ demo hoặc tải đầy đủ dữ liệu giải đấu. Vui lòng thử kết nối lại.
            </Alert>
          </div>
        )}
        {health.data?.demoMode && (
          <div className={isHome ? 'ba-home-alert' : 'mb-6'}>
            <Badge tone="warning">Môi trường demo · Dữ liệu mô phỏng</Badge>
          </div>
        )}
        {user && !user.emailVerified && !user.demo && (
          <div className={isHome ? 'ba-home-alert' : 'mb-6'}>
            <Alert tone="warning" title="Email chưa được xác minh">
              <Link className="text-accent underline" to="/profile">
                Mở Hồ sơ để gửi lại email và hoàn tất xác minh trước khi quản lý đội.
              </Link>
            </Alert>
          </div>
        )}
        <div className={isHome ? 'ba-home-alert' : undefined}>
          <LiveMatchBanner />
        </div>
        <NotificationPopups />
        <WorkspaceLayout user={user} onSearch={() => setCommandsOpen(true)}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route path="/register" element={<AuthPage key="register" register />} />
            <Route
              path="/demo-login"
              element={
                health.isPending ? (
                  <Spinner label="Đang kiểm tra chế độ demo" />
                ) : health.error ? (
                  <Alert
                    tone="error"
                    title="Chưa kiểm tra được chế độ demo"
                    action={<Button onClick={() => void reconnect()}>Thử lại</Button>}
                  >
                    Không thể kết nối API. Vui lòng thử lại khi dịch vụ sẵn sàng.
                  </Alert>
                ) : health.data?.demoMode ? (
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
        </WorkspaceLayout>
      </main>
      <div className="ba-footer">
        <footer className="footer">
          <div className="wrap footer-inner">
            <SiteBrand />
            <div className="footer-right">
              <Link to="/guide">Hướng dẫn</Link>
              <Link to="/news">Thông báo BTC</Link>
              <span className="footer-note">
                {health.data?.demoMode ? 'Môi trường demo · Dữ liệu mô phỏng' : 'Đấu trường lập trình bot'}
              </span>
            </div>
          </div>
        </footer>
      </div>
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
        Khu vực này dành cho BTC.
      </Alert>
    );
  return <AdminPage />;
}
