import { LedAccent } from './LedAccent';
import { TechSignals } from './TechSignals';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PieceGlyph } from './HomeGraphics';

export type Sector = 'bot' | 'team' | 'tournament' | 'rooms' | 'account' | 'library' | 'control';

/** Decorative diagrams share the product's geometry; they never represent live data. */
export function SectorArt({ variant, className = '' }: { variant: Sector; className?: string }) {
  const id = `sector-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`sector-art sector-art--${variant} ${className}`}
      viewBox="0 0 480 280"
      width="480"
      height="280"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" className="art-grid" />
        </pattern>
      </defs>
      <rect x="16" y="16" width="448" height="248" fill={`url(#${id})`} />
      <TechSignals variant={variant} />
      <path d="M24 48V24h24m384 0h24v24M24 232v24h24m384 0h24v-24" className="art-frame" />
      <path
        d="m24 244 55-34 30 16 49-42 28 19 59-52 35 27 40-14 56 42 23-8 57 46"
        className="art-landscape"
      />
      <path d="m42 252 73-21 28 10 71-39 39 20 31-8 68 27 42-7 43 18" className="art-landscape" />
      {variant === 'bot' && (
        <>
          <path d="m240 63 136 70-136 77-136-77z" className="art-plate" />
          <path d="m104 133v25l136 77 136-77v-25M240 210v25" className="art-frame" />
          <path d="m240 43 105 56v34l-105 60-105-60V99z" className="art-surface" />
          <path d="m135 99 105 59 105-59M240 158v35" className="art-frame" />
          <path
            d="M61 103h40l34 20m210 0 35-20h39M61 181h42l32-18m210 0 35 18h39M240 24v20"
            className="art-circuit"
          />
          <path d="m240 68 63 33-63 36-63-36z" className="art-accent-fill" />
          <path d="m240 78 44 23-44 25-44-25z" className="art-accent" />
          <text x="240" y="108" className="art-chip-label" textAnchor="middle">
            BOT
          </text>
          {[61, 419].map((x) => (
            <g key={x}>
              <circle cx={x} cy="103" r="5" className="art-blue-fill" />
              <circle cx={x} cy="181" r="5" className="art-accent-fill" />
            </g>
          ))}
          <path d="m167 151 20 11m12-6 20 11m42 0 20-11m12 6 20-11" className="art-blue" />
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            PYTHON / CHIẾN THUẬT
          </text>
        </>
      )}
      {variant === 'team' && (
        <>
          <path d="M120 88h54l66 51 66-51h54M120 199h54l66-60 66 60h54" className="art-circuit" />
          <path d="m240 69 56 28v55c0 40-56 65-56 65s-56-25-56-65V97z" className="art-surface" />
          <path d="m240 84 42 21v45c0 29-42 51-42 51s-42-22-42-51v-45z" className="art-accent" />
          <path d="m220 145 15 15 27-35" className="art-white" />
          {(
            [
              [110, 88],
              [370, 88],
              [110, 199],
              [370, 199],
            ] as const
          ).map(([x, y], i) => (
            <g key={i}>
              <path
                d={`m${x} ${y - 29} 27 15v29l-27 15-27-15v-29z`}
                className={i % 2 ? 'art-plate' : 'art-surface'}
              />
              <circle cx={x} cy={y - 6} r="7" className={i % 2 ? 'art-accent' : 'art-blue'} />
              <path
                d={`M${x - 13} ${y + 16}v-5c0-14 26-14 26 0v5`}
                className={i % 2 ? 'art-accent' : 'art-blue'}
              />
            </g>
          ))}
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            KẾT NỐI / PHỐI HỢP / TIẾN XA
          </text>
        </>
      )}
      {variant === 'tournament' && (
        <>
          <path
            d="M107 64h44v41h54m-98 82h44v-41h54M373 64h-44v41h-54m98 82h-44v-41h-54M205 105v41m70-41v41M205 125h70"
            className="art-circuit"
          />
          {[52, 175].map((y) => (
            <g key={y}>
              <rect x="49" y={y} width="58" height="24" rx="3" className="art-surface" />
              <path d={`M60 ${y + 12}h34`} className="art-blue" />
              <rect x="373" y={y} width="58" height="24" rx="3" className="art-surface" />
              <path d={`M385 ${y + 12}h34`} className="art-blue" />
            </g>
          ))}
          <path d="m240 66 47 27v63l-47 27-47-27V93z" className="art-surface" />
          <path
            d="M225 103h30v21c0 19-30 19-30 0v-21Zm0 5h-12v11c0 12 12 13 12 13m30-24h12v11c0 12-12 13-12 13m-15 5v18m-15 0h30"
            className="art-accent"
          />
          <path d="M240 183v28m-53 0h106" className="art-frame" />
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            CHIẾN THUẬT / BẢN LĨNH / BỨT PHÁ
          </text>
        </>
      )}
      {variant === 'rooms' && (
        <>
          <path d="m240 45 170 75-170 105L70 150z" className="art-plate" />
          <path d="m70 150 170 93 170-105v-18M240 225v18" className="art-frame" />
          {Array.from({ length: 7 }, (_, i) => {
            const t = (i + 1) / 8;
            return (
              <g key={i} className="art-frame">
                <path d={`M${240 + 170 * t} ${45 + 75 * t} ${70 + 170 * t} ${150 + 75 * t}`} />
                <path d={`M${240 - 170 * t} ${45 + 105 * t} ${410 - 170 * t} ${120 + 105 * t}`} />
              </g>
            );
          })}
          <ellipse cx="186" cy="138" rx="29" ry="18" className="art-blue-fill" />
          <ellipse cx="186" cy="131" rx="29" ry="18" className="art-surface art-blue" />
          <g transform="translate(175 119) scale(.9)" className="art-blue">
            <PieceGlyph type="ROCK" />
          </g>
          <path d="m298 112 30 18-30 18-30-18z" className="art-pink-fill" />
          <path d="m298 104 30 18-30 18-30-18z" className="art-surface art-pink" />
          <g transform="translate(287 109) scale(.9)" className="art-pink">
            <PieceGlyph type="SCISSORS" />
          </g>
          <path d="m219 135 28-5 20 2" className="art-accent" strokeDasharray="5 5" />
          <text x="240" y="266" className="art-caption" textAnchor="middle">
            MỖI NƯỚC ĐI / MỘT QUYẾT ĐỊNH
          </text>
        </>
      )}
      {variant === 'account' && (
        <>
          <path
            d="M82 86h73l37 42m206-42h-73l-37 42M82 203h73l37-42m206 42h-73l-37-42"
            className="art-circuit"
          />
          <path d="m240 48 65 30v75c0 42-65 74-65 74s-65-32-65-74V78z" className="art-surface" />
          <path d="m240 64 50 24v63c0 30-50 58-50 58s-50-28-50-58V88z" className="art-blue" />
          <circle cx="240" cy="116" r="19" className="art-accent" />
          <path d="M205 174v-7c0-37 70-37 70 0v7" className="art-accent" />
          {[82, 398].map((x) => (
            <g key={x}>
              <rect x={x - 15} y="71" width="30" height="30" rx="5" className="art-surface" />
              <path d={`m${x - 7} 86 5 5 10-10`} className="art-blue" />
              <circle cx={x} cy="203" r="9" className="art-accent-fill" />
            </g>
          ))}
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            DẤU ẤN CỦA BẠN / HÀNH TRÌNH CỦA ĐỘI
          </text>
        </>
      )}
      {variant === 'library' && (
        <>
          <path d="m177 66 42-22h101v153l-42 22H177z" className="art-plate" />
          <path d="M163 67h115v152H163z" className="art-surface" />
          <path d="m278 67 42-23M278 219l42-22" className="art-frame" />
          <path d="M184 99h45m-45 16h72m-72 16h63m-63 16h72m-72 16h50" className="art-blue" />
          <path d="M79 133h49l35 24m115-36h53l37-25M278 185h53l37 30" className="art-circuit" />
          <path d="M63 116h33v30H63zM354 78h29v31h-29zM354 201h29v31h-29z" className="art-surface" />
          <path d="M70 126h19m-19 8h14m347-45h15m-15 8h15m-15 114h15m-15 8h10" className="art-accent" />
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            HIỂU LUẬT / VIẾT CHIẾN THUẬT
          </text>
        </>
      )}
      {variant === 'control' && (
        <>
          <path
            d="M94 140h68m156 0h68M240 65v39m0 72v39M132 65h45l33 42m-78 108h45l33-42m138-108h-45l-33 42m78 108h-45l-33-42"
            className="art-circuit"
          />
          <path d="m240 90 53 25v50l-53 25-53-25v-50z" className="art-surface" />
          <path d="m240 105 37 18v34l-37 18-37-18v-34z" className="art-accent" />
          <path d="M216 142h12l7-14 11 27 7-13h12" className="art-white" />
          {(
            [
              [94, 140],
              [386, 140],
              [132, 65],
              [348, 65],
              [132, 215],
              [348, 215],
            ] as const
          ).map(([x, y], i) => (
            <g key={i}>
              <rect x={x - 18} y={y - 13} width="36" height="26" rx="4" className="art-surface" />
              <path d={`M${x - 8} ${y}h16`} className={i % 2 ? 'art-blue' : 'art-accent'} />
            </g>
          ))}
          <text x="240" y="252" className="art-caption" textAnchor="middle">
            ĐIỀU PHỐI / THEO DÕI / XÁC NHẬN
          </text>
        </>
      )}
    </svg>
  );
}

export function FeatureHero({
  variant,
  slogan,
  children,
  compact = false,
}: {
  variant: Sector;
  slogan: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={`led-framed sector-hero sector-hero--${variant}${compact ? ' sector-hero--compact' : ''}`}
    >
      <div className="sector-hero-copy">
        <div className="sector-hero-heading">{children}</div>
        <p className="sector-slogan">{slogan}</p>
      </div>
      <div className="sector-hero-visual" data-fx-tilt>
        <div className="sector-led-art">
          <SectorArt variant={variant} />
          <LedAccent frame variant={variant} />
        </div>
      </div>
    </header>
  );
}

/** A generated monogram, not an uploaded team logo or a ranking indicator. */
export function IdentityMark({ seed, label, side }: { seed: string; label: string; side?: 'blue' | 'pink' }) {
  const hash = Array.from(seed).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => Array.from(s)[0] ?? '')
    .join('')
    .toLocaleUpperCase('vi-VN');
  return (
    <svg
      className={`identity-mark${side ? ` identity-mark--${side}` : ''}`}
      viewBox="0 0 72 72"
      width="72"
      height="72"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {side === 'pink' ? (
        <path d="m36 3 33 33-33 33L3 36z" className="identity-base" />
      ) : (
        <path d="m36 3 29 16v34L36 69 7 53V19z" className="identity-base" />
      )}
      <path
        d={
          hash % 2
            ? 'M14 29V23l22-12 22 12v6M14 43v6l22 12 22-12v-6'
            : 'M14 25v22l7 4m37-26v22l-7 4M29 13l7-4 7 4m-14 46 7 4 7-4'
        }
        className="identity-etch"
      />
      <text x="36" y="43" textAnchor="middle">
        {initials || 'BA'}
      </text>
    </svg>
  );
}

export function BotProcess() {
  return (
    <ol className="bot-process" aria-label="Quy trình chuẩn bị bot">
      <li>
        <span className="process-glyph" aria-hidden="true">
          &lt;/&gt;
        </span>
        <div>
          <small>01 / PHIÊN BẢN</small>
          <strong>Nạp chiến thuật</strong>
          <p>Nộp code để tập luyện; dùng GitHub với commit cố định khi thi chính thức.</p>
        </div>
      </li>
      <li>
        <svg
          className="process-symbol"
          viewBox="0 0 48 48"
          width="48"
          height="48"
          fill="none"
          aria-hidden="true"
        >
          <path d="m24 4 16 8v13c0 11-16 19-16 19S8 36 8 25V12zM16 24l6 6 12-14" />
        </svg>
        <div>
          <small>02 / KIỂM THỬ</small>
          <strong>Kiểm tra trước trận</strong>
          <p>Theo dõi trạng thái hợp lệ và đọc lỗi của từng phiên bản đã nộp.</p>
        </div>
      </li>
      <li>
        <svg
          className="process-symbol"
          viewBox="0 0 48 48"
          width="48"
          height="48"
          fill="none"
          aria-hidden="true"
        >
          <path d="m24 6 18 10-18 10L6 16zM6 24l18 10 18-10M6 32l18 10 18-10" />
        </svg>
        <div>
          <small>03 / ĐẤU THỬ</small>
          <strong>Đưa bot lên bàn cờ</strong>
          <p>Mở Đấu thử ở phiên bản hợp lệ để chọn đối thủ và xem lại diễn biến.</p>
        </div>
      </li>
    </ol>
  );
}

export function LibraryPaths() {
  return (
    <nav className="library-paths" aria-label="Lộ trình tham gia">
      {[
        ['/profile', '01', 'Tài khoản', 'Hoàn thiện hồ sơ'],
        ['/team', '02', 'Đội hình', 'Kết nối đồng đội'],
        ['/bots', '03', 'Chiến thuật', 'Nộp và kiểm thử bot'],
        ['/tournament', '04', 'Thi đấu', 'Theo dõi lịch và kết quả'],
      ].map(([to, n, title, detail]) => (
        <Link to={to!} key={to}>
          <span>{n}</span>
          <div>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
          <b aria-hidden="true">↗</b>
        </Link>
      ))}
    </nav>
  );
}

export function ServiceMark({ kind }: { kind: 'database' | 'cache' | 'worker' }) {
  return (
    <svg
      className="service-symbol"
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'database' && (
        <>
          <ellipse cx="24" cy="10" rx="16" ry="6" />
          <path d="M8 10v26c0 8 32 8 32 0V10M8 23c0 8 32 8 32 0" />
        </>
      )}
      {kind === 'cache' && (
        <>
          <path d="m24 5 18 10-18 10L6 15zM6 24l18 10 18-10M6 33l18 10 18-10" />
        </>
      )}
      {kind === 'worker' && (
        <>
          <rect x="12" y="12" width="24" height="24" rx="4" />
          <path d="M19 4v8m10-8v8m-10 24v8m10-8v8M4 19h8m-8 10h8m24-10h8m-8 10h8m-24-5 4 4 8-9" />
        </>
      )}
    </svg>
  );
}
