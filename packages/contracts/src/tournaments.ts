// TV3 — giải, giai đoạn, cấu hình, sơ loại Swiss chia mức, cây 32 → 4, khiếu nại.
import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';

export const StageKind = z.enum(['qualifier', 'knockout']);
export const StageStatus = z.enum(['planned', 'open', 'running', 'finished', 'confirmed']);
export const ConfigurationStatus = z.enum(['draft', 'open', 'locked', 'confirmed']);
export const ConfigurationAction = z.enum(['open', 'lock', 'confirm', 'reopen']);
export const RegistrationPhase = z.enum([
  'unconfigured',
  'scheduled',
  'open',
  'closed',
  'teams_locked',
  'bots_locked',
]);
export type RegistrationPhase = z.infer<typeof RegistrationPhase>;
export type ConfigurationStatus = z.infer<typeof ConfigurationStatus>;
export type ConfigurationAction = z.infer<typeof ConfigurationAction>;
const OptionalTime = IsoDateTime.nullable();
const Name = z.string().trim().min(3).max(120);
const Reason = z.string().trim().min(3).max(500);
/** Loại giải demo: trải nghiệm chạy bot thật, hoặc mô phỏng nhanh (kết quả do hệ thống sinh, có nhãn). */
export const DemoKind = z.enum(['experience', 'simulation']);
export type DemoKind = z.infer<typeof DemoKind>;
export const RevisionRequest = z.object({ expectedRevision: z.number().int().nonnegative(), reason: Reason });
export const CreateTournamentRequest = z
  .object({
    name: Name,
    description: z.string().trim().max(2000).default(''),
    isDemo: z.boolean().default(false),
    /** Chỉ với giải demo; bỏ trống thì mặc định mô phỏng nhanh. */
    demoKind: DemoKind.nullable().optional(),
  })
  .strict();
export const UpdateTournamentRequest = RevisionRequest.extend({
  name: Name,
  description: z.string().trim().max(2000),
  registrationOpensAt: OptionalTime,
  registrationClosesAt: OptionalTime,
  teamLockAt: OptionalTime,
  botLockAt: OptionalTime,
}).strict();
export const StageConfigurationRequest = RevisionRequest.extend({
  name: Name,
  kind: StageKind,
  startsAt: OptionalTime,
  endsAt: OptionalTime,
  lockAt: OptionalTime,
}).strict();
export const ConfigurationActionRequest = RevisionRequest.extend({ action: ConfigurationAction }).strict();
export type UpdateTournamentRequest = z.infer<typeof UpdateTournamentRequest>;
export type CreateTournamentRequest = z.infer<typeof CreateTournamentRequest>;
export type StageConfigurationRequest = z.infer<typeof StageConfigurationRequest>;
export type ConfigurationActionRequest = z.infer<typeof ConfigurationActionRequest>;

export const StageView = z.object({
  id: Id,
  ord: z.number().int().positive(),
  kind: StageKind,
  name: z.string(),
  status: StageStatus,
  configStatus: ConfigurationStatus,
  startsAt: OptionalTime,
  endsAt: OptionalTime,
  lockAt: OptionalTime,
});
export type StageView = z.infer<typeof StageView>;

export const TournamentView = z.object({
  id: Id,
  name: z.string(),
  status: z.enum(['draft', 'registration', 'running', 'finished']),
  /** Giải mẫu chỉ để phát triển; giao diện phải ghi rõ không phải lịch thi chính thức. */
  isDemo: z.boolean(),
  demoKind: DemoKind.nullable(),
  description: z.string(),
  configStatus: ConfigurationStatus,
  revision: z.number().int().nonnegative(),
  registrationOpensAt: OptionalTime,
  registrationClosesAt: OptionalTime,
  teamLockAt: OptionalTime,
  botLockAt: OptionalTime,
  registrationPhase: RegistrationPhase,
  serverTime: IsoDateTime,
  stages: z.array(StageView),
});
export type TournamentView = z.infer<typeof TournamentView>;
export const TournamentAuditEntry = z.object({
  id: Id,
  actorId: Id.nullable(),
  action: z.string(),
  reason: z.string().nullable(),
  data: z.unknown().nullable(),
  requestId: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type TournamentAuditEntry = z.infer<typeof TournamentAuditEntry>;

/** TV3 → TV4: một cặp đấu cần mở trận. */
export const PairAssignment = z.object({
  pairId: Id,
  stageId: Id,
  teamAId: Id,
  teamBId: Id,
  kind: StageKind,
  lockAt: IsoDateTime,
});
export type PairAssignment = z.infer<typeof PairAssignment>;

// ---------------------------------------------------------------- Thi đấu: sơ loại chia mức, cây 32 → 4, khiếu nại
// Tham số còn chờ BTC chốt (Q02–Q05, Q12) dùng giá trị đề xuất; xem docs/TV3_COMPETITION.md.

const Count = z.number().int();
export const LevelStatus = z.enum(['planned', 'locked', 'running', 'cutting', 'done', 'skipped']);
export const PairingKind = z.enum(['swiss', 'bye', 'tiebreak', 'knockout']);
export const KnockoutPhase = z.enum(['r32', 'r16', 'qf']);
export type KnockoutPhase = z.infer<typeof KnockoutPhase>;
export const AvoidRematchScope = z.enum(['level', 'qualifier']);
/** Kết quả một ván/hiệp: 'a' | 'b' thắng, null = hòa. */
export const GameOutcome = z.enum(['a', 'b']).nullable();

export const ReasonRequest = z.object({ reason: Reason }).strict();
export const QualifierPlanRequest = z
  .object({
    targets: z.array(Count.min(2)).min(1).max(8),
    rounds: z.union([Count.min(1).max(20), z.array(Count.min(1).max(20)).min(1).max(8)]),
    names: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
    avoidRematch: AvoidRematchScope.default('level'),
    reason: Reason,
  })
  .strict();
export type QualifierPlanRequest = z.infer<typeof QualifierPlanRequest>;
export const LevelUpdateRequest = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    rounds: Count.min(1).max(20).optional(),
    botLockAt: OptionalTime.optional(),
    publishAt: OptionalTime.optional(),
    reason: Reason,
  })
  .strict();
export type LevelUpdateRequest = z.infer<typeof LevelUpdateRequest>;
export const PairingResultRequest = z
  .object({ games: z.array(GameOutcome).min(1).max(7), reason: Reason })
  .strict();
export type PairingResultRequest = z.infer<typeof PairingResultRequest>;
export const DemoTeamsRequest = z.object({ count: Count.min(2).max(256) }).strict();

export const AppealRequest = z
  .object({
    pairingId: Id,
    gameNo: Count.min(1).max(7).nullable().default(null),
    moveNo: Count.min(1).max(2000).nullable().default(null),
    body: z.string().trim().min(10).max(4000),
    evidence: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();
export type AppealRequest = z.infer<typeof AppealRequest>;
export const AppealDecisionRequest = z
  .object({
    decision: z.enum(['accept', 'reject']),
    action: z.enum(['none', 'rerun']).default('none'),
    reason: z.string().trim().min(5).max(4000),
  })
  .strict();
export type AppealDecisionRequest = z.infer<typeof AppealDecisionRequest>;

const TeamRef = z.object({ id: Id, name: z.string() }).nullable();

export const PairingView = z.object({
  id: Id,
  kind: PairingKind,
  levelOrd: Count.nullable(),
  round: Count,
  phase: KnockoutPhase.nullable(),
  slot: Count.nullable(),
  teamA: TeamRef,
  teamB: TeamRef,
  seedA: Count.nullable(),
  seedB: Count.nullable(),
  status: z.enum(['scheduled', 'done', 'cancelled']),
  result: z.enum(['a', 'b', 'draw']).nullable(),
  winnerTeamId: Id.nullable(),
  scoreA: Count,
  scoreB: Count,
  games: z.array(GameOutcome),
  decidedBy: z.string().nullable(),
  source: z.string().nullable(),
  resultVersion: Count,
  confirmed: z.boolean(),
  openAppeals: Count,
  /** Phòng thi đấu của cặp (TV4) khi đã mở trận; null nếu chưa mở hoặc kết quả nhập tay/mô phỏng. */
  roomId: Id.nullable(),
  updatedAt: IsoDateTime,
});
export type PairingView = z.infer<typeof PairingView>;

export const StandingRowView = z.object({
  rank: Count,
  teamId: Id,
  name: z.string(),
  points: Count,
  played: Count,
  w: Count,
  d: Count,
  l: Count,
  byes: Count,
  diff: Count,
  oppAvg: z.number(),
  withdrawn: z.boolean(),
  /** Nhãn chữ luôn đi kèm màu: zone (trong vùng đi tiếp tạm), maybe (bằng điểm ở ranh giới),
   *  contest (đang tranh suất), advanced, eliminated, withdrawn. */
  state: z.enum(['zone', 'maybe', 'contest', 'advanced', 'eliminated', 'withdrawn']).nullable(),
});
export type StandingRowView = z.infer<typeof StandingRowView>;

export const LevelView = z.object({
  id: Id,
  ord: Count,
  name: z.string(),
  status: LevelStatus,
  teamTarget: Count,
  rounds: Count,
  roundsPlayed: Count,
  teamsIn: Count.nullable(),
  qualifiedCount: Count.nullable(),
  botLockAt: OptionalTime,
  publishAt: OptionalTime,
  /** Đã quá giờ công bố mà mức chưa chốt → thông báo chậm kết quả. */
  late: z.boolean(),
  /** Đã tới mốc khóa bot (giờ máy chủ). */
  lockDue: z.boolean(),
  roundsDetail: z.array(
    z.object({ round: Count, total: Count, done: Count, confirmed: z.boolean(), openAppeals: Count }),
  ),
  contest: z.object({ group: z.array(Id), slots: Count, step: Count }).nullable(),
});
export type LevelView = z.infer<typeof LevelView>;

export const StandingsView = z.object({
  level: LevelView.nullable(),
  provisional: z.boolean(),
  /** Mức chưa khóa (hoặc chưa lập kế hoạch): danh sách đội DỰ KIẾN tham gia, chưa có điểm, chưa chốt. */
  preview: z.boolean(),
  rows: z.array(StandingRowView),
});
export type StandingsView = z.infer<typeof StandingsView>;

export const BracketView = z.array(
  z.object({
    phase: KnockoutPhase,
    title: z.string(),
    status: z.enum(['pending', 'running', 'finished', 'done']),
    pairings: z.array(PairingView),
  }),
);
export type BracketView = z.infer<typeof BracketView>;

export const CompetitionView = z.object({
  tournamentId: Id,
  demoKind: DemoKind.nullable(),
  /** Giải trải nghiệm tự điều hành (demo): thí sinh bấm "Tiếp theo" thay cho các bước BTC. */
  autopilot: z.boolean(),
  avoidRematch: AvoidRematchScope,
  eligibleTeams: Count,
  suggestedTargets: z.array(Count),
  levels: z.array(LevelView),
  /** Bước BTC nên làm tiếp theo (để giao diện hiển thị đúng một nút chính). */
  next: z.object({ action: z.string(), label: z.string(), blockedReason: z.string().nullable() }),
  bracket: BracketView,
  top4: z.array(z.object({ id: Id, name: z.string() })).nullable(),
  pending: z.array(PairingView),
  serverTime: IsoDateTime,
});
export type CompetitionView = z.infer<typeof CompetitionView>;

export const AppealView = z.object({
  id: Id,
  pairing: PairingView,
  team: z.object({ id: Id, name: z.string() }),
  accountId: Id,
  gameNo: Count.nullable(),
  moveNo: Count.nullable(),
  body: z.string(),
  evidence: z.string().nullable(),
  status: z.enum(['open', 'accepted', 'rejected']),
  action: z.string().nullable(),
  decision: z.string().nullable(),
  decidedById: Id.nullable(),
  decidedAt: OptionalTime,
  createdAt: IsoDateTime,
});
export type AppealView = z.infer<typeof AppealView>;

/** Cặp đấu của đội người dùng trong giải hiện tại, kèm quyền khiếu nại. */
export const MyPairingView = PairingView.extend({
  canAppeal: z.boolean(),
  appealBlockedReason: z.string().nullable(),
});
export type MyPairingView = z.infer<typeof MyPairingView>;

/** Đội trưởng chọn bot dùng cho mọi trận Swiss/tranh suất của mức sơ loại sắp tới (trước khi mức khóa). */
export const LevelBotRequest = z.object({ botVersionId: Id }).strict();
export type LevelBotRequest = z.infer<typeof LevelBotRequest>;
export const LevelBotView = z.object({
  /** Mức đang thi (bot đã chốt) hoặc mức sắp tới (còn chọn được); null khi sơ loại chưa lập/đã xong. */
  level: z.object({ ord: Count, name: z.string(), status: LevelStatus, botLockAt: OptionalTime }).nullable(),
  allowedBots: z.array(z.object({ id: Id, label: z.string(), version: Count })),
  /** Bot đang áp dụng. `source`: đội chọn, mặc định (mức trước / mới nhất) hoặc hệ thống chốt khi khóa mức. */
  current: z
    .object({ botVersionId: Id, label: z.string(), source: z.enum(['chosen', 'default', 'auto']) })
    .nullable(),
  canChoose: z.boolean(),
  reason: z.string().nullable(),
});
export type LevelBotView = z.infer<typeof LevelBotView>;

/** Demo một thí sinh: bấm "Tiếp theo" để máy chủ làm bước BTC kế tiếp (trận vẫn do worker chạy bot thật). */
export const AutopilotAdvanceRequest = z
  .object({ useDefault: z.boolean().optional() })
  .strict();
export type AutopilotAdvanceRequest = z.infer<typeof AutopilotAdvanceRequest>;
export const AutopilotView = z.object({
  enabled: z.boolean(),
  /** Bước BTC kế tiếp, ví dụ "Ghép vòng 2/3 — Mức 1". */
  step: z.string(),
  /** Các cặp của lượt đang thi (null khi không có trận đang chờ). */
  waiting: z.object({ done: Count, total: Count }).nullable(),
  /** Phòng loại trực tiếp đội bạn cần chọn kín bot và quân thứ 10. */
  needsChoice: z.array(z.object({ roomId: z.string(), title: z.string() })),
  canAdvance: z.boolean(),
  done: z.boolean(),
  message: z.string().nullable(),
});
export type AutopilotView = z.infer<typeof AutopilotView>;
