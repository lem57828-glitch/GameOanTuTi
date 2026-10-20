import type { BadgeTone } from '@arena/ui';
import type { GameEndReason, RoomStatus } from '@arena/contracts';

export const ROOM_STATUS: Record<RoomStatus, { label: string; tone: BadgeTone }> = {
  idle: { label: 'Chưa có ván', tone: 'neutral' },
  waiting: { label: 'Chờ worker', tone: 'warning' },
  running: { label: 'Đang đấu', tone: 'accent' },
  finished: { label: 'Đã kết thúc', tone: 'success' },
  failed: { label: 'Lỗi khi chạy', tone: 'danger' },
};

export const END_REASON: Record<GameEndReason, string> = {
  goal: 'Đưa quân về ô đích',
  eliminate: 'Ăn hết một loại quân của đối phương',
  no_moves: 'Đối phương hết nước đi',
  repetition: 'Lặp trạng thái',
  max_plies: 'Hết giới hạn nước — so số quân',
  errors: 'Bot lỗi quá số lần cho phép',
  crash: 'Bot dừng bất thường',
  timeout: 'Bot quá thời gian',
};

export const JOB_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Đã ghi, chờ phát', tone: 'neutral' },
  dispatched: { label: 'Trong hàng đợi', tone: 'warning' },
  running: { label: 'Worker đang chạy', tone: 'accent' },
  succeeded: { label: 'Hoàn tất', tone: 'success' },
  failed: { label: 'Thất bại', tone: 'danger' },
};
