import { useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Card, CardHeader } from '@arena/ui';
import type { RoomSnapshot } from '@arena/contracts';
import { HomeArena } from '../components/HomeArena';
import { HomeIcon } from '../components/HomeGraphics';
import { useSession } from '../lib/session';
import { usePublicHealth } from '../lib/health';
import { api } from '../lib/api';

const FLOWS = [
  ['Viết chiến thuật', 'Biến ý tưởng thành bot Python'],
  ['Đấu thử & cải tiến', 'Theo dõi từng nước đi'],
  ['Vào đấu trường', 'Thi đấu cùng cộng đồng'],
] as const;
const DOCS = [
  ['/news', 'Thông báo và lịch giải'],
  ['/tournament', 'Thể thức thi đấu'],
  ['/guide', 'Hướng dẫn tham gia'],
] as const;
const STAGES = [
  ['GIAI ĐOẠN 01', 'Sơ loại', 'Tích luỹ qua các vòng'],
  ['GIAI ĐOẠN 02', 'Top 32', 'Nhánh loại trực tiếp'],
  ['ĐÍCH ĐẾN', 'Top 4', 'Bốn đội đi tiếp'],
] as const;

export function HomePage() {
  const { user, isLoading } = useSession();
  const health = usePublicHealth();
  const demo = health.data?.demoMode === true;
  const room = useQuery({
    queryKey: ['home-room'],
    queryFn: () => api<RoomSnapshot>('/rooms/room_demo_1'),
    enabled: demo,
  });
  const [path, setPath] = useState<'new' | 'ready'>('new');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const runButton = useRef<HTMLButtonElement>(null);
  function changeTab(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - current;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 1;
    if (next === undefined) return;
    event.preventDefault();
    setPath(next === 0 ? 'new' : 'ready');
    tabs.current[next]?.focus();
  }
  function preview() {
    runButton.current?.click();
    runButton.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    runButton.current?.focus({ preventScroll: true });
  }
  const steps = [
    {
      tag: 'TEAM',
      title: 'Đăng nhập và lập đội',
      description: 'Mỗi người thuộc một đội trong một giải. Tạo đội hoặc tham gia cùng đồng đội bằng mã mời.',
      to: user ? '/team' : '/register',
      action: 'Bắt đầu tham gia',
    },
    {
      tag: 'BUILD',
      title: 'Chuẩn bị phiên bản bot',
      description: 'Tập luyện với file Python; nộp bot GitHub theo commit để thi chính thức.',
      to: '/bots',
      action: 'Mở Bot của tôi',
    },
    {
      tag: 'BATTLE',
      title: 'Theo dõi trận đấu',
      description: 'Vào phòng công khai dành cho thí sinh và khán giả. Theo dõi diễn biến qua từng nước đi.',
      to: '/rooms',
      action: 'Xem phòng đấu',
    },
  ];
  const pathSteps =
    path === 'new'
      ? [
          ['KHÁM PHÁ', 'Hiểu Búa–Bao–Kéo', 'Bấm chú giải trên bàn cờ.'],
          ['THỬ NGHIỆM', 'Quan sát nước đi', 'Theo dõi quân và nhật ký.'],
          ['BẮT ĐẦU', 'Viết bot đầu tiên', 'Chỉnh sửa bot Python mẫu.'],
        ]
      : [
          ['TẬP LUYỆN', 'Đấu thử bot', 'Nộp file Python trong ứng dụng.'],
          ['CHÍNH THỨC', 'Nộp qua GitHub', 'Cố định phiên bản bằng commit.'],
          ['THI ĐẤU', 'Chọn bot cho đội', 'Theo lịch và phòng do BTC mở.'],
        ];
  return (
    <div className="ba-home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-landscape" aria-hidden="true">
          <img src="/home/landscape.jpg" width="1600" height="900" alt="" />
        </div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="kicker hero-intro">BOT ARENA / ĐẤU TRƯỜNG LẬP TRÌNH</p>
            <h1 id="home-title">
              <span>Code chiến thuật.</span>
              <span>Làm chủ</span>
              <span>
                <em>bàn cờ.</em>
              </span>
            </h1>
            <p className="hero-desc">
              Xây dựng bot Búa – Bao – Kéo, gặp đối thủ và theo dõi từng nước đi cùng cả cộng đồng.
            </p>
            <p className="hero-slogan">
              Mỗi nước đi. Một chiến thuật.
              <br />
              <em>Một bước tiến.</em>
            </p>
            <div className="hero-actions">
              {isLoading && (
                <span className="button button-secondary" role="status">
                  Đang kiểm tra phiên…
                </span>
              )}
              {!isLoading && !user && (
                <Link className="button button-primary" data-ui-sound to="/register">
                  Đăng ký tham gia <HomeIcon name="arrow" />
                </Link>
              )}
              {user?.role === 'student' && (
                <Link className="button button-primary" data-ui-sound to="/competition">
                  Thi đấu của đội <HomeIcon name="arrow" />
                </Link>
              )}
              <Link className="button button-secondary" to="/rooms">
                Xem phòng đấu
              </Link>
            </div>
            <p className="hero-note">
              Nộp bot, đấu thử chiến thuật và tham gia các trận đấu theo lịch của BTC.
            </p>
            <div className="hero-capabilities">
              <span>
                <i className="code-bracket" aria-hidden="true">
                  {'{ }'}
                </i>
                <b>Python</b>
              </span>
              <span>
                <b>GitHub</b> / commit
              </span>
              <span>
                Bàn cờ <b>9 × 9</b>
              </span>
            </div>
          </div>
          <HomeArena
            snapshot={demo ? room.data : undefined}
            loading={demo && room.isFetching && !room.data}
            failed={demo && room.isError}
            runButtonRef={runButton}
          />
        </div>
      </section>
      <div className="wrap">
        <div className="flow-strip" aria-label="Hành trình lập trình bot">
          {FLOWS.map(([title, description], index) => (
            <div className="flow-item" key={title}>
              <span className="flow-number">0{index + 1} /</span>
              <span className="od-field">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              {index < 2 && (
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        <section className="quick-start" aria-labelledby="quick-title">
          <div className="quick-top">
            <div>
              <p className="section-kicker">ĐIỂM XUẤT PHÁT CỦA BẠN</p>
              <h2 id="quick-title">Bắt đầu đúng nhịp.</h2>
            </div>
            <div className="path-tabs" role="tablist" aria-label="Chọn lộ trình bắt đầu">
              {(['new', 'ready'] as const).map((value, index) => (
                <button
                  ref={(node) => {
                    tabs.current[index] = node;
                  }}
                  key={value}
                  className="path-tab"
                  type="button"
                  id={`home-tab-${value}`}
                  role="tab"
                  aria-selected={path === value}
                  aria-controls={`home-panel-${value}`}
                  tabIndex={path === value ? 0 : -1}
                  onClick={() => setPath(value)}
                  onKeyDown={(event) => changeTab(event, index)}
                >
                  {value === 'new' ? 'Tôi mới bắt đầu' : 'Tôi đã có bot'}
                </button>
              ))}
            </div>
          </div>
          {(['new', 'ready'] as const).map((value) => (
            <div
              key={value}
              className="path-panel"
              role="tabpanel"
              id={`home-panel-${value}`}
              aria-labelledby={`home-tab-${value}`}
              hidden={path !== value}
            >
              <div>
                <h3>
                  {value === 'new'
                    ? 'Thử một lượt. Hiểu cuộc chơi.'
                    : 'Bot đã sẵn sàng. Đến lượt chiến thuật.'}
                </h3>
                <p>
                  {value === 'new'
                    ? 'Bắt đầu từ bàn cờ, làm quen ba loại quân rồi phát triển chiến thuật đầu tiên với bot Python mẫu.'
                    : 'Tập luyện bằng file Python. Khi tham gia thi chính thức, nộp bot từ GitHub theo commit và chọn phiên bản cho đội.'}
                </p>
                <div className="path-actions">
                  {value === 'new' ? (
                    <>
                      <button type="button" className="text-action" onClick={preview}>
                        Chạy lượt minh hoạ <HomeIcon name="arrow" />
                      </button>
                      <a className="text-action" href="/home/bots/tien_cong.py" download="tien_cong.py">
                        Tải bot mẫu <HomeIcon name="arrow" />
                      </a>
                    </>
                  ) : (
                    <>
                      <Link className="text-action" to="/bots">
                        Mở Bot của tôi <HomeIcon name="arrow" />
                      </Link>
                      <Link className="text-action" to="/competition">
                        Chuẩn bị thi đấu <HomeIcon name="arrow" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <ol className="path-guide">
                {pathSteps.map(([tag, title, description], index) => (
                  <li key={tag}>
                    <small>
                      0{index + 1} / {tag}
                    </small>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
        <section className="news-section" aria-labelledby="news-title">
          <div className="news-banner">
            <div>
              <span className="section-kicker">TỪ BAN TỔ CHỨC</span>
              <h2 id="news-title">Thông báo & tài liệu.</h2>
              <p>Lịch giải, thể lệ và những điều cần biết trước khi nhập cuộc.</p>
            </div>
            <div className="news-links">
              {DOCS.map(([to, title], index) => (
                <Link className="news-link" to={to} key={to}>
                  <span>
                    <span className="doc-type">0{index + 1}</span>
                    {title}
                  </span>
                  <HomeIcon name="arrow" />
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="journey" aria-labelledby="journey-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">BẮT ĐẦU TỪ ĐÂY</p>
              <h2 id="journey-title">
                Từ dòng code đầu tiên
                <br />
                đến nước cờ của riêng bạn.
              </h2>
            </div>
            <p>Ba bước để chuẩn bị đội, xây dựng bot và theo dõi trận đấu trên cùng một nền tảng.</p>
          </div>
          <div className="journey-grid">
            {steps.map((step, index) => (
              <article className="journey-step" key={step.tag}>
                <div className="step-top">
                  <span>0{index + 1}</span>
                  <span>{step.tag}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <Link className="text-action" to={step.to}>
                  {step.action}
                  <HomeIcon name="arrow" />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="tournament" aria-labelledby="tournament-title">
          <div>
            <p className="section-kicker">{demo ? 'GIẢI MẪU BOT ARENA' : 'GIẢI ĐẤU BOT ARENA'}</p>
            <h2 id="tournament-title">
              Một chiến thuật.
              <br />
              Cả hành trình phía trước.
            </h2>
            <p>Theo dõi lịch thi, cặp đấu, bảng xếp hạng và nhánh loại trực tiếp của giải đang mở.</p>
            <Link className="text-action" to="/tournament">
              Xem thông tin giải <HomeIcon name="arrow" />
            </Link>
          </div>
          <div>
            <div className="stage-rail" aria-label="Sơ loại, Top 32, Top 4">
              {STAGES.map(([tag, title, description]) => (
                <div className="stage-item" key={title}>
                  <small>{tag}</small>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            <p className="tournament-note">Lịch thi và thông tin chi tiết theo thông báo từ BTC.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
export function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-black">Hướng dẫn thử M0</h1>
      <Alert title="Luồng mô phỏng" tone="info">
        Đây là bản kiểm tra nền tảng, chưa tổ chức giải chính thức.
      </Alert>
      <ol className="list-decimal space-y-4 pl-6 text-ink-muted">
        <li>Vào Đăng nhập mẫu, chọn BTC Demo để tạo ván; chọn sinh viên để xem đội và bot.</li>
        <li>Trong Khu vực BTC, kiểm tra dịch vụ rồi tạo một ván mô phỏng.</li>
        <li>
          Mở phòng đấu để xem tung xu, bàn cờ, nước đi và kết quả. Có thể chia sẻ đường dẫn phòng cho người
          chưa đăng nhập.
        </li>
        <li>
          Tải lại trang hoặc kết nối mạng lại để xem trạng thái đã lưu. Ván và kết quả tung xu được giữ
          nguyên.
        </li>
      </ol>
      <Card>
        <CardHeader title="Các phần làm tiếp" />
        <p className="text-sm leading-relaxed text-ink-muted">
          Đăng ký đội, nộp bot và sandbox, ghép cặp Swiss, cây đấu 32 → 4, chốt bot/quân kín và khiếu nại chưa
          được triển khai ở M0.
        </p>
      </Card>
    </div>
  );
}
