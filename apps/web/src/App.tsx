import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, Spinner } from '@arena/ui';
import { DemoLoginPage } from './features/accounts-teams/DemoLoginPage';
import { MyTeamPage } from './features/accounts-teams/MyTeamPage';
import { MyBotsPage } from './features/bots-runner/MyBotsPage';
import { TournamentPage } from './features/tournaments/TournamentPage';
import { RoomPage } from './features/rooms-matches/RoomPage';
import { RoomsPage } from './features/rooms-matches/RoomsPage';
import { AdminPage } from './pages/AdminPage';
import { HomePage, GuidePage } from './pages/HomePage';
import { ROLE_LABEL, useLogout, useSession } from './lib/session';
import { usePublicHealth } from './lib/health';

export function App() {
  const { user } = useSession();
  const logout = useLogout();
  const health = usePublicHealth();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 bg-accent p-3 text-bg focus:not-sr-only">
        Đến nội dung
      </a>
      <header className="border-b border-line bg-bg-deep/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link to="/" className="text-xl font-black tracking-tight">
            BOT<span className="text-accent"> ARENA</span> <span className="text-xs text-ink-muted">M0</span>
          </Link>
          <nav aria-label="Điều hướng chính" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
            {(
              [
                ['/tournament', 'Giải đấu'],
                ['/rooms', 'Phòng đấu'],
                ['/team', 'Đội của tôi'],
                ['/bots', 'Bot của tôi'],
                ['/guide', 'Hướng dẫn'],
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
                <Link to="/login">Đăng nhập mẫu</Link>
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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<DemoLoginPage />} />
          <Route path="/team" element={<MyTeamPage />} />
          <Route path="/bots" element={<MyBotsPage />} />
          <Route path="/tournament" element={<TournamentPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/admin" element={<StaffPage />} />
          <Route
            path="*"
            element={<EmptyState title="Không tìm thấy trang" action={<Link to="/">Về trang chủ</Link>} />}
          />
        </Routes>
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-ink-muted">
        Bot Arena · Nền tảng M0 · Luật thi chính thức đang hoàn thiện
      </footer>
    </div>
  );
}

function StaffPage() {
  const { user, isLoading } = useSession();
  if (isLoading) return <Spinner label="Kiểm tra phiên" />;
  if (!user)
    return <EmptyState title="Cần đăng nhập" action={<Link to="/login?next=/admin">Đăng nhập mẫu</Link>} />;
  if (user.role === 'student')
    return (
      <Alert tone="error" title="Không có quyền truy cập">
        Khu vực này dành cho BTC và trọng tài.
      </Alert>
    );
  return <AdminPage />;
}
