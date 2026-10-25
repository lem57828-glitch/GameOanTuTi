import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, CardHeader, Select } from '@arena/ui';
import type { TournamentView } from '@arena/contracts';
import { api } from '../../lib/api';
import { refreshRoomLists, roomOpenFeedback, type OpenRoomsResult, type RoomsSummary } from './room-actions';

/** Admin-only entry into the existing tournament pairing flow; never POSTs to the unfinished /rooms route. */
export function RoomManagement({ userId, onOpened }: { userId: string; onOpened: () => void }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const tournaments = useQuery({
    queryKey: ['admin-tournaments', userId],
    queryFn: () => api<TournamentView[]>('/admin/tournaments'),
  });
  const published = (tournaments.data ?? []).filter((item) => item.status !== 'draft');
  const tournamentId = published.find((item) => item.id === selected)?.id ?? published[0]?.id ?? '';
  const summary = useQuery({
    queryKey: ['competition', tournamentId, 'rooms'],
    queryFn: () =>
      api<RoomsSummary>(`/admin/tournaments/${encodeURIComponent(tournamentId)}/matches/summary`),
    enabled: !!tournamentId,
    refetchInterval: 5000,
  });
  const open = useMutation({
    mutationFn: (id: string) =>
      api<OpenRoomsResult>(`/admin/tournaments/${encodeURIComponent(id)}/matches/open`, { method: 'POST' }),
    onSuccess: async (result) => {
      if (result.opened > 0) onOpened();
      await refreshRoomLists(client);
    },
  });
  const feedback = open.data ? roomOpenFeedback(open.data) : null;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title="Mở phòng thi đấu"
        subtitle="Dùng các cặp đấu đã được ghép trong giải. Những phòng đang có được giữ nguyên."
      />
      {tournaments.isLoading && <p role="status">Đang tải giải để mở phòng…</p>}
      {tournaments.error && (
        <Alert
          tone="error"
          title="Không tải được danh sách giải"
          action={
            <Button variant="secondary" onClick={() => void tournaments.refetch()}>
              Thử lại
            </Button>
          }
        >
          {tournaments.error.message}
        </Alert>
      )}
      {published.length > 0 && (
        <>
          <Select
            label="Giải cần mở phòng"
            value={tournamentId}
            disabled={open.isPending}
            onValueChange={(value) => {
              setSelected(value);
              open.reset();
            }}
            options={published.map((item) => ({ value: item.id, label: item.name }))}
          />
          {summary.isLoading && <p role="status">Đang kiểm tra các cặp đấu…</p>}
          {summary.error && (
            <Alert
              tone="error"
              title="Không kiểm tra được các cặp đấu"
              action={
                <Button variant="secondary" onClick={() => void summary.refetch()}>
                  Thử lại
                </Button>
              }
            >
              {summary.error.message}
            </Alert>
          )}
          {summary.data && (
            <p className="text-sm text-ink-muted" role="status">
              {summary.data.notOpened > 0
                ? `${summary.data.notOpened} cặp đang chờ mở phòng. Phòng mới sẽ xuất hiện trong danh sách bên dưới.`
                : 'Không có cặp đang chờ mở phòng. Vào điều hành để ghép vòng hoặc kiểm tra giai đoạn thi đấu.'}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              loading={open.isPending}
              disabled={!summary.data || !!summary.error || summary.data.notOpened === 0}
              onClick={() => open.mutate(tournamentId)}
            >
              Mở phòng cho các cặp đang chờ
            </Button>
            <Button asChild variant="secondary">
              <Link to="/admin">Điều hành và ghép vòng</Link>
            </Button>
          </div>
        </>
      )}
      {tournaments.isSuccess && published.length === 0 && (
        <p className="text-sm text-ink-muted">
          Chưa có giải được công bố.{' '}
          <Link className="text-accent underline" to="/admin">
            Mở khu vực BTC
          </Link>{' '}
          để cấu hình và công bố giải trước.
        </p>
      )}
      {open.error && (
        <Alert tone="error" title="Không mở được phòng">
          {open.error.message}
        </Alert>
      )}
      {feedback && (
        <Alert tone={feedback.tone} title={feedback.title}>
          {feedback.description && <p className="whitespace-pre-wrap break-words">{feedback.description}</p>}
        </Alert>
      )}
    </Card>
  );
}
