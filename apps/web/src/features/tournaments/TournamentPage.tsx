// Giải đấu. TV3 phát triển tiếp: sơ loại Swiss, tranh suất Top 32, cây 32→4, bảng xếp hạng, khiếu nại.
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner, Tabs } from '@arena/ui';
import type { TournamentView } from '@arena/contracts';
import type { CompetitionView } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { BracketPanel, StandingsPanel } from './competition-ui';
import { MyPairings } from './MyPairings';

const STAGE_STATUS: Record<string, string> = {
  planned: 'Dự kiến',
  open: 'Đang mở',
  running: 'Đang diễn ra',
  finished: 'Đã xong',
  confirmed: 'Đã chốt',
};

export function TournamentPage() {
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
          <p className="mt-2">
            <Badge tone="warning">Giải mẫu — không phải lịch thi chính thức</Badge>
          </p>
        )}
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
          label="Thông tin giải"
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
                            ? 'Số ván mỗi trận, số vòng Swiss, bye, tránh tái đấu và tie-break đang chờ chốt (docs/DECISIONS.md).'
                            : 'Top 32 → Top 4. Bán kết và chung kết đổi luật là giai đoạn sau, chưa thuộc M0.'}
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
