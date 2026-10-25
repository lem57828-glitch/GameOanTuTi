import { LedAccent } from './LedAccent';
import { MotionToggle } from './MotionSystem';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { SessionUser } from '@arena/contracts';
import { ROLE_LABEL } from '../lib/session';
import { Icon } from '@arena/ui';
import { HomeIcon } from './HomeGraphics';

export function SiteBrand() {
  return (
    <Link className="brand" to="/" aria-label="Bot Arena — trang chủ">
      <img className="brand-mark" src="/home/bot-arena-mark.svg" width="86" height="64" alt="" />
      <span className="od-field">
        <span className="wordmark">
          BOT<span> ARENA</span>
        </span>
        <small className="brand-sub">CODE. STRATEGY. BATTLE.</small>
      </span>
    </Link>
  );
}
const MAIN = [
  ['/', 'Trang chủ'],
  ['/tournament', 'Giải đấu'],
  ['/rooms', 'Phòng đấu'],
  ['/guide', 'Hướng dẫn'],
] as const;
const EXTRA = [
  ['/competition', 'Thi đấu của đội'],
  ['/team', 'Đội của tôi'],
  ['/bots', 'Bot của tôi'],
  ['/news', 'Thông báo BTC'],
] as const;
export function SiteHeader({
  user,
  unread,
  loggingOut,
  onLogout,
  onSearch,
  searchRef,
  demo = false,
}: {
  user: SessionUser | null;
  unread: number;
  loggingOut: boolean;
  onLogout: () => void;
  onSearch: () => void;
  searchRef: RefObject<HTMLButtonElement>;
  demo?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const [more, setMore] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreWrap = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => {
    setMobile(false);
    setMore(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!more) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreWrap.current?.contains(event.target)) setMore(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [more]);
  const extra: [string, string][] = EXTRA.map(([to, label]) => [to, label]);
  if (user) extra.push(['/profile', 'Hồ sơ'], ['/notifications', `Thông báo (${unread})`]);
  if (user?.role === 'admin') extra.push(['/admin', 'Khu vực BTC'], ['/admin/accounts', 'Quản trị TV1']);
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);
  return (
    <div
      className="ba-header"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (mobile) {
          setMobile(false);
          menuButton.current?.focus();
        }
        if (more) {
          setMore(false);
          moreButton.current?.focus();
        }
      }}
    >
      <header className="header">
        <div className="wrap header-inner">
          <SiteBrand />
          <nav className="nav" aria-label="Điều hướng chính">
            {MAIN.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
                {label}
              </NavLink>
            ))}
            {demo && (
              <NavLink to="/demo-login" className={linkClass}>
                Đăng nhập mẫu
              </NavLink>
            )}
            <div className="more" ref={moreWrap}>
              <button
                className="more-button"
                ref={moreButton}
                type="button"
                aria-expanded={more}
                aria-controls="site-more"
                onClick={() => setMore((value) => !value)}
              >
                Thêm <HomeIcon name="chevron" />
              </button>
              <div className="dropdown" id="site-more" hidden={!more}>
                {extra.map(([to, label]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/admin'}
                    className={linkClass}
                    onClick={() => setMore(false)}
                  >
                    {label}
                  </NavLink>
                ))}
                <MotionToggle />
              </div>
            </div>
          </nav>
          <div className="header-actions">
            <button
              className="site-search"
              ref={searchRef}
              type="button"
              onClick={onSearch}
              aria-label="Tìm nhanh trang và chức năng (Ctrl K)"
            >
              <Icon name="search" />
              <kbd>Ctrl K</kbd>
            </button>
            {user ? (
              <>
                <Link
                  className="header-user"
                  to="/profile"
                  title={`${user.displayName} · ${ROLE_LABEL[user.role]}`}
                >
                  {user.displayName} · {ROLE_LABEL[user.role]}
                </Link>
                <button
                  className="login-button"
                  type="button"
                  disabled={loggingOut}
                  aria-busy={loggingOut || undefined}
                  onClick={onLogout}
                >
                  {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                </button>
              </>
            ) : (
              <Link className="login-button" to="/login">
                Đăng nhập / Đăng ký
              </Link>
            )}
            <button
              className="menu-button"
              ref={menuButton}
              type="button"
              aria-expanded={mobile}
              aria-label={mobile ? 'Đóng menu' : 'Mở menu'}
              aria-controls="site-mobile"
              onClick={() => setMobile((value) => !value)}
            >
              <HomeIcon name={mobile ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        <LedAccent variant="header" seed="site-header" />
        <div className="mobile-menu" id="site-mobile" hidden={!mobile}>
          <nav aria-label="Điều hướng di động">
            {[...MAIN, ...extra].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/admin'}
                className={linkClass}
                onClick={() => setMobile(false)}
              >
                {label}
              </NavLink>
            ))}
            {demo && (
              <NavLink to="/demo-login" className={linkClass} onClick={() => setMobile(false)}>
                Đăng nhập mẫu
              </NavLink>
            )}
            <MotionToggle />
          </nav>
        </div>
      </header>
    </div>
  );
}
