import { FeatureHero, SectorArt, IdentityMark } from '../../components/WorkspaceVisuals';
import { LedAccent } from '../../components/LedAccent';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, Input, LoadingState, Select, Table } from '@arena/ui';
import type { RoomListItem } from '@arena/contracts';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { matchesSearch } from '../../lib/workspace-navigation';
import { ROOM_STATUS } from './labels';
import { RoomManagement } from './RoomManagement';

export function RoomsPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api<RoomListItem[]>('/rooms'),
    refetchInterval: 10_000,
  });
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const requestedStatus = params.get('status') ?? 'all';
  const status = Object.keys(ROOM_STATUS).includes(requestedStatus) ? requestedStatus : 'all';
  const kind = ['demo', 'official'].includes(params.get('kind') ?? '') ? params.get('kind')! : 'all';
  const table = params.get('view') === 'table';
  function update(name: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === 'all') next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }
  function clear() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of ['q', 'status', 'kind']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const rooms = (q.data ?? [])
    .filter(
      (room) =>
        matchesSearch(`${room.title} ${room.teams.a.name} ${room.teams.b.name}`, search) &&
        (status === 'all' || room.status === status) &&
        (kind === 'all' || room.isDemo === (kind === 'demo')),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const filtered = Boolean(search || status !== 'all' || kind !== 'all');
  return (
    <div className="feature-page rooms-page">
      <FeatureHero variant="rooms" slogan="Theo dấu quyết định. Đọc vị chiến thuật.">
        <div>
          <p className="feature-eyebrow">ĐẤU TRƯỜNG / PHÒNG ĐẤU</p>
          <h1>Chọn một trận. Theo từng nước.</h1>
          <p>Theo dõi trực tiếp hoặc xem lại các ván công khai, không cần đăng nhập.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>
          Làm mới
        </Button>
      </FeatureHero>
      {user?.role === 'admin' && <RoomManagement userId={user.id} onOpened={clear} />}
      {q.data && (
        <dl className="ui-summary">
          <div>
            <dt>Tất cả phòng</dt>
            <dd>{q.data.length}</dd>
          </div>
          <div>
            <dt>Đang diễn ra</dt>
            <dd>{q.data.filter((room) => room.status === 'running').length}</dd>
          </div>
          <div>
            <dt>Đã kết thúc</dt>
            <dd>{q.data.filter((room) => room.status === 'finished').length}</dd>
          </div>
          <div>
            <dt>Phòng chính thức</dt>
            <dd>{q.data.filter((room) => !room.isDemo).length}</dd>
          </div>
        </dl>
      )}
      <Card className="filter-toolbar">
        <Input
          label="Tìm phòng hoặc tên đội"
          type="search"
          value={search}
          onChange={(event) => update('q', event.target.value)}
          placeholder="Tên phòng, đội A, đội B…"
        />
        <Select
          label="Trạng thái"
          value={status}
          onValueChange={(value) => update('status', value)}
          options={[
            { value: 'all', label: 'Tất cả trạng thái' },
            ...Object.entries(ROOM_STATUS).map(([value, item]) => ({ value, label: item.label })),
          ]}
        />
        <Select
          label="Loại phòng"
          value={kind}
          onValueChange={(value) => update('kind', value)}
          options={[
            { value: 'all', label: 'Tất cả phòng' },
            { value: 'official', label: 'Chính thức' },
            { value: 'demo', label: 'Mô phỏng' },
          ]}
        />
      </Card>
      {q.isLoading && <LoadingState label="Đang tải danh sách phòng" />}
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
          {q.error.message}
        </Alert>
      )}
      {q.data && (
        <>
          <div className="list-toolbar">
            <p role="status">
              {rooms.length} / {q.data.length} phòng
              {q.dataUpdatedAt > 0 && (
                <span> · Cập nhật {new Date(q.dataUpdatedAt).toLocaleTimeString('vi-VN')}</span>
              )}
            </p>
            <div className="list-actions">
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  Xóa bộ lọc
                </Button>
              )}
              <div className="view-switch" role="group" aria-label="Kiểu danh sách phòng">
                <Button
                  size="sm"
                  variant={!table ? 'secondary' : 'ghost'}
                  aria-pressed={!table}
                  onClick={() => update('view', 'cards')}
                >
                  Thẻ
                </Button>
                <Button
                  size="sm"
                  variant={table ? 'secondary' : 'ghost'}
                  aria-pressed={table}
                  onClick={() => update('view', 'table')}
                >
                  Bảng
                </Button>
              </div>
            </div>
          </div>
          {rooms.length === 0 ? (
            <EmptyState
              className="sector-empty"
              icon={<SectorArt variant="rooms" />}
              title={filtered ? 'Không có phòng phù hợp' : 'Chưa có phòng nào'}
              description={
                filtered
                  ? 'Thử tên đội khác hoặc bỏ bớt điều kiện lọc.'
                  : 'Phòng sẽ xuất hiện khi BTC mở trận. Bạn có thể theo dõi thông tin giải trong lúc chờ.'
              }
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clear}>
                    Xóa bộ lọc
                  </Button>
                ) : (
                  <Button asChild variant="secondary">
                    <Link to="/tournament">Xem giải đấu</Link>
                  </Button>
                )
              }
            />
          ) : table ? (
            <Table
              label="Danh sách phòng đấu"
              rows={rooms}
              rowKey={(room) => room.roomId}
              columns={[
                {
                  key: 'title',
                  header: 'Phòng',
                  cell: (room) => (
                    <Link className="font-semibold text-accent" to={`/rooms/${room.roomId}`}>
                      {room.title}
                    </Link>
                  ),
                },
                {
                  key: 'teams',
                  header: 'Hai đội',
                  cell: (room) => `${room.teams.a.name} vs ${room.teams.b.name}`,
                },
                {
                  key: 'status',
                  header: 'Trạng thái',
                  cell: (room) => (
                    <Badge dot tone={ROOM_STATUS[room.status].tone}>
                      {ROOM_STATUS[room.status].label}
                    </Badge>
                  ),
                },
                {
                  key: 'kind',
                  header: 'Loại',
                  cell: (room) => (
                    <Badge tone={room.isDemo ? 'warning' : 'neutral'}>
                      {room.isDemo ? 'Mô phỏng' : 'Chính thức'}
                    </Badge>
                  ),
                },
              ]}
            />
          ) : (
            <div className="room-grid">
              {rooms.map((room) => (
                <Card
                  className={`room-card led-framed room-card--${room.status}`}
                  key={room.roomId}
                  data-motion-state={room.status === 'running' ? 'live' : 'idle'}
                  data-motion-stamp={`${room.status}:${room.updatedAt}`}
                >
                  <LedAccent frame variant="room-card" seed={room.roomId} />
                  <div className="room-card-top">
                    <Badge dot tone={ROOM_STATUS[room.status].tone}>
                      {ROOM_STATUS[room.status].label}
                    </Badge>
                    <span>{room.isDemo ? 'Mô phỏng' : 'Chính thức'}</span>
                  </div>
                  <h2>
                    <Link to={`/rooms/${room.roomId}`}>{room.title}</Link>
                  </h2>
                  <div className="room-versus duel-line">
                    <div className="duel-team">
                      <IdentityMark seed={room.teams.a.name} label={room.teams.a.name} />
                      <small>ĐỘI A</small>
                      <strong>{room.teams.a.name}</strong>
                    </div>
                    <div className="duel-divider" aria-label="Đối đầu">
                      <span>VS</span>
                      <i aria-hidden="true" />
                    </div>
                    <div className="duel-team">
                      <IdentityMark seed={room.teams.b.name} label={room.teams.b.name} />
                      <small>ĐỘI B</small>
                      <strong>{room.teams.b.name}</strong>
                    </div>
                  </div>
                  <div className="room-card-bottom">
                    <span>{new Date(room.updatedAt).toLocaleString('vi-VN')}</span>
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/rooms/${room.roomId}`}>
                        {room.status === 'finished' ? 'Xem lại' : 'Vào phòng'} →
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
