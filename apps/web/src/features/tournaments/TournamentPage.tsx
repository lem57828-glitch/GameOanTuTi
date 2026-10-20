// Giải đấu. TV3 phát triển tiếp: sơ loại Swiss, tranh suất Top 32, cây 32→4, bảng xếp hạng, khiếu nại.
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner, Tabs } from '@arena/ui';
import type { TournamentView } from '@arena/contracts';
import { api, isApiError } from '../../lib/api';

const STAGE_STATUS: Record<string, string> = {
  planned: 'Dự kiến',
  open: 'Đang mở',
  running: 'Đang diễn ra',
  finished: 'Đã xong',
  confirmed: 'Đã chốt',
};

export function TournamentPage() {
  const q = useQuery({
    queryKey: ['tournament', 'current'],
    queryFn: () => api<TournamentView>('/tournaments/current'),
  });
  const t = q.data;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Giải đấu</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
          {t?.name ?? 'Giải đấu hiện tại'}
        </h1>
        {t?.isDemo && (
          <p className="mt-2">
            <Badge tone="warning">Giải mẫu — không phải lịch thi chính thức</Badge>
          </p>
        )}
      </header>
      {q.isLoading && <Spinner label="Đang tải giải đấu" />}
      {isApiError(q.error, 'NOT_FOUND') && <EmptyState title="Chưa có giải đấu nào đang mở" />}
      {q.error && !isApiError(q.error, 'NOT_FOUND') && (
        <Alert tone="error" title="Không tải được giải đấu">
          {(q.error as Error).message}
        </Alert>
      )}
      {t && (
        <Tabs
          label="Thông tin giải"
          items={[
            {
              value: 'stages',
              label: 'Giai đoạn',
              content: (
                <ol className="grid gap-3 md:grid-cols-2">
                  {t.stages.map((s) => (
                    <li key={s.id}>
                      <Card className="h-full">
                        <CardHeader
                          title={`${s.ord}. ${s.name}`}
                          subtitle={s.kind === 'qualifier' ? 'Vòng sơ loại' : 'Loại trực tiếp'}
                          action={<Badge>{STAGE_STATUS[s.status] ?? s.status}</Badge>}
                        />
                        <p className="text-sm text-ink-muted">
                          {s.kind === 'qualifier'
                            ? 'Số ván mỗi trận, số vòng Swiss, bye, tránh tái đấu và tie-break đang chờ chốt (docs/DECISIONS.md).'
                            : 'Top 32 → Top 4. Bán kết và chung kết đổi luật là giai đoạn sau, chưa thuộc M0.'}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ol>
              ),
            },
            {
              value: 'standings',
              label: 'Bảng xếp hạng',
              content: (
                <EmptyState
                  icon="≡"
                  title="Chưa có bảng xếp hạng"
                  description="Tính điểm và xếp hạng sơ loại chưa được triển khai ở M0 (TV3). API trả 501."
                />
              ),
            },
            {
              value: 'results',
              label: 'Kết quả mẫu',
              content: (
                <Alert tone="info" title="Kết quả ván mô phỏng nằm ở phòng đấu mẫu">
                  Các ván do BTC tạo ở khu vực BTC chỉ dùng để kiểm tra hệ thống, không tính vào giải.
                </Alert>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
