import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MatchView } from '@arena/contracts';
import { Button, Card, CardHeader, Icon } from '@arena/ui';
import { PIECE_LABEL, SideTag } from '../../components/Board';
import { PieceGlyph } from '../../components/HomeGraphics';
import type { Replay } from './useReplay';

export function ReplayReadout({ r }: { r: Replay }) {
  const move = r.lastMove;
  const blue = Object.values(r.board).filter((piece) => piece.side === 'blue').length;
  const pink = Object.values(r.board).filter((piece) => piece.side === 'pink').length;
  return (
    <div className="replay-readout">
      <div
        className={`replay-move-card${move?.capture ? ' replay-move-card--capture' : ''}`}
        key={`${r.streamKey}:${r.cursor}`}
      >
        {move ? (
          <>
            <svg
              className={`replay-piece-symbol replay-piece-symbol--${move.side}`}
              viewBox="0 0 24 24"
              width="40"
              height="40"
              aria-hidden="true"
            >
              <PieceGlyph type={move.type} />
            </svg>
            <div>
              <small>
                NƯỚC {r.cursor} / <SideTag side={move.side} />
              </small>
              <strong>
                {PIECE_LABEL[move.type]} <span>{move.from}</span>
                <Icon name="arrow" />
                <span>{move.to}</span>
              </strong>
              <p>
                {move.capture ? (
                  <>
                    <b className="replay-capture-label">ĂN QUÂN</b>
                    {PIECE_LABEL[move.type]} loại {PIECE_LABEL[move.capture]}
                  </>
                ) : (
                  'Di chuyển chiến thuật'
                )}
              </p>
            </div>
          </>
        ) : (
          <div>
            <small>VỊ TRÍ XUẤT PHÁT</small>
            <strong>Chiến thuật bắt đầu từ đây.</strong>
            <p>Bấm Phát lại hoặc tiến từng nước để theo dõi.</p>
          </div>
        )}
      </div>
      <dl className="replay-material" aria-label="Số quân trên bàn cờ ở nước đang xem">
        <div>
          <dt>Xanh còn</dt>
          <dd>
            {blue}
            <small> quân</small>
          </dd>
        </div>
        <div>
          <dt>Hồng còn</dt>
          <dd>
            {pink}
            <small> quân</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ReplayHistory({ r }: { r: Replay }) {
  const list = useRef<HTMLOListElement>(null);
  const visited = r.history.slice(0, r.seen);
  useEffect(() => {
    const container = list.current;
    const item = container?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!container || !item) return;
    // Scroll only the log itself, keeping the board and page position stable.
    const top =
      item.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    if (top < container.scrollTop || top + item.offsetHeight > container.scrollTop + container.clientHeight)
      container.scrollTop = Math.max(0, top - container.clientHeight / 2 + item.offsetHeight / 2);
  }, [r.cursor]);
  return (
    <Card className="replay-history-card">
      <CardHeader title="Dòng diễn biến" subtitle={`${r.cursor} / ${r.total} nước · lịch sử đã xem`} />
      {!visited.length ? (
        <p className="replay-log-empty">
          Các nước đi sẽ xuất hiện khi bạn phát lại. Thông tin phía trước đang được giữ kín.
        </p>
      ) : (
        <ol ref={list} className="replay-history-list" aria-label="Lịch sử nước đi" tabIndex={0}>
          {visited.map((move, i) => (
            <li key={`${move.ply}:${i}`}>
              <button
                type="button"
                data-ui-sound
                aria-current={i + 1 === r.cursor ? 'step' : undefined}
                onClick={() => r.seek(i + 1)}
              >
                <span className="replay-log-ply">{i + 1}</span>
                <SideTag side={move.side} />
                <svg className="history-piece" viewBox="0 0 24 24" aria-hidden="true">
                  <PieceGlyph type={move.type} />
                </svg>
                <strong>
                  {move.from} → {move.to}
                </strong>
                {move.capture && <span className="replay-log-capture">Ăn {PIECE_LABEL[move.capture]}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
      {r.seen < r.total && <p className="replay-log-more">Còn {r.total - r.seen} nước chưa xem.</p>}
    </Card>
  );
}

export function RoundNavigator({
  roomId,
  activeGameId,
  match,
}: {
  roomId: string;
  activeGameId: string | null;
  match: MatchView;
}) {
  const [params] = useSearchParams();
  const games = [...match.games].filter((game) => game.finished).sort((a, b) => a.no - b.no);
  const index = games.findIndex((game) => game.gameId === activeGameId);
  const href = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('game', id);
    return `/rooms/${encodeURIComponent(roomId)}?${next}`;
  };
  if (!games.length) return null;
  return (
    <nav className="replay-rounds" aria-label="Chọn hiệp để xem lại">
      <div className="replay-rounds-heading">
        <div>
          <small>TRẬN ĐẤU / CÁC HIỆP ĐÃ LƯU</small>
          <strong>Tiếp nối diễn biến.</strong>
        </div>
        <div className="replay-round-arrows">
          <Button asChild size="sm" variant="ghost" disabled={index <= 0}>
            {index > 0 ? (
              <Link data-ui-sound aria-label="Xem hiệp trước" to={href(games[index - 1]!.gameId)}>
                <Icon name="previous" />
              </Link>
            ) : (
              <button type="button" disabled aria-label="Không có hiệp trước">
                <Icon name="previous" />
              </button>
            )}
          </Button>
          <Button asChild size="sm" variant="ghost">
            {index >= 0 && index < games.length - 1 ? (
              <Link data-ui-sound aria-label="Xem hiệp sau" to={href(games[index + 1]!.gameId)}>
                <Icon name="next" />
              </Link>
            ) : (
              <button type="button" disabled aria-label="Không có hiệp sau">
                <Icon name="next" />
              </button>
            )}
          </Button>
        </div>
      </div>
      <div className="replay-round-list">
        {games.map((game) => (
          <Link
            data-ui-sound
            key={game.gameId}
            to={href(game.gameId)}
            aria-current={activeGameId === game.gameId ? 'page' : undefined}
          >
            <span>HIỆP {game.no}</span>
            <strong>{game.no > match.mainGames ? 'Hiệp phụ' : 'Ván đã lưu'}</strong>
            <Icon name="play" />
          </Link>
        ))}
      </div>
    </nav>
  );
}
