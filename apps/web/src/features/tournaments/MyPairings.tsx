// Trận của đội tôi + gửi khiếu nại chính thức (chỉ đội trưởng, khi kết quả chưa chốt).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Spinner,
  useToast,
  cn,
  focusRing,
} from '@arena/ui';
import type { AppealView, MyPairingView } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { KIND_LABEL, PairingLine, pairingLabel } from './competition-ui';
import { LevelBotCard } from './LevelBotCard';

export const APPEAL_STATUS: Record<
  AppealView['status'],
  { label: string; tone: 'warning' | 'success' | 'danger' }
> = {
  open: { label: 'Đang chờ xử lý', tone: 'warning' },
  accepted: { label: 'Được chấp nhận', tone: 'success' },
  rejected: { label: 'Bị bác', tone: 'danger' },
};

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'rounded-md border border-line bg-bg-deep/60 px-3 py-2 text-sm text-ink hover:border-ink-muted/60',
          focusRing,
        )}
      />
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function MyPairings({ tournamentId }: { tournamentId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [target, setTarget] = useState<MyPairingView | null>(null);
  const [body, setBody] = useState('');
  const [gameNo, setGameNo] = useState('');
  const [moveNo, setMoveNo] = useState('');
  const [evidence, setEvidence] = useState('');
  const mine = useQuery({
    queryKey: ['my-pairings', tournamentId, user?.id],
    queryFn: () => api<MyPairingView[]>(`/tournaments/${tournamentId}/my-pairings`),
    enabled: !!user,
    refetchInterval: 10_000,
  });
  const appeals = useQuery({
    queryKey: ['my-appeals', user?.id],
    queryFn: () => api<AppealView[]>('/appeals/mine'),
    enabled: !!user,
  });
  const submit = useMutation({
    mutationFn: () =>
      api<AppealView>('/appeals', {
        method: 'POST',
        json: {
          pairingId: target!.id,
          body,
          gameNo: gameNo ? Number(gameNo) : null,
          moveNo: moveNo ? Number(moveNo) : null,
          evidence: evidence || null,
        },
      }),
    onSuccess: () => {
      toast({
        title: 'Đã gửi khiếu nại',
        description: 'BTC sẽ xử lý trước khi chốt vòng.',
        tone: 'success',
      });
      setTarget(null);
      setBody('');
      setGameNo('');
      setMoveNo('');
      setEvidence('');
      void qc.invalidateQueries({ queryKey: ['my-pairings'] });
      void qc.invalidateQueries({ queryKey: ['my-appeals'] });
    },
    onError: (e) =>
      toast({ title: 'Không gửi được khiếu nại', description: (e as Error).message, tone: 'error' }),
  });

  if (!user) return <EmptyState title="Đăng nhập để xem trận của đội" />;
  if (!user.teamId) return <EmptyState title="Bạn chưa có đội trong giải hiện tại" />;
  return (
    <div className="flex flex-col gap-4">
      <LevelBotCard tournamentId={tournamentId} />
      {mine.isLoading && <Spinner label="Đang tải trận của đội" />}
      {mine.error && (
        <Alert tone="error" title="Không tải được trận của đội">
          {(mine.error as Error).message}
        </Alert>
      )}
      {mine.data?.length === 0 && (
        <EmptyState title="Đội chưa có cặp đấu nào" description="Cặp đấu xuất hiện khi BTC ghép vòng." />
      )}
      {mine.data && mine.data.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.data.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {pairingLabel(p)}
                  </p>
                  <Badge>{KIND_LABEL[p.kind]}</Badge>
                </div>
                <PairingLine p={p} />
                {p.roomId ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/rooms/${p.roomId}`}>
                      {p.status === 'done' ? 'Xem lại trận' : 'Vào phòng'}
                    </Link>
                  </Button>
                ) : p.status === 'scheduled' ? (
                  <p className="text-sm text-ink-muted">Chờ BTC mở phòng thi đấu.</p>
                ) : null}
                {p.games.length > 0 && (
                  <p className="font-mono text-xs text-ink-muted">
                    Ván/hiệp:{' '}
                    {p.games
                      .map((g) =>
                        g === null
                          ? 'H'
                          : g === 'a'
                            ? p.teamA?.id === user.teamId
                              ? 'T'
                              : 'B'
                            : p.teamB?.id === user.teamId
                              ? 'T'
                              : 'B',
                      )
                      .join(' ')}
                    <span className="sr-only"> (T: đội bạn thắng, B: đội bạn thua, H: hòa)</span>
                  </p>
                )}
                <div className="mt-auto">
                  {p.canAppeal ? (
                    <Button size="sm" variant="secondary" onClick={() => setTarget(p)}>
                      Gửi khiếu nại
                    </Button>
                  ) : (
                    p.appealBlockedReason && <p className="text-xs text-ink-muted">{p.appealBlockedReason}</p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {appeals.data && appeals.data.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-bold">Khiếu nại của đội</h3>
          <ul className="flex flex-col gap-2">
            {appeals.data.map((a) => (
              <li key={a.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{pairingLabel(a.pairing)}</span>
                  <Badge tone={APPEAL_STATUS[a.status].tone}>{APPEAL_STATUS[a.status].label}</Badge>
                </div>
                <p className="mt-1 text-ink-muted">{a.body}</p>
                {a.decision && (
                  <p className="mt-1">
                    Quyết định: {a.decision}
                    {a.action === 'rerun' ? ' (thi lại cặp)' : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Gửi khiếu nại chính thức"
        description={
          target
            ? `${pairingLabel(target)} · ${target.teamA?.name ?? ''} vs ${target.teamB?.name ?? ''}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Hủy
            </Button>
            <Button
              loading={submit.isPending}
              disabled={body.trim().length < 10}
              onClick={() => submit.mutate()}
            >
              Gửi khiếu nại
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Ván/hiệp số"
              inputMode="numeric"
              value={gameNo}
              onChange={(e) => setGameNo(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              label="Nước số"
              inputMode="numeric"
              value={moveNo}
              onChange={(e) => setMoveNo(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <TextArea label="Nội dung (tối thiểu 10 ký tự)" value={body} onChange={setBody} />
          <TextArea label="Bằng chứng (đường dẫn, mô tả)" value={evidence} onChange={setEvidence} rows={2} />
          <p className="text-xs text-ink-muted">
            Khiếu nại không tự dừng trận hay đổi kết quả. Khiếu nại đang mở chặn việc chốt vòng cho tới khi
            được xử lý.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
