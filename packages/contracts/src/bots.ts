// TV2 — phiên bản bot và yêu cầu chạy một ván (đặc tả M0 mục 14).
import { z } from 'zod';
import { CONTRACT_VERSION, Id, IsoDateTime } from './common.js';

export const BotVersionStatus = z.enum(['pending', 'valid', 'invalid']);

/**
 * Phiên bản bot BẤT BIẾN. Mã nguồn và báo cáo kiểm thử riêng không nằm trong DTO công khai;
 * chỉ trả cho thành viên đội sở hữu (endpoint riêng, TV2 phụ trách).
 */
export const BotVersion = z.object({
  id: Id,
  teamId: Id,
  version: z.number().int().positive(),
  label: z.string(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 dạng hex'),
  rulesetId: z.string(),
  status: BotVersionStatus,
  submissionMethod: z.enum(['direct', 'github', 'demo']).optional(),
  duplicateOfId: z.string().nullable().optional(),
  createdAt: IsoDateTime,
});
export type BotVersion = z.infer<typeof BotVersion>;

/** DTO gửi lên khi nộp bot mới (TV2). */
export const SubmitBotInput = z
  .object({
    teamId: Id,
    label: z.string().min(1, 'Tên phiên bản không được để trống').max(100),
    sourceCode: z.string().min(10, 'Mã nguồn quá ngắn').max(500_000, 'Mã nguồn tối đa 500KB').optional(),
    sourcePath: z.string().max(240).optional(),
    githubRepo: z.string().url('URL GitHub không hợp lệ').optional().or(z.literal('')),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/, 'Commit SHA phải gồm 40 ký tự hex')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    if (v.githubRepo) {
      if (!v.commitSha)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commitSha'],
          message: 'Nộp GitHub phải có commit SHA cố định.',
        });
      if (v.sourceCode)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceCode'],
          message: 'Chọn nộp mã trực tiếp hoặc GitHub.',
        });
    } else if (!v.sourceCode)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceCode'],
        message: 'Cần mã Python hoặc repository/commit GitHub.',
      });
  });
export type SubmitBotInput = z.infer<typeof SubmitBotInput>;

/** DTO trả về khi xem chi tiết mã nguồn bot (chỉ người có quyền). */
export const BotSourceDetail = z.object({
  id: Id,
  teamId: Id,
  version: z.number().int(),
  label: z.string(),
  sourceCode: z.string(),
  githubRepo: z.string().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  sourceHash: z.string(),
  status: BotVersionStatus,
  submittedById: z.string().nullable().optional(),
  duplicateOfId: z.string().nullable().optional(),
  validationLog: z.string().nullable().optional(),
  createdAt: IsoDateTime,
});
export type BotSourceDetail = z.infer<typeof BotSourceDetail>;

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
  stageId: Id.optional(),
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
export const QueueJobData = z.object({
  jobId: Id,
  requestKey: REQUEST_KEY,
  kind: z.enum(['game', 'test_run', 'validate_bot']).optional().default('game'),
});
export type QueueJobData = z.infer<typeof QueueJobData>;

// ============================================================ TV2 — Gói việc 4: Đấu thử (Practice Run)
export const TestRunOpponentType = z.enum(['demo', 'bot']);
export type TestRunOpponentType = z.infer<typeof TestRunOpponentType>;

export const CreateTestRunInput = z.object({
  botVersionId: Id,
  opponentType: TestRunOpponentType,
  /**
   * Nếu opponentType === 'demo': 'random' | 'greedy' | 'rusher'
   * Nếu opponentType === 'bot': ID của một BotVersion khác
   */
  opponentTarget: z.string().min(1),
  mySide: Side.optional().default('blue'),
  extraType: PieceType.optional().default('PAPER'),
  opponentExtraType: PieceType.optional().default('PAPER'),
});
export type CreateTestRunInput = z.infer<typeof CreateTestRunInput>;

export const TestRunStatus = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type TestRunStatus = z.infer<typeof TestRunStatus>;

export const TestRunDetail = z.object({
  id: Id,
  botVersionId: Id,
  status: TestRunStatus,
  mySide: Side,
  opponentType: TestRunOpponentType,
  opponentTarget: z.string(),
  winner: Side.nullable().optional(),
  reason: GameEndReason.nullable().optional(),
  plies: z.number().int().nonnegative().optional(),
  piecesLeft: z.object({ blue: z.number().int(), pink: z.number().int() }).optional(),
  error: z.string().nullable().optional(),
  logs: z.string().nullable().optional(),
  createdAt: IsoDateTime,
  finishedAt: IsoDateTime.nullable().optional(),
  /** Danh sách sự kiện nước đi chuẩn bàn giao TV4 */
  rulesetId: z.string().optional(),
  seed: z.number().int().nonnegative().optional(),
  extraType: PieceType.optional(),
  opponentExtraType: PieceType.optional(),
  initialBoard: z.record(z.string(), z.object({ side: Side, type: PieceType })).optional(),
  maxPlies: z.number().int().positive().optional(),
  events: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        ply: z.number().int().positive(),
        side: Side,
        from: z.string(),
        to: z.string(),
        type: PieceType.optional(),
        capture: PieceType.nullable().optional(),
      }),
    )
    .optional(),
});
export type TestRunDetail = z.infer<typeof TestRunDetail>;

export const BotSelectionInput = z
  .object({ teamId: Id, botVersionIds: z.array(Id).min(1).max(3) })
  .refine((v) => new Set(v.botVersionIds).size === v.botVersionIds.length, 'Không chọn trùng phiên bản.');
export const BotSelectionView = z.object({
  teamId: Id,
  stageId: Id,
  botVersionIds: z.array(Id),
  locked: z.boolean(),
  updatedAt: IsoDateTime,
});
