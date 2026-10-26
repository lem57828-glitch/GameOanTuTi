// TV4 — phòng đấu, snapshot, sự kiện (đặc tả M0 mục 14, 16–18).
import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';

const Count = z.number().int().nonnegative();
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
  /** Chung kết: quân dừng ở ô đổi loại → loại mới sau nước đi. Không có ở luật chuẩn. */
  promoted: PieceType.optional(),
});
export type MoveRecord = z.infer<typeof MoveRecord>;

/** Biến thể bàn cờ bán kết/chung kết để client vẽ vật cản và ô đặc biệt ở mọi nước (live và replay). */
export const BoardVariant = z.object({
  fixed: z.array(Square),
  /** Vật cản động: trước nước ply+1 ở path[floor(ply / every) % path.length]. */
  moving: z.array(z.object({ path: z.array(Square).min(1), every: z.number().int().positive() })),
  special: z.array(z.object({ square: Square, kind: z.enum(['shield', 'swap']) })),
});
export type BoardVariant = z.infer<typeof BoardVariant>;

/** Ô vật cản trước nước ply+1 — cùng công thức với game-engine (obstaclesAt). */
export function variantObstacles(v: BoardVariant, ply: number): string[] {
  const moving = v.moving.map((o) => o.path[Math.floor(ply / o.every) % o.path.length]!);
  return [...new Set([...v.fixed, ...moving])].sort();
}

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
// ---------------------------------------------------------------- Trận nhiều hiệp (TV4)

/** Phòng của một cặp đấu TV3 có id cố định để các trang khác dẫn link mà không cần tra cứu. */
export const pairingRoomId = (pairingId: string) => `room_p_${pairingId}`;

export const MatchKind = z.enum(['demo', 'swiss', 'tiebreak', 'knockout', 'semifinal', 'final']);
export type MatchKind = z.infer<typeof MatchKind>;
export const MatchStatus = z.enum(['open', 'selecting', 'running', 'paused', 'completed', 'cancelled']);
export type MatchStatus = z.infer<typeof MatchStatus>;

/** Trạng thái lựa chọn của một đội cho hiệp đang chọn. KHÔNG chứa bot/quân đã chọn (giữ kín). */
export const SelectionState = z.object({ chosen: z.boolean(), ready: z.boolean() });

export const MatchGameView = z.object({
  no: Count,
  gameId: Id,
  status: z.string(),
  /** Theo góc nhìn đội A: a thắng, b thắng, null hòa / chưa xong. */
  outcome: z.enum(['a', 'b']).nullable(),
  finished: z.boolean(),
  blueTeamId: Id.nullable(),
  /** Lựa chọn đã khóa — chỉ công bố sau khi khóa. */
  choices: z.object({
    a: z.object({ botLabel: z.string(), extraType: PieceType }),
    b: z.object({ botLabel: z.string(), extraType: PieceType }),
  }),
});
export type MatchGameView = z.infer<typeof MatchGameView>;

export const MatchView = z.object({
  matchId: Id,
  pairingId: Id.nullable(),
  kind: MatchKind,
  status: MatchStatus,
  scoreA: Count,
  scoreB: Count,
  /** Số hiệp chính của thể thức (2 hoặc 5) và có được chọn quân thứ 10 không. */
  mainGames: Count,
  chooseExtra: z.boolean(),
  currentNo: Count,
  deadline: IsoDateTime.nullable(),
  pauseReason: z.string().nullable(),
  selection: z.object({ a: SelectionState, b: SelectionState }).nullable(),
  games: z.array(MatchGameView),
  winnerTeamId: Id.nullable(),
});
export type MatchView = z.infer<typeof MatchView>;

/** POST /rooms/:id/choices — đội trưởng chọn kín bot (+ quân thứ 10) cho hiệp đang chọn. */
export const MatchChoiceRequest = z
  .object({ botVersionId: Id, extraType: PieceType.default('PAPER'), ready: z.boolean().default(true) })
  .strict();
export type MatchChoiceRequest = z.infer<typeof MatchChoiceRequest>;

/** Dữ liệu riêng của đội trưởng trong phòng: bot được phép và lựa chọn hiện tại của chính đội mình. */
export const MyMatchSelection = z.object({
  matchId: Id,
  gameNo: Count,
  side: z.enum(['a', 'b']),
  isCaptain: z.boolean(),
  allowedBots: z.array(z.object({ id: Id, label: z.string(), version: Count })),
  current: z.object({ botVersionId: Id, extraType: PieceType, ready: z.boolean() }).nullable(),
  canChoose: z.boolean(),
  reason: z.string().nullable(),
});
export type MyMatchSelection = z.infer<typeof MyMatchSelection>;

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
  initialBoard: Board.optional(),
  maxPlies: z.number().int().positive().optional(),
  variant: BoardVariant.nullable().optional(),
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
  /** Trận nhiều hiệp của phòng (null với phòng mẫu chỉ có ván demo). */
  match: MatchView.nullable().default(null),
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
