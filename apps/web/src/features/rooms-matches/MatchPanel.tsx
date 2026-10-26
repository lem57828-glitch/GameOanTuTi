// TV4 — bảng trận nhiều hiệp trong phòng: điểm, các hiệp, trạng thái chọn kín, đồng hồ đếm ngược (theo giờ máy chủ),
// form chọn bot + quân thứ 10 cho đội trưởng, thao tác BTC. Khán giả chỉ thấy "đã chọn / sẵn sàng".
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader, Select, useToast, type BadgeTone } from '@arena/ui';
import type { MatchView, MyMatchSelection, PieceType, RoomSnapshot } from '@arena/contracts';
import { PIECE_GLYPH, PIECE_LABEL, SideTag } from '../../components/Board';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const STATUS: Record<MatchView['status'], { label: string; tone: BadgeTone }> = {
  open: { label: 'Ván demo', tone: 'neutral' },
  selecting: { label: 'Đang chọn kín', tone: 'warning' },
  running: { label: 'Đang thi hiệp', tone: 'accent' },
  paused: { label: 'Tạm dừng', tone: 'danger' },
  completed: { label: 'Trận đã xong', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'neutral' },
};
const KIND: Record<MatchView['kind'], string> = {
  demo: 'Ván demo',
  swiss: 'Sơ loại · 2 ván đổi màu',
  tiebreak: 'Tranh suất · 2 ván (+2 ván phụ)',
  knockout: 'Loại trực tiếp · 5 hiệp (+2 hiệp phụ)',
  semifinal: 'Bán kết · BO5 (thắng 3 ván) · luật vật cản cố định',
  final: 'Chung kết · BO7 (thắng 4 ván) · vật cản động, ô đặc biệt',
};
const PIECES: PieceType[] = ['ROCK', 'PAPER', 'SCISSORS'];

/** Đếm ngược theo giờ máy chủ: bù lệch giữa đồng hồ trình duyệt và serverTime của snapshot. */
function useCountdown(deadline: string | null, serverTime: string) {
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(() => Date.parse(serverTime) - Date.now());
  useEffect(() => {
    setSkew(Date.parse(serverTime) - Date.now());
  }, [serverTime]);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Date.parse(deadline) - (now + skew));
  const s = Math.ceil(left / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MatchPanel({
  s,
  onChanged,
  hideResults = false,
}: {
  s: RoomSnapshot;
  onChanged: () => void;
  hideResults?: boolean;
}) {
  const m = s.match!;
  const { user } = useSession();
  const staff = user?.role === 'admin';
  const countdown = useCountdown(m.status === 'selecting' ? m.deadline : null, s.serverTime);
  const name = (side: 'a' | 'b') => (side === 'a' ? s.teams.a.name : s.teams.b.name);
  const teamId = (side: 'a' | 'b') => (side === 'a' ? s.teams.a.id : s.teams.b.id);
  const adjudicated = m.status === 'cancelled' && m.pauseReason?.startsWith('BTC phân xử:');
  const status = adjudicated ? { label: 'BTC đã phân xử', tone: 'warning' as const } : STATUS[m.status];
  // Sơ loại: mỗi đội dùng bot đã chốt cho cả mức, không có bước chọn kín theo hiệp.
  // Bán kết/chung kết: bot là bài BTC thu qua USB (kèm quân thứ 10 đăng ký khi nộp), cũng không chọn kín.
  const fixed = m.kind !== 'knockout';
  const offline = m.kind === 'semifinal' || m.kind === 'final';
  return (
    <Card className="border-accent/40">
      <CardHeader
        title={`Trận · ${KIND[m.kind]}`}
        subtitle={
          offline
            ? 'Bot do BTC thu qua USB và đã khóa; các ván chạy liên tục, ai đủ số ván thắng trước thắng loạt'
            : fixed
              ? 'Sơ loại: mỗi đội dùng bot đã chốt cho cả mức, các hiệp chạy liên tục'
              : m.status === 'selecting'
                ? `Hiệp ${m.currentNo}: chọn kín bot${m.chooseExtra ? ' và quân thứ 10' : ''}`
                : undefined
        }
        action={
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        }
      />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md bg-bg-deep/50 p-3 text-center">
        <p className="truncate font-semibold">{name('a')}</p>
        <p
          className="font-mono text-2xl font-black"
          aria-label={hideResults ? 'Tỉ số đang ẩn khi xem lại' : `Tỉ số ${m.scoreA} – ${m.scoreB}`}
        >
          {hideResults ? '— : —' : `${m.scoreA} – ${m.scoreB}`}
        </p>
        <p className="truncate font-semibold">{name('b')}</p>
      </div>
      {!hideResults && m.status === 'completed' && (
        <p className="mt-2 text-center text-sm font-semibold text-success">
          {m.winnerTeamId
            ? `${m.winnerTeamId === teamId('a') ? name('a') : name('b')} thắng trận`
            : 'Bằng điểm — BTC phân định theo thể lệ'}
          <span className="block text-xs font-normal text-ink-muted">
            {m.pauseReason
              ? 'Kết quả trận này không được tính (xem lý do bên dưới).'
              : 'Kết quả đã chuyển cho BTC, chờ xác nhận/chốt vòng.'}
          </span>
        </p>
      )}
      {m.pauseReason && !hideResults && (
        <Alert
          tone={adjudicated ? 'warning' : 'error'}
          title={adjudicated ? 'Quyết định của BTC' : 'Trận cần BTC xử lý'}
          className="mt-3"
        >
          {m.pauseReason}
        </Alert>
      )}

      {m.selection && !fixed && (
        <div className="mt-4 grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">Hạn chọn (giờ máy chủ)</span>
            <span className="font-mono text-lg font-bold text-warning" aria-live="polite">
              {countdown ?? '—'}
            </span>
          </div>
          {(['a', 'b'] as const).map((side) => {
            const st = m.selection![side];
            return (
              <div
                key={side}
                className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm"
              >
                <span className="truncate">{name(side)}</span>
                <Badge tone={st.ready ? 'success' : st.chosen ? 'blue' : 'neutral'}>
                  {st.ready ? 'Sẵn sàng' : st.chosen ? 'Đã chọn, chưa sẵn sàng' : 'Chưa chọn'}
                </Badge>
              </div>
            );
          })}
          <p className="text-xs text-ink-muted">
            Lựa chọn giữ kín, công bố đồng thời khi cả hai sẵn sàng hoặc hết giờ. Đội chưa chọn khi hết giờ
            dùng lựa chọn hiệp trước (đề xuất, chờ BTC chốt).
          </p>
        </div>
      )}

      {user && !fixed && <CaptainForm roomId={s.roomId} m={m} onChanged={onChanged} />}
      {staff && <StaffActions m={m} onChanged={onChanged} />}

      {m.games.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2" aria-label="Các hiệp của trận">
          {m.games.map((g, i) => {
            const blueIsA = g.blueTeamId === teamId('a');
            const result =
              hideResults && g.finished
                ? 'Ván đã lưu'
                : !g.finished
                  ? g.status === 'failed'
                    ? 'Lỗi khi chạy'
                    : 'Đang thi'
                  : g.outcome === null
                    ? 'Hòa'
                    : `${g.outcome === 'a' ? name('a') : name('b')} thắng`;
            return (
              <li key={g.gameId} className="rounded-md border border-line p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Ván {i + 1}
                    {i + 1 > m.mainGames ? ' (phụ)' : ''}
                  </span>
                  <Badge tone={g.status === 'failed' ? 'danger' : g.finished ? 'success' : 'accent'}>
                    {result}
                  </Badge>
                  {g.finished && (
                    <Link
                      data-ui-sound
                      className="font-semibold text-accent"
                      to={`/rooms/${s.roomId}?game=${g.gameId}`}
                    >
                      Xem lại ván {i + 1} →
                    </Link>
                  )}
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {(['a', 'b'] as const).map((side) => {
                    const isBlue = side === 'a' ? blueIsA : !blueIsA;
                    const c = g.choices[side];
                    return (
                      <p key={side} className="flex flex-wrap items-center gap-1.5">
                        <SideTag side={isBlue ? 'blue' : 'pink'} className="text-xs" />
                        <span className="truncate">{name(side)}:</span>
                        <span className="text-ink-muted">{c.botLabel}</span>
                        {(m.chooseExtra || offline) && (
                          <span title={`Quân thứ 10: ${PIECE_LABEL[c.extraType]}`}>
                            {PIECE_GLYPH[c.extraType]} <span className="sr-only">Quân thứ 10: </span>
                            {PIECE_LABEL[c.extraType]}
                          </span>
                        )}
                      </p>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function CaptainForm({ roomId, m, onChanged }: { roomId: string; m: MatchView; onChanged: () => void }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const mine = useQuery({
    queryKey: ['my-selection', roomId, m.currentNo, m.status, user?.id],
    queryFn: () => api<MyMatchSelection | null>(`/rooms/${roomId}/my-selection`),
  });
  const [bot, setBot] = useState<string>('');
  const [extra, setExtra] = useState<PieceType>('PAPER');
  const d = mine.data;
  useEffect(() => {
    if (d?.current) {
      setBot(d.current.botVersionId);
      setExtra(d.current.extraType);
    } else if (d?.allowedBots[0]) setBot((b) => b || d.allowedBots[0]!.id);
  }, [d]);
  const save = useMutation({
    mutationFn: (ready: boolean) =>
      api(`/rooms/${roomId}/choices`, {
        method: 'POST',
        json: { botVersionId: bot, extraType: extra, ready },
      }),
    onSuccess: (_r, ready) => {
      toast({
        title: ready ? 'Đã khóa lựa chọn của đội và báo sẵn sàng' : 'Đã lưu lựa chọn (chưa sẵn sàng)',
        tone: 'success',
      });
      void qc.invalidateQueries({ queryKey: ['my-selection', roomId] });
      onChanged();
    },
    onError: (e) =>
      toast({ title: 'Không lưu được lựa chọn', description: (e as Error).message, tone: 'error' }),
  });
  if (!d) return null;
  if (!d.canChoose) {
    return d.isCaptain && m.status === 'selecting' && d.reason ? (
      <Alert tone="warning" title="Chưa chọn được" className="mt-4">
        {d.reason}
      </Alert>
    ) : null;
  }
  return (
    <section
      aria-label="Lựa chọn của đội bạn"
      className="mt-4 flex flex-col gap-3 rounded-md border border-accent/50 bg-accent/5 p-3"
    >
      <p className="text-sm font-semibold">Đội bạn — hiệp {d.gameNo} (chỉ đội bạn thấy phần này)</p>
      <Select
        label="Bot cho hiệp này"
        value={bot || undefined}
        onValueChange={setBot}
        options={d.allowedBots.map((b) => ({ value: b.id, label: `v${b.version} · ${b.label}` }))}
      />
      {m.chooseExtra && (
        <Select
          label="Quân thứ 10"
          value={extra}
          onValueChange={(v) => setExtra(v as PieceType)}
          options={PIECES.map((p) => ({ value: p, label: `${PIECE_GLYPH[p]} ${PIECE_LABEL[p]}` }))}
        />
      )}
      {d.current && (
        <p className="text-xs text-ink-muted">
          Đã lưu: {d.allowedBots.find((b) => b.id === d.current!.botVersionId)?.label ?? 'bot'}
          {m.chooseExtra ? ` · ${PIECE_LABEL[d.current.extraType]}` : ''} ·{' '}
          {d.current.ready ? 'đã sẵn sàng' : 'chưa sẵn sàng'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={save.isPending && save.variables === true}
          disabled={!bot || save.isPending}
          onClick={() => save.mutate(true)}
        >
          Xác nhận và sẵn sàng
        </Button>
        <Button variant="secondary" disabled={!bot || save.isPending} onClick={() => save.mutate(false)}>
          Lưu, chưa sẵn sàng
        </Button>
      </div>
    </section>
  );
}

function StaffActions({ m, onChanged }: { m: MatchView; onChanged: () => void }) {
  const { toast } = useToast();
  const act = useMutation({
    mutationFn: ({ path }: { path: string; label: string }) =>
      api(path, { method: 'POST', json: { reason: 'Điều hành phòng đấu' } }),
    onSuccess: (_r, v) => {
      toast({ title: v.label, tone: 'success' });
      onChanged();
    },
    onError: (e) =>
      toast({ title: 'Không thực hiện được', description: (e as Error).message, tone: 'error' }),
  });
  if (m.status !== 'selecting' && m.status !== 'paused') return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
      {m.status === 'selecting' && (
        <Button
          size="sm"
          variant="secondary"
          loading={act.isPending}
          onClick={() =>
            act.mutate({ path: `/admin/matches/${m.matchId}/force-lock`, label: 'Đã khóa lựa chọn hiệp này' })
          }
        >
          Khóa lựa chọn ngay
        </Button>
      )}
      {m.status === 'paused' && m.games.some((g) => g.status === 'failed') && (
        <Button
          size="sm"
          variant="secondary"
          loading={act.isPending}
          onClick={() =>
            act.mutate({ path: `/admin/matches/${m.matchId}/rerun-game`, label: 'Đã cho chạy lại hiệp lỗi' })
          }
        >
          Chạy lại hiệp lỗi
        </Button>
      )}
      <p className="w-full text-xs text-ink-muted">BTC: thao tác được ghi nhật ký.</p>
    </div>
  );
}
