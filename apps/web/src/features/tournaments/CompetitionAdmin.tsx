// Điều hành thi đấu (BTC/trọng tài): kế hoạch mức → khóa mức → ghép vòng → nhập/mô phỏng kết quả → xác nhận →
// chốt mức/tranh suất → cây 32 → chốt từng vòng → Top 4. Mọi thao tác gửi kèm lý do và được ghi audit.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Select,
  Spinner,
  Table,
  useToast,
} from '@arena/ui';
import type { AppealView, CompetitionView, LevelView, PairingView, TournamentView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { usePublicHealth } from '../../lib/health';
import {
  BracketPanel,
  KIND_LABEL,
  LEVEL_STATUS,
  PairingLine,
  StandingsPanel,
  pairingLabel,
} from './competition-ui';
import { APPEAL_STATUS, TextArea } from './MyPairings';

type Outcome = 'a' | 'b' | null;
type RoomsSummary = {
  pending: number;
  notOpened: number;
  selecting: number;
  running: number;
  paused: number;
  completed: number;
};

export function CompetitionAdmin() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const health = usePublicHealth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('Điều hành theo lịch thi');
  const [targets, setTargets] = useState('');
  const [rounds, setRounds] = useState('3');
  const [scope, setScope] = useState<'level' | 'qualifier'>('level');
  const [demoCount, setDemoCount] = useState('38');
  const [entry, setEntry] = useState<PairingView | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [editLevel, setEditLevel] = useState<LevelView | null>(null);

  const list = useQuery({
    queryKey: ['admin-tournaments', user?.id],
    queryFn: () => api<TournamentView[]>('/admin/tournaments'),
  });
  const published = (list.data ?? []).filter((t) => t.status !== 'draft');
  const tid = selected || published[0]?.id || '';
  const view = useQuery({
    queryKey: ['competition', tid],
    queryFn: () => api<CompetitionView>(`/tournaments/${tid}/competition`),
    enabled: !!tid,
    refetchInterval: 5000,
  });
  const c = view.data;
  // Lập (lại) kế hoạch chỉ khi chưa mức nào bắt đầu — máy chủ cũng kiểm tra điều này.
  const canPlan = isAdmin && !!c && c.levels.every((l) => l.status === 'planned');
  const currentPlan = c?.levels.map((l) => `${l.teamTarget} (${l.rounds} vòng)`).join(' → ') ?? '';
  // Trạng thái thật của các phòng (TV4): chỉ phòng "đang chọn" mới bị nút khóa ảnh hưởng.
  const rooms = useQuery({
    queryKey: ['competition', tid, 'rooms'],
    queryFn: () => api<RoomsSummary>(`/admin/tournaments/${tid}/matches/summary`),
    enabled: !!tid && c?.next.action === 'results',
    refetchInterval: 3000,
  });

  const act = useMutation({
    mutationFn: ({ path, json }: { path: string; json?: unknown; label: string }) =>
      api<unknown>(path, { method: 'POST', json: json ?? { reason } }),
    onSuccess: (_d, v) => {
      toast({ title: v.label, tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['competition'] });
      void qc.invalidateQueries({ queryKey: ['standings'] });
      void qc.invalidateQueries({ queryKey: ['admin-appeals'] });
    },
    onError: (e, v) =>
      toast({ title: `Không thực hiện được: ${v.label}`, description: (e as Error).message, tone: 'error' }),
  });
  const run = (path: string, label: string, json?: unknown) =>
    act.mutate({ path: `/admin/tournaments/${tid}${path}`, label, json });

  if (list.isLoading) return <Spinner label="Đang tải giải" />;
  if (!published.length) {
    return (
      <EmptyState
        icon="⚑"
        title="Chưa có giải đã công bố"
        description="Công bố một giải ở tab Cấu hình giải trước khi điều hành thi đấu."
      />
    );
  }

  const primary = () => {
    if (!c) return null;
    const a = c.next.action;
    const busy = act.isPending;
    if (a === 'plan')
      return <p className="text-sm text-ink-muted">Điền kế hoạch các mức ở khung bên dưới.</p>;
    if (a === 'lock-level')
      return (
        <Button
          loading={busy}
          disabled={!isAdmin}
          onClick={() => run('/qualifier/lock', 'Đã khóa bot và mở mức')}
        >
          {c.next.label}
        </Button>
      );
    if (a === 'start-round')
      return (
        <Button
          loading={busy}
          disabled={!isAdmin}
          onClick={() => run('/qualifier/rounds', 'Đã ghép vòng mới')}
        >
          {c.next.label}
        </Button>
      );
    if (a === 'confirm-round') {
      const lvl = c.levels.find((l) => l.status === 'running');
      const round = lvl?.roundsPlayed ?? 0;
      return (
        <Button
          loading={busy}
          disabled={!!c.next.blockedReason}
          onClick={() => run(`/qualifier/rounds/${round}/confirm`, `Đã xác nhận vòng ${round}`)}
        >
          {c.next.label}
        </Button>
      );
    }
    if (a === 'finish-level')
      return (
        <Button loading={busy} disabled={!isAdmin} onClick={() => run('/qualifier/finish', 'Đã chốt mức')}>
          {c.next.label}
        </Button>
      );
    if (a.startsWith('start-phase:'))
      return (
        <Button
          loading={busy}
          disabled={!isAdmin}
          onClick={() => run(`/knockout/${a.split(':')[1]}/start`, 'Đã bắt đầu vòng')}
        >
          {c.next.label}
        </Button>
      );
    if (a.startsWith('confirm-phase:'))
      return (
        <Button
          loading={busy}
          disabled={!!c.next.blockedReason}
          onClick={() => run(`/knockout/${a.split(':')[1]}/confirm`, 'Đã chốt vòng')}
        >
          {c.next.label}
        </Button>
      );
    if (a === 'results') {
      const r = rooms.data;
      const unopened = r?.notOpened ?? c.pending.filter((p) => !p.roomId).length;
      return (
        <>
          {r && r.pending - r.notOpened > 0 && (
            <p className="w-full text-sm text-ink-muted">
              {r.pending - r.notOpened} phòng: {r.selecting} đang chọn bot · {r.running} đang thi
              {r.paused ? ` · ${r.paused} tạm dừng (vào phòng để xử lý)` : ''}
              {r.completed ? ` · ${r.completed} đã xong, đang gửi kết quả` : ''}
            </p>
          )}
          {isAdmin && unopened > 0 && (
            <Button loading={busy} onClick={() => run('/matches/open', 'Đã mở phòng thi đấu')}>
              Mở phòng thi đấu cho {unopened} cặp
            </Button>
          )}
          {(r?.selecting ?? 0) > 0 && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => run('/matches/force-lock', 'Đã khóa lựa chọn các phòng đang chọn')}
            >
              Khóa lựa chọn ngay ({r!.selecting} phòng đang chọn)
            </Button>
          )}
          {health.data?.demoMode && isAdmin && unopened > 0 && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => run('/demo/simulate', 'Đã mô phỏng các cặp chưa mở phòng')}
            >
              Mô phỏng các cặp chưa mở phòng
            </Button>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <section aria-label="Điều hành thi đấu" className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Điều hành thi đấu"
          subtitle="Sơ loại chia mức (Swiss) → tranh suất → cây 32 → Top 4"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Giải đã công bố"
            value={tid}
            onValueChange={setSelected}
            options={published.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Input
            label="Lý do thao tác (ghi vào nhật ký)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Tối thiểu 3 ký tự; áp dụng cho các nút bên dưới."
          />
        </div>
        {!isAdmin && (
          <p className="mt-3 text-xs text-ink-muted">
            Trọng tài: được xác nhận vòng, chốt vòng loại trực tiếp, nhập kết quả và xử lý khiếu nại; các thao
            tác khác dành cho BTC.
          </p>
        )}
      </Card>

      {view.isLoading && <Spinner label="Đang tải trạng thái thi đấu" />}
      {view.error && (
        <Alert tone="error" title="Không tải được trạng thái thi đấu">
          {(view.error as Error).message}
        </Alert>
      )}
      {c && (
        <>
          <Card className="border-accent/40">
            <CardHeader
              title="Bước tiếp theo"
              subtitle={`Máy chủ: ${new Date(c.serverTime).toLocaleString('vi-VN')} · ${c.eligibleTeams} đội đủ điều kiện`}
            />
            <p className="mb-3 text-lg font-bold">{c.next.label}</p>
            {c.next.blockedReason && <p className="mb-3 text-sm text-warning">{c.next.blockedReason}</p>}
            <div className="flex flex-wrap gap-2">{primary()}</div>
          </Card>

          {canPlan && (
            <Card>
              <CardHeader
                title={c.levels.length ? 'Lập lại kế hoạch các mức sơ loại' : 'Kế hoạch các mức sơ loại'}
                subtitle={
                  c.levels.length
                    ? `Chưa mức nào bắt đầu nên còn đổi được. Hiện tại: ${currentPlan}. Gợi ý theo ${c.eligibleTeams} đội: ${c.suggestedTargets.join(' → ')}`
                    : `Gợi ý theo ${c.eligibleTeams} đội: ${c.suggestedTargets.join(' → ')}`
                }
              />
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  label="Số đội đi tiếp mỗi mức (giảm dần, mức cuối 32)"
                  placeholder={(c.levels.length
                    ? c.levels.map((l) => l.teamTarget)
                    : c.suggestedTargets
                  ).join(', ')}
                  hint="Để trống: dùng giá trị gợi ý trong ô (kế hoạch hiện tại hoặc gợi ý theo số đội)."
                  value={targets}
                  onChange={(e) => setTargets(e.target.value)}
                />
                <Input
                  label="Số vòng Swiss mỗi mức (đề xuất 3–5)"
                  value={rounds}
                  onChange={(e) => setRounds(e.target.value)}
                  hint="Một số cho mọi mức, hoặc danh sách cách nhau dấu phẩy."
                />
                <Select
                  label="Tránh tái đấu"
                  value={scope}
                  onValueChange={(v) => setScope(v as 'level' | 'qualifier')}
                  options={[
                    { value: 'level', label: 'Trong từng mức' },
                    { value: 'qualifier', label: 'Toàn bộ sơ loại' },
                  ]}
                />
              </div>
              <div className="mt-4">
                <Button
                  loading={act.isPending}
                  onClick={() => {
                    const fallback = c.levels.length ? c.levels.map((l) => l.teamTarget) : c.suggestedTargets;
                    const t = (targets.trim() ? targets : fallback.join(','))
                      .split(/[,\s→]+/)
                      .filter(Boolean)
                      .map(Number);
                    const r = rounds
                      .split(/[,\s]+/)
                      .filter(Boolean)
                      .map(Number);
                    run('/qualifier/plan', 'Đã lập kế hoạch các mức', {
                      targets: t,
                      rounds: r.length === 1 ? r[0] : r,
                      avoidRematch: scope,
                      reason,
                    });
                  }}
                >
                  {c.levels.length ? 'Thay kế hoạch' : 'Lưu kế hoạch'}
                </Button>
                {c.levels.length > 0 && (
                  <p className="mt-2 text-xs text-ink-muted">
                    Thay kế hoạch xóa các mức cũ (kể cả mốc khóa bot/công bố đã đặt) và tạo mức mới; đội và
                    bot giữ nguyên.
                  </p>
                )}
              </div>
            </Card>
          )}

          {c.levels.length > 0 && (
            <Card>
              <CardHeader
                title="Các mức sơ loại"
                subtitle={`Tránh tái đấu: ${c.avoidRematch === 'level' ? 'trong từng mức' : 'toàn bộ sơ loại'}`}
              />
              <Table
                label="Các mức sơ loại"
                rows={c.levels}
                rowKey={(l) => l.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Mức',
                    cell: (l) => <span className="font-semibold">{l.name}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    cell: (l) => (
                      <Badge tone={LEVEL_STATUS[l.status].tone}>{LEVEL_STATUS[l.status].label}</Badge>
                    ),
                  },
                  {
                    key: 'teams',
                    header: 'Đội vào → đi tiếp',
                    cell: (l) => `${l.teamsIn ?? '—'} → ${l.qualifiedCount ?? l.teamTarget}`,
                  },
                  {
                    key: 'rounds',
                    header: 'Vòng',
                    cell: (l) => (
                      <span className="flex flex-wrap gap-1">
                        {l.roundsDetail.length === 0
                          ? `0/${l.rounds}`
                          : l.roundsDetail.map((r) => (
                              <Badge
                                key={r.round}
                                tone={r.confirmed ? 'success' : r.done < r.total ? 'warning' : 'blue'}
                              >
                                V{r.round}: {r.done}/{r.total}
                                {r.confirmed ? ' ✓' : ''}
                                {r.openAppeals ? ` · ${r.openAppeals} KN` : ''}
                              </Badge>
                            ))}
                      </span>
                    ),
                  },
                  {
                    key: 'times',
                    header: 'Khóa bot / Công bố',
                    cell: (l) => (
                      <span className="flex flex-col text-xs">
                        <span>
                          {l.botLockAt ? new Date(l.botLockAt).toLocaleString('vi-VN') : 'Khóa bằng tay'}
                          {l.lockDue && <span className="text-warning"> · đã tới giờ</span>}
                        </span>
                        <span className="text-ink-muted">
                          {l.publishAt
                            ? `Công bố ${new Date(l.publishAt).toLocaleString('vi-VN')}`
                            : 'Chưa đặt giờ công bố'}
                          {l.late && <span className="text-warning"> · đang chậm</span>}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'edit',
                    header: <span className="sr-only">Sửa mức</span>,
                    cell: (l) =>
                      isAdmin && ['planned', 'locked', 'running'].includes(l.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditLevel(l)}
                          aria-label={`Sửa ${l.name}`}
                        >
                          Sửa
                        </Button>
                      ) : null,
                  },
                  {
                    key: 'act',
                    header: <span className="sr-only">Thao tác</span>,
                    cell: (l) =>
                      l.status === 'running' &&
                      isAdmin &&
                      l.roundsDetail.length > 0 &&
                      !l.roundsDetail.at(-1)!.confirmed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            run(
                              `/qualifier/rounds/${l.roundsPlayed}/rerun`,
                              `Đã đặt lại vòng ${l.roundsPlayed} để thi lại`,
                            )
                          }
                        >
                          Thi lại vòng {l.roundsPlayed}
                        </Button>
                      ) : null,
                  },
                ]}
              />
              {c.levels.find((l) => l.contest) && (
                <Alert tone="warning" title="Đang tranh suất ở ranh giới" className="mt-4">
                  {c.levels.find((l) => l.contest)!.contest!.group.length} đội bằng hoàn toàn tranh{' '}
                  {c.levels.find((l) => l.contest)!.contest!.slots} suất (bước{' '}
                  {c.levels.find((l) => l.contest)!.contest!.step}).
                </Alert>
              )}
            </Card>
          )}

          {c.pending.length > 0 && (
            <Card>
              <CardHeader
                title={`Cặp đang chờ kết quả (${c.pending.length})`}
                subtitle="Kết quả đến từ phòng đấu (TV4) hoặc trọng tài nhập tay."
              />
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {c.pending.slice(0, 60).map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
                    <p className="text-xs text-ink-muted">
                      {pairingLabel(p)} · {KIND_LABEL[p.kind]}
                    </p>
                    <PairingLine p={p} compact />
                    <Button size="sm" variant="secondary" onClick={() => setEntry(p)}>
                      Nhập kết quả
                    </Button>
                  </li>
                ))}
              </ul>
              {c.pending.length > 60 && <p className="mt-2 text-xs text-ink-muted">Hiển thị 60 cặp đầu.</p>}
            </Card>
          )}

          <Card>
            <CardHeader title="Bảng xếp hạng" />
            <StandingsPanel tournamentId={tid} levels={c.levels} />
          </Card>
          <Card>
            <CardHeader title="Nhánh 32 → 4" />
            <BracketPanel bracket={c.bracket} top4={c.top4} />
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader
                title="Công cụ thử nghiệm"
                subtitle="Chỉ có khi DEMO_MODE bật. Kết quả mô phỏng được gắn nhãn, không phải kết quả thi thật."
              />
              {!health.data?.demoMode ? (
                <p className="text-sm text-ink-muted">DEMO_MODE đang tắt.</p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Input
                      label="Số đội mẫu thêm"
                      inputMode="numeric"
                      value={demoCount}
                      onChange={(e) => setDemoCount(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    loading={act.isPending}
                    onClick={() => run('/demo/teams', 'Đã thêm đội mẫu', { count: Number(demoCount) })}
                  >
                    Thêm đội mẫu có bot mô phỏng
                  </Button>
                  <Button
                    variant="secondary"
                    loading={act.isPending}
                    disabled={!c.pending.length}
                    onClick={() => run('/demo/simulate', 'Đã mô phỏng các cặp đang chờ')}
                  >
                    Mô phỏng các cặp đang chờ
                  </Button>
                  <Button variant="danger" onClick={() => setResetOpen(true)}>
                    Bắt đầu lại phần thi đấu
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      <ResultDialog pairing={entry} onClose={() => setEntry(null)} reason={reason} />
      {editLevel && (
        <LevelDialog
          key={editLevel.id}
          tournamentId={tid}
          level={editLevel}
          reason={reason}
          onClose={() => setEditLevel(null)}
        />
      )}
      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Bắt đầu lại phần thi đấu?"
        description="Xóa toàn bộ cặp đấu, kết quả, khiếu nại và nhánh của giải này; giữ đội, bot và kế hoạch các mức. Thao tác được ghi nhật ký."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setResetOpen(false);
                run('/competition/reset', 'Đã đặt lại phần thi đấu');
              }}
            >
              Đặt lại
            </Button>
          </>
        }
      />
    </section>
  );
}

const MAIN: Record<string, number> = { swiss: 2, tiebreak: 2, knockout: 5 };

function ResultDialog({
  pairing,
  onClose,
  reason,
}: {
  pairing: PairingView | null;
  onClose: () => void;
  reason: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [games, setGames] = useState<Outcome[]>([]);
  const p = pairing;
  const save = useMutation({
    mutationFn: () => api(`/admin/pairings/${p!.id}/result`, { method: 'POST', json: { games, reason } }),
    onSuccess: () => {
      toast({ title: 'Đã ghi kết quả', tone: 'success' });
      setGames([]);
      onClose();
      void qc.invalidateQueries({ queryKey: ['competition'] });
    },
    onError: (e) =>
      toast({ title: 'Kết quả không hợp lệ', description: (e as Error).message, tone: 'error' }),
  });
  if (!p) return null;
  const count = Math.max(MAIN[p.kind] ?? 2, games.length);
  const extraAllowed = p.kind !== 'swiss';
  const label = (o: Outcome) => (o === 'a' ? p.teamA?.name : o === 'b' ? p.teamB?.name : 'Hòa');
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          setGames([]);
          onClose();
        }
      }}
      title="Nhập kết quả cặp đấu"
      description={`${pairingLabel(p)} · ${p.teamA?.name} vs ${p.teamB?.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            loading={save.isPending}
            disabled={games.length < (MAIN[p.kind] ?? 2) || [...games].some((g) => g === undefined)}
            onClick={() => save.mutate()}
          >
            Lưu kết quả
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, i) => (
          <fieldset key={i} className="flex flex-wrap items-center gap-2">
            <legend className="mb-1 w-full text-xs font-semibold text-ink-muted">
              {i < (MAIN[p.kind] ?? 2) ? `Ván/hiệp ${i + 1}` : `Hiệp phụ ${i + 1 - (MAIN[p.kind] ?? 2)}`}
            </legend>
            {(['a', null, 'b'] as Outcome[]).map((o) => (
              <Button
                key={String(o)}
                size="sm"
                variant={games[i] === o && i < games.length ? 'primary' : 'secondary'}
                aria-pressed={games[i] === o && i < games.length}
                onClick={() => {
                  const next = games.slice(0, Math.max(games.length, i + 1));
                  next[i] = o;
                  setGames(next);
                }}
              >
                {label(o)}
              </Button>
            ))}
          </fieldset>
        ))}
        {extraAllowed && games.length >= (MAIN[p.kind] ?? 2) && games.length < (MAIN[p.kind] ?? 2) + 2 && (
          <Button size="sm" variant="ghost" onClick={() => setGames([...games, null])}>
            + Thêm hiệp phụ (chỉ khi bằng điểm)
          </Button>
        )}
        <p className="text-xs text-ink-muted">
          {p.kind === 'knockout'
            ? '5 hiệp chính (thắng 3, hòa 1). Bằng điểm thì nhập đúng 2 hiệp phụ; vẫn bằng thì máy chủ bốc thăm theo seed của cặp.'
            : p.kind === 'tiebreak'
              ? '2 ván; bằng thì thêm 2 ván phụ; vẫn bằng thì máy chủ bốc thăm.'
              : '2 ván đổi màu; so số ván thắng để ra thắng/hòa/thua trận.'}
        </p>
      </div>
    </Dialog>
  );
}

export function AppealsAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [target, setTarget] = useState<AppealView | null>(null);
  const [decision, setDecision] = useState<'reject' | 'accept' | 'rerun'>('reject');
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['admin-appeals', status],
    queryFn: () => api<AppealView[]>(`/admin/appeals${status === 'open' ? '?status=open' : ''}`),
    refetchInterval: 10_000,
  });
  const decide = useMutation({
    mutationFn: () =>
      api<AppealView>(`/admin/appeals/${target!.id}/decision`, {
        method: 'POST',
        json: {
          decision: decision === 'reject' ? 'reject' : 'accept',
          action: decision === 'rerun' ? 'rerun' : 'none',
          reason: text,
        },
      }),
    onSuccess: () => {
      toast({ title: 'Đã ghi quyết định', tone: 'success' });
      setTarget(null);
      setText('');
      void qc.invalidateQueries({ queryKey: ['admin-appeals'] });
      void qc.invalidateQueries({ queryKey: ['competition'] });
    },
    onError: (e) =>
      toast({ title: 'Không ghi được quyết định', description: (e as Error).message, tone: 'error' }),
  });
  return (
    <section aria-label="Khiếu nại" className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Khiếu nại chính thức"
          subtitle="Khiếu nại đang mở chặn xác nhận vòng, chốt mức và chốt vòng loại trực tiếp."
          action={
            <div className="w-44">
              <Select
                label="Lọc"
                value={status}
                onValueChange={(v) => setStatus(v as 'open' | 'all')}
                options={[
                  { value: 'open', label: 'Đang chờ xử lý' },
                  { value: 'all', label: 'Tất cả' },
                ]}
              />
            </div>
          }
        />
        {q.isLoading && <Spinner label="Đang tải khiếu nại" />}
        {q.data?.length === 0 && <EmptyState icon="✓" title="Không có khiếu nại" />}
        {q.data && q.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {q.data.map((a) => (
              <li key={a.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {a.team.name} · {pairingLabel(a.pairing)}
                  </p>
                  <Badge tone={APPEAL_STATUS[a.status].tone}>{APPEAL_STATUS[a.status].label}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {a.pairing.teamA?.name} vs {a.pairing.teamB?.name}
                  {a.gameNo ? ` · ván ${a.gameNo}` : ''}
                  {a.moveNo ? ` · nước ${a.moveNo}` : ''} · {new Date(a.createdAt).toLocaleString('vi-VN')}
                </p>
                <p className="mt-2 text-sm">{a.body}</p>
                {a.evidence && <p className="mt-1 text-xs text-ink-muted">Bằng chứng: {a.evidence}</p>}
                {a.decision && (
                  <p className="mt-2 text-sm">
                    Quyết định: {a.decision}
                    {a.action === 'rerun' ? ' (thi lại cặp)' : ''}
                  </p>
                )}
                {a.status === 'open' && (
                  <Button className="mt-3" size="sm" onClick={() => setTarget(a)}>
                    Xử lý
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Quyết định khiếu nại"
        description={target ? `${target.team.name} · ${pairingLabel(target.pairing)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Hủy
            </Button>
            <Button
              loading={decide.isPending}
              disabled={text.trim().length < 5}
              onClick={() => decide.mutate()}
            >
              Ghi quyết định
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            label="Quyết định"
            value={decision}
            onValueChange={(v) => setDecision(v as typeof decision)}
            options={[
              { value: 'reject', label: 'Bác khiếu nại' },
              { value: 'accept', label: 'Chấp nhận, giữ kết quả' },
              { value: 'rerun', label: 'Chấp nhận và cho thi lại cặp' },
            ]}
          />
          <TextArea label="Lý do (tối thiểu 5 ký tự, công khai cho đội)" value={text} onChange={setText} />
        </div>
      </Dialog>
    </section>
  );
}

/** Giá trị cho ô datetime-local theo giờ của thiết bị; máy chủ lưu UTC. */
function localInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Sửa một mức: tên, số vòng (không nhỏ hơn số vòng đã ghép), mốc khóa bot (chỉ khi chưa khóa), mốc công bố. */
function LevelDialog({
  tournamentId,
  level,
  reason,
  onClose,
}: {
  tournamentId: string;
  level: LevelView;
  reason: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(level.name);
  const [rounds, setRounds] = useState(String(level.rounds));
  const [lockAt, setLockAt] = useState(localInput(level.botLockAt));
  const [publishAt, setPublishAt] = useState(localInput(level.publishAt));
  const planned = level.status === 'planned';
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/tournaments/${tournamentId}/qualifier/levels/${level.ord}`, {
        method: 'PATCH',
        json: {
          name: name.trim(),
          rounds: Number(rounds),
          ...(planned ? { botLockAt: lockAt ? new Date(lockAt).toISOString() : null } : {}),
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          reason,
        },
      }),
    onSuccess: () => {
      toast({ title: `Đã cập nhật ${name.trim()}`, tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['competition'] });
      onClose();
    },
    onError: (e) =>
      toast({ title: 'Không cập nhật được mức', description: (e as Error).message, tone: 'error' }),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Sửa ${level.name}`}
      description={`Chọn ${level.teamTarget} đội đi tiếp · ${LEVEL_STATUS[level.status].label}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            loading={save.isPending}
            disabled={!name.trim() || !Number(rounds)}
            onClick={() => save.mutate()}
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Tên mức" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Số vòng Swiss"
          inputMode="numeric"
          value={rounds}
          onChange={(e) => setRounds(e.target.value.replace(/\D/g, ''))}
          hint={`1–20, không nhỏ hơn số vòng đã ghép (${level.roundsPlayed}).`}
        />
        <Input
          label="Mốc khóa bot (giờ máy chủ tự khóa mức)"
          type="datetime-local"
          value={lockAt}
          onChange={(e) => setLockAt(e.target.value)}
          disabled={!planned}
          hint={planned ? 'Để trống: BTC khóa bằng tay.' : 'Mức đã khóa bot, không đổi được mốc này.'}
        />
        <Input
          label="Mốc công bố kết quả"
          type="datetime-local"
          value={publishAt}
          onChange={(e) => setPublishAt(e.target.value)}
          hint="Phải sau mốc khóa bot. Quá giờ mà mức chưa chốt thì bảng xếp hạng báo chậm kết quả."
        />
        <p className="text-xs text-ink-muted">
          Giờ nhập theo múi giờ thiết bị; máy chủ lưu UTC. Lý do lấy từ ô "Lý do thao tác".
        </p>
      </div>
    </Dialog>
  );
}
