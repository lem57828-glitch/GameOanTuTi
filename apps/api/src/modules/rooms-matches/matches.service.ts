// TV4 — điều phối trận nhiều hiệp trong phòng của một cặp đấu TV3 (thể lệ 32 → 4 bản 2.0 mục 2–4, đặc tả 6.2).
//
// Vòng đời một trận:
//   selecting (chọn kín bot + quân thứ 10 cho hiệp N, hạn MATCH_SELECT_SECONDS)
//     → khóa khi cả hai sẵn sàng hoặc hết giờ → tung xu → tạo Game + GameJob (worker TV2 chạy)
//   running (chờ ván xong) → ghi kết quả hiệp → còn cần hiệp? quay lại selecting : completed
//   completed → gửi danh sách ván/hiệp cho TV3 (recordResult nguồn 'match'); TV3 tính điểm và chốt chính thức.
//   paused: ván lỗi sau khi worker đã thử lại, hoặc đội không có bot hợp lệ → BTC xử lý.
//
// Nguyên tắc:
//  - Lựa chọn của đội giữ kín tới khi khóa; khán giả chỉ thấy "đã chọn / sẵn sàng".
//  - Khóa rồi thì không đổi; chạy lại hiệp giữ nguyên bot, quân thứ 10, màu, kết quả tung xu và seed.
//  - Mọi chuyển trạng thái chạy trong transaction khóa hàng Match (một trận chỉ chuyển hiệp một lần).
//  - Xem phòng/reconnect không tạo ván, không tung lại xu.
import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CONTRACT_VERSION,
  MatchChoiceRequest,
  pairingRoomId,
  type CoinResult,
  type MatchView,
  type MyMatchSelection,
  type PieceType,
  type SessionUser,
} from '@arena/contracts';
import { STANDARD_RULESET_ID } from '@arena/game-engine';
import { AuditService } from '../../core/audit.service.js';
import { APP_CONFIG, type AppConfig } from '../../core/config.js';
import { AppError, conflict, forbidden, notFound } from '../../core/errors.js';
import { parse } from '../../core/http.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { AccountsTeamsService } from '../accounts-teams/accounts-teams.service.js';
import { NotificationsService } from '../accounts-teams/notifications.service.js';
import { BotsRunnerService, DEMO_LIMITS } from '../bots-runner/bots-runner.service.js';
import { CompetitionService } from '../tournaments/competition.service.js';
import { MatchesRepository, type MatchRow } from './matches.repository.js';
import { RoomsRepository } from './rooms.repository.js';
import { streamIdOf } from './snapshot.js';

type Kind = 'swiss' | 'tiebreak' | 'knockout' | 'semifinal' | 'final';
type Outcome = 'a' | 'b' | null;
/**
 * Không có bước chọn kín theo hiệp — sơ loại: bot đội chốt cho cả mức; bán kết/chung kết: bài nộp USB đã khóa
 * (kèm quân thứ 10 đội đăng ký khi nộp).
 */
const FIXED_BOT: ReadonlySet<string> = new Set(['swiss', 'tiebreak', 'semifinal', 'final']);
const OFFLINE: ReadonlySet<string> = new Set(['semifinal', 'final']);
interface Actor {
  id: string | null;
  requestId?: string;
}

const TICK_MS = 2000;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const outcomesOf = (m: { outcomes: Prisma.JsonValue | null }): Outcome[] =>
  Array.isArray(m.outcomes) ? (m.outcomes as Outcome[]) : [];

@Injectable()
export class MatchesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Matches');
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners: Array<(roomId: string) => void> = [];
  private ticking = false;
  private readonly inFlight = new Set<string>();
  private readonly again = new Set<string>();
  private readonly roomChecks = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: MatchesRepository,
    private readonly rooms: RoomsRepository,
    private readonly accounts: AccountsTeamsService,
    private readonly bots: BotsRunnerService,
    private readonly competition: CompetitionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Gateway đăng ký để đẩy snapshot mới cho khán giả khi trạng thái trận đổi. */
  onChange(listener: (roomId: string) => void): void {
    this.listeners.push(listener);
  }

  private notify(roomId: string): void {
    for (const l of this.listeners) l(roomId);
  }

  /** Hết hạn chọn → khóa; ván đang chạy đã xong → sang hiệp sau hoặc kết thúc trận. Chạy theo giờ máy chủ. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const m of await this.repo.due(now))
        await this.advance(m.id).catch((e: Error) => this.log.warn(`Trận ${m.id}: ${e.message}`));
      // Trận đã xong nhưng chưa bàn giao được cho TV3 (vd. tiến trình dừng giữa chừng): gửi bù.
      for (const m of await this.repo.unreported())
        await this.report(m.id).catch((e: Error) =>
          this.log.warn(`Gửi bù kết quả trận ${m.id}: ${e.message}`),
        );
    } finally {
      this.ticking = false;
    }
  }

  // ================================================================== mở phòng / trận

  /** Mở phòng và trận cho mọi cặp đang chờ thi của giải (cặp đã có trận thì bỏ qua). */
  async openForTournament(tournamentId: string, actor: Actor) {
    const pairs = (await this.competition.pairAssignments(tournamentId)).filter((p) => !p.matchId);
    let opened = 0;
    const errors: Array<{ pairingId: string; error: string }> = [];
    for (const p of pairs) {
      try {
        await this.openForPairing(p.id, actor);
        opened++;
      } catch (e) {
        errors.push({ pairingId: p.id, error: (e as Error).message });
      }
    }
    return { opened, skipped: errors.length, errors };
  }

  async openForPairing(pairingId: string, actor: Actor) {
    const a = await this.competition.assignment(pairingId);
    if (a.kind === 'bye') throw conflict('Lượt nghỉ không có trận.');
    if (!a.playable || a.status !== 'scheduled') throw conflict('Cặp chưa tới lượt thi hoặc đã có kết quả.');
    if (!a.teamAId || !a.teamBId) throw conflict('Cặp thiếu đối thủ.');
    if (a.matchId) throw conflict('Cặp đã có trận.');
    const kind = a.kind;
    const names = await this.accounts.teamNames([a.teamAId, a.teamBId]);
    const roomId = pairingRoomId(pairingId);
    const out = await this.prisma.$transaction(async (tx) => {
      await this.repo.upsertRoom(tx, {
        id: roomId,
        code: `p-${pairingId}`,
        title: `${a.title}: ${names.get(a.teamAId!) ?? '?'} vs ${names.get(a.teamBId!) ?? '?'}`,
        isDemo: a.isDemo,
        status: 'waiting',
        teamAId: a.teamAId!,
        teamBId: a.teamBId!,
        pairingId,
      });
      const match = await tx.match.create({
        data: {
          roomId,
          pairId: pairingId,
          kind,
          stageId: a.stageId,
          teamAId: a.teamAId,
          teamBId: a.teamBId,
          status: 'selecting',
          currentNo: 1,
          outcomes: json([]),
          deadlineAt: this.deadline(),
        },
      });
      await this.competition.attachMatch(tx, pairingId, match.id);
      if (!FIXED_BOT.has(kind)) await this.notifySelection(tx, match, a.title, 1);
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'match.open',
          target: a.tournamentId,
          requestId: actor.requestId,
          data: json({ pairingId, matchId: match.id, kind }),
        },
        tx,
      );
      return { roomId, matchId: match.id };
    });
    this.notify(roomId);
    if (FIXED_BOT.has(kind)) await this.advance(out.matchId);
    return out;
  }

  // ================================================================== lựa chọn kín

  /** Dữ liệu riêng cho người đang xem phòng: đội trưởng thấy bot được phép và lựa chọn của chính đội mình. */
  async mySelection(user: SessionUser, roomId: string): Promise<MyMatchSelection | null> {
    const m = await this.repo.latestOfRoom(roomId);
    if (!m || !m.teamAId || !m.teamBId) return null;
    const side = user.teamId === m.teamAId ? 'a' : user.teamId === m.teamBId ? 'b' : null;
    if (!side) return null;
    const teamId = side === 'a' ? m.teamAId : m.teamBId;
    const team = await this.accounts.team(teamId);
    const isCaptain = team.members.some((x) => x.id === user.id && x.isCaptain);
    const { bots } = await this.bots.botsForMatch(teamId, m.stageId);
    const sel = m.selections.find((s) => s.gameNo === m.currentNo && s.teamId === teamId) ?? null;
    let reason: string | null = null;
    if (OFFLINE.has(m.kind))
      reason = 'Bán kết/chung kết: dùng bài BTC đã thu qua USB và khóa, không chọn lại trong phòng.';
    else if (FIXED_BOT.has(m.kind))
      reason = 'Sơ loại: dùng bot đội đã chốt cho cả mức, không chọn lại giữa các hiệp/vòng.';
    else if (m.status !== 'selecting')
      reason = m.status === 'completed' ? 'Trận đã kết thúc.' : 'Chưa tới thời gian chọn cho hiệp tiếp theo.';
    else if (!isCaptain) reason = 'Chỉ đội trưởng chọn bot và quân thứ 10.';
    else if (!bots.length) reason = 'Đội chưa có bộ bot đã khóa cho giai đoạn này. Liên hệ BTC.';
    return {
      matchId: m.id,
      gameNo: m.currentNo,
      side,
      isCaptain,
      allowedBots: bots,
      current: sel
        ? { botVersionId: sel.botVersionId, extraType: sel.extraType as PieceType, ready: sel.ready }
        : null,
      canChoose: reason === null,
      reason,
    };
  }

  /** Đội trưởng gửi lựa chọn kín cho hiệp đang chọn. Đổi được cho tới khi khóa. */
  async choose(user: SessionUser, roomId: string, raw: unknown, requestId: string) {
    const input = parse(MatchChoiceRequest, raw);
    const mine = await this.mySelection(user, roomId);
    if (!mine) throw forbidden('Đội của bạn không thi trong phòng này.');
    if (!mine.canChoose) throw conflict(mine.reason ?? 'Không chọn được lúc này.');
    if (!mine.allowedBots.some((b) => b.id === input.botVersionId))
      throw forbidden('Bot không thuộc bộ bot của đội cho giai đoạn này.');
    const roomMatch = await this.repo.latestOfRoom(roomId);
    const chooseExtra = this.competition.format(roomMatch!.kind as Kind).chooseExtra;
    await this.prisma.$transaction(async (tx) => {
      const m = await this.repo.lock(tx, mine.matchId);
      if (!m || m.status !== 'selecting' || m.currentNo !== mine.gameNo)
        throw conflict('Hiệp đã khóa lựa chọn. Tải lại phòng.');
      const teamId = mine.side === 'a' ? m.teamAId! : m.teamBId!;
      await this.repo.upsertSelection(
        tx,
        { matchId: m.id, gameNo: m.currentNo, teamId },
        {
          botVersionId: input.botVersionId,
          extraType: chooseExtra ? input.extraType : 'PAPER',
          ready: input.ready,
          auto: false,
        },
      );
      // Không ghi bot/quân vào nhật ký công khai trước khi khóa; chỉ ghi đã chọn.
      await this.audit.record(
        {
          actorId: user.id,
          action: 'match.selection',
          target: m.id,
          requestId,
          data: json({ gameNo: m.currentNo, teamId, ready: input.ready }),
        },
        tx,
      );
    });
    this.notify(roomId);
    if (input.ready) await this.advance(mine.matchId);
    return this.mySelection(user, roomId);
  }

  /** BTC khóa ngay lựa chọn của hiệp đang chọn (không chờ hết giờ). Đội chưa chọn dùng lựa chọn dự phòng. */
  async forceLock(matchId: string, actor: Actor, reason: string) {
    const m = await this.repo.find(matchId);
    if (!m) throw notFound('trận');
    if (m.status !== 'selecting') throw conflict('Trận không ở bước chọn.');
    await this.prisma.match.update({ where: { id: matchId }, data: { deadlineAt: new Date() } });
    await this.audit.record({
      actorId: actor.id,
      action: 'match.force_lock',
      target: matchId,
      reason,
      requestId: actor.requestId,
    });
    await this.advance(matchId);
    return this.view(matchId);
  }

  /** Khóa ngay mọi trận đang chọn của một giải (BTC dùng khi thử nghiệm hoặc khi đã hết thời gian thực tế). */
  async forceLockAll(tournamentId: string, actor: Actor, reason: string) {
    const pairs = await this.competition.pairAssignments(tournamentId);
    const roomIds = pairs.filter((p) => p.matchId).map((p) => pairingRoomId(p.id));
    const list = await this.repo.selecting(roomIds);
    for (const m of list)
      await this.forceLock(m.id, actor, reason).catch((e: Error) => this.log.warn(e.message));
    return { locked: list.length };
  }

  /** Ván lỗi → BTC cho chạy lại hiệp: giữ nguyên bot, quân thứ 10, màu, tung xu và seed của ván lỗi. */
  async rerunGame(matchId: string, actor: Actor, reason: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const m = await this.repo.lock(tx, matchId);
      if (!m) throw notFound('trận');
      if (m.status !== 'paused') throw conflict('Chỉ chạy lại khi trận đang tạm dừng vì ván lỗi.');
      const failed = [...m.games].reverse().find((g) => g.status === 'failed');
      if (!failed) throw conflict('Không có ván lỗi để chạy lại. Kiểm tra lý do tạm dừng.');
      const blue = failed.choices.find((c) => c.side === 'blue')!;
      const pink = failed.choices.find((c) => c.side === 'pink')!;
      const game = await this.createGame(tx, m, {
        blue: {
          teamId: blue.teamId,
          botVersionId: blue.botVersionId,
          extraType: (blue.extraType ?? 'PAPER') as PieceType,
        },
        pink: {
          teamId: pink.teamId,
          botVersionId: pink.botVersionId,
          extraType: (pink.extraType ?? 'PAPER') as PieceType,
        },
        coin: failed.coinResult as unknown as CoinResult,
        seed: failed.seed,
      });
      await tx.match.update({ where: { id: m.id }, data: { status: 'running', pauseReason: null } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'match.rerun_game',
          target: m.id,
          reason,
          requestId: actor.requestId,
          data: json({ failedGameId: failed.id, gameId: game.id }),
        },
        tx,
      );
      return { roomId: m.roomId, gameId: game.id };
    });
    this.bots.kick();
    this.notify(out.roomId);
    return out;
  }

  // ================================================================== chuyển trạng thái

  /** Một bước của máy trạng thái trận. An toàn khi gọi lặp hoặc gọi đồng thời (khóa hàng Match). */
  async advance(matchId: string): Promise<void> {
    // Một trận chỉ có một lần xử lý tại một thời điểm; yêu cầu đến trong lúc đó được gộp thành MỘT lần chạy tiếp.
    // Tránh hàng trăm transaction chờ khóa cùng một hàng Match (cạn pool kết nối khi worker báo tín hiệu dồn dập).
    if (this.inFlight.has(matchId)) {
      this.again.add(matchId);
      return;
    }
    this.inFlight.add(matchId);
    try {
      do {
        this.again.delete(matchId);
        await this.advanceOnce(matchId);
      } while (this.again.has(matchId));
    } finally {
      this.inFlight.delete(matchId);
    }
  }

  private async advanceOnce(matchId: string): Promise<void> {
    if (await this.cancelIfStale(matchId)) return;
    let complete = false;
    let roomId: string | null = null;
    let kicked = false;
    let nextNow = false;
    await this.prisma.$transaction(
      async (tx) => {
        const m = await this.repo.lock(tx, matchId);
        if (!m || !m.teamAId || !m.teamBId) return;
        roomId = m.roomId;
        const kind = m.kind as Kind;
        if (m.status === 'selecting') {
          const sels = m.selections.filter((s) => s.gameNo === m.currentNo);
          let a = sels.find((s) => s.teamId === m.teamAId);
          let b = sels.find((s) => s.teamId === m.teamBId);
          const expired = !!m.deadlineAt && m.deadlineAt <= new Date();
          const fixed = FIXED_BOT.has(kind);
          // Giải trải nghiệm tự điều hành: đội mẫu (không người điều khiển) dùng lựa chọn mặc định ngay.
          if (!fixed && m.pairId) {
            const auto = await this.competition.systemTeams(m.pairId);
            if (auto.has(m.teamAId) && !a?.ready) a = (await this.fallback(tx, m, m.teamAId)) ?? a;
            if (auto.has(m.teamBId) && !b?.ready) b = (await this.fallback(tx, m, m.teamBId)) ?? b;
          }
          if (!fixed && !(a?.ready && b?.ready) && !expired) return;
          const fixedChoice = (teamId: string) =>
            OFFLINE.has(kind) ? this.offlineChoice(tx, m, teamId) : this.levelChoice(tx, m, teamId);
          const choiceA = fixed
            ? await fixedChoice(m.teamAId)
            : (a ?? (await this.fallback(tx, m, m.teamAId)));
          const choiceB = fixed
            ? await fixedChoice(m.teamBId)
            : (b ?? (await this.fallback(tx, m, m.teamBId)));
          if (!choiceA || !choiceB) {
            const who = !choiceA ? m.teamAId : m.teamBId;
            const names = await this.accounts.teamNames([who]);
            await tx.match.update({
              where: { id: m.id },
              data: {
                status: 'paused',
                pauseReason: `Đội ${names.get(who) ?? who} không có bot hợp lệ để thi hiệp ${m.currentNo}. BTC xử lý theo quy định.`,
              },
            });
            return;
          }
          // Tung xu độc lập từng hiệp ở loại trực tiếp (cả bán kết/chung kết); Swiss/tranh suất: xu ở ván 1,
          // các ván sau đổi màu luân phiên.
          const last = [...m.games].reverse().find((g) => g.status === 'finished');
          let aBlue: boolean;
          if ((kind !== 'swiss' && kind !== 'tiebreak') || !last) aBlue = randomInt(2) === 0;
          else aBlue = last.blueTeamId !== m.teamAId;
          const blueTeamId = aBlue ? m.teamAId : m.teamBId;
          const pinkTeamId = aBlue ? m.teamBId : m.teamAId;
          const coin: CoinResult = {
            winnerTeamId: blueTeamId,
            blueTeamId,
            pinkTeamId,
            decidedAt: new Date().toISOString(),
          };
          const blueSel = aBlue ? choiceA : choiceB;
          const pinkSel = aBlue ? choiceB : choiceA;
          await this.createGame(tx, m, {
            blue: {
              teamId: blueTeamId,
              botVersionId: blueSel.botVersionId,
              extraType: blueSel.extraType as PieceType,
            },
            pink: {
              teamId: pinkTeamId,
              botVersionId: pinkSel.botVersionId,
              extraType: pinkSel.extraType as PieceType,
            },
            coin,
            seed: randomInt(0, 2 ** 31 - 1),
          });
          await tx.match.update({ where: { id: m.id }, data: { status: 'running', deadlineAt: null } });
          kicked = true;
          return;
        }
        if (m.status === 'running') {
          const room = await this.rooms.findRoom(m.roomId, tx);
          const game = m.games.find((g) => g.id === room?.currentGameId) ?? m.games.at(-1);
          if (!game) return;
          if (game.status === 'failed') {
            await tx.match.update({
              where: { id: m.id },
              data: {
                status: 'paused',
                pauseReason: `Hiệp ${m.currentNo} lỗi khi chạy (worker đã thử lại). BTC kiểm tra và cho chạy lại hiệp.`,
              },
            });
            return;
          }
          if (game.status !== 'finished' || !game.result) return;
          const outcome: Outcome =
            game.result.winnerTeamId === m.teamAId
              ? 'a'
              : game.result.winnerTeamId === m.teamBId
                ? 'b'
                : null;
          const outcomes = [...outcomesOf(m), outcome];
          const f = this.competition.format(kind);
          const pts = (side: 'a' | 'b') =>
            outcomes.reduce((s, o) => s + (o === side ? f.win : o === null ? f.draw : 0), 0);
          const need = this.competition.gamesNeeded(kind, outcomes);
          if (need > 0) {
            await tx.match.update({
              where: { id: m.id },
              data: {
                outcomes: json(outcomes),
                scoreA: pts('a'),
                scoreB: pts('b'),
                status: 'selecting',
                currentNo: m.currentNo + 1,
                deadlineAt: this.deadline(),
              },
            });
            if (!FIXED_BOT.has(kind) && m.pairId) {
              const title = (await this.competition.assignment(m.pairId)).title;
              await this.notifySelection(tx, m, title, m.currentNo + 1);
            }
            await tx.room.update({ where: { id: m.roomId }, data: { status: 'waiting' } });
            // Sơ loại không có bước chọn: tạo hiệp kế tiếp ngay. Giải tự điều hành: đội mẫu chọn ngay (trận hai đội
            // mẫu chạy tiếp luôn, không chờ hết hạn chọn).
            nextNow =
              FIXED_BOT.has(kind) || (!!m.pairId && (await this.competition.systemTeams(m.pairId)).size > 0);
            return;
          }
          await tx.match.update({
            where: { id: m.id },
            data: {
              outcomes: json(outcomes),
              scoreA: pts('a'),
              scoreB: pts('b'),
              status: 'completed',
              completedAt: new Date(),
            },
          });
          await tx.room.update({ where: { id: m.roomId }, data: { status: 'finished' } });
          complete = !!m.pairId;
        }
      },
      { timeout: 30_000 },
    );
    if (kicked) this.bots.kick();
    if (nextNow) this.again.add(matchId);
    // Bàn giao sau khi commit; nếu tiến trình dừng ngay đây, bộ hẹn giờ sẽ gửi bù (reportedAt vẫn null).
    if (complete) await this.report(matchId);
    if (roomId) this.notify(roomId);
  }

  /**
   * TV4 → TV3 (MatchCompleted): gửi danh sách ván/hiệp của trận đã xong cho TV3. Idempotent: chỉ gửi khi cặp vẫn
   * chờ kết quả và vẫn gắn với chính trận này; xong (hoặc không còn gì để gửi) thì đánh dấu reportedAt.
   */
  async report(matchId: string): Promise<void> {
    const m = await this.repo.find(matchId);
    if (!m || m.status !== 'completed' || m.reportedAt || !m.pairId) return;
    const mark = (pauseReason?: string) =>
      this.prisma.match.update({
        where: { id: m.id },
        data: { reportedAt: new Date(), ...(pauseReason ? { pauseReason } : {}) },
      });
    let a: Awaited<ReturnType<CompetitionService['assignment']>>;
    try {
      a = await this.competition.assignment(m.pairId);
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') {
        await mark('Cặp đấu không còn tồn tại (giải đã được đặt lại); kết quả trận không được tính.');
        return;
      }
      throw e;
    }
    if (a.matchId !== m.id || a.status !== 'scheduled') {
      // Cặp đã có kết quả khác (nhập tay) hoặc đã gắn trận mới (thi lại): trận này không còn là nguồn kết quả.
      await mark();
      return;
    }
    try {
      await this.competition.recordResult(
        m.pairId,
        outcomesOf(m),
        'match',
        { id: null },
        'Kết quả trận từ phòng đấu',
      );
      await mark();
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // lỗi tạm thời (DB...): để lần sau gửi lại
      this.log.warn(`TV3 từ chối kết quả trận ${m.id}: ${e.message}`);
      await mark(`Trận xong nhưng TV3 không nhận kết quả: ${e.message}. BTC nhập kết quả thủ công.`);
    }
    this.notify(m.roomId);
  }

  /**
   * Cặp đấu đã bị xóa (đặt lại phần thi đấu) hoặc đã gắn trận khác (thi lại vòng/khiếu nại) → hủy trận này để không
   * chạy ván vô ích và không tranh kết quả với trận mới. Trả true nếu đã hủy / không cần xử lý tiếp.
   */
  private async cancelIfStale(matchId: string): Promise<boolean> {
    const m = await this.repo.find(matchId);
    if (!m || !m.pairId || !['selecting', 'running', 'paused'].includes(m.status)) return false;
    let stale = false;
    try {
      const a = await this.competition.assignment(m.pairId);
      stale = a.matchId !== m.id;
    } catch (e) {
      if (!(e instanceof AppError && e.code === 'NOT_FOUND')) throw e;
      stale = true;
    }
    if (!stale) return false;
    await this.prisma.match.updateMany({
      where: { id: m.id, status: { in: ['selecting', 'running', 'paused'] } },
      data: {
        status: 'cancelled',
        deadlineAt: null,
        reportedAt: new Date(),
        pauseReason: 'Cặp đấu đã được đặt lại hoặc thi lại; trận này không còn hiệu lực.',
      },
    });
    this.log.log(`Hủy trận ${m.id}: cặp đấu không còn gắn với trận.`);
    this.notify(m.roomId);
    return true;
  }

  /** Tóm tắt các phòng của cặp đang chờ thi trong giải (cho bảng điều hành BTC). */
  async summary(tournamentId: string) {
    const pairs = await this.competition.pairAssignments(tournamentId);
    const ids = pairs.map((p) => p.matchId).filter((x): x is string => !!x);
    const matches = await this.repo.statuses(ids);
    const count = (st: string) => matches.filter((m) => m.status === st).length;
    // Mỗi trận nhiều hiệp: các phòng trong cùng vòng có thể đang ở hiệp khác nhau.
    const byGame = new Map<number, { no: number; selecting: number; running: number }>();
    for (const m of matches) {
      if (m.status !== 'selecting' && m.status !== 'running') continue;
      const g = byGame.get(m.currentNo) ?? { no: m.currentNo, selecting: 0, running: 0 };
      g[m.status] += 1;
      byGame.set(m.currentNo, g);
    }
    return {
      byGame: [...byGame.values()].sort((a, b) => a.no - b.no),
      pending: pairs.length,
      notOpened: pairs.length - ids.length,
      selecting: count('selecting'),
      running: count('running'),
      paused: count('paused'),
      completed: count('completed'),
    };
  }

  /** Tín hiệu từ worker cho một phòng: thử chuyển trạng thái trận đang chạy trong phòng đó. */
  async advanceRoom(roomId: string): Promise<void> {
    if (this.roomChecks.has(roomId)) return;
    this.roomChecks.add(roomId);
    try {
      const m = await this.repo.latestOfRoom(roomId);
      if (!m || m.status !== 'running') return;
      // Worker báo tín hiệu ở MỖI nước; chỉ xử lý khi ván mới nhất đã xong hoặc lỗi.
      const last = m.games.at(-1);
      if (last && (last.status === 'finished' || last.status === 'failed')) await this.advance(m.id);
    } finally {
      this.roomChecks.delete(roomId);
    }
  }

  // ================================================================== xem

  /** Trạng thái công khai của trận mới nhất trong phòng; không lộ lựa chọn chưa khóa. */
  async viewOfRoom(roomId: string): Promise<MatchView | null> {
    const m = await this.repo.latestOfRoom(roomId);
    return m ? this.toView(m) : null;
  }

  async view(matchId: string): Promise<MatchView | null> {
    const m = await this.repo.find(matchId);
    return m ? this.toView(m) : null;
  }

  private async toView(m: MatchRow): Promise<MatchView | null> {
    if (m.kind === 'demo' || !m.teamAId || !m.teamBId) return null;
    const kind = m.kind as Kind;
    const f = this.competition.format(kind);
    const labels = await this.bots.botLabels([
      ...new Set(m.games.flatMap((g) => g.choices.map((c) => c.botVersionId))),
    ]);
    const outcomes = outcomesOf(m);
    const sels = m.selections.filter((s) => s.gameNo === m.currentNo);
    const state = (teamId: string) => {
      const s = sels.find((x) => x.teamId === teamId);
      return { chosen: !!s, ready: !!s?.ready };
    };
    let finishedIndex = 0;
    const games = m.games.map((g) => {
      const finished = g.status === 'finished';
      const outcome = finished ? (outcomes[finishedIndex] ?? null) : null;
      if (finished) finishedIndex++;
      const choiceOf = (teamId: string) => {
        const c = g.choices.find((x) => x.teamId === teamId);
        return {
          botLabel: c ? (labels.get(c.botVersionId) ?? 'Bot') : '—',
          extraType: (c?.extraType ?? 'PAPER') as PieceType,
        };
      };
      return {
        no: g.no,
        gameId: g.id,
        status: g.status,
        outcome,
        finished,
        blueTeamId: g.blueTeamId,
        choices: { a: choiceOf(m.teamAId!), b: choiceOf(m.teamBId!) },
      };
    });
    const winnerTeamId =
      m.status === 'completed'
        ? m.scoreA > m.scoreB
          ? m.teamAId
          : m.scoreB > m.scoreA
            ? m.teamBId
            : null
        : null;
    return {
      matchId: m.id,
      pairingId: m.pairId,
      kind,
      status: m.status as MatchView['status'],
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      mainGames: f.mainGames,
      chooseExtra: f.chooseExtra,
      currentNo: m.currentNo,
      deadline: m.deadlineAt?.toISOString() ?? null,
      pauseReason: m.pauseReason,
      selection: m.status === 'selecting' ? { a: state(m.teamAId), b: state(m.teamBId) } : null,
      games,
      winnerTeamId,
    };
  }

  // ================================================================== nội bộ

  private deadline(): Date {
    return new Date(Date.now() + this.cfg.matchSelectSeconds * 1000);
  }

  /**
   * Hết giờ mà đội chưa chọn (đề xuất cho Q08, chờ BTC chốt): dùng lại lựa chọn hiệp trước của đội;
   * chưa có hiệp trước thì bot đầu tiên trong bộ được phép với quân thứ 10 mặc định (Bao). Ghi auto = true.
   */
  private async fallback(tx: Tx, m: MatchRow, teamId: string) {
    const prev = [...m.selections]
      .filter((s) => s.teamId === teamId && s.gameNo < m.currentNo)
      .sort((x, y) => y.gameNo - x.gameNo)[0];
    const { bots } = await this.bots.botsForMatch(teamId, m.stageId);
    const botVersionId =
      prev && bots.some((b) => b.id === prev.botVersionId) ? prev.botVersionId : bots[0]?.id;
    if (!botVersionId) return null;
    return this.repo.upsertSelection(
      tx,
      { matchId: m.id, gameNo: m.currentNo, teamId },
      { botVersionId, extraType: prev?.extraType ?? 'PAPER', ready: true, auto: true },
    );
  }

  /** Loại trực tiếp: báo thành viên hai đội mở chọn kín hiệp `no` (mỗi hiệp một lần); đội mẫu không có thành viên. */
  private async notifySelection(
    tx: Tx,
    m: { id: string; roomId: string; teamAId: string | null; teamBId: string | null },
    pairingTitle: string,
    no: number,
  ) {
    const teams = [m.teamAId, m.teamBId].filter((x): x is string => !!x);
    const members = await tx.membership.findMany({
      where: { teamId: { in: teams } },
      select: { accountId: true },
    });
    if (!members.length) return;
    const stage = pairingTitle.split(' · ')[0] ?? 'Loại trực tiếp';
    const deadline = new Date(Date.now() + this.cfg.matchSelectSeconds * 1000).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
    await this.notifications.deliver(
      tx,
      members.map((x) => x.accountId),
      `match:select:${m.id}:${no}`,
      `${stage} · Hiệp ${no}: chọn bot và quân thứ 10`,
      `Đội trưởng chọn kín trong phòng trước ${deadline}. Hết hạn chưa chọn, hệ thống dùng lựa chọn mặc định.`,
      `/rooms/${m.roomId}`,
    );
  }

  /** Sơ loại (Swiss/tranh suất): bot đội đã chốt cho mức, quân thứ 10 mặc định. Thiếu/không còn hợp lệ → như hết giờ. */
  private async levelChoice(tx: Tx, m: MatchRow, teamId: string) {
    const botVersionId = m.pairId ? await this.competition.levelBotFor(tx, m.pairId, teamId) : null;
    const { bots } = await this.bots.botsForMatch(teamId, m.stageId);
    if (!botVersionId || !bots.some((b) => b.id === botVersionId)) return this.fallback(tx, m, teamId);
    return this.repo.upsertSelection(
      tx,
      { matchId: m.id, gameNo: m.currentNo, teamId },
      { botVersionId, extraType: 'PAPER', ready: true, auto: false },
    );
  }

  /** Bán kết/chung kết: bài USB đã khóa và qua kiểm tra của đội; không có thì null (trận tạm dừng, BTC xử lý). */
  private async offlineChoice(tx: Tx, m: MatchRow, teamId: string) {
    const c = m.pairId ? await this.competition.finalsChoice(tx, m.pairId, teamId) : null;
    if (!c) return null;
    return this.repo.upsertSelection(
      tx,
      { matchId: m.id, gameNo: m.currentNo, teamId },
      { botVersionId: c.botVersionId, extraType: c.extraType, ready: true, auto: false },
    );
  }

  /** Tạo ván cho hiệp hiện tại: lưu tung xu, lựa chọn đã khóa, sự kiện game.created và GameJob trong cùng transaction. */
  private async createGame(
    tx: Tx,
    m: MatchRow,
    input: {
      blue: { teamId: string; botVersionId: string; extraType: PieceType };
      pink: { teamId: string; botVersionId: string; extraType: PieceType };
      coin: CoinResult;
      seed: number;
    },
  ) {
    const no = (m.games.at(-1)?.no ?? 0) + 1;
    const rulesetId = this.competition.rulesetFor(m.kind) ?? STANDARD_RULESET_ID;
    const game = await this.rooms.createGame(tx, {
      matchId: m.id,
      roomId: m.roomId,
      no,
      rulesetId,
      seed: input.seed,
      maxPlies: DEMO_LIMITS.maxPlies,
      blueTeamId: input.blue.teamId,
      pinkTeamId: input.pink.teamId,
      coinResult: json(input.coin),
      lastSeq: 1,
    });
    await this.rooms.createChoices(tx, [
      {
        gameId: game.id,
        side: 'blue',
        teamId: input.blue.teamId,
        botVersionId: input.blue.botVersionId,
        extraType: input.blue.extraType,
      },
      {
        gameId: game.id,
        side: 'pink',
        teamId: input.pink.teamId,
        botVersionId: input.pink.botVersionId,
        extraType: input.pink.extraType,
      },
    ]);
    await this.rooms.createEvent(tx, {
      gameId: game.id,
      streamId: streamIdOf(game.id),
      seq: 1,
      type: 'game.created',
      payload: { gameId: game.id, rulesetId, coin: input.coin },
    });
    // Bộ bot đã khóa của cả hai đội → gửi stageId để TV2 kiểm tra lại; demo chưa khóa thì không gửi.
    const [lockA, lockB] = await Promise.all([
      this.bots.botsForMatch(input.blue.teamId, m.stageId),
      this.bots.botsForMatch(input.pink.teamId, m.stageId),
    ]);
    await this.bots.createGameJob(
      tx,
      {
        contractVersion: CONTRACT_VERSION,
        requestKey: `match:${m.id}:${no}`,
        gameId: game.id,
        ...(m.stageId && lockA.locked && lockB.locked ? { stageId: m.stageId } : {}),
        choices: {
          blue: { botVersionId: input.blue.botVersionId, extraType: input.blue.extraType },
          pink: { botVersionId: input.pink.botVersionId, extraType: input.pink.extraType },
        },
        rulesetId,
        seed: input.seed,
        limits: DEMO_LIMITS,
      },
      m.roomId,
    );
    await tx.room.update({ where: { id: m.roomId }, data: { currentGameId: game.id, status: 'waiting' } });
    return game;
  }
}
