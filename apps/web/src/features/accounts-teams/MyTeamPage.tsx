import { ActionButton } from './Forms';
// Lập đội, tham gia bằng mã và quản lý thành viên.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner, Button, Input } from '@arena/ui';
import { CreateTeamRequest, JoinTeamRequest, TEAM_MEMBER_LIMIT, type TeamView } from '@arena/contracts';
import { api } from '../../lib/api';
import { sessionKey, useSession } from '../../lib/session';

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
  const { user, isLoading } = useSession();
  const qc = useQueryClient();
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({
    mutationFn: ({
      action,
      input,
    }: {
      action: 'create' | 'join';
      input: { name: string } | { code: string };
    }) =>
      api<{ team: TeamView }>(action === 'create' ? '/teams' : '/teams/join', {
        method: 'POST',
        json: input,
      }),
    onSuccess: async (result) => {
      qc.setQueryData(['team', 'mine', user?.id], result);
      await qc.invalidateQueries({ queryKey: sessionKey });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>, action: 'create' | 'join') {
    event.preventDefault();
    mutation.reset();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const result = (action === 'create' ? CreateTeamRequest : JoinTeamRequest).safeParse(values);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? 'Thông tin không hợp lệ.');
      return;
    }
    setFormError('');
    mutation.mutate({ action, input: result.data });
  }
  const q = useQuery({
    queryKey: ['team', 'mine', user?.id],
    queryFn: () => api<{ team: TeamView | null }>('/teams/mine'),
    enabled: !!user,
    refetchInterval: 5000,
  });
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['team'] });
    await qc.invalidateQueries({ queryKey: sessionKey });
  }
  const isCaptain = q.data?.team?.members.some((m) => m.id === user?.id && m.isCaptain);
  const canManage = !!user && (user.demo || (user.emailVerified && user.profileComplete));
  if (isLoading) return <Spinner label="Kiểm tra phiên đăng nhập" />;
  if (!user)
    return (
      <EmptyState
        title="Bạn cần đăng nhập để quản lý đội"
        action={<Link to="/login?next=/team">Đăng nhập</Link>}
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tài khoản & đội</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Đội của tôi</h1>
      </header>
      {!canManage && user.role === 'student' && (
        <Alert tone="warning" title="Hoàn tất hồ sơ và xác minh email">
          <Link className="text-accent underline" to="/profile">
            Mở Hồ sơ để hoàn tất trước khi lập hoặc tham gia đội.
          </Link>
        </Alert>
      )}
      {q.isLoading && <Spinner label="Đang tải đội" />}
      {q.error && (
        <Alert tone="error" title="Không tải được thông tin đội">
          {(q.error as Error).message}
        </Alert>
      )}
      {q.data &&
        !q.data.team &&
        (user.role === 'student' ? (
          <>
            <p className="text-sm text-ink-muted">
              Bạn chưa có đội. Hãy lập đội mới hoặc nhập mã để tham gia đội của bạn bè. Mỗi đội tối đa{' '}
              {TEAM_MEMBER_LIMIT} thành viên, tính cả đội trưởng.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <h2 className="text-xl font-bold">Lập đội</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Bạn sẽ là đội trưởng. Mã tham gia được tạo tự động sau khi lập đội.
                </p>
                <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => submit(event, 'create')}>
                  <Input
                    label="Tên đội"
                    name="name"
                    required
                    maxLength={100}
                    placeholder="Nhập tên đội của bạn"
                  />
                  <Button
                    type="submit"
                    disabled={mutation.isPending || !canManage}
                    loading={mutation.isPending && mutation.variables?.action === 'create'}
                  >
                    Lập đội
                  </Button>
                </form>
              </Card>
              <Card>
                <h2 className="text-xl font-bold">Tham gia đội</h2>
                <p className="mt-2 text-sm text-ink-muted">Nhập mã do đội trưởng chia sẻ để tham gia ngay.</p>
                <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => submit(event, 'join')}>
                  <Input
                    label="Mã đội"
                    name="code"
                    required
                    maxLength={10}
                    placeholder="Nhập mã gồm 10 ký tự"
                    autoComplete="off"
                    className="uppercase"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={mutation.isPending || !canManage}
                    loading={mutation.isPending && mutation.variables?.action === 'join'}
                  >
                    Tham gia đội
                  </Button>
                </form>
              </Card>
            </div>
            {(formError || mutation.error) && (
              <Alert tone="error" title="Không thể thực hiện">
                {formError || mutation.error?.message}
              </Alert>
            )}
          </>
        ) : (
          <EmptyState
            title="Bạn không phải thí sinh"
            description="Chức năng lập và tham gia đội dành cho tài khoản sinh viên."
          />
        ))}
      {q.data?.team && (
        <Card>
          <CardHeader
            title={q.data.team.name}
            subtitle={`${q.data.team.members.length}/${TEAM_MEMBER_LIMIT} thành viên`}
            action={
              <Badge tone={TEAM_STATUS[q.data.team.status].tone} dot>
                {TEAM_STATUS[q.data.team.status].label}
              </Badge>
            }
          />
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-4">
            <div>
              <p className="text-sm text-ink-muted">Mã tham gia đội</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-widest text-accent">
                {q.data.team.joinCode}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(q.data!.team!.joinCode);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Đã sao chép' : 'Sao chép mã'}
            </Button>
          </div>
          {q.data.team.rosterLocked && (
            <div className="mb-5">
              <Alert title="Đội hình đã khóa" tone="warning">
                Không thể đổi thành viên, tên đội hoặc đội trưởng. Liên hệ BTC nếu cần mở lại trước hạn khóa
                của giải.
              </Alert>
            </div>
          )}
          <ul className="divide-y divide-line/70 rounded-md border border-line">
            {q.data.team.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium text-ink">{m.displayName}</span>
                {m.isCaptain && <Badge tone="accent">Đội trưởng</Badge>}
                {isCaptain && !m.isCaptain && !q.data!.team!.rosterLocked && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      confirm={`Chuyển quyền đội trưởng cho ${m.displayName}?`}
                      run={() => api('/teams/mine/captain', { method: 'POST', json: { accountId: m.id } })}
                      onDone={refresh}
                    >
                      Chuyển đội trưởng
                    </ActionButton>
                    <ActionButton
                      confirm={`Loại ${m.displayName} khỏi đội?`}
                      run={() => api(`/teams/mine/members/${m.id}`, { method: 'DELETE' })}
                      onDone={refresh}
                    >
                      Loại thành viên
                    </ActionButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!q.data.team.rosterLocked && (
            <div className="mt-5 flex flex-col gap-5">
              <ActionButton
                confirm={
                  isCaptain && q.data.team.members.length === 1
                    ? 'Bạn là thành viên cuối cùng. Rời đội sẽ rút đội khỏi giải. Tiếp tục?'
                    : 'Bạn muốn rời đội? Đội trưởng cần chuyển quyền nếu còn thành viên khác.'
                }
                run={() => api(`/teams/mine/members/${user.id}`, { method: 'DELETE' })}
                onDone={refresh}
              >
                Rời đội
              </ActionButton>
            </div>
          )}
          <p className="mt-4 text-xs text-ink-muted">
            {q.data.team.rosterLocked
              ? 'Đội đang khóa theo quy định của giải, không nhận thêm thành viên.'
              : q.data.team.members.length >= TEAM_MEMBER_LIMIT
                ? `Đội đã đủ ${TEAM_MEMBER_LIMIT} thành viên.`
                : `Chia sẻ mã để mời thêm ${TEAM_MEMBER_LIMIT - q.data.team.members.length} thành viên.`}
          </p>
        </Card>
      )}
    </div>
  );
}
