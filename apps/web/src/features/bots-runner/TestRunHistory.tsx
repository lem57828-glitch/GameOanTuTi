// Lịch sử đấu thử của một phiên bản bot: liệt kê các ván cũ, bấm để mở lại kết quả và xem lại từng nước.
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Spinner } from '@arena/ui';
import type { BotVersion, TestRunDetail } from '@arena/contracts';
import { api } from '../../lib/api';

const DEMO_NAME: Record<string, string> = {
  random: 'Bot mẫu Ngẫu nhiên',
  greedy: 'Bot mẫu Tham ăn',
  rusher: 'Bot mẫu Lao đích',
};

function outcome(r: TestRunDetail): { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' } {
  if (r.status === 'failed') return { label: 'Lỗi', tone: 'danger' };
  if (r.status !== 'succeeded') return { label: 'Đang chạy', tone: 'warning' };
  if (!r.winner) return { label: 'Hòa', tone: 'neutral' };
  return r.winner === r.mySide ? { label: 'Thắng', tone: 'success' } : { label: 'Thua', tone: 'danger' };
}

export function TestRunHistory({
  botId,
  bots,
  onOpen,
}: {
  botId: string;
  /** Các phiên bản bot của đội, để hiện tên đối thủ khi đấu với bot của đội. */
  bots: BotVersion[];
  onOpen: (runId: string) => void;
}) {
  const q = useQuery({
    queryKey: ['test-runs', botId],
    queryFn: () => api<TestRunDetail[]>(`/bots/${botId}/test-runs`),
  });
  const opponent = (r: TestRunDetail) => {
    if (r.opponentType === 'demo') return DEMO_NAME[r.opponentTarget] ?? r.opponentTarget;
    const b = bots.find((x) => x.id === r.opponentTarget);
    return b ? `v${b.version} · ${b.label}` : 'Bot của đội (đã xóa)';
  };
  const runs = (q.data ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  return (
    <section aria-label="Lịch sử đấu thử" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Lịch sử đấu thử</h3>
      {q.isLoading && <Spinner label="Đang tải lịch sử đấu thử" />}
      {q.data && runs.length === 0 && <p className="text-xs text-ink-muted">Bot này chưa đấu thử ván nào.</p>}
      {runs.length > 0 && (
        <ul className="max-h-60 overflow-y-auto rounded-md border border-line">
          {runs.map((r) => {
            const o = outcome(r);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 border-b border-line/60 px-3 py-2 text-xs last:border-0"
              >
                <Badge tone={o.tone}>{o.label}</Badge>
                <span className="min-w-0 flex-1 truncate">
                  vs {opponent(r)}
                  {r.plies ? ` · ${r.plies} nước` : ''}
                </span>
                <span className="text-ink-muted">{new Date(r.createdAt).toLocaleString('vi-VN')}</span>
                <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)} aria-label="Mở lại ván đấu thử">
                  Xem lại
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {(q.data?.length ?? 0) > 20 && <p className="text-xs text-ink-muted">Hiện 20 ván gần nhất.</p>}
    </section>
  );
}
