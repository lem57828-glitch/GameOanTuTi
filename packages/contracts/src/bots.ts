// TV2 — phiên bản bot và yêu cầu chạy một ván (đặc tả M0 mục 14).
import { z } from 'zod';
import { CONTRACT_VERSION, Id, IsoDateTime } from './common.js';

export const BotVersionStatus = z.enum(['pending', 'valid', 'invalid']);

/**
 * Phiên bản bot BẤT BIẾN. Mã nguồn và báo cáo kiểm thử riêng không nằm trong DTO công khai;
 * chỉ trả cho thành viên đội sở hữu (endpoint riêng, chưa làm trong M0).
 */
export const BotVersion = z.object({
  id: Id,
  teamId: Id,
  version: z.number().int().positive(),
  label: z.string(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 dạng hex'),
  rulesetId: z.string(),
  status: BotVersionStatus,
  createdAt: IsoDateTime,
});
export type BotVersion = z.infer<typeof BotVersion>;

export const Side = z.enum(['blue', 'pink']);
export type Side = z.infer<typeof Side>;
export const PieceType = z.enum(['ROCK', 'PAPER', 'SCISSORS']);
export type PieceType = z.infer<typeof PieceType>;

/** Lựa chọn đã khóa của một bên trước khi chạy ván. Retry phải dùng lại đúng lựa chọn này. */
export const LockedChoice = z.object({
  botVersionId: Id,
  /** Quân thứ 10 (vòng 32→4). Chưa chốt luật (DECISIONS: Q06/Q07) → null ở ruleset demo. */
  extraType: PieceType.nullable(),
});
export type LockedChoice = z.infer<typeof LockedChoice>;

/**
 * Giới hạn chạy, đơn vị ghi trong tên trường. Giá trị cho bot thật CHƯA được chốt (DECISIONS: Q10);
 * M0 chỉ dùng cho runner mô phỏng tin cậy.
 */
export const GameLimits = z.object({
  cpuMsPerMove: z.number().int().positive(),
  wallMsPerMove: z.number().int().positive(),
  startupMs: z.number().int().positive(),
  maxPlies: z.number().int().positive().max(2000),
  maxErrorsPerGame: z.number().int().positive(),
});
export type GameLimits = z.infer<typeof GameLimits>;

export const REQUEST_KEY = z
  .string()
  .min(4)
  .max(120)
  .regex(/^[A-Za-z0-9:_\-./]+$/, 'chỉ gồm chữ, số và : _ - . /');

/** TV4 → TV2: chạy MỘT ván đã khóa lựa chọn. Cùng requestKey = cùng một job logic. */
export const GameRequest = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  requestKey: REQUEST_KEY,
  gameId: Id,
  choices: z.object({ blue: LockedChoice, pink: LockedChoice }),
  rulesetId: z.string(),
  seed: z
    .number()
    .int()
    .nonnegative()
    .max(2 ** 31 - 1),
  limits: GameLimits,
});
export type GameRequest = z.infer<typeof GameRequest>;

export const GameEndReason = z.enum([
  'goal',
  'eliminate',
  'no_moves',
  'repetition',
  'max_plies',
  'errors',
  'crash',
  'timeout',
]);
export type GameEndReason = z.infer<typeof GameEndReason>;

/** TV2 → TV3/TV4: kết quả có hiệu lực của một ván. */
export const GameResult = z.object({
  requestKey: REQUEST_KEY,
  gameId: Id,
  attemptId: Id,
  winner: Side.nullable(),
  reason: GameEndReason,
  plies: z.number().int().nonnegative(),
  piecesLeft: z.object({ blue: z.number().int().nonnegative(), pink: z.number().int().nonnegative() }),
  rulesetId: z.string(),
  resultVersion: z.number().int().positive(),
  /** Tham chiếu để tải replay (danh sách sự kiện của ván). */
  replayRef: z.string(),
});
export type GameResult = z.infer<typeof GameResult>;

export const JobStatus = z.enum(['queued', 'dispatched', 'running', 'succeeded', 'failed']);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobView = z.object({
  id: Id,
  requestKey: REQUEST_KEY,
  gameId: Id,
  roomId: Id,
  status: JobStatus,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type JobView = z.infer<typeof JobView>;

/** Payload BullMQ: chỉ mang id job; worker đọc nội dung bền vững từ PostgreSQL. */
export const QueueJobData = z.object({ jobId: Id, requestKey: REQUEST_KEY });
export type QueueJobData = z.infer<typeof QueueJobData>;
