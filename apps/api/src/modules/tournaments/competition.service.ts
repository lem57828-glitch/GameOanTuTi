// TV3 — điều hành thi đấu: sơ loại chia mức + Swiss trong từng mức, tranh suất ranh giới, hạt giống,
// cây loại trực tiếp 32 → 4 có chốt vòng, nhận kết quả cặp đấu, khiếu nại. Căn cứ: đặc tả tổng hợp mục 5, 6, 9.3
// và thể lệ 32 → 4 bản 2.0. Tham số chờ chốt (Q02–Q05, Q12) dùng giá trị đề xuất, ghi trong docs/TV3_COMPETITION.md.
//
// Nguyên tắc:
//  - Mọi thay đổi chạy trong transaction khóa hàng Tournament → hai BTC bấm cùng lúc không tạo vòng trùng.
//  - Kết quả cặp đấu đi qua một đường duy nhất (recordResult) dù đến từ TV4, BTC nhập tay hay mô phỏng demo.
//  - Khiếu nại đang mở chặn xác nhận vòng, chốt mức và chốt vòng loại trực tiếp.
//  - Không xóa lịch sử: chạy lại tăng resultVersion, mọi thao tác ghi AuditLog kèm lý do.
import { randomInt } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AppealDecisionRequest,
  AppealRequest,
  AppealView,
  BracketView,
  CompetitionView,
  KnockoutPhase,
  LevelUpdateRequest,
  LevelView,
  MyPairingView,
  PairingView,
  QualifierPlanRequest,
  SessionUser,
  StandingRowView,
  StandingsView,
} from '@arena/contracts';
import { pairingRoomId } from '@arena/contracts';
import { DEMO_RULESET, simulate } from '@arena/game-engine';
import { AuditService } from '../../core/audit.service.js';
import { AppError, conflict, forbidden, notFound } from '../../core/errors.js';
import type { Tx } from '../../core/prisma.service.js';
import { AccountsTeamsService } from '../accounts-teams/accounts-teams.service.js';
import { BotsRunnerService } from '../bots-runner/bots-runner.service.js';
import {
  CompetitionRepository,
  type CompetitionTournament,
  type LevelRow,
  type PairingRow,
} from './competition.repository.js';
import { FORMAT, evaluatePairing, gamesNeeded, type GameOutcome } from './scoring.js';
import {
  applyContest,
  compare,
  contestStep,
  cutLine,
  pairKey,
  pairRound,
  seedOrder,
  shuffle,
  standings as computeStandings,
  suggestTargets,
  type ContestStep,
  type StandingRow,
  type SwissGame,
} from './swiss.js';
import { rng } from '@arena/game-engine';

export const KNOCKOUT_SIZE = 32;
export const PHASES: Array<{ phase: KnockoutPhase; title: string }> = [
  { phase: 'r32', title: 'Vòng 32' },
  { phase: 'r16', title: 'Vòng 16' },
  { phase: 'qf', title: 'Tứ kết' },
];
const ACTIVE_LEVEL = ['locked', 'running', 'cutting'];
const ELIGIBLE_TEAM = ['approved', 'locked'];
const MAX_PLIES = 200;
/** Kết quả cặp không tự sinh ra: phải mở phòng (TV4) hoặc nhập tay/mô phỏng. Nói rõ để BTC không chờ vô ích. */
const WAITING_HINT =
  'Kết quả đến khi trận trong phòng đấu kết thúc. Bấm "Mở phòng thi đấu" để các đội chọn bot và thi; hoặc trọng tài nhập kết quả từng cặp, hoặc "Mô phỏng" khi đang bật chế độ demo.';

interface CutState {
  seed: number;
  target: number;
  qualified: string[];
  contest: { group: string[]; slots: number } | null;
  step: number;
  history: Array<ContestStep & { step: number; applied: boolean; winners?: string[] }>;
  done?: boolean;
}

interface Actor {
  id: string | null;
  requestId?: string;
}

const newSeed = () => randomInt(0, 2 ** 31 - 1);
const deriveSeed = (base: number, ...parts: number[]) =>
  parts.reduce((s, p) => (Math.imul(s ^ p, 0x9e3779b1) >>> 0) & 0x7fffffff, base >>> 0);
const json = (v: unknown) => v as Prisma.InputJsonValue;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const ids = (v: Prisma.JsonValue | null): string[] => (Array.isArray(v) ? (v as string[]) : []);

@Injectable()
export class CompetitionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Competition');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repo: CompetitionRepository,
    private readonly accounts: AccountsTeamsService,
    private readonly bots: BotsRunnerService,
    private readonly audit: AuditService,
  ) {}

  // ================================================================== tự khóa mức theo giờ máy chủ

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tới mốc khóa bot của mức kế tiếp thì tự khóa (không phụ thuộc đồng hồ trình duyệt). */
  async tick(now = new Date()): Promise<void> {
    for (const due of await this.repo.dueLevels(now)) {
      try {
        await this.lockNextLevel(due.tournamentId, { id: null }, 'Tự khóa theo mốc khóa bot', true);
        this.log.log(`Tự khóa mức ${due.ord} của giải ${due.tournamentId}`);
      } catch (e) {
        this.log.warn(`Tự khóa mức ${due.ord} (${due.tournamentId}) thất bại: ${(e as Error).message}`);
        await this.audit.record({
          actorId: null,
          action: 'qualifier.auto_lock_failed',
          target: due.tournamentId,
          data: { level: due.ord, error: (e as Error).message },
        });
      }
    }
  }

  // ================================================================== đọc

  async overview(tournamentId: string): Promise<CompetitionView> {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    const ctx = await this.context(t);
    const levels = await Promise.all(t.levels.map((l) => this.levelView(t, l, ctx)));
    const pending = ctx.pairings.filter((p) => p.status === 'scheduled' && this.playable(t, p));
    const top4 = ids(t.top4).map((id) => ({ id, name: ctx.names.get(id) ?? id }));
    return {
      tournamentId: t.id,
      avoidRematch: t.avoidRematch === 'qualifier' ? 'qualifier' : 'level',
      eligibleTeams: ctx.teams.filter((x) => ELIGIBLE_TEAM.includes(x.status)).length,
      suggestedTargets: suggestTargets(
        ctx.teams.filter((x) => ELIGIBLE_TEAM.includes(x.status)).length,
        KNOCKOUT_SIZE,
      ),
      levels,
      next: await this.nextAction(t, ctx),
      bracket: this.bracketOf(t, ctx),
      top4: top4.length ? top4 : null,
      pending: pending.map((p) => this.pairingView(p, ctx)),
      serverTime: new Date().toISOString(),
    };
  }

  async standings(tournamentId: string, levelOrd?: number): Promise<StandingsView> {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    const ctx = await this.context(t);
    const pick =
      levelOrd != null
        ? t.levels.find((l) => l.ord === levelOrd)
        : (t.levels.find((l) => ACTIVE_LEVEL.includes(l.status)) ??
          [...t.levels].reverse().find((l) => !['planned', 'skipped'].includes(l.status)) ??
          t.levels[0]);
    if (!pick) return { level: null, provisional: false, rows: [] };
    const levelPairings = ctx.pairings.filter(
      (p) => p.levelId === pick.id && (p.kind === 'swiss' || p.kind === 'bye'),
    );
    const rows = this.levelStandings(pick, levelPairings, false);
    const provisional = levelPairings.some((p) => !p.confirmed);
    const cut = (pick.cutState as unknown as CutState | null) ?? null;
    const qualified = new Set(ids(pick.qualified).length ? ids(pick.qualified) : (cut?.qualified ?? []));
    const contest = new Set(cut?.contest?.group ?? []);
    const finished = pick.status === 'done' || pick.status === 'skipped';
    const eligible = rows.filter((r) => !ctx.withdrawn.has(r.teamId));
    const straddle =
      eligible.length > pick.teamTarget &&
      compare(eligible[pick.teamTarget - 1]!, eligible[pick.teamTarget]!) === 0
        ? eligible[pick.teamTarget - 1]!
        : null;
    let zone = 0;
    const view: StandingRowView[] = rows.map((r) => {
      const withdrawn = ctx.withdrawn.has(r.teamId);
      let state: StandingRowView['state'] = null;
      if (finished) state = qualified.has(r.teamId) ? 'advanced' : 'eliminated';
      else if (pick.status === 'cutting')
        state = qualified.has(r.teamId) ? 'advanced' : contest.has(r.teamId) ? 'contest' : 'eliminated';
      else if (withdrawn) state = 'withdrawn';
      else if (straddle && compare(r, straddle) === 0) state = 'maybe';
      else if (++zone <= pick.teamTarget) state = 'zone';
      return {
        rank: r.rank,
        teamId: r.teamId,
        name: ctx.names.get(r.teamId) ?? r.teamId,
        points: r.points,
        played: r.played,
        w: r.w,
        d: r.d,
        l: r.l,
        byes: r.byes,
        diff: r.diff,
        oppAvg: r.oppAvg,
        withdrawn,
        state,
      };
    });
    return { level: await this.levelView(t, pick, ctx), provisional, rows: view };
  }

  async bracket(tournamentId: string): Promise<BracketView> {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    return this.bracketOf(t, await this.context(t));
  }

  /** Cặp đấu của đội người dùng trong giải, kèm quyền gửi khiếu nại. */
  async myPairings(user: SessionUser, tournamentId: string): Promise<MyPairingView[]> {
    if (!user.teamId) return [];
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    const ctx = await this.context(t);
    const team = ctx.teams.find((x) => x.id === user.teamId);
    const mine = ctx.pairings.filter(
      (p) => p.kind !== 'bye' && (p.teamAId === user.teamId || p.teamBId === user.teamId),
    );
    const openByTeam = new Set(
      (
        await this.repo.appeals({
          teamId: user.teamId,
          status: 'open',
          pairingId: { in: mine.map((p) => p.id) },
        })
      ).map((a) => a.pairingId),
    );
    return mine.reverse().map((p) => {
      const reason = this.appealBlocked(t, p, team?.captainId === user.id, openByTeam.has(p.id));
      return { ...this.pairingView(p, ctx), canAppeal: reason === null, appealBlockedReason: reason };
    });
  }

  // ================================================================== lập kế hoạch mức

  async plan(tournamentId: string, input: QualifierPlanRequest, actor: Actor) {
    return this.mutate(tournamentId, actor, 'qualifier.plan', input.reason, async (tx, t) => {
      if (t.levels.some((l) => l.status !== 'planned'))
        throw conflict('Sơ loại đã bắt đầu, không lập lại kế hoạch được.');
      const targets = input.targets;
      for (let i = 1; i < targets.length; i++)
        if (targets[i]! >= targets[i - 1]!) throw invalid('Số đội đi tiếp phải giảm dần qua các mức.');
      if (targets.at(-1) !== KNOCKOUT_SIZE)
        throw invalid(`Mức cuối phải chọn ${KNOCKOUT_SIZE} đội vào vòng loại trực tiếp.`);
      const rounds = Array.isArray(input.rounds) ? input.rounds : targets.map(() => input.rounds as number);
      if (rounds.length !== targets.length) throw invalid('Số phần tử của số vòng phải bằng số mức.');
      await tx.qualifierLevel.deleteMany({ where: { tournamentId } });
      for (let i = 0; i < targets.length; i++) {
        await tx.qualifierLevel.create({
          data: {
            tournamentId,
            ord: i + 1,
            name: input.names?.[i] ?? `Mức ${i + 1}`,
            teamTarget: targets[i]!,
            rounds: rounds[i]!,
          },
        });
      }
      await tx.tournament.update({ where: { id: tournamentId }, data: { avoidRematch: input.avoidRematch } });
      return { targets, rounds, avoidRematch: input.avoidRematch };
    });
  }

  async updateLevel(tournamentId: string, ord: number, input: LevelUpdateRequest, actor: Actor) {
    return this.mutate(tournamentId, actor, 'qualifier.level.update', input.reason, async (tx, t) => {
      const l = t.levels.find((x) => x.ord === ord);
      if (!l) throw notFound('mức sơ loại');
      if (['done', 'skipped', 'cutting'].includes(l.status))
        throw conflict('Mức đã chốt hoặc đang tranh suất, không sửa được.');
      const data: Prisma.QualifierLevelUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.rounds !== undefined) {
        const played = await this.roundsPlayed(tx, l.id);
        if (input.rounds < played) throw conflict(`Không nhỏ hơn số vòng đã ghép (${played}).`);
        data.rounds = input.rounds;
      }
      if (input.botLockAt !== undefined) {
        if (l.status !== 'planned') throw conflict('Mức đã khóa bot, không đổi mốc khóa được.');
        data.botLockAt = input.botLockAt ? new Date(input.botLockAt) : null;
      }
      if (input.publishAt !== undefined) data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
      const lock = data.botLockAt !== undefined ? (data.botLockAt as Date | null) : l.botLockAt;
      const pub = data.publishAt !== undefined ? (data.publishAt as Date | null) : l.publishAt;
      if (lock && pub && pub <= lock) throw invalid('Mốc công bố phải sau mốc khóa bot.');
      await tx.qualifierLevel.update({ where: { id: l.id }, data });
      return { level: ord };
    });
  }

  // ================================================================== khóa mức và Swiss

  /**
   * Khóa bot và mở mức kế tiếp. Mức 1: mọi đội đã duyệt. Mức sau: các đội đi tiếp của mức trước.
   * Mức không phải mức cuối mà số đội đã ≤ chỉ tiêu thì bỏ qua (mục 5.1).
   */
  lockNextLevel(tournamentId: string, actor: Actor, reason: string, auto = false) {
    return this.mutate(
      tournamentId,
      actor,
      auto ? 'qualifier.level.auto_lock' : 'qualifier.level.lock',
      reason,
      async (tx, t) => {
        if (t.status !== 'registration' && t.status !== 'running')
          throw conflict('Giải chưa công bố hoặc đã kết thúc.');
        if (!t.levels.length) throw conflict('Chưa lập kế hoạch các mức sơ loại.');
        if (t.levels.some((l) => ACTIVE_LEVEL.includes(l.status))) throw conflict('Đang có mức chưa chốt.');
        const teams = await this.accounts.tournamentTeams(tournamentId);
        const withdrawn = new Set(teams.filter((x) => x.status === 'withdrawn').map((x) => x.id));
        const skipped: number[] = [];
        // Trạng thái/đội đi tiếp cập nhật ngay trong vòng lặp (mức vừa bị bỏ qua phải được thấy ở mức sau).
        const state = new Map(
          t.levels.map((l) => [l.ord, { status: l.status, qualified: ids(l.qualified) }]),
        );
        for (const l of t.levels) {
          if (state.get(l.ord)!.status !== 'planned') continue;
          const prev = state.get(l.ord - 1);
          if (prev && prev.status !== 'done' && prev.status !== 'skipped')
            throw conflict(`Mức ${l.ord - 1} chưa chốt.`);
          const entrants = prev
            ? prev.qualified.filter((id) => !withdrawn.has(id))
            : teams.filter((x) => ELIGIBLE_TEAM.includes(x.status)).map((x) => x.id);
          if (entrants.length < 2) throw conflict('Cần ít nhất 2 đội hợp lệ để mở mức sơ loại.');
          const isLast = l.ord === t.levels.at(-1)!.ord;
          if (!isLast && entrants.length <= l.teamTarget) {
            await tx.qualifierLevel.update({
              where: { id: l.id },
              data: {
                status: 'skipped',
                teamsIn: entrants.length,
                entrants: json(entrants),
                qualified: json(entrants),
                finishedAt: new Date(),
              },
            });
            state.set(l.ord, { status: 'skipped', qualified: entrants });
            skipped.push(l.ord);
            continue;
          }
          await tx.qualifierLevel.update({
            where: { id: l.id },
            data: {
              status: 'locked',
              seed: newSeed(),
              teamsIn: entrants.length,
              entrants: json(entrants),
              lockedAt: new Date(),
            },
          });
          await tx.tournament.update({ where: { id: tournamentId }, data: { status: 'running' } });
          await this.setStageStatus(tx, t, 'qualifier', 'running');
          return { level: l.ord, teams: entrants.length, skipped };
        }
        throw conflict('Không còn mức sơ loại nào chờ khóa.');
      },
    );
  }

  startRound(tournamentId: string, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'qualifier.round.start', reason, async (tx, t) => {
      const L = t.levels.find((l) => l.status === 'locked' || l.status === 'running');
      if (!L)
        throw conflict(
          t.levels.some((l) => l.status === 'cutting')
            ? 'Mức đang tranh suất ranh giới.'
            : 'Cần khóa bot cho mức sơ loại trước.',
        );
      const played = await this.roundsPlayed(tx, L.id);
      if (played >= L.rounds) throw conflict(`${L.name} đã đủ ${L.rounds} vòng.`);
      const levelPairings = await this.repo.pairings(
        tournamentId,
        { levelId: L.id, kind: { in: ['swiss', 'bye'] } },
        tx,
      );
      if (played && levelPairings.some((p) => p.round === played && !p.confirmed))
        throw conflict(`Vòng ${played} chưa được xác nhận.`);
      const roundNo = played + 1;
      const teams = await this.accounts.tournamentTeams(tournamentId);
      const withdrawn = new Set(teams.filter((x) => x.status === 'withdrawn').map((x) => x.id));
      const rows = this.levelStandings(L, levelPairings, true).filter((r) => !withdrawn.has(r.teamId));
      if (rows.length < 2) throw conflict('Không đủ đội để ghép vòng.');
      const scope =
        t.avoidRematch === 'qualifier'
          ? await this.repo.pairings(tournamentId, { kind: 'swiss', status: 'done' }, tx)
          : levelPairings.filter((p) => p.kind === 'swiss' && p.status === 'done');
      const played2 = new Set(scope.map((p) => pairKey(p.teamAId!, p.teamBId!)));
      const byeCounts = new Map<string, number>();
      for (const p of levelPairings)
        if (p.kind === 'bye') byeCounts.set(p.teamAId!, (byeCounts.get(p.teamAId!) ?? 0) + 1);
      const seed = deriveSeed(L.seed ?? 1, roundNo);
      const plan = pairRound(rows, played2, byeCounts, seed, roundNo);
      for (const [i, [a, b]] of plan.pairs.entries()) {
        await tx.pairing.create({
          data: {
            tournamentId,
            kind: 'swiss',
            levelId: L.id,
            round: roundNo,
            slot: i,
            teamAId: a,
            teamBId: b,
            seed: deriveSeed(seed, i + 1),
          },
        });
      }
      if (plan.bye) {
        await tx.pairing.create({
          data: {
            tournamentId,
            kind: 'bye',
            levelId: L.id,
            round: roundNo,
            teamAId: plan.bye,
            seed,
            status: 'done',
            result: 'a',
            winnerTeamId: plan.bye,
            decidedBy: 'bye',
            source: 'system',
            resultVersion: 1,
          },
        });
      }
      await tx.qualifierLevel.update({ where: { id: L.id }, data: { status: 'running' } });
      return {
        level: L.ord,
        round: roundNo,
        pairs: plan.pairs.length,
        bye: plan.bye,
        rematches: plan.rematches,
        seed,
      };
    });
  }

  /** Xác nhận vòng: điểm chuyển từ tạm sang chính thức. Cần đủ kết quả và không còn khiếu nại mở. */
  confirmRound(tournamentId: string, round: number, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'qualifier.round.confirm', reason, async (tx, t) => {
      const L = t.levels.find((l) => l.status === 'running');
      if (!L) throw conflict('Không có mức sơ loại đang thi.');
      const list = await this.repo.pairings(
        tournamentId,
        { levelId: L.id, round, kind: { in: ['swiss', 'bye'] } },
        tx,
      );
      if (!list.length) throw notFound(`vòng ${round}`);
      const notDone = list.filter((p) => p.status !== 'done').length;
      if (notDone) throw conflict(`Còn ${notDone} cặp chưa có kết quả.`);
      const appeals = await this.repo.countOpenAppeals({ id: { in: list.map((p) => p.id) } }, tx);
      if (appeals) throw conflict(`Còn ${appeals} khiếu nại chưa xử lý ở vòng ${round}.`);
      await tx.pairing.updateMany({
        where: { id: { in: list.map((p) => p.id) } },
        data: { confirmed: true },
      });
      return { level: L.ord, round };
    });
  }

  /** Chạy lại vòng gần nhất của mức đang thi: giữ cặp và seed, xóa kết quả tạm để thi lại (tăng resultVersion). */
  rerunRound(tournamentId: string, round: number, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'qualifier.round.rerun', reason, async (tx, t) => {
      const L = t.levels.find((l) => l.status === 'running');
      if (!L) throw conflict('Không có mức sơ loại đang thi.');
      const last = await this.roundsPlayed(tx, L.id);
      if (round !== last)
        throw conflict('Chỉ chạy lại được vòng gần nhất vì vòng sau đã dùng kết quả để ghép cặp.');
      const list = await this.repo.pairings(
        tournamentId,
        { levelId: L.id, round, kind: { in: ['swiss', 'bye'] } },
        tx,
      );
      if (list.some((p) => p.confirmed && p.kind === 'swiss'))
        throw conflict('Vòng đã xác nhận; không chạy lại để tránh lệch bảng điểm.');
      await tx.pairing.updateMany({
        where: { id: { in: list.filter((p) => p.kind === 'swiss').map((p) => p.id) } },
        data: {
          status: 'scheduled',
          matchId: null,
          result: null,
          winnerTeamId: null,
          scoreA: 0,
          scoreB: 0,
          games: json([]),
          decidedBy: null,
          source: null,
          confirmed: false,
        },
      });
      await tx.pairing.updateMany({
        where: { id: { in: list.filter((p) => p.kind === 'bye').map((p) => p.id) } },
        data: { confirmed: false },
      });
      return { level: L.ord, round, pairings: list.length };
    });
  }

  /** Chốt mức: đủ vòng, đã xác nhận, không còn khiếu nại; cắt suất theo điểm → ĐTB đối thủ → hiệu số. */
  finishLevel(tournamentId: string, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'qualifier.level.finish', reason, async (tx, t) => {
      const L = t.levels.find((l) => l.status === 'running' || l.status === 'locked');
      if (!L)
        throw conflict(
          t.levels.some((l) => l.status === 'cutting')
            ? 'Mức đang tranh suất.'
            : 'Không có mức sơ loại đang thi.',
        );
      const played = await this.roundsPlayed(tx, L.id);
      if (played < L.rounds) throw conflict(`Mới ghép ${played}/${L.rounds} vòng.`);
      const list = await this.repo.pairings(
        tournamentId,
        { levelId: L.id, kind: { in: ['swiss', 'bye'] } },
        tx,
      );
      if (list.some((p) => !p.confirmed)) throw conflict('Còn vòng chưa xác nhận.');
      const appeals = await this.repo.countOpenAppeals({ levelId: L.id }, tx);
      if (appeals) throw conflict(`Còn ${appeals} khiếu nại chưa xử lý trong mức.`);
      const teams = await this.accounts.tournamentTeams(tournamentId);
      const withdrawn = new Set(teams.filter((x) => x.status === 'withdrawn').map((x) => x.id));
      const rows = this.levelStandings(L, list, true).filter((r) => !withdrawn.has(r.teamId));
      const target = Math.min(L.teamTarget, rows.length);
      const cut = cutLine(rows, target);
      const st: CutState = {
        seed: L.seed ?? newSeed(),
        target,
        qualified: cut.qualified,
        contest: cut.contested,
        step: 0,
        history: [],
      };
      await tx.qualifierLevel.update({
        where: { id: L.id },
        data: { status: 'cutting', cutState: json(st) },
      });
      await this.advanceContest(tx, tournamentId);
      return { level: L.ord, target, qualified: cut.qualified.length, contested: cut.contested };
    });
  }

  // ================================================================== loại trực tiếp 32 → 4

  startPhase(tournamentId: string, phase: KnockoutPhase, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'knockout.start', reason, async (tx, t) => {
      const round = t.bracketRounds.find((r) => r.phase === phase);
      if (!round) throw conflict('Chưa có cây đấu: cần chốt mức sơ loại cuối.');
      if (round.status !== 'pending') throw conflict('Vòng này đã bắt đầu.');
      const idx = PHASES.findIndex((p) => p.phase === phase);
      if (idx > 0 && t.bracketRounds.find((r) => r.phase === PHASES[idx - 1]!.phase)?.status !== 'done')
        throw conflict('Vòng trước chưa được chốt.');
      const list = await this.repo.pairings(tournamentId, { kind: 'knockout', phase }, tx);
      if (!list.length) throw conflict('Vòng này chưa có cặp đấu.');
      for (const p of list) {
        if (p.teamAId && p.teamBId) continue;
        // Thiếu đối thủ (ít hơn 32 đội): đội còn lại đi tiếp, ghi rõ là xử thắng do vắng đối thủ.
        const winner = p.teamAId ?? p.teamBId;
        await tx.pairing.update({
          where: { id: p.id },
          data: {
            status: 'done',
            result: p.teamAId ? 'a' : 'b',
            winnerTeamId: winner,
            decidedBy: 'walkover',
            source: 'system',
            resultVersion: { increment: 1 },
          },
        });
      }
      await tx.bracketRound.update({
        where: { id: round.id },
        data: { status: 'running', startedAt: new Date() },
      });
      await this.setStageStatus(tx, t, 'knockout', 'running');
      await this.checkPhaseFinished(tx, tournamentId, phase);
      return { phase, pairings: list.length };
    });
  }

  /** Chốt vòng loại trực tiếp; tạo cặp vòng sau theo đường đi cố định trên cây. Chốt tứ kết → Top 4. */
  confirmPhase(tournamentId: string, phase: KnockoutPhase, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'knockout.confirm', reason, async (tx, t) => {
      const round = t.bracketRounds.find((r) => r.phase === phase);
      if (!round) throw notFound('vòng loại trực tiếp');
      if (round.status === 'done') throw conflict('Vòng đã được chốt.');
      if (round.status !== 'finished') throw conflict('Vòng chưa đấu xong.');
      const list = await this.repo.pairings(tournamentId, { kind: 'knockout', phase }, tx);
      const appeals = await this.repo.countOpenAppeals({ id: { in: list.map((p) => p.id) } }, tx);
      if (appeals) throw conflict(`Còn ${appeals} khiếu nại chưa xử lý trong vòng.`);
      await tx.pairing.updateMany({
        where: { id: { in: list.map((p) => p.id) } },
        data: { confirmed: true },
      });
      await tx.bracketRound.update({
        where: { id: round.id },
        data: { status: 'done', confirmedAt: new Date() },
      });
      const sorted = list.slice().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      const idx = PHASES.findIndex((p) => p.phase === phase);
      const next = PHASES[idx + 1];
      if (!next) {
        const winners = sorted.map((p) => p.winnerTeamId).filter((w): w is string => !!w);
        await tx.tournament.update({ where: { id: tournamentId }, data: { top4: json(winners) } });
        await this.setStageStatus(tx, t, 'knockout', 'confirmed');
        return { phase, next: null, top4: winners };
      }
      for (let j = 0; j < sorted.length / 2; j++) {
        const a = sorted[2 * j]!;
        const b = sorted[2 * j + 1]!;
        await tx.pairing.create({
          data: {
            tournamentId,
            kind: 'knockout',
            phase: next.phase,
            round: idx + 2,
            slot: j,
            teamAId: a.winnerTeamId,
            teamBId: b.winnerTeamId,
            seedA: a.winnerTeamId === a.teamAId ? a.seedA : a.seedB,
            seedB: b.winnerTeamId === b.teamAId ? b.seedA : b.seedB,
            seed: newSeed(),
          },
        });
      }
      return { phase, next: next.phase };
    });
  }

  // ================================================================== kết quả cặp đấu

  /**
   * Ghi kết quả một cặp đấu từ danh sách ván/hiệp. Một đường duy nhất cho TV4 (MatchCompleted), BTC nhập tay
   * và mô phỏng demo. Ghi đè kết quả chưa chốt được (tăng resultVersion); kết quả đã chốt thì từ chối.
   */
  recordResult(
    pairingId: string,
    games: GameOutcome[],
    source: 'manual' | 'simulation' | 'match',
    actor: Actor,
    reason: string,
  ) {
    return this.withPairing(pairingId, async (tx, t, p) => {
      if (p.kind === 'bye') throw conflict('Lượt nghỉ không có kết quả để nhập.');
      if (p.status === 'cancelled') throw conflict('Cặp đã hủy.');
      if (p.confirmed) throw conflict('Kết quả đã chốt. Dùng khiếu nại/chạy lại trước khi sửa.');
      if (!this.playable(t, p)) throw conflict('Cặp này chưa tới lượt thi (vòng chưa bắt đầu hoặc đã chốt).');
      if (!p.teamAId || !p.teamBId) throw conflict('Cặp thiếu đối thủ.');
      const out = evaluatePairing(p.kind as 'swiss' | 'tiebreak' | 'knockout', games, p.seed);
      const winner = out.result === 'a' ? p.teamAId : out.result === 'b' ? p.teamBId : null;
      await tx.pairing.update({
        where: { id: p.id },
        data: {
          status: 'done',
          result: out.result,
          winnerTeamId: winner,
          scoreA: out.scoreA,
          scoreB: out.scoreB,
          games: json(games),
          decidedBy: out.decidedBy,
          source,
          resultVersion: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: `pairing.result.${source}`,
          target: t.id,
          reason,
          requestId: actor.requestId,
          data: json({ pairingId: p.id, games, outcome: out }),
        },
        tx,
      );
      if (p.kind === 'tiebreak') await this.advanceContest(tx, t.id);
      if (p.kind === 'knockout' && p.phase) await this.checkPhaseFinished(tx, t.id, p.phase as KnockoutPhase);
      return { pairingId: p.id, ...out, winnerTeamId: winner };
    });
  }

  /**
   * DEMO: chạy mô phỏng mọi cặp đang chờ kết quả bằng engine demo và bot mô phỏng của từng đội. Không phải kết quả
   * thi thật; nhãn nguồn "simulation" được lưu cùng kết quả. Khi TV4 xong, kết quả đến từ phòng đấu (MatchCompleted).
   */
  async simulatePending(tournamentId: string, actor: Actor) {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    let rounds = 0;
    let done = 0;
    // Tranh suất có thể sinh bước mới sau mỗi lượt → lặp tới khi hết cặp chờ (giới hạn để không chạy vô hạn).
    while (rounds++ < 20) {
      const fresh = (await this.repo.findTournament(tournamentId))!;
      // Bỏ qua cặp đang thi trong phòng đấu (TV4): kết quả sẽ đến từ trận thật.
      const pending = (await this.repo.pairings(tournamentId, { status: 'scheduled' })).filter(
        (p) => this.playable(fresh, p) && p.teamAId && p.teamBId && !p.matchId,
      );
      if (!pending.length) break;
      const policies = await this.bots.demoPolicies([
        ...new Set(pending.flatMap((p) => [p.teamAId!, p.teamBId!])),
      ]);
      for (const p of pending) {
        const a = policies.get(p.teamAId!);
        const b = policies.get(p.teamBId!);
        if (!a || !b) throw conflict(`Đội ${!a ? p.teamAId : p.teamBId} chưa có bot mô phỏng hợp lệ.`);
        const games = this.simulateGames(p, a, b);
        await this.recordResult(p.id, games, 'simulation', actor, 'Mô phỏng demo bằng bot hệ thống');
        done++;
      }
    }
    return { simulated: done };
  }

  // ================================================================== khiếu nại

  async submitAppeal(user: SessionUser, input: AppealRequest, requestId: string): Promise<AppealView> {
    const p = await this.repo.findPairing(input.pairingId);
    if (!p) throw notFound('cặp đấu');
    return this.withPairing(p.id, async (tx, t, pairing) => {
      const teams = await this.accounts.tournamentTeams(t.id);
      const team = teams.find((x) => x.id === user.teamId);
      if (!team || ![pairing.teamAId, pairing.teamBId].includes(team.id))
        throw forbidden('Đội của bạn không thi cặp này.');
      const open = await tx.appeal.count({
        where: { pairingId: pairing.id, teamId: team.id, status: 'open' },
      });
      const blocked = this.appealBlocked(t, pairing, team.captainId === user.id, open > 0);
      if (blocked) throw conflict(blocked);
      const a = await tx.appeal.create({
        data: {
          pairingId: pairing.id,
          teamId: team.id,
          accountId: user.id,
          gameNo: input.gameNo,
          moveNo: input.moveNo,
          body: input.body,
          evidence: input.evidence,
        },
        include: { pairing: true },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'appeal.submit',
          target: t.id,
          requestId,
          data: json({ appealId: a.id, pairingId: pairing.id, teamId: team.id }),
        },
        tx,
      );
      return this.appealView(a, await this.context(t, tx));
    });
  }

  async listAppeals(status?: 'open' | 'accepted' | 'rejected'): Promise<AppealView[]> {
    const rows = await this.repo.appeals(status ? { status } : {});
    return this.appealViews(rows);
  }

  async myAppeals(user: SessionUser): Promise<AppealView[]> {
    if (!user.teamId) return [];
    return this.appealViews(await this.repo.appeals({ teamId: user.teamId }));
  }

  /** Trọng tài/BTC quyết định: bác, chấp nhận, hoặc chấp nhận và cho thi lại cặp (giữ đội, seed; tăng resultVersion). */
  async decideAppeal(id: string, input: AppealDecisionRequest, actor: Actor): Promise<AppealView> {
    const a = await this.repo.findAppeal(id);
    if (!a) throw notFound('khiếu nại');
    return this.withPairing(a.pairingId, async (tx, t, p) => {
      const fresh = await tx.appeal.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'open') throw conflict('Khiếu nại đã được xử lý.');
      const action = input.decision === 'accept' ? input.action : 'none';
      if (action === 'rerun') {
        if (p.confirmed) throw conflict('Kết quả đã chốt, không cho thi lại.');
        if (p.kind === 'tiebreak') throw conflict('Kết quả tranh suất đã được áp dụng, không thi lại được.');
        await tx.pairing.update({
          where: { id: p.id },
          data: {
            status: 'scheduled',
            result: null,
            winnerTeamId: null,
            scoreA: 0,
            scoreB: 0,
            games: json([]),
            decidedBy: null,
            source: null,
            // Gỡ trận cũ: TV4 mở trận mới trong cùng phòng của cặp.
            matchId: null,
          },
        });
        if (p.kind === 'knockout' && p.phase) {
          await tx.bracketRound.updateMany({
            where: { tournamentId: t.id, phase: p.phase, status: 'finished' },
            data: { status: 'running' },
          });
        }
      }
      const updated = await tx.appeal.update({
        where: { id },
        data: {
          status: input.decision === 'accept' ? 'accepted' : 'rejected',
          action,
          decision: input.reason,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
        include: { pairing: true },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'appeal.decide',
          target: t.id,
          reason: input.reason,
          requestId: actor.requestId,
          data: json({ appealId: id, decision: input.decision, action }),
        },
        tx,
      );
      return this.appealView(updated, await this.context(t, tx));
    });
  }

  // ================================================================== DEMO và đặt lại

  /** DEMO: thêm đội mẫu có bot mô phỏng để thử sơ loại/cây đấu với nhiều đội. */
  async addDemoTeams(tournamentId: string, count: number, actor: Actor) {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    if (t.levels.some((l) => l.status !== 'planned'))
      throw conflict('Sơ loại đã bắt đầu, không thêm đội được.');
    const teamIds = await this.accounts.createDemoTeams(tournamentId, count);
    await this.bots.createDemoBots(teamIds);
    await this.audit.record({
      actorId: actor.id,
      action: 'demo.teams.create',
      target: tournamentId,
      requestId: actor.requestId,
      data: { count },
    });
    return { created: teamIds.length };
  }

  /** Bắt đầu lại phần thi đấu của giải: xóa cặp/khiếu nại/cây, đưa mức về "planned". Giữ đội, bot và kế hoạch mức. */
  resetCompetition(tournamentId: string, actor: Actor, reason: string) {
    return this.mutate(tournamentId, actor, 'competition.reset', reason, async (tx, t) => {
      const pairings = await tx.pairing.findMany({ where: { tournamentId }, select: { id: true } });
      await tx.appeal.deleteMany({ where: { pairingId: { in: pairings.map((p) => p.id) } } });
      await tx.pairing.deleteMany({ where: { tournamentId } });
      await tx.bracketRound.deleteMany({ where: { tournamentId } });
      await tx.qualifierLevel.updateMany({
        where: { tournamentId },
        data: { status: 'planned', seed: null, teamsIn: null, lockedAt: null, finishedAt: null },
      });
      await tx.$executeRaw`UPDATE "QualifierLevel" SET entrants = NULL, "cutState" = NULL, qualified = NULL WHERE "tournamentId" = ${tournamentId}`;
      await tx.$executeRaw`UPDATE "Tournament" SET top4 = NULL, status = 'registration' WHERE id = ${tournamentId}`;
      for (const s of t.stages) await tx.stage.update({ where: { id: s.id }, data: { status: 'planned' } });
      return { pairings: pairings.length };
    });
  }

  /** TV3 → TV4: cặp đang chờ thi (đã đủ hai đội, vòng đang chạy). */
  /**
   * TV3 → TV4: thông tin một cặp để mở phòng/trận. `playable` = vòng/mức của cặp đang thi.
   * stageId: giai đoạn sơ loại cho swiss/tiebreak, loại trực tiếp cho knockout (TV2 kiểm bộ bot đã khóa theo stage).
   */
  async assignment(pairingId: string) {
    const p = await this.repo.findPairing(pairingId);
    if (!p) throw notFound('cặp đấu');
    const t = (await this.repo.findTournament(p.tournamentId))!;
    const stage = t.stages.find((s) => s.kind === (p.kind === 'knockout' ? 'knockout' : 'qualifier')) ?? null;
    const level = t.levels.find((l) => l.id === p.levelId) ?? null;
    const phaseTitle = PHASES.find((x) => x.phase === p.phase)?.title;
    const title =
      p.kind === 'knockout'
        ? `${phaseTitle} · cặp ${(p.slot ?? 0) + 1}`
        : p.kind === 'tiebreak'
          ? `${level?.name ?? 'Sơ loại'} · tranh suất bước ${p.round - 1000}`
          : `${level?.name ?? 'Sơ loại'} · vòng ${p.round}`;
    return {
      pairingId: p.id,
      tournamentId: t.id,
      isDemo: t.isDemo,
      kind: p.kind as 'swiss' | 'bye' | 'tiebreak' | 'knockout',
      status: p.status,
      matchId: p.matchId,
      teamAId: p.teamAId,
      teamBId: p.teamBId,
      stageId: stage?.id ?? null,
      title,
      playable: this.playable(t, p),
    };
  }

  /** TV4 gắn trận vừa mở vào cặp (trong transaction của TV4). Một cặp chỉ có một trận hiệu lực. */
  async attachMatch(tx: Tx, pairingId: string, matchId: string): Promise<void> {
    const updated = await tx.pairing.updateMany({
      where: { id: pairingId, matchId: null, status: 'scheduled' },
      data: { matchId },
    });
    if (updated.count === 0) throw conflict('Cặp đã có trận hoặc không còn chờ thi.');
  }

  /** Thể thức trận theo loại cặp: số hiệp chính và có chọn quân thứ 10 không. */
  format(kind: 'swiss' | 'tiebreak' | 'knockout') {
    const f = FORMAT[kind];
    return {
      mainGames: f.main,
      extraGames: f.extra,
      chooseExtra: kind === 'knockout',
      win: f.win,
      draw: f.draw,
    };
  }

  /** Còn cần chơi bao nhiêu ván/hiệp nữa (0 = trận đã đủ để phân định). */
  gamesNeeded(kind: 'swiss' | 'tiebreak' | 'knockout', games: GameOutcome[]): number {
    return gamesNeeded(kind, games);
  }

  async pairAssignments(tournamentId: string) {
    const t = await this.repo.findTournament(tournamentId);
    if (!t) throw notFound('giải đấu');
    return (await this.repo.pairings(tournamentId, { status: 'scheduled' })).filter(
      (p) => this.playable(t, p) && p.teamAId && p.teamBId,
    );
  }

  // ================================================================== nội bộ

  private async mutate<T>(
    tournamentId: string,
    actor: Actor,
    action: string,
    reason: string,
    work: (tx: Tx, t: CompetitionTournament) => Promise<T>,
  ) {
    return this.repo.transaction(tournamentId, async (tx, t) => {
      if (!t) throw notFound('giải đấu');
      if (t.status === 'draft') throw conflict('Giải chưa công bố.');
      const result = await work(tx, t);
      await this.audit.record(
        {
          actorId: actor.id,
          action,
          target: tournamentId,
          reason,
          requestId: actor.requestId,
          data: json(result),
        },
        tx,
      );
      return result;
    });
  }

  private async withPairing<T>(
    pairingId: string,
    work: (tx: Tx, t: CompetitionTournament, p: PairingRow) => Promise<T>,
  ) {
    const p0 = await this.repo.findPairing(pairingId);
    if (!p0) throw notFound('cặp đấu');
    return this.repo.transaction(p0.tournamentId, async (tx, t) => {
      if (!t) throw notFound('giải đấu');
      const p = await this.repo.findPairing(pairingId, tx);
      if (!p) throw notFound('cặp đấu');
      return work(tx, t, p);
    });
  }

  private async roundsPlayed(tx: Tx, levelId: string): Promise<number> {
    const r = await tx.pairing.aggregate({
      where: { levelId, kind: { in: ['swiss', 'bye'] } },
      _max: { round: true },
    });
    return r._max.round ?? 0;
  }

  private levelStandings(level: LevelRow, pairings: PairingRow[], confirmedOnly: boolean): StandingRow[] {
    const entrants = ids(level.entrants);
    const use = pairings.filter((p) => p.levelId === level.id && (!confirmedOnly || p.confirmed));
    const games: SwissGame[] = use
      .filter((p) => p.kind === 'swiss' && p.status === 'done' && p.result)
      .map((p) => {
        const g = (p.games as GameOutcome[] | null) ?? [];
        return {
          a: p.teamAId!,
          b: p.teamBId!,
          result: p.result as SwissGame['result'],
          winsA: g.filter((x) => x === 'a').length,
          winsB: g.filter((x) => x === 'b').length,
        };
      });
    const byes = use.filter((p) => p.kind === 'bye').map((p) => p.teamAId!);
    return computeStandings(entrants, games, byes);
  }

  /** Bước kế tiếp của tranh suất ranh giới; xong thì lưu danh sách đi tiếp (mức cuối: lập cây 32). */
  private async advanceContest(tx: Tx, tournamentId: string): Promise<void> {
    const L = await tx.qualifierLevel.findFirst({
      where: { tournamentId, status: 'cutting' },
      orderBy: { ord: 'asc' },
    });
    if (!L) return;
    const st = L.cutState as unknown as CutState;
    const last = st.history.at(-1);
    if (last && !last.applied) {
      const ms = await tx.pairing.findMany({
        where: { levelId: L.id, kind: 'tiebreak', round: 1000 + st.step },
      });
      if (ms.some((m) => m.status !== 'done')) return;
      const winners = ms.map((m) => m.winnerTeamId!);
      const r = applyContest(last, winners, st.contest!.slots);
      st.qualified.push(...r.qualified);
      last.applied = true;
      last.winners = winners;
      st.contest = r.group.length ? { group: r.group, slots: r.slots } : null;
    }
    if (st.contest && st.contest.slots > 0 && st.contest.group.length > st.contest.slots) {
      st.step++;
      const plan = contestStep(
        st.contest.group,
        st.contest.slots,
        deriveSeed(st.seed, st.step),
        st.history.some((h) => h.mode === 'group-round'),
      );
      st.history.push({ ...plan, step: st.step, applied: false });
      await tx.qualifierLevel.update({ where: { id: L.id }, data: { cutState: json(st) } });
      for (const [i, [a, b]] of plan.pairs.entries()) {
        await tx.pairing.create({
          data: {
            tournamentId,
            kind: 'tiebreak',
            levelId: L.id,
            round: 1000 + st.step,
            slot: i,
            teamAId: a,
            teamBId: b,
            seed: deriveSeed(st.seed, st.step, i + 1),
          },
        });
      }
      return;
    }
    if (st.contest && st.contest.slots > 0) st.qualified.push(...st.contest.group);
    st.contest = null;
    st.done = true;
    const all = await tx.pairing.findMany({ where: { levelId: L.id, kind: { in: ['swiss', 'bye'] } } });
    const rows = this.levelStandings(L, all, true);
    const order = new Map(rows.map((r, i) => [r.teamId, i]));
    const lot = new Map(shuffle(st.qualified, rng(st.seed)).map((id, i) => [id, i]));
    // Hạt giống: thứ hạng mức (không cộng điểm mức trước); bằng hoàn toàn thì theo bốc thăm có seed.
    const qualified = st.qualified
      .slice()
      .sort((a, b) => compare(rows[order.get(a)!]!, rows[order.get(b)!]!) || lot.get(a)! - lot.get(b)!);
    await tx.qualifierLevel.update({
      where: { id: L.id },
      data: { status: 'done', cutState: json(st), qualified: json(qualified), finishedAt: new Date() },
    });
    const lastLevel = await tx.qualifierLevel.findFirst({
      where: { tournamentId },
      orderBy: { ord: 'desc' },
    });
    if (lastLevel?.id === L.id) await this.buildBracket(tx, tournamentId, qualified);
  }

  private async buildBracket(tx: Tx, tournamentId: string, qualified: string[]): Promise<void> {
    const t = (await this.repo.findTournament(tournamentId, tx))!;
    await this.setStageStatus(tx, t, 'qualifier', 'confirmed');
    for (const [i, p] of PHASES.entries()) {
      await tx.bracketRound.upsert({
        where: { tournamentId_phase: { tournamentId, phase: p.phase } },
        create: { tournamentId, phase: p.phase, ord: i + 1 },
        update: {},
      });
    }
    const order = seedOrder(KNOCKOUT_SIZE);
    for (let slot = 0; slot < KNOCKOUT_SIZE / 2; slot++) {
      const sa = order[2 * slot]!;
      const sb = order[2 * slot + 1]!;
      await tx.pairing.create({
        data: {
          tournamentId,
          kind: 'knockout',
          phase: 'r32',
          round: 1,
          slot,
          teamAId: qualified[sa - 1] ?? null,
          teamBId: qualified[sb - 1] ?? null,
          seedA: qualified[sa - 1] ? sa : null,
          seedB: qualified[sb - 1] ? sb : null,
          seed: newSeed(),
        },
      });
    }
  }

  private async checkPhaseFinished(tx: Tx, tournamentId: string, phase: KnockoutPhase): Promise<void> {
    const list = await tx.pairing.findMany({ where: { tournamentId, kind: 'knockout', phase } });
    if (list.length && list.every((p) => p.status === 'done')) {
      await tx.bracketRound.updateMany({
        where: { tournamentId, phase, status: 'running' },
        data: { status: 'finished' },
      });
    }
  }

  private async setStageStatus(
    tx: Tx,
    t: CompetitionTournament,
    kind: 'qualifier' | 'knockout',
    status: string,
  ): Promise<void> {
    const stage = t.stages.find((s) => s.kind === kind);
    if (stage) await tx.stage.update({ where: { id: stage.id }, data: { status } });
  }

  /** Cặp có đang trong thời gian thi không (vòng/mức đang chạy, chưa chốt). */
  private playable(t: CompetitionTournament, p: PairingRow): boolean {
    if (p.kind === 'swiss') return t.levels.find((l) => l.id === p.levelId)?.status === 'running';
    if (p.kind === 'tiebreak') return t.levels.find((l) => l.id === p.levelId)?.status === 'cutting';
    if (p.kind === 'knockout') return t.bracketRounds.find((r) => r.phase === p.phase)?.status === 'running';
    return false;
  }

  private appealBlocked(
    t: CompetitionTournament,
    p: PairingRow,
    isCaptain: boolean,
    hasOpen: boolean,
  ): string | null {
    if (p.kind === 'bye') return 'Lượt nghỉ không có trận để khiếu nại.';
    if (!isCaptain) return 'Chỉ đội trưởng gửi khiếu nại chính thức.';
    if (p.status !== 'done') return 'Cặp chưa có kết quả.';
    if (p.kind === 'tiebreak') return 'Kết quả tranh suất được áp dụng ngay, không nhận khiếu nại.';
    if (p.confirmed) return 'Kết quả đã chốt, hết hạn khiếu nại.';
    if (p.kind === 'knockout' && t.bracketRounds.find((r) => r.phase === p.phase)?.status === 'done')
      return 'Vòng đã chốt, hết hạn khiếu nại.';
    if (hasOpen) return 'Đội đã có một khiếu nại đang chờ xử lý cho cặp này.';
    return null;
  }

  private simulateGames(p: PairingRow, policyA: string, policyB: string): GameOutcome[] {
    const kind = p.kind as 'swiss' | 'tiebreak' | 'knockout';
    const games: GameOutcome[] = [];
    let need = gamesNeeded(kind, games);
    while (need > 0) {
      for (let k = 0; k < need; k++) {
        const i = games.length;
        const gameSeed = deriveSeed(p.seed, i + 1);
        // Swiss/tranh suất: đổi màu luân phiên. Loại trực tiếp: tung xu độc lập mỗi hiệp (thể lệ 2.0 mục 4).
        const aBlue = kind === 'knockout' ? rng(gameSeed)() < 0.5 : i % 2 === 0;
        const sim = simulate(
          DEMO_RULESET,
          aBlue ? { blue: policyA, pink: policyB } : { blue: policyB, pink: policyA },
          gameSeed,
          MAX_PLIES,
        );
        const w = sim.end.winner;
        games.push(w === null ? null : (w === 'blue') === aBlue ? 'a' : 'b');
      }
      need = gamesNeeded(kind, games);
    }
    return games;
  }

  // ---------------------------------------------------------------- view helpers

  private async context(t: CompetitionTournament, tx?: Tx) {
    const teams = await this.accounts.tournamentTeams(t.id);
    const pairings = await this.repo.pairings(t.id, {}, tx);
    const counts = await this.repo.openAppealCounts(
      pairings.map((p) => p.id),
      tx,
    );
    return {
      teams,
      names: new Map(teams.map((x) => [x.id, x.name])),
      withdrawn: new Set(teams.filter((x) => x.status === 'withdrawn').map((x) => x.id)),
      pairings,
      appeals: new Map(counts.map((c) => [c.pairingId, c._count])),
    };
  }

  private pairingView(
    p: PairingRow,
    ctx: Awaited<ReturnType<CompetitionService['context']>>,
    levelOrd?: number | null,
  ): PairingView {
    const ref = (id: string | null) => (id ? { id, name: ctx.names.get(id) ?? id } : null);
    return {
      id: p.id,
      kind: p.kind as PairingView['kind'],
      levelOrd: levelOrd ?? null,
      round: p.round,
      phase: (p.phase as KnockoutPhase | null) ?? null,
      slot: p.slot,
      teamA: ref(p.teamAId),
      teamB: ref(p.teamBId),
      seedA: p.seedA,
      seedB: p.seedB,
      status: p.status as PairingView['status'],
      result: (p.result as PairingView['result']) ?? null,
      winnerTeamId: p.winnerTeamId,
      scoreA: p.scoreA,
      scoreB: p.scoreB,
      games: (p.games as GameOutcome[] | null) ?? [],
      decidedBy: p.decidedBy,
      source: p.source,
      resultVersion: p.resultVersion,
      confirmed: p.confirmed,
      openAppeals: ctx.appeals.get(p.id) ?? 0,
      roomId: p.matchId ? pairingRoomId(p.id) : null,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async levelView(
    _t: CompetitionTournament,
    l: LevelRow,
    ctx: Awaited<ReturnType<CompetitionService['context']>>,
  ): Promise<LevelView> {
    const list = ctx.pairings.filter((p) => p.levelId === l.id && (p.kind === 'swiss' || p.kind === 'bye'));
    const roundsPlayed = list.reduce((m, p) => Math.max(m, p.round), 0);
    const now = Date.now();
    const cut = l.cutState as unknown as CutState | null;
    return {
      id: l.id,
      ord: l.ord,
      name: l.name,
      status: l.status as LevelView['status'],
      teamTarget: l.teamTarget,
      rounds: l.rounds,
      roundsPlayed,
      teamsIn: l.teamsIn,
      qualifiedCount: l.qualified ? ids(l.qualified).length : null,
      botLockAt: iso(l.botLockAt),
      publishAt: iso(l.publishAt),
      late: !!(l.publishAt && !['done', 'skipped'].includes(l.status) && now > l.publishAt.getTime()),
      lockDue: l.status === 'planned' && !!l.botLockAt && now >= l.botLockAt.getTime(),
      roundsDetail: Array.from({ length: roundsPlayed }, (_, i) => {
        const r = list.filter((p) => p.round === i + 1);
        return {
          round: i + 1,
          total: r.filter((p) => p.kind === 'swiss').length,
          done: r.filter((p) => p.kind === 'swiss' && p.status === 'done').length,
          confirmed: r.every((p) => p.confirmed),
          openAppeals: r.reduce((n, p) => n + (ctx.appeals.get(p.id) ?? 0), 0),
        };
      }),
      contest:
        cut?.contest && l.status === 'cutting'
          ? { group: cut.contest.group, slots: cut.contest.slots, step: cut.step }
          : null,
    };
  }

  private bracketOf(
    t: CompetitionTournament,
    ctx: Awaited<ReturnType<CompetitionService['context']>>,
  ): BracketView {
    return t.bracketRounds.map((r) => ({
      phase: r.phase as KnockoutPhase,
      title: PHASES.find((p) => p.phase === r.phase)?.title ?? r.phase,
      status: r.status as BracketView[number]['status'],
      pairings: ctx.pairings
        .filter((p) => p.kind === 'knockout' && p.phase === r.phase)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map((p) => this.pairingView(p, ctx)),
    }));
  }

  private async nextAction(
    t: CompetitionTournament,
    ctx: Awaited<ReturnType<CompetitionService['context']>>,
  ): Promise<CompetitionView['next']> {
    const step = (action: string, label: string, blockedReason: string | null = null) => ({
      action,
      label,
      blockedReason,
    });
    if (t.status === 'draft') return step('none', 'Giải chưa công bố', 'Công bố giải ở phần cấu hình trước.');
    if (!t.levels.length) return step('plan', 'Lập kế hoạch các mức sơ loại');
    const active = t.levels.find((l) => ACTIVE_LEVEL.includes(l.status));
    if (active) {
      const list = ctx.pairings.filter((p) => p.levelId === active.id);
      if (active.status === 'cutting') {
        const waiting = list.filter((p) => p.kind === 'tiebreak' && p.status === 'scheduled').length;
        return step('results', `Chờ ${waiting} cặp tranh suất ranh giới`, WAITING_HINT);
      }
      const swiss = list.filter((p) => p.kind === 'swiss' || p.kind === 'bye');
      const played = swiss.reduce((m, p) => Math.max(m, p.round), 0);
      const last = swiss.filter((p) => p.round === played);
      const waiting = last.filter((p) => p.status === 'scheduled').length;
      if (played && waiting)
        return step('results', `Chờ kết quả ${waiting} cặp vòng ${played}`, WAITING_HINT);
      if (played && last.some((p) => !p.confirmed)) {
        const appeals = last.reduce((n, p) => n + (ctx.appeals.get(p.id) ?? 0), 0);
        return step(
          'confirm-round',
          `Xác nhận vòng ${played} — ${active.name}`,
          appeals ? `Còn ${appeals} khiếu nại mở.` : null,
        );
      }
      if (played < active.rounds)
        return step('start-round', `Ghép vòng ${played + 1}/${active.rounds} — ${active.name}`);
      return step('finish-level', `Chốt ${active.name} và cắt ${active.teamTarget} suất`);
    }
    const next = t.levels.find((l) => l.status === 'planned');
    if (next) return step('lock-level', `Khóa bot và mở ${next.name}`);
    for (const r of t.bracketRounds) {
      const title = PHASES.find((p) => p.phase === r.phase)?.title ?? r.phase;
      if (r.status === 'pending') return step(`start-phase:${r.phase}`, `Bắt đầu ${title}`);
      if (r.status === 'running') {
        const waiting = ctx.pairings.filter(
          (p) => p.kind === 'knockout' && p.phase === r.phase && p.status === 'scheduled',
        ).length;
        return step('results', `Chờ kết quả ${waiting} cặp ${title}`, WAITING_HINT);
      }
      if (r.status === 'finished') {
        const appeals = ctx.pairings
          .filter((p) => p.phase === r.phase)
          .reduce((n, p) => n + (ctx.appeals.get(p.id) ?? 0), 0);
        return step(
          `confirm-phase:${r.phase}`,
          `Chốt ${title}`,
          appeals ? `Còn ${appeals} khiếu nại mở.` : null,
        );
      }
    }
    if (t.top4) return step('done', 'Đã có Top 4 — giai đoạn 32 → 4 kết thúc');
    return step('none', 'Không có bước nào');
  }

  private async appealViews(
    rows: Array<Prisma.AppealGetPayload<{ include: { pairing: true } }>>,
  ): Promise<AppealView[]> {
    const byTournament = new Map<string, Awaited<ReturnType<CompetitionService['context']>>>();
    const out: AppealView[] = [];
    for (const a of rows) {
      let ctx = byTournament.get(a.pairing.tournamentId);
      if (!ctx) {
        const t = await this.repo.findTournament(a.pairing.tournamentId);
        if (!t) continue;
        ctx = await this.context(t);
        byTournament.set(t.id, ctx);
      }
      out.push(this.appealView(a, ctx));
    }
    return out;
  }

  private appealView(
    a: Prisma.AppealGetPayload<{ include: { pairing: true } }>,
    ctx: Awaited<ReturnType<CompetitionService['context']>>,
  ): AppealView {
    return {
      id: a.id,
      pairing: this.pairingView(a.pairing, ctx),
      team: { id: a.teamId, name: ctx.names.get(a.teamId) ?? a.teamId },
      accountId: a.accountId,
      gameNo: a.gameNo,
      moveNo: a.moveNo,
      body: a.body,
      evidence: a.evidence,
      status: a.status as AppealView['status'],
      action: a.action,
      decision: a.decision,
      decidedById: a.decidedById,
      decidedAt: iso(a.decidedAt),
      createdAt: a.createdAt.toISOString(),
    };
  }
}

const invalid = (message: string) => new AppError('VALIDATION_ERROR', message);
