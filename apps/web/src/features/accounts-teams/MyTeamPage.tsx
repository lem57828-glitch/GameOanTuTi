// Đội của tôi. TV1 phát triển tiếp: lập đội, mời/duyệt thành viên, khóa đội.
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner } from '@arena/ui';
import type { TeamView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const TEAM_STATUS: Record<
  TeamView['status'],
  { label: string; tone: 'neutral' | 'success' | 'accent' | 'danger' }
> = {
  draft: { label: 'Đang lập', tone: 'neutral' },
  approved: { label: 'Đã duyệt', tone: 'success' },
  locked: { label: 'Đã khóa', tone: 'accent' },
  withdrawn: { label: 'Đã rút', tone: 'danger' },
};

export function MyTeamPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ['team', 'mine', user?.id],
    queryFn: () => api<{ team: TeamView | null }>('/teams/mine'),
  });
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tài khoản & đội</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Đội của tôi</h1>
      </header>
      {q.isLoading && <Spinner label="Đang tải đội" />}
      {q.error && (
        <Alert tone="error" title="Không tải được thông tin đội">
          {(q.error as Error).message}
        </Alert>
      )}
      {q.data && !q.data.team && (
        <EmptyState
          icon="👥"
          title="Bạn chưa có đội trong giải hiện tại"
          description="Lập đội và mời thành viên (2–4 người) chưa được triển khai ở M0 — phần này do TV1 phụ trách."
        />
      )}
      {q.data?.team && (
        <Card>
          <CardHeader
            title={q.data.team.name}
            subtitle={`${q.data.team.members.length} thành viên`}
            action={
              <Badge tone={TEAM_STATUS[q.data.team.status].tone} dot>
                {TEAM_STATUS[q.data.team.status].label}
              </Badge>
            }
          />
          <ul className="divide-y divide-line/70 rounded-md border border-line">
            {q.data.team.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium text-ink">{m.displayName}</span>
                {m.isCaptain && <Badge tone="accent">Đội trưởng</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-muted">
            Dữ liệu mẫu. Mời thành viên, rời đội, khóa đội: chưa làm ở M0 (TV1).
          </p>
        </Card>
      )}
    </div>
  );
}
