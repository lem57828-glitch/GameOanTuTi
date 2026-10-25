import { SectorArt } from './WorkspaceVisuals';
import { LedAccent } from './LedAccent';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { SessionUser } from '@arena/contracts';
import { Icon } from '@arena/ui';
import { workspaceMeta } from '../lib/workspace-navigation';
export function WorkspaceLayout({
  children,
  user,
  onSearch,
}: {
  children: ReactNode;
  user: SessionUser | null;
  onSearch: () => void;
}) {
  const { pathname } = useLocation();
  const meta = workspaceMeta(pathname);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (pathname === '/') return <>{children}</>;
  const links =
    meta.group === 'admin' && user?.role === 'admin'
      ? [
          ['/admin', 'Điều hành giải'],
          ['/admin/accounts', 'Tài khoản & nội dung'],
        ]
      : meta.group === 'team'
        ? [
            ['/competition', 'Thi đấu của đội'],
            ['/team', 'Đội'],
            ['/bots', 'Bot & đấu thử'],
          ]
        : meta.group === 'rooms' || meta.group === 'competition'
          ? [
              ['/tournament', 'Giải đấu'],
              ['/rooms', 'Phòng đấu'],
            ]
          : meta.group === 'content'
            ? [
                ['/news', 'Thông báo BTC'],
                ['/guide', 'Hướng dẫn'],
              ]
            : user
              ? [
                  ['/profile', 'Hồ sơ'],
                  ['/notifications', 'Thông báo'],
                ]
              : [];
  return (
    <div className={`workspace workspace--${meta.group}${meta.auth ? ' workspace--auth' : ''}`}>
      <div className="workspace-toolbar">
        <nav aria-label="Đường dẫn trang" className="workspace-breadcrumb">
          <Link to="/">Bot Arena</Link>
          <span aria-hidden="true">/</span>
          <span>{meta.section}</span>
          <span aria-hidden="true">/</span>
          <strong aria-current="page">{meta.label}</strong>
        </nav>
        <button className="workspace-command" type="button" onClick={onSearch}>
          <Icon name="search" />
          <span>Tìm nhanh</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
      {!online && (
        <p className="workspace-offline" role="status">
          Trình duyệt đang mất mạng. Dữ liệu hiển thị có thể là trạng thái đã nhận trước đó.
        </p>
      )}
      {links.length > 0 && (
        <nav className="workspace-subnav" aria-label={`Điều hướng ${meta.section}`}>
          {links.map(([to, label]) => (
            <NavLink
              to={to!}
              key={to}
              end={to === '/admin'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      <p className="workspace-hint">{meta.hint}</p>
      <div className="workspace-layout">
        {meta.auth && (
          <aside className="workspace-auth-aside">
            <p className="workspace-eyebrow">BOT ARENA / THAM GIA</p>
            <h2>
              Chiến thuật bắt đầu
              <br />
              từ <em>bạn.</em>
            </h2>
            <p>Viết bot. Đấu thử. Cùng đồng đội tiến xa hơn trên bàn cờ.</p>
            <div className="auth-sector-art sector-led-art">
              <SectorArt variant="account" />
              <LedAccent frame variant="account" seed="auth-illustration" />
            </div>
            <ol>
              <li>
                <span>01</span>Hoàn thiện tài khoản
              </li>
              <li>
                <span>02</span>Kết nối đội của bạn
              </li>
              <li>
                <span>03</span>Đưa chiến thuật vào cuộc đấu
              </li>
            </ol>
            <Link to="/guide">
              Tìm hiểu trước khi tham gia <Icon name="arrow" />
            </Link>
          </aside>
        )}
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
