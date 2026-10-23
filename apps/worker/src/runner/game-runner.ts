// GameRunner che giấu cách một ván được thực thi (đặc tả M0 mục 5, 8).
// M0 chỉ có SimulatedRunner (bot mô phỏng tin cậy do hệ thống viết). Runner bot thật (sandbox, stdin/stdout,
// giới hạn CPU/RAM) là việc của TV2 sau M0 và phải cài đặt cùng interface này để TV3/TV4 không phải đổi gì.
import type { GameEndReason, GameRequest, MoveRecord, Side } from '@arena/contracts';

export interface RunOutcome {
  logs?: string;
  winner: Side | null;
  reason: GameEndReason;
  plies: number;
  piecesLeft: { blue: number; pink: number };
}

export interface GameRunner {
  /**
   * Chạy trọn một ván theo yêu cầu đã khóa. Gọi `onMove` lần lượt cho từng nước theo thứ tự ply.
   * Bắt buộc xác định theo (request.seed, lựa chọn đã khóa): chạy lại phải ra đúng các nước cũ.
   */
  run(request: GameRequest, onMove: (move: MoveRecord) => Promise<void>): Promise<RunOutcome>;
}

/** Lỗi không nên thử lại (cấu hình sai, bot không được hỗ trợ...). */
export class PermanentRunError extends Error {}
