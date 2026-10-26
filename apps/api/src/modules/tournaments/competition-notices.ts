// TV3 → TV1: thông báo trong web cho đội theo diễn biến thi đấu (khóa mức, ghép cặp, mở phòng, xác nhận,
// đi tiếp/dừng). Ghi trong cùng transaction với thao tác thi đấu; sourceKey cố định theo sự kiện nên thao tác
// lặp lại hay chạy lại không gửi trùng.
import { Injectable } from '@nestjs/common';
import type { Tx } from '../../core/prisma.service.js';
import { NotificationsService } from '../accounts-teams/notifications.service.js';

interface Message {
  teamId: string;
  key: string;
  title: string;
  body: string;
  href: string;
}
interface PairRow {
  id: string;
  kind: string;
  teamAId: string | null;
  teamBId: string | null;
  result?: string | null;
  scoreA?: number;
  scoreB?: number;
  resultVersion?: number;
}

const MY_TEAM = '/tournament?tab=mine';
const COMPETE = '/competition';
const at = (d: Date) =>
  d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

@Injectable()
export class CompetitionNotices {
  constructor(private readonly notifications: NotificationsService) {}

  private async send(tx: Tx, messages: Message[]) {
    if (!messages.length) return;
    const teamIds = [...new Set(messages.map((m) => m.teamId))];
    const members = await tx.membership.findMany({
      where: { teamId: { in: teamIds } },
      select: { teamId: true, accountId: true },
    });
    const byTeam = new Map<string, string[]>();
    for (const m of members) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m.accountId]);
    for (const m of messages) {
      const accounts = byTeam.get(m.teamId);
      if (accounts?.length) await this.notifications.deliver(tx, accounts, m.key, m.title, m.body, m.href);
    }
  }

  private async names(tx: Tx, ids: string[]) {
    const rows = await tx.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Mức sơ loại vừa khóa: bot đã chốt, sắp ghép vòng 1. */
  async levelLocked(
    tx: Tx,
    level: { id: string; name: string; rounds: number },
    entrants: string[],
    lockedAt: Date,
  ) {
    await this.send(
      tx,
      entrants.map((teamId) => ({
        teamId,
        key: `comp:level-lock:${level.id}:${lockedAt.getTime()}`,
        title: `${level.name} đã khóa`,
        body: `${level.name} bắt đầu với ${entrants.length} đội, ${level.rounds} vòng Swiss. Bot của đội đã được chốt cho cả mức. Cặp đấu sẽ báo khi BTC ghép vòng.`,
        href: MY_TEAM,
      })),
    );
  }

  /** Mở chọn bot cho mức sơ loại sắp tới (lập kế hoạch, đổi giờ khóa, hoặc nhắc trước giờ khóa). */
  async levelBot(
    tx: Tx,
    level: { id: string; name: string },
    teamIds: string[],
    botLockAt: Date | null,
    kind: 'open' | 'lock-at' | 'remind',
  ) {
    const when = botLockAt ? ` trước ${at(botLockAt)}` : ' trước khi BTC khóa mức';
    const title =
      kind === 'remind'
        ? `Sắp khóa bot ${level.name}${botLockAt ? ` lúc ${at(botLockAt)}` : ''}`
        : kind === 'lock-at'
          ? `Giờ khóa bot ${level.name}: ${botLockAt ? at(botLockAt) : 'BTC khóa bằng tay'}`
          : `Chọn bot cho ${level.name}`;
    await this.send(
      tx,
      teamIds.map((teamId) => ({
        teamId,
        key: `comp:level-${kind}:${level.id}:${botLockAt?.getTime() ?? 0}`,
        title,
        body: `Mỗi đội một bot cho mọi trận Swiss của ${level.name}. Đội trưởng chọn ở Thi đấu của đội${when}; chưa chọn thì dùng bot mặc định.`,
        href: COMPETE,
      })),
    );
  }

  /** Đã ghép cặp (vòng Swiss, tranh suất, hoặc vòng loại trực tiếp bắt đầu). */
  async paired(tx: Tx, label: string, pairings: PairRow[], note = 'Phòng đấu sẽ mở khi BTC bắt đầu thi.') {
    const teams = pairings.flatMap((p) => [p.teamAId, p.teamBId]).filter((x): x is string => !!x);
    const names = await this.names(tx, teams);
    const out: Message[] = [];
    for (const p of pairings) {
      if (p.kind === 'bye' && p.teamAId) {
        out.push({
          teamId: p.teamAId,
          key: `comp:pair:${p.id}`,
          title: `${label}: đội bạn được miễn đấu`,
          body: 'Đội bạn được miễn đấu (bye) ở vòng này và nhận 3 điểm.',
          href: MY_TEAM,
        });
        continue;
      }
      if (!p.teamAId || !p.teamBId) continue;
      for (const [me, opp] of [
        [p.teamAId, p.teamBId],
        [p.teamBId, p.teamAId],
      ] as const)
        out.push({
          teamId: me,
          key: `comp:pair:${p.id}`,
          title: `${label}: đã ghép cặp`,
          body: `Đội bạn gặp ${names.get(opp) ?? opp}. ${note}`,
          href: MY_TEAM,
        });
    }
    await this.send(tx, out);
  }

  /** TV4 vừa mở phòng cho cặp. */
  async roomOpened(tx: Tx, title: string, p: PairRow, roomId: string, matchId: string) {
    const note =
      p.kind === 'knockout'
        ? 'Đội trưởng vào phòng để chọn kín bot và quân thứ 10 cho từng hiệp.'
        : 'Trận chạy ngay với bot đội đã chốt cho mức; vào phòng để theo dõi.';
    await this.send(
      tx,
      [p.teamAId, p.teamBId]
        .filter((x): x is string => !!x)
        .map((teamId) => ({
          teamId,
          key: `comp:room:${matchId}`,
          title: 'Phòng đấu đã mở',
          body: `${title}. ${note}`,
          href: `/rooms/${roomId}`,
        })),
    );
  }

  /** BTC xác nhận kết quả vòng: báo thắng/hòa/thua cho từng đội. */
  async confirmed(tx: Tx, label: string, pairings: PairRow[]) {
    const real = pairings.filter((p) => p.kind !== 'bye' && p.teamAId && p.teamBId);
    const names = await this.names(
      tx,
      real.flatMap((p) => [p.teamAId!, p.teamBId!]),
    );
    const out: Message[] = [];
    for (const p of real) {
      for (const side of ['a', 'b'] as const) {
        const me = side === 'a' ? p.teamAId! : p.teamBId!;
        const opp = side === 'a' ? p.teamBId! : p.teamAId!;
        const mine = side === 'a' ? p.scoreA : p.scoreB;
        const theirs = side === 'a' ? p.scoreB : p.scoreA;
        const verdict = p.result === 'draw' ? 'hòa' : p.result === side ? 'thắng' : 'thua';
        out.push({
          teamId: me,
          key: `comp:confirm:${p.id}:${p.resultVersion ?? 0}`,
          title: `${label}: kết quả đã xác nhận`,
          body: `Đội bạn ${verdict} ${names.get(opp) ?? opp} (${mine ?? 0}–${theirs ?? 0}).`,
          href: MY_TEAM,
        });
      }
    }
    await this.send(tx, out);
  }

  /** Mức sơ loại đã chốt: đội đi tiếp và đội dừng lại. */
  async levelDone(
    tx: Tx,
    level: { id: string; name: string },
    qualified: string[],
    entrants: string[],
    nextLabel: string,
    finishedAt: Date,
    nextIsLevel = false,
  ) {
    const rank = new Map(qualified.map((id, i) => [id, i + 1]));
    await this.send(
      tx,
      entrants.map((teamId) => {
        const r = rank.get(teamId);
        return {
          teamId,
          key: `comp:level-done:${level.id}:${finishedAt.getTime()}`,
          title: r ? `Đội bạn vượt qua ${level.name}` : `Đội bạn dừng lại ở ${level.name}`,
          body: r
            ? `Đội bạn xếp thứ ${r}/${qualified.length} suất đi tiếp và vào ${nextLabel}.${nextIsLevel ? ' Đội trưởng nhớ chọn bot cho mức mới ở Thi đấu của đội.' : ''}`
            : `Đội bạn không nằm trong ${qualified.length} suất đi tiếp của ${level.name}. Cảm ơn đội đã tham gia.`,
          href: MY_TEAM,
        };
      }),
    );
  }

  /** Tứ kết đã chốt: báo Top 4. */
  async top4(tx: Tx, tournamentId: string, winners: string[]) {
    await this.send(
      tx,
      winners.map((teamId) => ({
        teamId,
        key: `comp:top4:${tournamentId}:${winners.join(',')}`,
        title: 'Đội bạn vào Top 4',
        body: 'Chúc mừng! Đội bạn vào Top 4. Bán kết và chung kết diễn ra trực tiếp theo lịch BTC.',
        href: MY_TEAM,
      })),
    );
  }

  /** Bán kết/chung kết: báo các đội của vòng một mốc offline (khóa bài, kết quả kiểm tra bot...). */
  async finals(tx: Tx, key: string, teamIds: string[], title: string, body: string) {
    await this.send(
      tx,
      teamIds.map((teamId) => ({ teamId, key: `comp:finals:${key}`, title, body, href: COMPETE })),
    );
  }

  /** Chung kết đã chốt: báo đội vô địch và á quân. */
  async champion(tx: Tx, tournamentId: string, champion: string, runnerUp: string | null) {
    await this.send(tx, [
      {
        teamId: champion,
        key: `comp:champion:${tournamentId}`,
        title: 'Đội bạn vô địch Bot Arena!',
        body: 'Chúc mừng! BTC đã chốt kết quả chung kết: đội bạn giành chức vô địch.',
        href: COMPETE,
      },
      ...(runnerUp
        ? [
            {
              teamId: runnerUp,
              key: `comp:champion:${tournamentId}`,
              title: 'Đội bạn giành ngôi á quân',
              body: 'BTC đã chốt kết quả chung kết. Chúc mừng đội bạn về nhì toàn giải.',
              href: COMPETE,
            },
          ]
        : []),
    ]);
  }
}
