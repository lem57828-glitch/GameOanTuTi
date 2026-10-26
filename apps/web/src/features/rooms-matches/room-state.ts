// Áp sự kiện trực tiếp lên snapshot phòng. Hàm thuần, có kiểm thử (room-state.test.ts).
// Quy tắc (đặc tả M0 mục 17):
//  - Sự kiện khác stream hoặc nhảy cóc seq → yêu cầu tải lại snapshot ("resync"), không đoán trạng thái.
//  - Sự kiện trùng hoặc seq cũ → bỏ qua ("ignore"); sự kiện cũ không được ghi đè trạng thái mới.
import type { RoomEvent, RoomSnapshot } from '@arena/contracts';

export type ApplyResult =
  | { kind: 'applied'; snapshot: RoomSnapshot }
  | { kind: 'ignore' }
  | { kind: 'resync'; reason: string };

export function applyRoomEvent(s: RoomSnapshot, ev: RoomEvent): ApplyResult {
  if (ev.streamId !== s.streamId) return { kind: 'resync', reason: 'stream đổi' };
  if (ev.seq <= s.seq) return { kind: 'ignore' };
  if (ev.seq !== s.seq + 1) return { kind: 'resync', reason: `thiếu seq ${s.seq + 1}..${ev.seq - 1}` };
  const next: RoomSnapshot = { ...s, seq: ev.seq };
  switch (ev.type) {
    case 'game.created':
      return { kind: 'resync', reason: 'ván mới' };
    case 'game.started':
      return {
        kind: 'applied',
        snapshot: {
          ...next,
          status: 'running',
          job: s.job ? { ...s.job, status: 'running', attempts: ev.payload.attemptNo } : s.job,
        },
      };
    case 'game.move': {
      const m = ev.payload.move;
      const board = { ...s.board };
      const piece = board[m.from];
      if (!piece || piece.side !== m.side)
        return { kind: 'resync', reason: `nước ${m.from}-${m.to} không khớp bàn cờ` };
      delete board[m.from];
      // Chung kết: quân dừng ở ô đổi loại đổi sang loại mới (engine ghi trong promoted).
      board[m.to] = m.promoted ? { ...piece, type: m.promoted } : piece;
      return {
        kind: 'applied',
        snapshot: {
          ...next,
          status: 'running',
          board,
          history: [...s.history, m],
          turn: { side: m.side === 'blue' ? 'pink' : 'blue', ply: m.ply },
        },
      };
    }
    case 'game.finished': {
      const p = ev.payload;
      return {
        kind: 'applied',
        snapshot: {
          ...next,
          status: 'finished',
          turn: null,
          result: {
            winner: p.winner,
            winnerTeamId: p.winnerTeamId,
            reason: p.reason,
            plies: p.plies,
            piecesLeft: p.piecesLeft,
          },
          job: s.job ? { ...s.job, status: 'succeeded' } : s.job,
        },
      };
    }
    case 'game.failed':
      return {
        kind: 'applied',
        snapshot: {
          ...next,
          status: 'failed',
          turn: null,
          job: s.job ? { ...s.job, status: 'failed' } : s.job,
        },
      };
  }
}

/**
 * Chọn snapshot mới hơn. Cùng stream: seq lớn hơn thắng. Khác stream: bản được server tạo sau thắng
 * (tránh phản hồi HTTP chậm của ván cũ đè lên snapshot ván mới nhận qua socket).
 */
export function preferSnapshot(current: RoomSnapshot | null, incoming: RoomSnapshot): RoomSnapshot {
  if (!current) return incoming;
  if (current.streamId !== incoming.streamId)
    return Date.parse(incoming.serverTime) >= Date.parse(current.serverTime) ? incoming : current;
  return incoming.seq >= current.seq ? incoming : current;
}
