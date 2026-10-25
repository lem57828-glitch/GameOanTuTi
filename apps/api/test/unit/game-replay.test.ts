import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { RoomsService } from '../../src/modules/rooms-matches/rooms.service.js';

function fixture(gameRoomId = 'room') {
  const room = {
    id: 'room',
    title: 'Alpha vs Beta',
    teamAId: 'alpha',
    teamBId: 'beta',
    currentGameId: 'latest',
    isDemo: false,
    status: 'running',
  };
  const game = {
    id: 'earlier',
    roomId: gameRoomId,
    status: 'queued',
    choices: [],
    result: null,
    rulesetId: 'standard-32-4',
    maxPlies: 200,
    lastSeq: 0,
    coinResult: null,
    blueTeamId: null,
    pinkTeamId: null,
  };
  const repo = {
    findRoom: vi.fn(async () => room),
    findGame: vi.fn(async () => game),
    listEvents: vi.fn(async () => []),
  };
  const prisma = { $transaction: vi.fn(async (read: (tx: unknown) => unknown) => read({})) };
  const accounts = {
    teamNames: vi.fn(
      async () =>
        new Map([
          ['alpha', 'Alpha'],
          ['beta', 'Beta'],
        ]),
    ),
  };
  const bots = { findJobByGame: vi.fn(async () => null) };
  const service = new RoomsService(
    prisma as never,
    repo as never,
    accounts as never,
    bots as never,
    {} as never,
    {} as never,
  );
  return { service, room, repo };
}

describe('snapshot xem lại từng ván', () => {
  it('đọc đúng ván đã chọn và không đổi ván hiện tại của phòng', async () => {
    const { service, room, repo } = fixture();
    const snapshot = await service.gameSnapshot('room', 'earlier');
    expect(snapshot.gameId).toBe('earlier');
    expect(snapshot.status).toBe('waiting');
    expect(room.currentGameId).toBe('latest');
    expect(room.status).toBe('running');
    expect(repo.listEvents).toHaveBeenCalledWith('earlier', 0, expect.anything());
  });
  it('không trả ván của phòng khác khi ghép nhầm URL', async () => {
    const { service, repo } = fixture('other-room');
    await expect(service.gameSnapshot('room', 'earlier')).rejects.toThrow();
    expect(repo.listEvents).not.toHaveBeenCalled();
  });
});
