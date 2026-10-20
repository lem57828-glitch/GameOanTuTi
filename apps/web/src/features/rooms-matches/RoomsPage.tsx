import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, Spinner, Table } from '@arena/ui';
import type { RoomListItem } from '@arena/contracts';
import { api } from '../../lib/api';
import { ROOM_STATUS } from './labels';

export function RoomsPage() {
  const q = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomListItem[]>('/rooms'),
    refetchInterval: 10_000,
  });
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Phòng đấu</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Danh sách phòng</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Khách xem được mọi phòng công khai. Ở M0 chỉ có phòng mẫu chạy bot mô phỏng.
        </p>
      </header>
      {q.isLoading && <Spinner label="Đang tải danh sách phòng" />}
      {q.error && (
        <Alert
          tone="error"
          title="Không tải được danh sách phòng"
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Thử lại
            </Button>
          }
        >
          {(q.error as Error).message}
        </Alert>
      )}
      {q.data && (
        <Table
          label="Danh sách phòng đấu"
          rows={q.data}
          rowKey={(r) => r.roomId}
          empty={<EmptyState title="Chưa có phòng nào" description="Chạy pnpm db:seed để tạo phòng mẫu." />}
          columns={[
            {
              key: 'title',
              header: 'Phòng',
              cell: (r) => (
                <Link
                  to={`/rooms/${r.roomId}`}
                  className="font-semibold text-ink underline-offset-4 hover:text-accent hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {r.title}
                </Link>
              ),
            },
            { key: 'teams', header: 'Hai đội', cell: (r) => `${r.teams.a.name} vs ${r.teams.b.name}` },
            {
              key: 'status',
              header: 'Trạng thái',
              cell: (r) => (
                <Badge tone={ROOM_STATUS[r.status].tone} dot>
                  {ROOM_STATUS[r.status].label}
                </Badge>
              ),
            },
            {
              key: 'kind',
              header: 'Loại',
              cell: (r) => (r.isDemo ? <Badge tone="warning">Mô phỏng</Badge> : <Badge>Chính thức</Badge>),
            },
          ]}
        />
      )}
    </div>
  );
}
