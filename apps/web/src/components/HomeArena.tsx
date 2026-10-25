import { LedAccent } from './LedAccent';
import { HomeTechField } from './TechSignals';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { Board, PieceType, RoomSnapshot, Side } from '@arena/contracts';
import { HomeIcon, PieceGlyph } from './HomeGraphics';

type Token = { id: string; square: string; side: Side; type: PieceType };
type PreviewMove = { side: Side; from: string; to: string };
const OPENING: Record<Side, Record<PieceType, string[]>> = {
  blue: { PAPER: ['B2', 'C2', 'B3', 'C3'], SCISSORS: ['B1', 'C1', 'D1'], ROCK: ['A2', 'A3', 'A4'] },
  pink: { PAPER: ['G7', 'H7', 'G8', 'H8'], SCISSORS: ['F9', 'G9', 'H9'], ROCK: ['I6', 'I7', 'I8'] },
};
// Presentation only: never mutate an API snapshot or execute a bot in the browser.
const PREVIEW: PreviewMove[] = [
  { side: 'blue', from: 'C3', to: 'D4' },
  { side: 'pink', from: 'G7', to: 'F6' },
  { side: 'blue', from: 'D4', to: 'E5' },
  { side: 'pink', from: 'F6', to: 'F5' },
  { side: 'blue', from: 'E5', to: 'F4' },
  { side: 'pink', from: 'F5', to: 'E4' },
  { side: 'blue', from: 'F4', to: 'G5' },
  { side: 'pink', from: 'E4', to: 'D3' },
];
const TYPES: PieceType[] = ['ROCK', 'PAPER', 'SCISSORS'];
const LABEL: Record<PieceType, string> = { ROCK: 'Búa', PAPER: 'Bao', SCISSORS: 'Kéo' };
const EXPLAIN = {
  ALL: 'Bấm một loại quân để xem vị trí và quan hệ khắc chế.',
  ROCK: 'Búa khắc Kéo; Bao khắc Búa. Các quân Búa đang được làm nổi.',
  PAPER: 'Bao khắc Búa; Kéo khắc Bao. Các quân Bao đang được làm nổi.',
  SCISSORS: 'Kéo khắc Bao; Búa khắc Kéo. Các quân Kéo đang được làm nổi.',
};
function projection(u: number, v: number): [number, number] {
  return [245 + 465 * u - 195 * v, 25 + 115 * u + 275 * v];
}
function center(square: string) {
  return projection(
    0.09 + (0.82 * (square.charCodeAt(0) - 65 + 0.5)) / 9,
    0.09 + (0.82 * (9 - Number(square.slice(1)) + 0.5)) / 9,
  );
}
function polygon(square: string) {
  const c = square.charCodeAt(0) - 65,
    r = 9 - Number(square.slice(1));
  return [
    [c, r],
    [c + 1, r],
    [c + 1, r + 1],
    [c, r + 1],
  ]
    .map(([x = 0, y = 0]) => projection(0.09 + (0.82 * x) / 9, 0.09 + (0.82 * y) / 9).join(','))
    .join(' ');
}
function previewTokens(count: number): Token[] {
  const tokens: Token[] = [];
  for (const side of ['blue', 'pink'] as const)
    for (const type of TYPES)
      for (const square of OPENING[side][type]) tokens.push({ id: `${side}-${square}`, square, side, type });
  for (const move of PREVIEW.slice(0, count)) {
    const token = tokens.find((p) => p.side === move.side && p.square === move.from);
    if (token) token.square = move.to;
  }
  return tokens;
}
function snapshotTokens(board: Board): Token[] {
  return Object.entries(board).map(([square, piece]) => ({
    id: `${piece.side}-${square}`,
    square,
    ...piece,
  }));
}

export function HomeArena({
  snapshot,
  loading,
  failed,
  runButtonRef,
}: {
  snapshot?: RoomSnapshot;
  loading: boolean;
  failed: boolean;
  runButtonRef: RefObject<HTMLButtonElement>;
}) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [illustration, setIllustration] = useState(false);
  const [filter, setFilter] = useState<PieceType | 'ALL'>('ALL');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphicId = useId().replace(/:/g, '');
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const roomMode = Boolean(snapshot) && !illustration;
  const tokens = useMemo(
    () => (roomMode && snapshot ? snapshotTokens(snapshot.board) : previewTokens(count)),
    [roomMode, snapshot, count],
  );
  const move = roomMode ? snapshot?.history.at(-1) : PREVIEW[count - 1];
  function play() {
    if (busy) return;
    setIllustration(true);
    setBusy(true);
    setCount((value) => (value >= PREVIEW.length ? 1 : value + 1));
    timer.current = setTimeout(() => setBusy(false), 300);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setCount(0);
    setIllustration(true);
  }
  const sorted = [...tokens].sort((a, b) => center(a.square)[1] - center(b.square)[1]);
  return (
    <div
      className={`arena${busy ? ' is-playing' : ''}`}
      id="home-arena"
      aria-label="Minh hoạ bàn cờ Bot Arena"
      data-motion-state={busy ? 'processing' : undefined}
      data-motion-stamp={`${roomMode ? snapshot?.gameId : 'illustration'}:${move?.from ?? ''}:${move?.to ?? ''}:${roomMode ? snapshot?.history.length : count}`}
    >
      <div className="arena-header">
        <span className="arena-title">BOT ARENA / {roomMode ? 'PHÒNG MẪU' : 'TRÌNH DIỄN NƯỚC ĐI'}</span>
        <span className="sample-label">
          {loading && !illustration ? 'ĐANG TẢI PHÒNG…' : roomMode ? 'TRẠNG THÁI ĐÃ LƯU' : 'MINH HOẠ'}
        </span>
      </div>
      <div className="arena-board-frame led-framed">
        <LedAccent frame variant="home" seed="home-board" />
        <div className="arena-board" data-fx-tilt>
          <HomeTechField />
          <svg
            className="board-svg"
            width="760"
            height="480"
            viewBox="0 0 760 480"
            role="img"
            aria-label={`Bàn cờ 9 × 9. Xanh: quân tròn. Hồng: quân thoi.${move ? ` Nước gần nhất: ${move.from} đến ${move.to}.` : ''}`}
          >
            <defs>
              <linearGradient id={`${graphicId}-blue`} x2="0" y2="1">
                <stop stopColor="#6093ce" />
                <stop offset=".18" stopColor="#2a6096" />
                <stop offset=".85" stopColor="#183b60" />
                <stop offset="1" stopColor="#629cce" />
              </linearGradient>
              <linearGradient id={`${graphicId}-pink`} x2="0" y2="1">
                <stop stopColor="#d38aaf" />
                <stop offset=".18" stopColor="#995077" />
                <stop offset=".85" stopColor="#4d293e" />
                <stop offset="1" stopColor="#c47aa5" />
              </linearGradient>
            </defs>
            <image href="/home/arena-base.svg" width="760" height="480" aria-hidden="true" />
            {move && (
              <g aria-hidden="true">
                <polygon className="square-highlight" points={polygon(move.from)} />
                <polygon className="board-marker" points={polygon(move.to)} />
              </g>
            )}
            {sorted.map((token) => {
              const [x, y] = center(token.square);
              const blue = token.side === 'blue';
              return (
                <g
                  key={token.id}
                  className={`board-piece${move?.to === token.square ? ' last' : ''}${filter !== 'ALL' && filter !== token.type ? ' token-muted' : ''}`}
                  style={{ transform: `translate(${x}px,${y}px)` }}
                >
                  <title>{`${token.square}: ${LABEL[token.type]} ${blue ? 'Xanh' : 'Hồng'}`}</title>
                  {blue ? (
                    <>
                      <ellipse cy="4" rx="19" ry="12" fill="#0b2549" />
                      <path d="M-19 0v4a19 12 0 0 0 38 0v-4" fill="#123760" />
                      <ellipse
                        rx="19"
                        ry="12"
                        fill={`url(#${graphicId}-blue)`}
                        stroke="#60a5fa"
                        strokeWidth="1.4"
                      />
                      <ellipse
                        className="piece-ring"
                        rx="15.5"
                        ry="9"
                        fill="none"
                        stroke="#9eccff"
                        strokeOpacity=".3"
                      />
                    </>
                  ) : (
                    <>
                      <path d="M-20 0 0-14 20 0v5L0 19-20 5Z" fill="#51283f" stroke="#8a456a" />
                      <path
                        className="piece-ring"
                        d="M-20 0 0-14 20 0 0 14Z"
                        fill={`url(#${graphicId}-pink)`}
                        stroke="#f472b6"
                        strokeWidth="1.4"
                      />
                    </>
                  )}
                  <g transform="translate(-7.5 -8) scale(.625 .55)" color="#f1f5ff">
                    <PieceGlyph type={token.type} />
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="board-caption">
        <span className="side-name blue">
          <i className="side-shape" />
          QUÂN XANH / TRÒN
        </span>
        <span aria-live="polite">
          {move ? `${move.side === 'blue' ? 'Xanh' : 'Hồng'}: ${move.from} → ${move.to}` : 'Thế cờ xuất phát'}
        </span>
        <span className="side-name pink">
          QUÂN HỒNG / THOI
          <i className="side-shape pink" />
        </span>
      </div>
      <div className="board-legend" role="group" aria-label="Tìm hiểu các loại quân">
        <button type="button" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          Tất cả
        </button>
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={filter === type}
            onClick={() => setFilter(filter === type ? 'ALL' : type)}
          >
            <svg className="od-icon" viewBox="0 0 24 24" aria-hidden="true">
              <PieceGlyph type={type} />
            </svg>
            {LABEL[type]}
          </button>
        ))}
      </div>
      <p className="legend-description" aria-live="polite">
        {EXPLAIN[filter]}
      </p>
      <div className="bot-console">
        <div className="code-panel">
          <p className="console-label">
            <b>tien_cong.py</b>
            <span>TRÍCH BOT MẪU</span>
          </p>
          <pre>
            <span className="key">def</span> <span className="fn">make_move</span>(state):{'\n'}{' '}
            <span className="code-comment"># ... đánh giá nước đi ...</span>
            {'\n'} best = <span className="fn">max</span>(safe, key=score){'\n'}
            <span className={`code-result-line${move ? ' active' : ''}`}>
              {' '}
              <span className="key">return</span> {'{"from": best[0], "to": best[1]}'}
            </span>
          </pre>
        </div>
        <div className="move-panel">
          <p className="console-label">
            <span>{roomMode ? 'VÁN MẪU' : 'MINH HOẠ'}</span>
            <span>
              {roomMode
                ? `${snapshot?.turn?.ply ?? snapshot?.history.length ?? 0} NƯỚC`
                : `${String(count).padStart(2, '0')} / 08`}
            </span>
          </p>
          <div className="move-log" role="status">
            <strong>{move ? `{"from": "${move.from}", "to": "${move.to}"}` : 'Chờ một nước đi…'}</strong>
          </div>
          <div className="replay-controls">
            <button
              ref={runButtonRef}
              type="button"
              className="run-button"
              data-ui-sound
              disabled={busy}
              onClick={play}
            >
              <HomeIcon name="play" />
              {busy
                ? 'Đang trình diễn…'
                : count === PREVIEW.length && !roomMode
                  ? 'Chạy lại lượt mẫu'
                  : 'Chạy 1 lượt mẫu'}
            </button>
            <button
              type="button"
              className="reset-button"
              aria-label="Đặt lại chuỗi minh hoạ"
              onClick={reset}
            >
              <HomeIcon name="reset" />
            </button>
          </div>
        </div>
      </div>
      <p className="replay-disclaimer">
        {roomMode ? (
          <>
            <Link to={`/rooms/${snapshot?.roomId}`}>Mở phòng mẫu →</Link> · Dữ liệu đã lưu từ máy chủ; mã bên
            cạnh là ví dụ.
          </>
        ) : (
          <>Chuỗi nước đi minh hoạ giao diện, không thực thi Python.{failed && ' Chưa tải được phòng mẫu.'}</>
        )}
        {snapshot && illustration && (
          <>
            {' '}
            <button type="button" className="room-source-toggle" onClick={() => setIllustration(false)}>
              Trở về dữ liệu phòng mẫu
            </button>
          </>
        )}
      </p>
    </div>
  );
}
