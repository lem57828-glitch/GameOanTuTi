import type { QueryClient } from '@tanstack/react-query';

/** Response from the existing pairing-based room-opening endpoint. */
export interface OpenRoomsResult {
  opened: number;
  skipped: number;
  errors: Array<{ pairingId: string; error: string }>;
}

export interface RoomsSummary {
  pending: number;
  notOpened: number;
  selecting: number;
  running: number;
  paused: number;
  completed: number;
  byGame: Array<{ no: number; selecting: number; running: number }>;
}

export function roomOpenFeedback(result: OpenRoomsResult) {
  if (result.errors.length || result.skipped > 0)
    return {
      title: result.opened > 0 ? `Đã mở ${result.opened} phòng, còn cặp chưa mở được` : 'Chưa mở được phòng',
      tone: 'error' as const,
      description: result.errors.map((item) => `${item.pairingId}: ${item.error}`).join('\n'),
    };
  return {
    title: result.opened > 0 ? `Đã mở ${result.opened} phòng thi đấu` : 'Không có cặp mới cần mở phòng',
    tone: result.opened > 0 ? ('success' as const) : ('info' as const),
    description:
      result.opened > 0
        ? 'Danh sách phòng đã được yêu cầu cập nhật.'
        : 'Các cặp đã có phòng được giữ nguyên.',
  };
}

/** Opening rooms also changes pairings and the public room list, not just the admin summary. */
export async function refreshRoomLists(client: QueryClient) {
  await Promise.all(
    [['rooms'], ['competition'], ['my-pairings']].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
