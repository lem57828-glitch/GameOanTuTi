// TV4 — phòng đấu: snapshot, danh sách phòng, tạo ván mô phỏng (demo), sự kiện của ván.
import { randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  CONTRACT_VERSION,
  EVENT_SCHEMA_VERSION,
  RoomEvent,
  RoomListItem,
  RoomStatus,
  type CoinResult,
  type DemoGameRequest,
  type JobView,
  type RoomSnapshot,
  type SessionUser,
} from '@arena/contracts';
import { STANDARD_RULESET_ID } from '@arena/game-engine';
import { AuditService } from '../../core/audit.service.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { PrismaService, isUniqueViolation } from '../../core/prisma.service.js';
import { AccountsTeamsService } from '../accounts-teams/accounts-teams.service.js';
import { BotsRunnerService, DEMO_LIMITS, toJobView } from '../bots-runner/bots-runner.service.js';
import { MatchesService } from './matches.service.js';
import { RoomsRepository } from './rooms.repository.js';
import { buildSnapshot, streamIdOf } from './snapshot.js';

export interface DemoGameCreated {
  created: boolean;
  roomId: string;
  gameId: string;
  job: JobView;
}

type EventRow = {
  id: string;
  streamId: string;
  seq: number;
  type: string;
  payload: unknown;
  occurredAt: Date;
};

@Injectable()
export class RoomsService {
  private readonly log = new Logger('Rooms');

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: RoomsRepository,
    private readonly accounts: AccountsTeamsService,
    private readonly bots: BotsRunnerService,
    private readonly audit: AuditService,
    private readonly matches: MatchesService,
  ) {}

  async list(): Promise<RoomListItem[]> {
    const rooms = await this.repo.listRooms();
    const names = await this.accounts.teamNames(rooms.flatMap((r) => [r.teamAId, r.teamBId]));
    return rooms.map((r) =>
      RoomListItem.parse({
        roomId: r.id,
        title: r.title,
        isDemo: r.isDemo,
        status: RoomStatus.parse(r.status),
        teams: {
          a: { id: r.teamAId, name: names.get(r.teamAId) ?? '?' },
          b: { id: r.teamBId, name: names.get(r.teamBId) ?? '?' },
        },
        updatedAt: r.updatedAt.toISOString(),
      }),
    );
  }

  /** Chỉ đọc. Xem phòng, tải lại trang hay reconnect KHÔNG tạo ván, tung xu hay enqueue job. */
  async snapshot(roomId: string): Promise<RoomSnapshot> {
    const base = await this.boardSnapshot(roomId);
    // Trận nhiều hiệp (TV4): điểm, các hiệp, trạng thái chọn kín — không lộ lựa chọn chưa khóa.
    return { ...base, match: await this.matches.viewOfRoom(roomId) };
  }

  private async boardSnapshot(roomId: string): Promise<RoomSnapshot> {
    return this.prisma.$transaction(
      async (tx) => {
        const room = await this.repo.findRoom(roomId, tx);
        if (!room) throw notFound('phòng');
        const names = await this.accounts.teamNames([room.teamAId, room.teamBId]);
        const game = room.currentGameId ? await this.repo.findGame(room.currentGameId, tx) : null;
        const events = game ? await this.repo.listEvents(game.id, 0, tx) : [];
        const job = game ? await this.bots.findJobByGame(game.id, tx) : null;
        return buildSnapshot({
          room,
          teams: {
            a: { id: room.teamAId, name: names.get(room.teamAId) ?? '?' },
            b: { id: room.teamBId, name: names.get(room.teamBId) ?? '?' },
          },
          game,
          moves: events
            .filter((e) => e.type === 'game.move')
            .map((e) => (e.payload as { move: unknown }).move),
          result: game?.result ?? null,
          job: job ? { id: job.id, status: job.status, attempts: job.attempts } : null,
          now: new Date(),
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** Sự kiện công khai của một ván (dùng cho replay và bù seq bị thiếu). */
  async gameEvents(gameId: string, afterSeq = 0): Promise<RoomEvent[]> {
    const game = await this.repo.findGame(gameId);
    if (!game) throw notFound('ván');
    return (await this.repo.listEvents(gameId, afterSeq)).map((e) => toEnvelope(game.roomId, e));
  }

  async currentGameId(roomId: string): Promise<string | null> {
    return (await this.repo.findRoom(roomId))?.currentGameId ?? null;
  }

  /**
   * POST /demo/games. Một transaction: Match + Game (kèm kết quả tung xu và seed đã quyết định) + lựa chọn đã khóa
   * + sự kiện game.created + GameJob + OutboxEvent. Gửi lại cùng requestKey trả về job cũ.
   */
  async createDemoGame(
    user: SessionUser,
    body: DemoGameRequest,
    requestId: string,
  ): Promise<DemoGameCreated> {
    const existing = await this.bots.findJobByRequestKey(body.requestKey);
    if (existing)
      return { created: false, roomId: existing.roomId, gameId: existing.gameId, job: toJobView(existing) };

    const room = body.roomId ? await this.repo.findRoom(body.roomId) : await this.repo.findDefaultDemoRoom();
    if (!room) throw notFound('phòng mẫu');
    if (!room.isDemo) throw forbidden('Chỉ tạo ván mô phỏng trong phòng mẫu.');

    try {
      const out = await this.prisma.$transaction(async (tx) => {
        const [botA, botB] = await Promise.all([
          this.bots.pickDemoBot(room.teamAId, tx),
          this.bots.pickDemoBot(room.teamBId, tx),
        ]);
        if (!botA || !botB)
          throw conflict('Đội trong phòng mẫu chưa có bot mô phỏng hợp lệ. Chạy lại pnpm db:seed.');

        // Máy chủ tung xu MỘT lần và lưu trước khi chạy. Đội thắng cầm Xanh, đi trước.
        const aWins = randomInt(2) === 0;
        const blueTeamId = aWins ? room.teamAId : room.teamBId;
        const pinkTeamId = aWins ? room.teamBId : room.teamAId;
        const seed = randomInt(0, 2 ** 31 - 1);
        const match = await this.repo.createMatch(tx, room.id);
        const game = await this.repo.createGame(tx, {
          matchId: match.id,
          roomId: room.id,
          no: 1,
          rulesetId: STANDARD_RULESET_ID,
          seed,
          maxPlies: DEMO_LIMITS.maxPlies,
          blueTeamId,
          pinkTeamId,
          lastSeq: 1,
        });
        const coin: CoinResult = {
          winnerTeamId: blueTeamId,
          blueTeamId,
          pinkTeamId,
          decidedAt: new Date().toISOString(),
        };
        await tx.game.update({ where: { id: game.id }, data: { coinResult: coin } });

        const claimed = await this.repo.claimRoom(tx, room.id, game.id);
        if (claimed.count === 0)
          throw conflict('Phòng đang có ván chờ hoặc đang chạy. Đợi ván hiện tại kết thúc.');

        const blueBot = aWins ? botA : botB;
        const pinkBot = aWins ? botB : botA;
        await this.repo.createChoices(tx, [
          { gameId: game.id, side: 'blue', teamId: blueTeamId, botVersionId: blueBot.id, extraType: 'PAPER' },
          { gameId: game.id, side: 'pink', teamId: pinkTeamId, botVersionId: pinkBot.id, extraType: 'PAPER' },
        ]);
        await this.repo.createEvent(tx, {
          gameId: game.id,
          streamId: streamIdOf(game.id),
          seq: 1,
          type: 'game.created',
          payload: { gameId: game.id, rulesetId: STANDARD_RULESET_ID, coin },
        });
        const job = await this.bots.createGameJob(
          tx,
          {
            contractVersion: CONTRACT_VERSION,
            requestKey: body.requestKey,
            gameId: game.id,
            choices: {
              blue: { botVersionId: blueBot.id, extraType: 'PAPER' },
              pink: { botVersionId: pinkBot.id, extraType: 'PAPER' },
            },
            rulesetId: STANDARD_RULESET_ID,
            seed,
            limits: DEMO_LIMITS,
          },
          room.id,
        );
        await this.audit.record(
          {
            actorId: user.id,
            action: 'demo.game.create',
            target: game.id,
            data: { requestKey: body.requestKey, roomId: room.id, seed },
            requestId,
          },
          tx,
        );
        return { roomId: room.id, gameId: game.id, job };
      });
      this.bots.kick();
      return { created: true, roomId: out.roomId, gameId: out.gameId, job: toJobView(out.job) };
    } catch (e) {
      // claimRoom có thể chặn trước khi chạm unique requestKey: đọc lại sau rollback.
      const existing = await this.bots.findJobByRequestKey(body.requestKey);
      if (existing)
        return { created: false, roomId: existing.roomId, gameId: existing.gameId, job: toJobView(existing) };
      if (isUniqueViolation(e)) {
        // Hai yêu cầu cùng requestKey đến đồng thời: yêu cầu thua rollback toàn bộ và trả job của yêu cầu thắng.
        const winner = await this.bots.findJobByRequestKey(body.requestKey);
        if (winner)
          return { created: false, roomId: winner.roomId, gameId: winner.gameId, job: toJobView(winner) };
        this.log.warn(`Vi phạm duy nhất khi tạo ván demo nhưng không thấy job ${body.requestKey}`);
      }
      throw e;
    }
  }
}

export function toEnvelope(roomId: string, e: EventRow): RoomEvent {
  return RoomEvent.parse({
    eventId: e.id,
    type: e.type,
    schemaVersion: EVENT_SCHEMA_VERSION,
    aggregateId: roomId,
    streamId: e.streamId,
    seq: e.seq,
    occurredAt: e.occurredAt.toISOString(),
    payload: e.payload,
  });
}
