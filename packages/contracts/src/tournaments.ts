// TV3 — giải, giai đoạn, cặp đấu (đặc tả M0 mục 13–14). Ghép cặp Swiss, xếp hạng, khiếu nại chưa làm ở M0.
import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';

export const StageKind = z.enum(['qualifier', 'knockout']);
export const StageStatus = z.enum(['planned', 'open', 'running', 'finished', 'confirmed']);

export const StageView = z.object({
  id: Id,
  ord: z.number().int().positive(),
  kind: StageKind,
  name: z.string(),
  status: StageStatus,
});
export type StageView = z.infer<typeof StageView>;

export const TournamentView = z.object({
  id: Id,
  name: z.string(),
  status: z.enum(['draft', 'registration', 'running', 'finished']),
  /** Giải mẫu chỉ để phát triển; giao diện phải ghi rõ không phải lịch thi chính thức. */
  isDemo: z.boolean(),
  stages: z.array(StageView),
});
export type TournamentView = z.infer<typeof TournamentView>;

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
