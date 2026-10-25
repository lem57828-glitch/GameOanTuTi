import { FeatureHero } from '../../components/WorkspaceVisuals';
import { LoadingState } from '@arena/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader, EmptyState } from '@arena/ui';
import type { MyPairingView, StandingsView, TeamView, TournamentView } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { DEMO_KIND } from './competition-ui';
import { MyPairings } from './MyPairings';
import { StageBotCard } from './StageBotCard';
import { teamNextStep } from './team-competition';
import { TeamRegistrationCard } from '../accounts-teams/TeamRegistrationCard';

export function TeamCompetitionPage() {
  const { user, isLoading, error } = useSession();
  const team = useQuery({
    queryKey: ['team', 'mine', user?.id],
    queryFn: () => api<{ team: TeamView | null }>('/teams/mine'),
    enabled: !!user && user.role === 'student',
    refetchInterval: 5000,
  });
  const tournament = useQuery({
    queryKey: ['tournament', 'current'],
    queryFn: () => api<TournamentView>('/tournaments/current'),
    enabled: !!user,
    refetchInterval: 10000,
  });
  const t = tournament.data;
  const own = team.data?.team;
  const pairings = useQuery({
    queryKey: ['my-pairings', t?.id, user?.id],
    queryFn: () => api<MyPairingView[]>(`/tournaments/${t!.id}/my-pairings`),
    enabled: !!own && own.tournamentId === t?.id,
    refetchInterval: 5000,
  });
  const standings = useQuery({
    queryKey: ['standings', t?.id, ''],
    queryFn: () => api<StandingsView>(`/tournaments/${t!.id}/standings`),
    enabled: !!own && own.tournamentId === t?.id,
    refetchInterval: 10000,
  });
  if (isLoading) return <LoadingState label="Kiểm tra phiên đăng nhập" />;
  if (error)
    return (
      <Alert tone="error" title="Không tải được phiên">
        {error.message}
      </Alert>
    );
  if (!user)
    return (
      <EmptyState
        title="Đăng nhập để xem thi đấu của đội"
        action={<Link to="/login?next=/competition">Đăng nhập</Link>}
      />
    );
  if (user.role !== 'student')
    return (
      <EmptyState title="Màn hình dành cho sinh viên" action={<Link to="/admin">Mở khu vực BTC</Link>} />
    );
  const step = teamNextStep(
    own ?? null,
    pairings.data ?? [],
    standings.data?.rows.find((r) => r.teamId === own?.id),
  );
  return (
    <div className="flex flex-col gap-6">
      <FeatureHero variant="tournament" slogan="Chuẩn bị kỹ từng bước. Bứt phá trong từng trận.">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Giải đấu</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Thi đấu của đội</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {own?.name ?? 'Đội của bạn'}
          {t ? ` · ${t.name}` : ''}
        </p>
        {t?.demoKind && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={DEMO_KIND[t.demoKind].tone}>{DEMO_KIND[t.demoKind].label}</Badge>
            {DEMO_KIND[t.demoKind].hint}
          </p>
        )}
      </FeatureHero>
      {(team.isLoading || tournament.isLoading || pairings.isLoading) && (
        <LoadingState label="Đang tải trạng thái thi đấu" />
      )}
      {[team.error, tournament.error, pairings.error]
        .filter((e) => e && !isApiError(e, 'NOT_FOUND'))
        .map((e, i) => (
          <Alert key={i} tone="error" title="Không tải được trạng thái">
            {e!.message}
          </Alert>
        ))}
      {isApiError(tournament.error, 'NOT_FOUND') && (
        <EmptyState
          title="Chưa có giải đấu đang mở"
          description="Theo dõi thông báo từ BTC để biết lịch đăng ký."
        />
      )}
      {team.isSuccess &&
        (t || isApiError(tournament.error, 'NOT_FOUND')) &&
        !pairings.isLoading &&
        !pairings.error && (
          <Card className="next-step-card border-accent/40">
            <CardHeader
              title={step.title}
              subtitle={step.detail}
              action={
                own ? (
                  <Badge>
                    {
                      {
                        draft: own.tournamentId ? 'Chờ duyệt' : 'Đang lập đội',
                        approved: 'Đã duyệt',
                        locked: 'Đã khóa đội',
                        withdrawn: 'Đã rút',
                      }[own.status]
                    }
                  </Badge>
                ) : undefined
              }
            />
            <Button asChild>
              <Link to={step.href}>{step.label}</Link>
            </Button>
            <Link className="ml-4 text-sm text-accent" to="/team">
              Thông tin đội
            </Link>
          </Card>
        )}
      {own && !own.tournamentId && (
        <>
          <TeamRegistrationCard team={own} />
          <Button asChild variant="secondary">
            <Link to="/bots">Nộp / Kiểm thử bot</Link>
          </Button>
        </>
      )}
      {own && t && own.tournamentId === t.id && own.status !== 'withdrawn' && (
        <>
          <Card>
            <CardHeader
              title="Chuẩn bị thi đấu"
              subtitle="Nộp và kiểm thử bot trước khi chọn bộ bot cho từng giai đoạn."
            />
            <p className="mb-4 text-sm text-ink-muted">
              Hạn nộp bot: {t.botLockAt ? new Date(t.botLockAt).toLocaleString('vi-VN') : 'Chưa ấn định'}
            </p>
            <Button asChild variant="secondary">
              <Link to="/bots">Nộp / Kiểm thử bot</Link>
            </Button>
          </Card>
          {t.stages.map((stage) => (
            <StageBotCard key={`${own.id}:${stage.id}`} team={own} stage={stage} serverTime={t.serverTime} />
          ))}
          <section aria-label="Trận đấu và kết quả của đội">
            <h2 className="mb-4 text-xl font-bold">Trận đấu và kết quả</h2>
            <MyPairings tournamentId={t.id} />
          </section>
        </>
      )}
      <Card>
        <CardHeader title="Theo dõi giải đấu" />
        <div className="flex flex-wrap gap-5 text-sm font-semibold text-accent">
          <Link to="/tournament">Lịch, bảng điểm và nhánh đấu →</Link>
          <Link to="/news">Thông báo từ BTC →</Link>
        </div>
      </Card>
    </div>
  );
}
