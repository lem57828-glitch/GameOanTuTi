// Bot của đội cho mức sơ loại: đội trưởng chọn một bot trước khi mức khóa; mọi trận Swiss/tranh suất của mức dùng bot đó.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Select, Spinner, useToast } from '@arena/ui';
import type { LevelBotView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const SOURCE: Record<NonNullable<LevelBotView['current']>['source'], string> = {
  chosen: 'Đội trưởng chọn',
  default: 'Mặc định (chưa chọn)',
  auto: 'Hệ thống chốt khi khóa mức',
};

export function LevelBotCard({ tournamentId }: { tournamentId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ['level-bot', tournamentId, user?.id],
    queryFn: () => api<LevelBotView>(`/tournaments/${tournamentId}/qualifier/my-bot`),
    refetchInterval: 15_000,
  });
  const d = q.data;
  const [bot, setBot] = useState('');
  useEffect(() => {
    if (d?.current) setBot(d.current.botVersionId);
  }, [d?.current]);
  const save = useMutation({
    mutationFn: () =>
      api(`/tournaments/${tournamentId}/qualifier/my-bot`, { method: 'POST', json: { botVersionId: bot } }),
    onSuccess: () => {
      toast({ title: 'Đã lưu bot cho mức sơ loại', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['level-bot', tournamentId] });
    },
    onError: (e) => toast({ title: 'Không lưu được bot', description: (e as Error).message, tone: 'error' }),
  });

  if (q.isLoading) return <Spinner label="Đang tải bot thi sơ loại" />;
  if (q.error)
    return (
      <Alert tone="error" title="Không tải được bot thi sơ loại">
        {(q.error as Error).message}
      </Alert>
    );
  if (!d?.level) return null;
  const lockAt = d.level.botLockAt ? new Date(d.level.botLockAt).toLocaleString('vi-VN') : null;
  return (
    <Card className="p-4">
      <CardHeader
        title={`Bot thi sơ loại · ${d.level.name}`}
        subtitle={
          d.level.status === 'planned'
            ? `Một bot cho mọi trận Swiss của mức này, không đổi giữa các vòng. Chốt khi BTC khóa mức${lockAt ? ` (dự kiến ${lockAt})` : ''}.`
            : 'Đã chốt cho mọi trận của mức này.'
        }
        action={
          <Badge tone={d.level.status === 'planned' ? 'warning' : 'success'} dot>
            {d.level.status === 'planned' ? 'Còn đổi được' : 'Đã chốt'}
          </Badge>
        }
      />
      {d.current && (
        <p className="mb-3 text-sm">
          Đang dùng: <span className="font-semibold">{d.current.label}</span>{' '}
          <span className="text-ink-muted">· {SOURCE[d.current.source]}</span>
        </p>
      )}
      {d.canChoose ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Select
            label="Chọn bot cho mức"
            value={bot}
            onValueChange={setBot}
            options={d.allowedBots.map((b) => ({ value: b.id, label: `v${b.version} · ${b.label}` }))}
          />
          <Button
            loading={save.isPending}
            disabled={!bot || (bot === d.current?.botVersionId && d.current.source === 'chosen')}
            onClick={() => save.mutate()}
          >
            Lưu bot
          </Button>
        </div>
      ) : (
        d.reason && <p className="text-xs text-ink-muted">{d.reason}</p>
      )}
    </Card>
  );
}
