// TV3 — interface công khai của module giải đấu. Module khác chỉ dùng các hàm ở đây.
import { Injectable } from '@nestjs/common';
import { StageKind, StageStatus, TournamentView, type PairAssignment } from '@arena/contracts';
import { notImplemented, notFound } from '../../core/errors.js';
import { TournamentsRepository } from './tournaments.repository.js';

@Injectable()
export class TournamentsService {
  constructor(private readonly repo: TournamentsRepository) {}

  async current(): Promise<TournamentView> {
    const t = await this.repo.findCurrent();
    if (!t) throw notFound('giải đấu đang mở');
    return TournamentView.parse({
      id: t.id,
      name: t.name,
      status: t.status,
      isDemo: t.isDemo,
      stages: t.stages.map((s) => ({
        id: s.id,
        ord: s.ord,
        kind: StageKind.parse(s.kind),
        name: s.name,
        status: StageStatus.parse(s.status),
      })),
    });
  }

  async currentId(): Promise<string | null> {
    return (await this.repo.findCurrent())?.id ?? null;
  }

  /** TV3 → TV4: các cặp cần mở trận. Ghép cặp Swiss/loại trực tiếp chưa làm ở M0. */
  pairAssignments(_stageId: string): Promise<PairAssignment[]> {
    notImplemented('Ghép cặp và mở trận theo giai đoạn', 'TV3');
  }
}
