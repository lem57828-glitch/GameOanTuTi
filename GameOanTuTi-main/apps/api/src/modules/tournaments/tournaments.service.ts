// TV3: lịch và quy trình duyệt cấu hình; trạng thái thi đấu được quản lý riêng.
import { Injectable } from '@nestjs/common';
import {
  TournamentView,
  type CreateTournamentRequest,
  type UpdateTournamentRequest,
  type StageConfigurationRequest,
  type ConfigurationActionRequest,
  type PairAssignment,
} from '@arena/contracts';
import { AuditService } from '../../core/audit.service.js';
import { conflict, notImplemented, notFound } from '../../core/errors.js';
import type { Tx } from '../../core/prisma.service.js';
import { nextConfigurationStatus, registrationPhase, validateTimeline } from './configuration.js';
import { TournamentsRepository, type TournamentRow } from './tournaments.repository.js';

const asDate = (value: string | null) => (value === null ? null : new Date(value));
const iso = (value: Date | null) => value?.toISOString() ?? null;
export function tournamentView(t: TournamentRow): TournamentView {
  const now = new Date();
  return TournamentView.parse({
    ...t,
    registrationOpensAt: iso(t.registrationOpensAt),
    registrationClosesAt: iso(t.registrationClosesAt),
    teamLockAt: iso(t.teamLockAt),
    botLockAt: iso(t.botLockAt),
    registrationPhase: registrationPhase(t, now),
    serverTime: now.toISOString(),
    stages: t.stages.map((s) => ({
      ...s,
      startsAt: iso(s.startsAt),
      endsAt: iso(s.endsAt),
      lockAt: iso(s.lockAt),
    })),
  });
}

@Injectable()
export class TournamentsService {
  constructor(
    private readonly repo: TournamentsRepository,
    private readonly audit: AuditService,
  ) {}
  async current(): Promise<TournamentView> {
    const t = await this.repo.findCurrent();
    if (!t) throw notFound('giải đấu đang mở');
    return tournamentView(t);
  }
  async currentId(): Promise<string | null> {
    return (await this.repo.findCurrent())?.id ?? null;
  }
  async list() {
    return (await this.repo.list()).map(tournamentView);
  }
  async create(userId: string, input: CreateTournamentRequest, requestId: string) {
    return this.repo.create(async (tx) => {
      const row = await tx.tournament.create({ data: input, include: { stages: true } });
      const view = tournamentView(row);
      await this.audit.record(
        { actorId: userId, action: 'tournament.create', target: row.id, data: { after: view }, requestId },
        tx,
      );
      return view;
    });
  }

  private async mutate(
    id: string,
    expectedRevision: number,
    actorId: string,
    requestId: string,
    reason: string,
    action: string,
    work: (tx: Tx, row: TournamentRow) => Promise<void>,
  ) {
    return this.repo.transaction(id, async (tx, row) => {
      if (!row) throw notFound('giải đấu');
      if (row.revision !== expectedRevision)
        throw conflict('Dữ liệu đã thay đổi ở phiên khác. Tải lại trước khi thao tác.', {
          currentRevision: row.revision,
        });
      if (row.status !== 'draft') throw conflict('Giải đã công bố: cấu hình đã đóng băng.');
      const before = tournamentView(row);
      await work(tx, row);
      const after = await tx.tournament.update({
        where: { id },
        data: { revision: { increment: 1 } },
        include: { stages: { orderBy: { ord: 'asc' } } },
      });
      validateTimeline(after);
      const view = tournamentView(after);
      await this.audit.record(
        { actorId, action, target: id, reason, requestId, data: { before, after: view } },
        tx,
      );
      return view;
    });
  }
  private editable(row: TournamentRow) {
    if (!['draft', 'open'].includes(row.configStatus))
      throw conflict('Cấu hình đang khóa hoặc đã chốt. Mở lại trước khi sửa.');
  }
  update(id: string, userId: string, input: UpdateTournamentRequest, requestId: string) {
    const { expectedRevision, reason, ...fields } = input;
    return this.mutate(
      id,
      expectedRevision,
      userId,
      requestId,
      reason,
      'tournament.configure',
      async (tx, row) => {
        this.editable(row);
        await tx.tournament.update({
          where: { id },
          data: {
            ...fields,
            registrationOpensAt: asDate(fields.registrationOpensAt),
            registrationClosesAt: asDate(fields.registrationClosesAt),
            teamLockAt: asDate(fields.teamLockAt),
            botLockAt: asDate(fields.botLockAt),
          },
        });
      },
    );
  }
  saveStage(
    id: string,
    stageId: string | null,
    userId: string,
    input: StageConfigurationRequest,
    requestId: string,
  ) {
    const { expectedRevision, reason, ...fields } = input;
    return this.mutate(
      id,
      expectedRevision,
      userId,
      requestId,
      reason,
      stageId ? 'stage.configure' : 'stage.create',
      async (tx, row) => {
        this.editable(row);
        const stage = stageId ? row.stages.find((s) => s.id === stageId) : null;
        if (stageId && !stage) throw notFound('giai đoạn trong giải');
        if (stage && (!['draft', 'open'].includes(stage.configStatus) || stage.status !== 'planned'))
          throw conflict('Giai đoạn đã khóa/chốt hoặc đang thi đấu, không thể sửa.');
        const data = {
          ...fields,
          startsAt: asDate(fields.startsAt),
          endsAt: asDate(fields.endsAt),
          lockAt: asDate(fields.lockAt),
        };
        if (stageId) await tx.stage.update({ where: { id: stageId }, data });
        else
          await tx.stage.create({
            data: { ...data, tournamentId: id, ord: (row.stages.at(-1)?.ord ?? 0) + 1 },
          });
      },
    );
  }
  transition(
    id: string,
    stageId: string | null,
    userId: string,
    input: ConfigurationActionRequest,
    requestId: string,
  ) {
    return this.mutate(
      id,
      input.expectedRevision,
      userId,
      requestId,
      input.reason,
      stageId ? `stage.config.${input.action}` : `tournament.config.${input.action}`,
      async (tx, row) => {
        const stage = stageId ? row.stages.find((s) => s.id === stageId) : null;
        if (stageId && !stage) throw notFound('giai đoạn trong giải');
        if (stageId) this.editable(row);
        const next = nextConfigurationStatus(stage?.configStatus ?? row.configStatus, input.action);
        if (input.action === 'lock' || input.action === 'confirm') {
          validateTimeline(row, true);
          if (!stage && row.stages.some((s) => s.configStatus !== 'confirmed'))
            throw conflict('Cần chốt cấu hình từng giai đoạn trước khi khóa/chốt cấu hình giải.');
        }
        if (stageId) await tx.stage.update({ where: { id: stageId }, data: { configStatus: next } });
        else await tx.tournament.update({ where: { id }, data: { configStatus: next } });
      },
    );
  }
  publish(
    id: string,
    userId: string,
    input: { expectedRevision: number; reason: string },
    requestId: string,
  ) {
    return this.mutate(
      id,
      input.expectedRevision,
      userId,
      requestId,
      input.reason,
      'tournament.publish',
      async (tx, row) => {
        if (row.configStatus !== 'confirmed' || row.stages.some((s) => s.configStatus !== 'confirmed'))
          throw conflict('Cần chốt cấu hình giải và tất cả giai đoạn trước khi công bố.');
        validateTimeline(row, true);
        if (row.registrationClosesAt! <= new Date())
          throw conflict('Hạn đăng ký đã qua. Cập nhật lịch trước khi công bố.');
        await tx.tournament.update({ where: { id }, data: { status: 'registration' } });
      },
    );
  }
  async history(id: string) {
    if (!(await this.repo.list()).some((t) => t.id === id)) throw notFound('giải đấu');
    return this.audit.forTarget(id);
  }
  pairAssignments(_stageId: string): Promise<PairAssignment[]> {
    notImplemented('Ghép cặp và mở trận theo giai đoạn', 'TV3');
  }
}
