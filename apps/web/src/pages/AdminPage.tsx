import { FeatureHero, ServiceMark } from '../components/WorkspaceVisuals';
import { LoadingState } from '@arena/ui';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, CardHeader, Input, Tabs } from '@arena/ui';
import type { JobView, ServiceHealth } from '@arena/contracts';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { TournamentAdmin } from '../features/tournaments/TournamentAdmin';
import { AppealsAdmin, CompetitionAdmin } from '../features/tournaments/CompetitionAdmin';
import { refreshRoomLists } from '../features/rooms-matches/room-actions';

type CreatedGame = { job: JobView; gameId: string; roomId: string; created: boolean };

export function AdminPage() {
  const client = useQueryClient();
  const { user } = useSession();
  const [requestKey, setRequestKey] = useState<string>(() => crypto.randomUUID());
  const health = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => api<ServiceHealth>('/admin/health'),
    refetchInterval: 3000,
  });
  const create = useMutation({
    mutationFn: () => api<CreatedGame>('/demo/games', { method: 'POST', json: { requestKey } }),
    onSuccess: () => refreshRoomLists(client),
  });
  const job = useQuery({
    queryKey: ['job', create.data?.job.id],
    queryFn: () => api<JobView>(`/jobs/${create.data!.job.id}`),
    enabled: !!create.data?.job.id,
    refetchInterval: 1000,
  });
  const h = health.data;
  return (
    <div className="flex flex-col gap-6">
      <FeatureHero variant="control" slogan="Mỗi giai đoạn rõ ràng. Mỗi kết quả được xác nhận." compact>
        <p className="text-sm font-semibold text-accent">Điều hành</p>
        <h1 className="text-3xl font-black">Khu vực BTC</h1>
      </FeatureHero>
      <Tabs
        label="Khu vực BTC"
        defaultValue="competition"
        items={[
          { value: 'competition', label: 'Điều hành thi đấu', content: <CompetitionAdmin /> },
          { value: 'appeals', label: 'Khiếu nại', content: <AppealsAdmin /> },
          { value: 'config', label: 'Cấu hình giải', content: <TournamentAdmin /> },
          {
            value: 'system',
            label: h?.demoMode ? 'Dịch vụ & ván demo' : 'Dịch vụ',
            content: (
              <div className="flex flex-col gap-6">
                {health.isLoading && <LoadingState label="Kiểm tra dịch vụ" />}
                {health.error && (
                  <Alert tone="error" title="Không tải được sức khỏe dịch vụ">
                    {health.error.message}
                  </Alert>
                )}
                {h && (
                  <>
                    <div className="service-topology">
                      {[
                        ['PostgreSQL', h.database, 'database'],
                        ['Redis', h.redis, 'cache'],
                        ['Worker', h.worker.alive, 'worker'],
                      ].map(([name, up, kind]) => (
                        <Card className="system-service" key={String(name)}>
                          <ServiceMark kind={kind as 'database' | 'cache' | 'worker'} />
                          <div>
                            <p className="mb-3 font-semibold">{name}</p>
                            <Badge tone={up ? 'success' : 'warning'}>
                              {up ? 'Đang hoạt động' : 'Chưa sẵn sàng'}
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                    <Card>
                      <CardHeader title="Hàng đợi và phục hồi" />
                      <dl className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
                        <div>
                          Đang đợi: {h.queue?.waiting ?? '—'} · Đang chạy: {h.queue?.active ?? '—'} · Lỗi:{' '}
                          {h.queue?.failed ?? '—'}
                        </div>
                        <div>
                          Outbox chưa phát: {h.outbox.pending} · Phát lại khi khởi động:{' '}
                          {h.outbox.replayedOnStartup}
                        </div>
                        <div>Worker: {h.worker.workerId ?? 'Chưa kết nối'}</div>
                        <div>
                          Máy chủ: {h.environment} · {new Date(h.serverTime).toLocaleTimeString('vi-VN')}
                        </div>
                      </dl>
                    </Card>
                    {!h.worker.alive && (
                      <Alert tone="warning" title="Worker chưa chạy">
                        Ván được lưu và chờ trong hàng đợi. Khởi động worker để tiếp tục.
                      </Alert>
                    )}
                  </>
                )}
                {h?.demoMode && user?.role === 'admin' && (
                  <Card>
                    <CardHeader
                      title="Tạo ván mô phỏng"
                      subtitle="Alpha và Beta · Bot tin cậy · Không tính vào giải"
                    />
                    <div className="flex flex-col gap-4">
                      <Input
                        label="Mã yêu cầu (requestKey)"
                        value={requestKey}
                        onChange={(e) => setRequestKey(e.target.value)}
                      />
                      <p className="text-xs text-ink-muted">
                        Gửi lại cùng mã sẽ nhận lại ván đã tạo. Dùng mã mới để tạo ván tiếp theo sau khi phòng
                        rảnh.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          disabled={!h?.demoMode || !requestKey}
                          loading={create.isPending}
                          onClick={() => create.mutate()}
                        >
                          Tạo ván mô phỏng
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setRequestKey(crypto.randomUUID());
                            create.reset();
                          }}
                        >
                          Mã yêu cầu mới
                        </Button>
                      </div>
                    </div>
                    {create.error && (
                      <div className="mt-4">
                        <Alert tone="error" title="Không tạo được ván">
                          {create.error.message}
                        </Alert>
                      </div>
                    )}
                    {create.data && (
                      <div className="mt-4">
                        <Alert
                          tone="success"
                          title={create.data.created ? 'Đã tạo ván' : 'Đã có ván với mã yêu cầu này'}
                        >
                          <p>
                            Trạng thái: {job.data?.status ?? 'Đang tải'} · Lần chạy: {job.data?.attempts ?? 0}
                          </p>
                          {job.data?.lastError && <p>{job.data.lastError}</p>}
                          <Link
                            className="mt-2 inline-block font-bold underline"
                            to={`/rooms/${create.data.roomId}`}
                          >
                            Vào phòng đấu →
                          </Link>
                        </Alert>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
