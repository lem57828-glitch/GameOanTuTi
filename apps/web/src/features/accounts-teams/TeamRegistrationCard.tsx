import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, CardHeader, Spinner } from '@arena/ui';
import type { TeamView, TournamentView } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';
import { sessionKey, useSession } from '../../lib/session';

/** Lập đội độc lập; đội trưởng chủ động đăng ký giải, sau đó chờ BTC duyệt. */
export function TeamRegistrationCard({ team }: { team: TeamView }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ['tournament', 'current'],
    queryFn: () => api<TournamentView>('/tournaments/current'),
    refetchInterval: 10000,
  });
  const t = current.data;
  const captain = team.members.some((m) => m.id === user?.id && m.isCaptain);
  const register = useMutation({
    mutationFn: () => api<{ team: TeamView }>(`/teams/mine/tournaments/${t!.id}`, { method: 'POST' }),
    onSuccess: async (result) => {
      qc.setQueryData(['team', 'mine', user?.id], result);
      await qc.invalidateQueries({ queryKey: sessionKey });
      void qc.invalidateQueries({ queryKey: ['competition'] });
    },
  });
  if (team.tournamentId) return null;
  return (
    <Card>
      <CardHeader
        title="Đăng ký thi đấu giải"
        subtitle="Đội được lập độc lập với giải đấu. Đăng ký khi sẵn sàng để BTC xét duyệt."
      />
      {current.isLoading && <Spinner label="Đang tải giải mở đăng ký" />}
      {isApiError(current.error, 'NOT_FOUND') && (
        <p className="text-sm text-ink-muted">
          Chưa có giải đang mở. Bạn vẫn có thể quản lý thành viên, nộp bot và đấu thử.
        </p>
      )}
      {current.error && !isApiError(current.error, 'NOT_FOUND') && (
        <Alert tone="error" title="Không tải được giải">
          {current.error.message}
        </Alert>
      )}
      {t && (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{t.name}</p>
          <p className="text-sm text-ink-muted">
            Hạn đăng ký:{' '}
            {t.registrationClosesAt
              ? new Date(t.registrationClosesAt).toLocaleString('vi-VN')
              : 'Chưa ấn định'}
          </p>
          {captain ? (
            <Button
              disabled={
                t.registrationPhase !== 'open' ||
                team.status === 'withdrawn' ||
                team.rosterLocked ||
                register.isPending
              }
              loading={register.isPending}
              onClick={() => register.mutate()}
            >
              Đăng ký đội vào giải
            </Button>
          ) : (
            <p className="text-sm text-ink-muted">Chỉ đội trưởng được đăng ký đội vào giải.</p>
          )}
          {t.registrationPhase !== 'open' && (
            <p className="text-sm text-ink-muted">Giải hiện chưa mở hoặc đã hết thời gian đăng ký.</p>
          )}
          <Link className="text-sm text-accent" to="/tournament">
            Xem lịch và thể lệ giải →
          </Link>
        </div>
      )}
      {register.error && (
        <Alert className="mt-3" tone="error" title="Không đăng ký được giải">
          {register.error.message}
        </Alert>
      )}
    </Card>
  );
}
