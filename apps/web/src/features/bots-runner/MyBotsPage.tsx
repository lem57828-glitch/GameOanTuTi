// Bot của tôi. TV2 phát triển tiếp: nộp bot, kiểm thử trong sandbox, đấu thử.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Spinner, Table } from '@arena/ui';
import type { BotVersion } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

const STATUS: Record<BotVersion['status'], { label: string; tone: 'neutral' | 'success' | 'danger' }> = {
  pending: { label: 'Chờ kiểm thử', tone: 'neutral' },
  valid: { label: 'Hợp lệ', tone: 'success' },
  invalid: { label: 'Không hợp lệ', tone: 'danger' },
};

export function MyBotsPage() {
  const { user } = useSession();
  const q = useQuery({ queryKey: ['bots', user?.id], queryFn: () => api<BotVersion[]>('/bots') });
  const [detail, setDetail] = useState<BotVersion | null>(null);
  const [submitInfo, setSubmitInfo] = useState(false);
  const staff = user?.role === 'admin' || user?.role === 'referee';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bot & runner</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
            {staff ? 'Tất cả phiên bản bot' : 'Bot của tôi'}
          </h1>
        </div>
        <Button variant="secondary" onClick={() => setSubmitInfo(true)}>
          Nộp phiên bản mới
        </Button>
      </header>
      <Alert tone="info" title="Nộp bot chưa được triển khai ở M0">
        Các phiên bản dưới đây là bot mô phỏng do hệ thống viết. Hệ thống chưa nhận hoặc chạy mã do sinh viên
        gửi (TV2 phụ trách sau M0).
      </Alert>
      {q.isLoading && <Spinner label="Đang tải bot" />}
      {q.error && (
        <Alert tone="error" title="Không tải được danh sách bot">
          {(q.error as Error).message}
        </Alert>
      )}
      {q.data && (
        <Card>
          <CardHeader title="Phiên bản" subtitle="Mỗi phiên bản bất biến, định danh bằng mã băm nội dung." />
          <Table
            label="Danh sách phiên bản bot"
            rows={q.data}
            rowKey={(b) => b.id}
            empty={
              <EmptyState
                title="Chưa có phiên bản bot nào"
                description={user?.teamId ? 'Đội của bạn chưa có bot.' : 'Bạn cần thuộc một đội để có bot.'}
              />
            }
            columns={[
              {
                key: 'v',
                header: 'Phiên bản',
                cell: (b) => <span className="font-mono font-bold">v{b.version}</span>,
              },
              { key: 'label', header: 'Mô tả', cell: (b) => b.label },
              {
                key: 'status',
                header: 'Kiểm thử',
                cell: (b) => (
                  <Badge tone={STATUS[b.status].tone} dot>
                    {STATUS[b.status].label}
                  </Badge>
                ),
              },
              {
                key: 'hash',
                header: 'SHA-256',
                cell: (b) => (
                  <span className="font-mono text-xs text-ink-muted">{b.sourceHash.slice(0, 12)}…</span>
                ),
              },
              {
                key: 'act',
                header: <span className="sr-only">Thao tác</span>,
                cell: (b) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDetail(b)}
                    aria-label={`Xem chi tiết v${b.version}`}
                  >
                    Chi tiết
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Dialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? `Phiên bản v${detail.version}` : ''}
        description={detail?.label}
      >
        {detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">Trạng thái</dt>
            <dd>{STATUS[detail.status].label}</dd>
            <dt className="text-ink-muted">Ruleset</dt>
            <dd className="font-mono">{detail.rulesetId}</dd>
            <dt className="text-ink-muted">Tạo lúc</dt>
            <dd>{new Date(detail.createdAt).toLocaleString('vi-VN')}</dd>
            <dt className="text-ink-muted">SHA-256</dt>
            <dd className="break-all font-mono text-xs">{detail.sourceHash}</dd>
          </dl>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          Mã nguồn và báo cáo kiểm thử chỉ hiển thị cho thành viên đội — chưa làm ở M0 (TV2).
        </p>
      </Dialog>
      <Dialog
        open={submitInfo}
        onOpenChange={setSubmitInfo}
        title="Nộp bot chưa mở"
        description="Chức năng nộp bot từ GitHub riêng tư/tải tệp và kiểm thử trong sandbox sẽ có sau M0. API hiện trả 501 FEATURE_NOT_IMPLEMENTED."
        footer={<Button onClick={() => setSubmitInfo(false)}>Đã hiểu</Button>}
      />
    </div>
  );
}
