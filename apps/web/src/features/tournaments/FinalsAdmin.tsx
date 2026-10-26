// Bán kết, chung kết offline (BTC): nhận bài từ USB của BTC → khóa bài → sandbox kiểm tra → thi đấu trình chiếu → chốt.
// Mọi thao tác gửi kèm lý do và được ghi audit; bài nộp là phiên bản bot bất biến kèm SHA-256 để đối chiếu.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader, Select, Table, useToast } from '@arena/ui';
import type { FinalsRoundView, FinalsView, PairingView, PieceType } from '@arena/contracts';
import { api } from '../../lib/api';
import { PIECE_LABEL } from '../../components/Board';
import { PairingLine } from './competition-ui';
import { FINALS_STATUS, RULESET_LABEL } from './finals-ui';

const MAX_BYTES = 500_000;

/** Quy trình 6 bước của đặc tả. */
const STEPS = [
  { title: 'Kiểm tra thiết bị', time: '15 phút' },
  { title: 'Công bố luật mới, phát bộ kiểm thử offline', time: '15 phút' },
  { title: 'Thí sinh chỉnh sửa bot (không Internet)', time: '90–120 phút' },
  { title: 'Thu mã nguồn qua USB của BTC, khóa bài', time: '10–15 phút' },
  { title: 'Kiểm tra bot trong sandbox, lưu mã hash', time: '20 phút' },
  { title: 'Thi đấu trực tiếp, trình chiếu màn hình lớn', time: '30–60 phút' },
];
/** Các bước đang diễn ra theo trạng thái vòng: [từ, tới] (chỉ số bước); trước "từ" là đã xong. */
const ACTIVE_STEPS: Record<FinalsRoundView['status'], [number, number]> = {
  waiting: [0, -1],
  collecting: [0, 3],
  locked: [4, 4],
  running: [5, 5],
  finished: [6, 5],
  done: [6, 5],
};

export function FinalsAdmin({
  tid,
  reason,
  isAdmin,
  onAdjudicate,
}: {
  tid: string;
  reason: string;
  isAdmin: boolean;
  onAdjudicate: (p: PairingView) => void;
}) {
  const q = useQuery({
    queryKey: ['finals-admin', tid],
    queryFn: () => api<FinalsView | null>(`/admin/tournaments/${tid}/finals`),
    refetchInterval: 4000,
  });
  const f = q.data;
  if (!f) return null;
  return (
    <>
      {f.champion && (
        <Card className="border-success/60">
          <CardHeader
            title={`Vô địch: ${f.champion.name}`}
            subtitle={f.runnerUp ? `Á quân: ${f.runnerUp.name}` : undefined}
            action={<Badge tone="success">Giải đã kết thúc</Badge>}
          />
        </Card>
      )}
      {f.rounds
        .filter((r) => r.status !== 'waiting')
        .map((r) => (
          <FinalsRound
            key={r.phase}
            tid={tid}
            r={r}
            reason={reason}
            isAdmin={isAdmin}
            onAdjudicate={onAdjudicate}
          />
        ))}
    </>
  );
}

function FinalsRound({
  tid,
  r,
  reason,
  isAdmin,
  onAdjudicate,
}: {
  tid: string;
  r: FinalsRoundView;
  reason: string;
  isAdmin: boolean;
  onAdjudicate: (p: PairingView) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['finals-admin', tid] });
    void qc.invalidateQueries({ queryKey: ['competition', tid] });
  };
  const step = useMutation({
    mutationFn: ({ action }: { action: 'lock' | 'start' | 'confirm'; label: string }) =>
      api(`/admin/tournaments/${tid}/finals/${r.phase}/${action}`, { method: 'POST', json: { reason } }),
    onSuccess: (_d, v) => {
      toast({ title: v.label, tone: 'success' });
      refresh();
    },
    onError: (e, v) =>
      toast({ title: `Không thực hiện được: ${v.label}`, description: (e as Error).message, tone: 'error' }),
  });
  const subs = new Map(r.submissions.map((s) => [s.teamId, s]));
  const checking = r.submissions.filter((s) => s.status === 'pending').length;
  const missing = r.teams.filter((t) => subs.get(t.id)?.status !== 'valid');
  const [from, to] = ACTIVE_STEPS[r.status];
  return (
    <Card className="border-accent/40">
      <CardHeader
        title={`${r.title} · BO${r.bestOf} (thắng ${r.winsNeeded} ván trước) · offline`}
        subtitle={RULESET_LABEL[r.rulesetId] ?? r.rulesetId}
        action={<Badge tone={FINALS_STATUS[r.status].tone}>{FINALS_STATUS[r.status].label}</Badge>}
      />
      <ol className="mb-4 grid gap-1 text-sm sm:grid-cols-2" aria-label={`Quy trình ${r.title}`}>
        {STEPS.map((s, i) => {
          const state = i < from ? 'done' : i <= to ? 'now' : 'later';
          return (
            <li
              key={s.title}
              className={
                state === 'now'
                  ? 'font-semibold text-accent'
                  : state === 'done'
                    ? 'text-ink-muted line-through'
                    : ''
              }
            >
              Bước {i + 1}. {s.title} <span className="text-xs text-ink-muted">({s.time})</span>
            </li>
          );
        })}
      </ol>
      {r.status === 'collecting' && (
        <Alert tone="info" title="Nhận bài trên máy nhận bài cách ly">
          Cắm USB của BTC, chọn file .py của từng đội và quân thứ 10 đội đăng ký. Nộp lại trước khi khóa thì
          thay bài cũ (mọi bản đã nhận vẫn được lưu kèm mã hash). Bộ kiểm thử offline cho thí sinh nằm trong
          thư mục offline-kit/ của mã nguồn — chép vào USB phát cho các đội ở bước 2.
        </Alert>
      )}
      <div className="mt-3">
        <Table
          label={`Bài nộp ${r.title}`}
          rows={r.teams}
          rowKey={(t) => t.id}
          columns={[
            { key: 'team', header: 'Đội', cell: (t) => <span className="font-semibold">{t.name}</span> },
            {
              key: 'file',
              header: 'Bài nhận qua USB',
              cell: (t) => {
                const s = subs.get(t.id);
                return s ? (
                  <span className="text-sm">
                    {s.fileName ?? 'bot.py'} · v{s.version} · quân thứ 10: {PIECE_LABEL[s.extraType]}
                    <span className="block text-xs text-ink-muted">
                      {new Date(s.receivedAt).toLocaleString('vi-VN')}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-muted">Chưa nhận</span>
                );
              },
            },
            {
              key: 'hash',
              header: 'SHA-256',
              className: 'font-mono text-xs',
              cell: (t) => {
                const s = subs.get(t.id);
                return s ? <span title={s.sourceHash}>{s.sourceHash.slice(0, 16)}…</span> : '—';
              },
            },
            {
              key: 'check',
              header: 'Kiểm tra',
              cell: (t) => {
                const s = subs.get(t.id);
                if (!s) return '—';
                return (
                  <details>
                    <summary className="cursor-pointer">
                      <Badge
                        tone={
                          s.status === 'valid' ? 'success' : s.status === 'invalid' ? 'danger' : 'warning'
                        }
                      >
                        {s.status === 'valid'
                          ? 'Hợp lệ'
                          : s.status === 'invalid'
                            ? 'Không hợp lệ'
                            : 'Đang kiểm tra'}
                      </Badge>
                    </summary>
                    <pre className="mt-2 max-h-48 max-w-md overflow-auto whitespace-pre-wrap text-xs text-ink-muted">
                      {s.validationLog ?? '—'}
                    </pre>
                  </details>
                );
              },
            },
            ...(r.status === 'collecting' && isAdmin
              ? [
                  {
                    key: 'upload',
                    header: 'Nhận bài',
                    cell: (t: { id: string }) => (
                      <UploadCell tid={tid} phase={r.phase} teamId={t.id} reason={reason} onDone={refresh} />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {r.pairings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" aria-label={`Cặp đấu ${r.title}`}>
          {r.pairings.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <PairingLine p={p} />
              <div className="flex flex-wrap gap-3 text-sm">
                {p.roomId && (
                  <Link className="font-semibold text-accent" to={`/rooms/${p.roomId}`} target="_blank">
                    Mở phòng để trình chiếu ↗
                  </Link>
                )}
                {isAdmin && p.status === 'scheduled' && r.status === 'running' && (
                  <Button size="sm" variant="secondary" onClick={() => onAdjudicate(p)}>
                    Phân xử / Nhập kết quả
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {r.status === 'collecting' && (
            <Button
              loading={step.isPending}
              onClick={() => step.mutate({ action: 'lock', label: 'Đã khóa bài' })}
            >
              Hết giờ: khóa bài ({r.submissions.length}/{r.teams.length} đội đã nộp)
            </Button>
          )}
          {r.status === 'locked' && (
            <>
              <Button
                loading={step.isPending}
                disabled={checking > 0}
                onClick={() => step.mutate({ action: 'start', label: 'Đã bắt đầu thi đấu' })}
              >
                Bắt đầu thi đấu
              </Button>
              <span className="text-sm text-ink-muted">
                {checking
                  ? `Còn ${checking} bài đang kiểm tra trong sandbox…`
                  : missing.length
                    ? `Đội không có bài hợp lệ bị xử thua: ${missing.map((t) => t.name).join(', ')}.`
                    : 'Mọi bài đã hợp lệ.'}
              </span>
            </>
          )}
          {r.status === 'running' && (
            <span className="text-sm text-ink-muted">
              Phòng mở ở mục "Mở phòng thi đấu" phía trên; mỗi trận chạy liên tục tới khi một đội đủ{' '}
              {r.winsNeeded} ván thắng.
            </span>
          )}
          {r.status === 'finished' && (
            <Button
              loading={step.isPending}
              onClick={() =>
                step.mutate({
                  action: 'confirm',
                  label: r.phase === 'sf' ? 'Đã chốt bán kết, tạo chung kết' : 'Đã chốt chung kết',
                })
              }
            >
              {r.phase === 'sf' ? 'Chốt bán kết → tạo chung kết' : 'Chốt chung kết, công bố vô địch'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function UploadCell({
  tid,
  phase,
  teamId,
  reason,
  onDone,
}: {
  tid: string;
  phase: string;
  teamId: string;
  reason: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [extra, setExtra] = useState<PieceType>('PAPER');
  const send = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Chọn file .py từ USB.');
      if (file.size > MAX_BYTES) throw new Error('File tối đa 500KB.');
      const sourceCode = await file.text();
      return api<{ sourceHash: string; version: number }>(
        `/admin/tournaments/${tid}/finals/${phase}/submissions`,
        {
          method: 'POST',
          json: { teamId, fileName: file.name, sourceCode, extraType: extra, reason },
        },
      );
    },
    onSuccess: (d) => {
      toast({
        title: `Đã nhận bài v${d.version}`,
        description: `SHA-256 ${d.sourceHash.slice(0, 16)}…`,
        tone: 'success',
      });
      setFile(null);
      onDone();
    },
    onError: (e) => toast({ title: 'Không nhận được bài', description: (e as Error).message, tone: 'error' }),
  });
  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        accept=".py,text/x-python"
        aria-label="File mã nguồn .py từ USB"
        className="text-xs"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-end gap-2">
        <Select
          label="Quân thứ 10"
          value={extra}
          onValueChange={(v) => setExtra(v as PieceType)}
          options={(['ROCK', 'PAPER', 'SCISSORS'] as const).map((t) => ({ value: t, label: PIECE_LABEL[t] }))}
        />
        <Button size="sm" loading={send.isPending} disabled={!file} onClick={() => send.mutate()}>
          Nhận bài
        </Button>
      </div>
    </div>
  );
}
