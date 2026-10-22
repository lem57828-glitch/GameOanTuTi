// Phong bì sự kiện (đặc tả M0 mục 14, 17). Mỗi sự kiện thuộc một stream có seq tăng dần;
// client bỏ qua sự kiện có seq ≤ seq đã có, và tải snapshot khi thiếu seq hoặc stream đổi.
import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';
import { CoinResult, MoveRecord } from './rooms.js';
import { GameEndReason, Side } from './bots.js';

export const EVENT_SCHEMA_VERSION = 1 as const;

const envelope = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    eventId: Id,
    type: z.literal(type),
    schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
    /** Thực thể gốc của sự kiện, ví dụ roomId. */
    aggregateId: Id,
    streamId: z.string(),
    seq: z.number().int().positive(),
    occurredAt: IsoDateTime,
    payload,
  });

export const GameCreatedEvent = envelope(
  'game.created',
  z.object({ gameId: Id, rulesetId: z.string(), coin: CoinResult }),
);
export const GameStartedEvent = envelope(
  'game.started',
  z.object({ gameId: Id, attemptId: Id, attemptNo: z.number().int().positive() }),
);
export const GameMoveEvent = envelope('game.move', z.object({ gameId: Id, move: MoveRecord }));
export const GameFinishedEvent = envelope(
  'game.finished',
  z.object({
    gameId: Id,
    winner: Side.nullable(),
    winnerTeamId: Id.nullable(),
    reason: GameEndReason,
    plies: z.number().int().nonnegative(),
    piecesLeft: z.object({ blue: z.number().int(), pink: z.number().int() }),
  }),
);
export const GameFailedEvent = envelope('game.failed', z.object({ gameId: Id, error: z.string() }));

export const RoomEvent = z.discriminatedUnion('type', [
  GameCreatedEvent,
  GameStartedEvent,
  GameMoveEvent,
  GameFinishedEvent,
  GameFailedEvent,
]);
export type RoomEvent = z.infer<typeof RoomEvent>;
export type RoomEventType = RoomEvent['type'];

/** TV4 → TV3: trận kết thúc, chờ TV3 chốt chính thức (chưa dùng trong M0, giữ hợp đồng). */
export const MatchCompleted = z.object({
  matchId: Id,
  pairId: Id,
  winnerTeamId: Id.nullable(),
  games: z.array(z.object({ gameId: Id, winnerTeamId: Id.nullable() })),
  resultVersion: z.number().int().positive(),
});
export type MatchCompleted = z.infer<typeof MatchCompleted>;

/**
 * Tên khóa Redis dùng chung giữa API và worker. `prefix` = QUEUE_PREFIX (mặc định "arena"),
 * để kiểm thử tích hợp chạy song song với môi trường dev mà không lẫn dữ liệu.
 */
export const redisKeys = (prefix: string) => ({
  /** Hàng đợi BullMQ chạy ván. */
  gameQueue: 'arena-games',
  /** Kênh pub/sub worker → API: "đã lưu sự kiện mới của phòng" (nội dung đã bền vững trong PostgreSQL). */
  roomSignals: `${prefix}:room-events`,
  /** Heartbeat worker (giá trị JSON {workerId, at}, hết hạn sau vài giây). */
  workerHeartbeat: `${prefix}:worker:heartbeat`,
});

export const RoomSignal = z.object({ roomId: Id, gameId: Id });
export type RoomSignal = z.infer<typeof RoomSignal>;
