// TV3 — giải, giai đoạn, cặp đấu (đặc tả M0 mục 13–14). Ghép cặp Swiss, xếp hạng, khiếu nại chưa làm ở M0.
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
export const RevisionRequest = z.object({ expectedRevision: z.number().int().nonnegative(), reason: Reason });
export const CreateTournamentRequest = z
  .object({
    name: Name,
    description: z.string().trim().max(2000).default(''),
    isDemo: z.boolean().default(false),
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
