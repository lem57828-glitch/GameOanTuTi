import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardHeader, Spinner } from '@arena/ui';
import type { BotSelectionView, BotVersion, TeamView, TournamentView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { usePublicHealth } from '../../lib/health';

export function StageBotCard({
  team,
  stage,
  serverTime,
}: {
  team: TeamView;
  stage: TournamentView['stages'][number];
  serverTime: string;
}) {
  const { user } = useSession();
  const health = usePublicHealth();
  const qc = useQueryClient();
  const key = ['stage-selection', stage.id, team.id, user?.id];
  const selection = useQuery({
    queryKey: key,
    queryFn: () => api<BotSelectionView | null>(`/stages/${stage.id}/bot-selection/${team.id}`),
    refetchInterval: 5000,
  });
  const bots = useQuery({
    queryKey: ['bots', user?.id],
    queryFn: () => api<BotVersion[]>('/bots'),
    refetchInterval: 5000,
  });
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (selection.isSuccess) setIds(selection.data?.botVersionIds ?? []);
  }, [selection.data, selection.isSuccess]);
  const captain = team.members.some((m) => m.id === user?.id && m.isCaptain);
  const frozen =
    !!selection.data?.locked ||
    !!(stage.lockAt && Date.parse(stage.lockAt) <= Date.parse(serverTime)) ||
    stage.status === 'finished' ||
    stage.status === 'confirmed';
  const allowed = (bots.data ?? []).filter(
    (b) =>
      b.teamId === team.id &&
      b.status === 'valid' &&
      (b.submissionMethod === 'github' || (health.data?.demoMode && b.submissionMethod === 'demo')),
  );
  const limit = stage.kind === 'qualifier' ? 1 : 3;
  const save = useMutation({
    mutationFn: () =>
      api<BotSelectionView>(`/stages/${stage.id}/bot-selection`, {
        method: 'POST',
        json: { teamId: team.id, botVersionIds: ids },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stage-selection', stage.id, team.id] });
      void qc.invalidateQueries({ queryKey: ['level-bot'] });
    },
  });
  return (
    <Card>
      <CardHeader
        title={`Bộ bot · ${stage.name}`}
        subtitle={`${stage.kind === 'qualifier' ? 'Chọn 1 bot' : 'Chọn từ 1 đến 3 bot'} hợp lệ. Chỉ đội trưởng được lưu; BTC và lịch giải quyết định khóa bộ bot.`}
        action={
          <Badge tone={selection.data?.locked ? 'success' : 'warning'}>
            {selection.data?.locked ? 'Đã khóa' : frozen ? 'Đã hết hạn chọn' : 'Chưa khóa'}
          </Badge>
        }
      />
      <p className="mb-3 text-sm text-ink-muted">
        Hạn khóa: {stage.lockAt ? new Date(stage.lockAt).toLocaleString('vi-VN') : 'Chưa ấn định'}
      </p>
      {bots.data && (
        <p className="mb-3 text-sm text-ink-muted">
          Bot của đội: {bots.data.filter((b) => b.teamId === team.id && b.status === 'pending').length} chờ
          kiểm thử · {allowed.length} đủ điều kiện thi ·{' '}
          {bots.data.filter((b) => b.teamId === team.id && b.status === 'invalid').length} không hợp lệ. Đã
          lưu: {selection.data?.botVersionIds.length ?? 0}/{limit} bot.
        </p>
      )}
      {(selection.isLoading || bots.isLoading) && <Spinner label="Đang tải bộ bot" />}
      {(selection.error || bots.error) && (
        <Alert tone="error" title="Không tải được bộ bot">
          {(selection.error ?? bots.error)?.message}
        </Alert>
      )}
      {selection.isSuccess && frozen && !selection.data && (
        <Alert tone="warning" title="Chưa có bộ bot khi hết hạn">
          Liên hệ BTC để kiểm tra bộ bot trước khi mở phòng thi đấu.
        </Alert>
      )}
      {bots.isSuccess && allowed.length === 0 && (
        <p className="text-sm text-ink-muted">
          Chưa có bot đủ điều kiện. Bot tải file/dán code chỉ dùng tập luyện; thi chính thức cần bot GitHub đã
          kiểm thử hợp lệ.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {allowed.map((b) => (
          <label key={b.id} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm">
            <input
              type="checkbox"
              checked={ids.includes(b.id)}
              disabled={
                !captain ||
                frozen ||
                save.isPending ||
                selection.isLoading ||
                !!selection.error ||
                (!ids.includes(b.id) && ids.length >= limit)
              }
              onChange={(e) =>
                setIds((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))
              }
            />
            <span>
              v{b.version} · {b.label}
            </span>
            <Badge tone="success">Hợp lệ</Badge>
          </label>
        ))}
      </div>
      {captain && !frozen && (
        <Button
          className="mt-4"
          loading={save.isPending}
          disabled={
            !ids.length ||
            ids.some((id) => !allowed.some((b) => b.id === id)) ||
            selection.isLoading ||
            !!selection.error ||
            !!bots.error
          }
          onClick={() => save.mutate()}
        >
          Lưu bộ bot dự thi
        </Button>
      )}
      {!captain && <p className="mt-3 text-xs text-ink-muted">Đội trưởng chọn bộ bot cho đội.</p>}
      {save.error && (
        <Alert className="mt-3" tone="error" title="Không lưu được bộ bot">
          {save.error.message}
        </Alert>
      )}
      {save.isSuccess && (
        <p role="status" className="mt-3 text-sm text-success">
          Đã lưu bộ bot.
        </p>
      )}
    </Card>
  );
}
