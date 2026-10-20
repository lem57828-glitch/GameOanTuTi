// TV4 — phòng đấu, snapshot, sự kiện (đặc tả M0 mục 14, 16–18).
import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';
import { GameEndReason, PieceType, REQUEST_KEY, Side } from './bots.js';

export const Square = z.string().regex(/^[A-I][1-9]$/);
export const Piece = z.object({ side: Side, type: PieceType });
export const Board = z.record(Square, Piece);
export type Board = z.infer<typeof Board>;

export const MoveRecord = z.object({
  ply: z.number().int().positive(),
  side: Side,
  from: Square,
  to: Square,
  type: PieceType,
  capture: PieceType.nullable(),
});
export type MoveRecord = z.infer<typeof MoveRecord>;

/** Kết quả tung đồng xu: do máy chủ quyết định MỘT lần và lưu trước khi chạy ván. */
export const CoinResult = z.object({
  /** Đội thắng tung xu cầm Xanh và đi trước. */
  winnerTeamId: Id,
  blueTeamId: Id,
  pinkTeamId: Id,
  decidedAt: IsoDateTime,
});
export type CoinResult = z.infer<typeof CoinResult>;

export const RoomStatus = z.enum(['idle', 'waiting', 'running', 'finished', 'failed']);
export type RoomStatus = z.infer<typeof RoomStatus>;

export const RoomTeam = z.object({ id: Id, name: z.string() });

/**
 * Trạng thái phòng để vẽ lại khi vào phòng, tải lại trang hoặc kết nối lại.
 * streamId = `game:<gameId>`: đổi khi phòng sang ván mới → client phải bỏ trạng thái cũ và dùng snapshot.
 * Lần chạy lại (retry) của cùng ván tiếp tục stream cũ: cùng seed nên nước đã lưu không bị ghi lại.
 * Khán giả không bao giờ thấy lựa chọn kín trước thời điểm công bố.
 */
export const RoomSnapshot = z.object({
  roomId: Id,
  title: z.string(),
  isDemo: z.boolean(),
  streamId: z.string().nullable(),
  seq: z.number().int().nonnegative(),
  status: RoomStatus,
  gameId: Id.nullable(),
  rulesetId: z.string().nullable(),
  teams: z.object({ a: RoomTeam, b: RoomTeam }),
  coinResult: CoinResult.nullable(),
  board: Board,
  turn: z.object({ side: Side, ply: z.number().int().nonnegative() }).nullable(),
  history: z.array(MoveRecord),
  result: z
    .object({
      winner: Side.nullable(),
      winnerTeamId: Id.nullable(),
      reason: GameEndReason,
      plies: z.number().int().nonnegative(),
      piecesLeft: z.object({ blue: z.number().int(), pink: z.number().int() }),
    })
    .nullable(),
  job: z.object({ id: Id, status: z.string(), attempts: z.number().int() }).nullable(),
  serverTime: IsoDateTime,
  deadline: IsoDateTime.nullable(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

export const RoomListItem = z.object({
  roomId: Id,
  title: z.string(),
  isDemo: z.boolean(),
  status: RoomStatus,
  teams: z.object({ a: RoomTeam, b: RoomTeam }),
  updatedAt: IsoDateTime,
});
export type RoomListItem = z.infer<typeof RoomListItem>;

/** POST /api/v1/demo/games — BTC tạo một ván mô phỏng trong phòng mẫu. */
export const DemoGameRequest = z.object({
  requestKey: REQUEST_KEY,
  roomId: Id.optional(),
});
export type DemoGameRequest = z.infer<typeof DemoGameRequest>;

// ---------------------------------------------------------------- Socket.IO

export const SOCKET_EVENTS = {
  join: 'room.join',
  leave: 'room.leave',
  snapshot: 'room.snapshot',
  event: 'room.event',
  error: 'room.error',
} as const;

export const RoomJoinPayload = z.object({ roomId: Id });
export type RoomJoinPayload = z.infer<typeof RoomJoinPayload>;
