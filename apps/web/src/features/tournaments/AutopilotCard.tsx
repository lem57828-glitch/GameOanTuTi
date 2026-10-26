// Demo một thí sinh (chỉ giải trải nghiệm tự điều hành ở DEMO_MODE): nút "Tiếp theo" thay cho các bước BTC.
// Trận vẫn do worker chạy bot thật; nút chỉ mở khi lượt đang thi đã xong (hoặc đội cần chọn kín ở loại trực tiếp).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader, useToast } from '@arena/ui';
import type { AutopilotView } from '@arena/contracts';
import { api } from '../../lib/api';

export function AutopilotCard({ tournamentId }: { tournamentId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ['autopilot', tournamentId],
    queryFn: () => api<AutopilotView>(`/tournaments/${tournamentId}/demo/autopilot`),
    refetchInterval: 3000,
  });
  const refresh = () => {
    for (const key of ['autopilot', 'competition', 'my-pairings', 'standings', 'level-bot'])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  const next = useMutation({
    mutationFn: (useDefault: boolean) =>
      api<AutopilotView>(`/tournaments/${tournamentId}/demo/autopilot/advance`, {
        method: 'POST',
        json: useDefault ? { useDefault: true } : {},
      }),
    onSuccess: (v, useDefault) => {
      qc.setQueryData(['autopilot', tournamentId], v);
      refresh();
      // Vừa sang loại trực tiếp và đội phải chọn kín: vào thẳng phòng (người bấm muốn xem trận).
      if (!useDefault && v.needsChoice[0]) navigate(`/rooms/${v.needsChoice[0].roomId}`);
    },
    onError: (e) =>
      toast({ title: 'Chưa chuyển được bước', description: (e as Error).message, tone: 'error' }),
  });
  const v = q.data;
  if (!v) return null;
  const pct = v.waiting && v.waiting.total ? Math.round((v.waiting.done / v.waiting.total) * 100) : 0;
  return (
    <Card className="border-accent/50">
      <CardHeader
        title="Bản demo một thí sinh"
        subtitle="BTC tự động: bấm Tiếp theo để hệ thống ghép vòng, mở phòng, xác nhận kết quả và chuyển giai đoạn. Các trận vẫn do bot thật đấu."
        action={<Badge tone="accent">BTC tự động</Badge>}
      />
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="text-ink-muted">Bước tiếp theo của BTC: </span>
          <span className="font-semibold">{v.done ? 'Giải đã kết thúc' : v.step}</span>
        </p>
        {v.waiting && (
          <div aria-label="Tiến độ lượt đang thi">
            <div className="mb-1 flex justify-between text-xs text-ink-muted">
              <span>Các trận của lượt này</span>
              <span className="font-mono">
                {v.waiting.done}/{v.waiting.total} cặp xong
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {v.needsChoice.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {v.needsChoice.map((r) => (
              <li key={r.roomId}>
                <Link to={`/rooms/${r.roomId}`} className="font-semibold text-accent underline">
                  Vào phòng chọn bot và quân thứ 10 · {r.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {v.message && <Alert tone="info" title={v.message} />}
        <div className="flex flex-wrap gap-2">
          <Button
            loading={next.isPending}
            disabled={!v.canAdvance || v.needsChoice.length > 0}
            onClick={() => next.mutate(false)}
          >
            {v.done ? 'Giải đã kết thúc' : 'Tiếp theo →'}
          </Button>
          {v.needsChoice.length > 0 && (
            <Button variant="secondary" loading={next.isPending} onClick={() => next.mutate(true)}>
              Dùng lựa chọn mặc định
            </Button>
          )}
          <a href="#bang-xep-hang" className="self-center text-sm font-semibold text-accent">
            Xem bảng xếp hạng ↓
          </a>
          {!v.canAdvance && !v.done && v.waiting && (
            <span className="self-center text-xs text-ink-muted">
              Đợi các trận chạy xong (thường dưới một phút)…
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
