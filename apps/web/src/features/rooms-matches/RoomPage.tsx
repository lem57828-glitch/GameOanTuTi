import { useState } from 'react';
import { ReplayHistory, ReplayReadout, RoundNavigator } from './ReplayDetails';
import { FeatureHero, IdentityMark } from '../../components/WorkspaceVisuals';
// Phòng đấu (chỉ đọc cho người xem). TV4 phát triển tiếp: chọn bot/quân kín, tung xu chính thức, replay chính thức.
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Spinner, cn } from '@arena/ui';
import type { RoomSnapshot, Side } from '@arena/contracts';
import { Board, SideTag } from '../../components/Board';
import { CoinToss } from '../../components/CoinToss';
import { usePublicHealth } from '../../lib/health';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { END_REASON, JOB_STATUS, ROOM_STATUS } from './labels';
import { MatchPanel } from './MatchPanel';
import { ReplayBar } from './ReplayBar';
import { useReplay, type Replay } from './useReplay';
import { useRoomStream, type ConnectionState } from './useRoomStream';

const CONN: Record<ConnectionState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  connecting: { label: 'Đang kết nối', tone: 'neutral' },
  live: { label: 'Trực tiếp', tone: 'success' },
  reconnecting: { label: 'Đang kết nối lại', tone: 'warning' },
  offline: { label: 'Mất mạng', tone: 'danger' },
};

export function RoomPage() {
  const { roomId = '' } = useParams();
  const [focused, setFocused] = useState(false);
  const { snapshot: current, connection, error, resync, coinFor, dismissCoin } = useRoomStream(roomId);
  const [params] = useSearchParams();
  const gameId = params.get('game');
  const archived = useQuery({
    queryKey: ['game-replay', roomId, gameId],
    queryFn: () =>
      api<RoomSnapshot>(`/rooms/${encodeURIComponent(roomId)}/games/${encodeURIComponent(gameId!)}`),
    enabled: !!gameId,
  });
  const snapshot = gameId ? (archived.data ?? null) : current;
  // Phòng hiện tại theo sát nước mới; ván được chọn để replay bắt đầu từ nước 0.
  const replay = useReplay(snapshot, !gameId);
  const health = usePublicHealth();
  const { user } = useSession();

  if (gameId && archived.error)
    return (
      <Alert
        tone="error"
        title="Không tải được ván xem lại"
        action={<Link to={`/rooms/${roomId}`}>Về trận hiện tại</Link>}
      >
        {archived.error.message}
      </Alert>
    );

  if (!snapshot) {
    if (error?.code === 'NOT_FOUND') {
      return (
        <EmptyState
          title="Không có phòng này"
          description="Phòng có thể đã bị xóa hoặc đường dẫn bị sai."
          action={
            <Button asChild variant="secondary">
              <Link to="/rooms">Xem danh sách phòng</Link>
            </Button>
          }
        />
      );
    }
    if (error) {
      return (
        <Alert
          tone="error"
          title="Không tải được phòng đấu"
          action={
            <Button size="sm" variant="secondary" onClick={() => void resync()}>
              Thử lại
            </Button>
          }
        >
          {error.message}
        </Alert>
      );
    }
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink-muted">
        <Spinner size="lg" label="Đang tải phòng đấu" />
      </div>
    );
  }

  const s = snapshot;
  const teamName = (id: string | null) =>
    id === s.teams.a.id ? s.teams.a.name : id === s.teams.b.id ? s.teams.b.name : '—';
  const sideOf = (teamId: string): Side | null =>
    s.coinResult ? (s.coinResult.blueTeamId === teamId ? 'blue' : 'pink') : null;
  // Trong trận nhiều hiệp, trạng thái phòng giữa các hiệp là bước chọn kín, không phải chờ worker.
  const status =
    s.match?.status === 'selecting'
      ? { label: 'Chờ hai đội chọn', tone: 'warning' as const }
      : s.match?.status === 'cancelled'
        ? {
            label: s.match.pauseReason?.startsWith('BTC phân xử:') ? 'BTC đã phân xử' : 'Trận đã hủy',
            tone: 'warning' as const,
          }
        : s.match?.status === 'paused'
          ? { label: 'Tạm dừng', tone: 'danger' as const }
          : ROOM_STATUS[s.status];
  const workerDown = health.data && !health.data.workerAlive;
  const conn = gameId ? { label: 'Xem lại', tone: 'neutral' as const } : CONN[connection];

  return (
    <div
      className={`room-workspace flex flex-col gap-6${focused ? ' is-replay-focus' : ''}`}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          focused &&
          !(event.target instanceof Element && event.target.closest('[role="dialog"]'))
        ) {
          setFocused(false);
        }
      }}
      data-motion-state={!gameId && connection === 'live' && s.status === 'running' ? 'live' : 'idle'}
    >
      {!gameId && coinFor === s.gameId && s.coinResult && (
        <CoinToss coin={s.coinResult} teamName={(id) => teamName(id)} onDone={dismissCoin} />
      )}

      <FeatureHero variant="rooms" slogan="Hai chiến thuật gặp nhau trên một bàn cờ." compact>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Phòng đấu</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">{s.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {s.isDemo && (
              <Badge tone="warning">Dữ liệu mô phỏng{s.rulesetId ? ` — ruleset ${s.rulesetId}` : ''}</Badge>
            )}
            <span
              className="motion-status"
              aria-live="polite"
              data-motion-stamp={connection}
              data-motion-state={!gameId && connection === 'live' && s.status === 'running' ? 'live' : 'idle'}
            >
              <Badge tone={conn.tone} dot>
                {conn.label}
              </Badge>
            </span>
          </div>
        </div>
        {user?.role === 'admin' && (
          <Button asChild variant="secondary" size="sm">
            <Link to="/admin">{health.data?.demoMode ? 'Tạo ván mô phỏng' : 'Điều hành giải'}</Link>
          </Button>
        )}
      </FeatureHero>

      {connection === 'reconnecting' || connection === 'offline' ? (
        <Alert tone="warning" title="Đang mất kết nối trực tiếp">
          Bàn cờ dưới đây là trạng thái đã nhận gần nhất. Khi kết nối lại, trang sẽ tự tải snapshot mới nhất
          từ máy chủ.
        </Alert>
      ) : null}
      {error && <Alert tone="error" title={error.message} />}
      {workerDown && (s.status === 'waiting' || s.status === 'running') && (
        <Alert tone="warning" title="Worker chưa chạy">
          Ván đã được ghi và đang nằm trong hàng đợi. Nó sẽ tự chạy khi worker khởi động (
          <code className="font-mono">pnpm dev:worker</code>).
        </Alert>
      )}

      {gameId && (
        <Alert
          title="Đang xem lại một ván đã lưu"
          action={<Link to={`/rooms/${roomId}`}>Về trận hiện tại</Link>}
        >
          Việc xem lại không làm thay đổi trận đang thi.
        </Alert>
      )}
      {current?.match && (
        <div className="replay-match-panel">
          <MatchPanel s={current} hideResults={!!gameId || !replay.atEnd} onChanged={() => void resync()} />
        </div>
      )}
      {(current?.match ?? s.match) && (
        <RoundNavigator roomId={roomId} activeGameId={s.gameId} match={(current?.match ?? s.match)!} />
      )}

      <div className="replay-layout grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="battle-board-card p-3 sm:p-5">
          <div className="battle-board-heading">
            {[s.teams.a, s.teams.b].map((t, i) => (
              <div className="battle-contender" key={t.id}>
                <IdentityMark seed={t.id} label={t.name} side={sideOf(t.id) ?? undefined} />
                <div>
                  <small>ĐỘI {i === 0 ? 'A' : 'B'}</small>
                  <strong>{t.name}</strong>
                  {sideOf(t.id) && <SideTag side={sideOf(t.id)!} />}
                </div>
              </div>
            ))}
          </div>
          <Board
            board={replay.board}
            lastMove={replay.lastMove}
            motion={{
              streamKey: replay.streamKey,
              durationMs: replay.travelMs,
              animate: replay.intent === 'forward',
            }}
            label={`Bàn cờ ${s.title}`}
            size="lg"
          />
          <ReplayReadout r={replay} />
          <ReplayBar r={replay} focused={focused} onFocusToggle={() => setFocused((value) => !value)} />
          <TurnLine s={s} teamName={teamName} replay={replay} />
        </Card>

        <div className="replay-sidebar flex min-w-0 flex-col gap-4">
          <Card className="room-team-summary">
            <CardHeader
              title="Hai đội"
              subtitle={
                s.coinResult
                  ? `Tung xu: ${teamName(s.coinResult.winnerTeamId)} thắng, cầm Xanh đi trước.`
                  : 'Chưa tung xu.'
              }
            />
            <ul className="grid gap-2">
              {[s.teams.a, s.teams.b].map((t) => {
                const side = sideOf(t.id);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg-deep/40 px-3 py-2.5"
                  >
                    <span className="battle-team-name">
                      <IdentityMark seed={t.id} label={t.name} side={side ?? undefined} />
                      <strong>{t.name}</strong>
                    </span>
                    {side ? (
                      <SideTag side={side} />
                    ) : (
                      <span className="text-xs text-ink-muted">chưa xếp bên</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Không lộ kết quả khi người xem đang xem lại giữa chừng. */}
          {replay.atEnd ? (
            <ResultCard s={s} teamName={teamName} />
          ) : (
            s.result && <p className="text-xs text-ink-muted">Kết quả ván sẽ hiện khi xem tới nước cuối.</p>
          )}

          <ReplayHistory r={replay} />

          {user?.role === 'admin' && s.job && (
            <p className="text-xs text-ink-muted">
              Job <span className="font-mono">{s.job.id.slice(0, 10)}…</span> ·{' '}
              {JOB_STATUS[s.job.status]?.label ?? s.job.status} · lần chạy {s.job.attempts} · stream{' '}
              <span className="font-mono">{s.streamId}</span> · seq {s.seq}
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Người xem chỉ đọc. Tải lại trang hay mất mạng không tạo ván mới và không tung lại xu.
          </p>
        </div>
      </div>
    </div>
  );
}

function TurnLine({
  s,
  teamName,
  replay,
}: {
  s: RoomSnapshot;
  teamName: (id: string | null) => string;
  replay: Replay;
}) {
  let text = 'Phòng chưa có ván nào.';
  if (s.status === 'waiting') text = 'Ván đã tạo, chờ worker bắt đầu.';
  if (s.turn && s.status === 'running') {
    const teamId = s.coinResult
      ? s.turn.side === 'blue'
        ? s.coinResult.blueTeamId
        : s.coinResult.pinkTeamId
      : null;
    text = `Nước ${s.turn.ply + 1} · ${teamName(teamId)} (${s.turn.side === 'blue' ? 'Xanh' : 'Hồng'}) đang đi`;
  }
  if (s.status === 'finished') text = `Ván kết thúc sau ${s.result?.plies ?? s.history.length} nước.`;
  if (s.status === 'failed') text = 'Ván không chạy được. BTC xem chi tiết ở trang quản trị.';
  // Đang xem lại giữa chừng: không báo trước diễn biến/kết quả phía sau.
  if (replay.available && !replay.atEnd)
    text = `Đang xem lại: nước ${replay.cursor}/${replay.total}${replay.live ? ' · ván vẫn đang diễn ra' : ''}`;
  return (
    <p
      aria-live="polite"
      className={cn(
        'mt-3 text-center text-sm font-medium',
        s.status === 'running' ? 'text-ink' : 'text-ink-muted',
      )}
    >
      {text}
    </p>
  );
}

function ResultCard({ s, teamName }: { s: RoomSnapshot; teamName: (id: string | null) => string }) {
  if (!s.result) return null;
  const r = s.result;
  return (
    <Card className="border-accent/50">
      <CardHeader title={s.match ? 'Kết quả ván vừa xong' : 'Kết quả'} subtitle={END_REASON[r.reason]} />
      <p className="text-xl font-extrabold text-ink">
        {r.winner ? `${teamName(r.winnerTeamId)} thắng` : 'Hòa'}
      </p>
      {r.winner && (
        <p className="mt-1 text-sm text-ink-muted">
          Cầm quân <SideTag side={r.winner} className="text-sm" />
        </p>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-bg-deep/50 p-2">
          <dt className="text-xs text-ink-muted">Số nước</dt>
          <dd className="font-mono text-lg font-bold text-ink">{r.plies}</dd>
        </div>
        <div className="rounded-md bg-bg-deep/50 p-2">
          <dt className="text-xs text-ink-muted">Quân Xanh</dt>
          <dd className="font-mono text-lg font-bold text-team-blue">{r.piecesLeft.blue}</dd>
        </div>
        <div className="rounded-md bg-bg-deep/50 p-2">
          <dt className="text-xs text-ink-muted">Quân Hồng</dt>
          <dd className="font-mono text-lg font-bold text-team-pink">{r.piecesLeft.pink}</dd>
        </div>
      </dl>
    </Card>
  );
}
