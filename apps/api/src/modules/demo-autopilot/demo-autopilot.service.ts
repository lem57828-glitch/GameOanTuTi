// Demo một thí sinh: thí sinh bấm "Tiếp theo", máy chủ làm bước BTC kế tiếp của giải trải nghiệm tự điều hành.
// Chỉ gọi lại đúng các thao tác BTC/TV4 đang có (lập kế hoạch, khóa mức, ghép vòng, mở phòng, xác nhận, chốt);
// trận vẫn do worker chạy bot thật, không sinh kết quả. Dừng lại khi còn trận đang thi, cần đội chọn kín hoặc có
// khiếu nại mở. Chỉ chạy khi DEMO_MODE bật (@DemoOnly), giải loại "experience" và đã bật tự điều hành.
import { Injectable, Logger } from '@nestjs/common';
import type { AutopilotAdvanceRequest, AutopilotView, CompetitionView, SessionUser } from '@arena/contracts';
import { conflict, forbidden } from '../../core/errors.js';
import { AccountsTeamsService } from '../accounts-teams/accounts-teams.service.js';
import { CommunityService } from '../accounts-teams/community.service.js';
import { BotsRunnerService } from '../bots-runner/bots-runner.service.js';
import { MatchesService } from '../rooms-matches/matches.service.js';
import { CompetitionService } from '../tournaments/competition.service.js';

const MAX_STEPS = 12;
type Phase = 'r32' | 'r16' | 'qf';

@Injectable()
export class DemoAutopilotService {
  private readonly log = new Logger('DemoAutopilot');
  private readonly busy = new Set<string>();

  constructor(
    private readonly competition: CompetitionService,
    private readonly matches: MatchesService,
    private readonly accounts: AccountsTeamsService,
    private readonly bots: BotsRunnerService,
    private readonly community: CommunityService,
  ) {}

  /**
   * BTC tự động duyệt các đội đã đăng ký (đang chờ duyệt) khi giải còn mở đăng ký, theo đúng luật của TV1
   * (2–3 thành viên, đủ điều kiện dự thi). Trả lý do của đội chưa duyệt được.
   */
  private async approvePending(tournamentId: string): Promise<Array<{ teamId: string; text: string }>> {
    const problems: Array<{ teamId: string; text: string }> = [];
    for (const t of await this.accounts.tournamentTeams(tournamentId)) {
      if (t.status !== 'draft') continue;
      await this.community
        .updateTeam(null, t.id, {
          status: 'approved',
          reason: 'BTC tự động (giải trải nghiệm demo) duyệt đội đủ điều kiện',
        })
        .catch((e: Error) => problems.push({ teamId: t.id, text: `${t.name}: ${e.message}` }));
    }
    return problems;
  }

  /** Số đội đã duyệt chưa có bot hợp lệ (bot GitHub mới nộp đang chờ worker kiểm thử). Khóa mức lúc đó sẽ làm trận tạm dừng. */
  private async teamsWithoutBot(tournamentId: string): Promise<number> {
    const teams = (await this.accounts.tournamentTeams(tournamentId)).filter((t) =>
      ['approved', 'locked'].includes(t.status),
    );
    let missing = 0;
    for (const t of teams) if (!(await this.bots.botsForMatch(t.id, null)).bots.length) missing++;
    return missing;
  }

  private async ownTeamState(user: SessionUser, tournamentId: string) {
    if (!user.teamId) return null;
    const team = (await this.accounts.tournamentTeams(tournamentId)).find((t) => t.id === user.teamId);
    if (!team) return null;
    const hasBot = (await this.bots.botsForMatch(team.id, null)).bots.length > 0;
    return { status: team.status, hasBot };
  }

  private async guard(user: SessionUser, tournamentId: string) {
    const c = await this.competition.overview(tournamentId);
    if (c.demoKind !== 'experience' || !c.autopilot)
      throw forbidden('Giải này không bật chế độ tự điều hành.');
    if (user.role !== 'admin') {
      const teams = await this.accounts.tournamentTeams(tournamentId);
      if (!user.teamId || !teams.some((t) => t.id === user.teamId))
        throw forbidden('Chỉ đội tham gia giải mới điều khiển được bản demo này.');
    }
    return c;
  }

  /** Trạng thái để hiện nút "Tiếp theo": bước kế tiếp, tiến độ lượt đang thi, phòng đội bạn cần chọn kín. */
  async status(user: SessionUser, tournamentId: string): Promise<AutopilotView> {
    const c = await this.guard(user, tournamentId);
    return this.view(user, c, null);
  }

  /** Làm các bước BTC liên tiếp cho tới khi có trận đang thi (hoặc cần đội chọn kín / có khiếu nại / hết giải). */
  async advance(user: SessionUser, tournamentId: string, input: AutopilotAdvanceRequest, requestId: string) {
    await this.guard(user, tournamentId);
    if (this.busy.has(tournamentId)) throw conflict('Đang chuyển bước, đợi một chút.');
    this.busy.add(tournamentId);
    const actor = { id: null, requestId };
    const reason = `Tự điều hành giải trải nghiệm (demo) — ${user.displayName} bấm Tiếp theo`;
    let message: string | null = null;
    try {
      const first = await this.competition.overview(tournamentId);
      if (first.next.action === 'plan' || first.next.action === 'lock-level') {
        const problems = await this.approvePending(tournamentId);
        // Đội chưa duyệt không vào giải nên không chặn các đội khác; chỉ dừng khi chính đội của người bấm chưa đủ điều kiện.
        const own = problems.find((p) => p.teamId === user.teamId);
        if (own) return this.view(user, first, `Đội bạn chưa được duyệt: ${own.text}`);
        if (problems.length)
          message = `Bỏ qua đội chưa đủ điều kiện (không dự thi): ${problems.map((p) => p.text).join('; ')}`;
      }
      for (let i = 0; i < MAX_STEPS; i++) {
        const c = await this.competition.overview(tournamentId);
        const { action, blockedReason } = c.next;
        if (blockedReason && action !== 'results') {
          message = blockedReason;
          break;
        }
        if (action === 'plan' || action === 'lock-level') {
          const own = await this.ownTeamState(user, tournamentId);
          if (own && !own.hasBot) {
            message = null; // view() báo hướng dẫn nộp bot cho đội của bạn
            break;
          }
          const missing = await this.teamsWithoutBot(tournamentId);
          if (missing) {
            message = `Đang chờ worker kiểm thử bot của ${missing} đội. Thử lại sau ít giây.`;
            break;
          }
        }
        if (action === 'plan') {
          await this.competition.plan(
            tournamentId,
            { targets: c.suggestedTargets, rounds: 3, avoidRematch: 'qualifier', reason },
            actor,
          );
        } else if (action === 'lock-level') {
          await this.competition.lockNextLevel(tournamentId, actor, reason);
        } else if (action === 'start-round') {
          await this.competition.startRound(tournamentId, actor, reason);
          await this.openAll(tournamentId, actor);
          break;
        } else if (action === 'confirm-round') {
          const active = c.levels.find((l) => l.status === 'running');
          if (!active) break;
          await this.competition.confirmRound(tournamentId, active.roundsPlayed, actor, reason);
        } else if (action === 'finish-level') {
          await this.competition.finishLevel(tournamentId, actor, reason);
        } else if (action.startsWith('start-phase:')) {
          await this.competition.startPhase(tournamentId, action.split(':')[1] as Phase, actor, reason);
          await this.openAll(tournamentId, actor);
          const after = await this.competition.overview(tournamentId);
          if (after.next.action === 'results') break; // có trận thật; vòng toàn xử thắng vắng đối thủ thì đi tiếp
        } else if (action.startsWith('confirm-phase:')) {
          await this.competition.confirmPhase(tournamentId, action.split(':')[1] as Phase, actor, reason);
        } else if (action.startsWith('finals-')) {
          // Bán kết/chung kết: giả lập thu bài USB (bot hợp lệ mới nhất của mỗi đội) → khóa → thi → chốt.
          const [step, phase] = action.slice('finals-'.length).split(':') as [string, 'sf' | 'final'];
          if (step === 'lock') {
            await this.competition.demoCollectFinals(tournamentId, phase, actor, reason);
            await this.competition.lockFinals(tournamentId, phase, actor, reason);
          } else if (step === 'start') {
            await this.competition.startFinals(tournamentId, phase, actor, reason);
            await this.openAll(tournamentId, actor);
            const after = await this.competition.overview(tournamentId);
            if (after.next.action === 'results') break;
          } else {
            await this.competition.confirmFinals(tournamentId, phase, actor, reason);
          }
        } else if (action === 'results') {
          // Cặp chưa mở phòng (vd. tranh suất vừa sinh) → mở; đội bạn đồng ý dùng lựa chọn mặc định → khóa ngay.
          await this.openAll(tournamentId, actor);
          if (input.useDefault) await this.lockMine(user, tournamentId, actor, reason);
          message = 'Các trận của lượt này đang chạy. Khi xong, bấm Tiếp theo để sang bước sau.';
          break;
        } else {
          break; // done | none
        }
      }
    } finally {
      this.busy.delete(tournamentId);
    }
    this.log.log(`Giải ${tournamentId}: tự điều hành theo yêu cầu của ${user.id}`);
    return this.view(user, await this.competition.overview(tournamentId), message);
  }

  /** Mở phòng cho mọi cặp đang chờ và cho trận chạy bước đầu (loại trực tiếp: đội mẫu tự chọn ngay). */
  private async openAll(tournamentId: string, actor: { id: null; requestId: string }) {
    await this.matches.openForTournament(tournamentId, actor);
    for (const p of await this.competition.pairAssignments(tournamentId))
      if (p.matchId) await this.matches.advance(p.matchId);
  }

  /** Thí sinh bấm "dùng lựa chọn mặc định" cho hiệp đang chọn của đội mình. */
  private async lockMine(
    user: SessionUser,
    tournamentId: string,
    actor: { id: null; requestId: string },
    reason: string,
  ) {
    for (const p of await this.competition.pairAssignments(tournamentId)) {
      if (!p.matchId || (p.teamAId !== user.teamId && p.teamBId !== user.teamId)) continue;
      await this.matches.forceLock(p.matchId, actor, reason).catch(() => undefined);
    }
  }

  private async view(user: SessionUser, c: CompetitionView, message: string | null): Promise<AutopilotView> {
    const { action, label } = c.next;
    let waiting: AutopilotView['waiting'] = null;
    const running = c.levels.find((l) => l.status === 'running');
    const phase =
      c.bracket.find((r) => r.status === 'running') ?? c.finals?.rounds.find((r) => r.status === 'running');
    if (action === 'results') {
      if (running?.roundsDetail.length) {
        const last = running.roundsDetail.at(-1)!;
        waiting = { done: last.done, total: last.total };
      } else if (phase) {
        const real = phase.pairings.filter((p) => p.teamA && p.teamB);
        waiting = { done: real.filter((p) => p.status === 'done').length, total: real.length };
      } else {
        waiting = { done: 0, total: c.pending.length };
      }
    }
    const needsChoice: AutopilotView['needsChoice'] = [];
    if (user.teamId)
      for (const p of c.pending) {
        if (p.kind !== 'knockout' || !p.roomId) continue;
        if (p.teamA?.id !== user.teamId && p.teamB?.id !== user.teamId) continue;
        const mine = await this.matches.mySelection(user, p.roomId).catch(() => null);
        if (mine?.canChoose && !mine.current?.ready) {
          const title = c.bracket.find((r) => r.phase === p.phase)?.title ?? 'Loại trực tiếp';
          needsChoice.push({ roomId: p.roomId, title: `${title} · hiệp ${mine.gameNo}` });
        }
      }
    const done = action === 'done';
    let pendingApproval = false;
    if (!message && (action === 'plan' || action === 'lock-level')) {
      const own = await this.ownTeamState(user, c.tournamentId);
      if (own?.status === 'draft') {
        pendingApproval = true;
        message = 'Đội bạn đang chờ duyệt: bấm Tiếp theo để BTC tự động duyệt (đội cần 2–3 thành viên).';
      } else if (own && !own.hasBot) {
        message =
          'Đội bạn chưa có bot hợp lệ để dự thi. Vào Bot của tôi, nộp bot qua GitHub (theo commit) và chờ kiểm thử xong.';
      } else {
        const missing = await this.teamsWithoutBot(c.tournamentId);
        if (missing) message = `Đang chờ worker kiểm thử bot của ${missing} đội (thường dưới một phút)…`;
      }
    }
    const botWait =
      !pendingApproval &&
      (!!message?.startsWith('Đang chờ worker') || !!message?.startsWith('Đội bạn chưa có bot'));
    return {
      enabled: true,
      step: label,
      waiting,
      needsChoice,
      canAdvance: !done && !botWait && action !== 'none' && (action !== 'results' || needsChoice.length > 0),
      done,
      message:
        message ??
        (needsChoice.length
          ? 'Đội bạn cần chọn kín bot và quân thứ 10 cho hiệp này: vào phòng chọn rồi bấm sẵn sàng, hoặc bấm "Dùng lựa chọn mặc định".'
          : null),
    };
  }
}
