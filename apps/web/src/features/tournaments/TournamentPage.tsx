// Giải đấu. TV3 phát triển tiếp: sơ loại Swiss, tranh suất Top 32, cây 32→4, bảng xếp hạng, khiếu nại.
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner, Tabs } from '@arena/ui';
import type { TournamentView } from '@arena/contracts';
import type { CompetitionView } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { BracketPanel, DEMO_KIND, LEVEL_STATUS, StandingsPanel } from './competition-ui';
import { MyPairings } from './MyPairings';

const STAGE_STATUS: Record<string, string> = {
  planned: 'Dự kiến',
  open: 'Đang mở',
  running: 'Đang diễn ra',
  finished: 'Đã xong',
  confirmed: 'Đã chốt',
};

export function TournamentPage() {
  // ?tab=mine: thông báo theo vòng mở thẳng tab "Trận của đội tôi".
  const [params] = useSearchParams();
  const q = useQuery({
    queryKey: ['tournament', 'current'],
    queryFn: () => api<TournamentView>('/tournaments/current'),
    refetchInterval: 30000,
  });
  const t = q.data;
  const comp = useQuery({
    queryKey: ['competition', t?.id],
    queryFn: () => api<CompetitionView>(`/tournaments/${t!.id}/competition`),
    enabled: !!t,
    refetchInterval: 10_000,
  });
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Giải đấu</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
          {t?.name ?? 'Giải đấu hiện tại'}
        </h1>
        {t?.isDemo && (
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {t.demoKind && <Badge tone={DEMO_KIND[t.demoKind].tone}>{DEMO_KIND[t.demoKind].label}</Badge>}
            <Badge tone="warning">Giải mẫu — không phải lịch thi chính thức</Badge>
          </p>
        )}
        {t?.demoKind && <p className="mt-1 text-sm text-ink-muted">{DEMO_KIND[t.demoKind].hint}</p>}
      </header>
      {q.isLoading && <Spinner label="Đang tải giải đấu" />}
      {isApiError(q.error, 'NOT_FOUND') && <EmptyState title="Chưa có giải đấu nào đang mở" />}
      {q.error && !isApiError(q.error, 'NOT_FOUND') && (
        <Alert tone="error" title="Không tải được giải đấu">
          {(q.error as Error).message}
        </Alert>
      )}
      {t && (
        <Card>
          <CardHeader
            title="Lịch đăng ký và mốc khóa"
            subtitle="Trạng thái do máy chủ xác định theo lịch đã lưu."
          />
          {t.description && <p className="mb-3 text-sm text-ink-muted">{t.description}</p>}
          <Badge>
            {
              {
                unconfigured: 'Chưa cấu hình lịch',
                scheduled: 'Chưa đến giờ đăng ký',
                open: 'Đang mở đăng ký',
                closed: 'Đã đóng đăng ký',
                teams_locked: 'Đã đến hạn khóa đội hình',
                bots_locked: 'Đã đến hạn khóa bot',
              }[t.registrationPhase]
            }
          </Badge>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                ['Mở đăng ký', t.registrationOpensAt],
                ['Đóng đăng ký', t.registrationClosesAt],
                ['Khóa đội hình', t.teamLockAt],
                ['Khóa nộp bot', t.botLockAt],
              ] as const
            ).map(([label, date]) => (
              <div key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd>{date ? new Date(date).toLocaleString('vi-VN') : 'Chưa ấn định'}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      {t && (
        <Tabs
          key={params.get('tab') ?? 'default'}
          label="Thông tin giải"
          defaultValue={params.get('tab') ?? undefined}
          items={[
            {
              value: 'stages',
              label: 'Giai đoạn',
              content: (
                <ol className="grid gap-3 md:grid-cols-2">
                  {t.stages.map((s) => (
                    <li key={s.id}>
                      <Card className="h-full">
                        <CardHeader
                          title={`${s.ord}. ${s.name}`}
                          subtitle={s.kind === 'qualifier' ? 'Vòng sơ loại' : 'Loại trực tiếp'}
                          action={<Badge>{STAGE_STATUS[s.status] ?? s.status}</Badge>}
                        />
                        <p className="text-sm text-ink-muted">
                          {s.kind === 'qualifier'
                            ? 'Mỗi cặp Swiss thi đấu 2 ván đổi màu, không chọn quân thứ 10.'
                            : 'Loại trực tiếp từ Top 32 đến Top 4; có xác nhận kết quả trước khi sang vòng tiếp theo.'}
                        </p>
                        {s.startsAt && (
                          <p className="mt-3 text-sm">
                            Bắt đầu: {new Date(s.startsAt).toLocaleString('vi-VN')}
                          </p>
                        )}
                        {s.endsAt && (
                          <p className="mt-1 text-sm">
                            Kết thúc: {new Date(s.endsAt).toLocaleString('vi-VN')}
                          </p>
                        )}
                        {s.lockAt && (
                          <p className="mt-1 text-sm">
                            Hạn khóa: {new Date(s.lockAt).toLocaleString('vi-VN')}
                          </p>
                        )}
                      </Card>
                    </li>
                  ))}
                  {(comp.data?.levels.length ?? 0) > 0 && (
                    <li className="md:col-span-2">
                      <LevelSchedule levels={comp.data!.levels} />
                    </li>
                  )}
                </ol>
              ),
            },
            {
              value: 'standings',
              label: 'Bảng xếp hạng',
              content: <StandingsPanel tournamentId={t.id} levels={comp.data?.levels ?? []} />,
            },
            {
              value: 'bracket',
              label: 'Nhánh 32 → 4',
              content: <BracketPanel bracket={comp.data?.bracket ?? []} top4={comp.data?.top4 ?? null} />,
            },
            {
              value: 'mine',
              label: 'Trận của đội tôi',
              content: <MyPairings tournamentId={t.id} />,
            },
          ]}
        />
      )}
    </div>
  );
}

/** Lịch các mức sơ loại cho thí sinh: chỉ tiêu, số vòng, mốc khóa bot, mốc công bố kết quả, tiến độ. */
function LevelSchedule({ levels }: { levels: CompetitionView['levels'] }) {
  const at = (v: string | null) => (v ? new Date(v).toLocaleString('vi-VN') : 'BTC thông báo sau');
  return (
    <Card>
      <CardHeader
        title="Lịch các mức sơ loại"
        subtitle="Mỗi mức: khóa bot (chốt một bot cho cả mức) → các vòng Swiss → công bố đội đi tiếp."
      />
      <ol className="grid gap-2">
        {levels.map((l) => (
          <li
            key={l.id}
            className="grid gap-1 rounded-md border border-line p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p className="font-semibold">
                {l.name} · giữ {l.teamTarget} đội · {l.rounds} vòng
                {l.roundsPlayed > 0 && l.status !== 'done' ? ` (đã ghép ${l.roundsPlayed})` : ''}
              </p>
              <p className="text-xs text-ink-muted">
                Khóa bot: {l.status === 'planned' ? at(l.botLockAt) : 'đã khóa'} · Công bố kết quả:{' '}
                {at(l.publishAt)}
                {l.late && <span className="text-warning"> · đang chậm so với lịch</span>}
              </p>
            </div>
            <Badge tone={LEVEL_STATUS[l.status].tone}>{LEVEL_STATUS[l.status].label}</Badge>
          </li>
        ))}
      </ol>
    </Card>
  );
}
