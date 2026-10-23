import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@arena/contracts';
import { BotsRunnerService } from '../../src/modules/bots-runner/bots-runner.service.js';

describe('Gói việc 4 — Chế độ Đấu thử (Practice Match) & API Test Runs (TV2)', () => {
  const mockRepo = {
    findBotVersion: vi.fn(),
    createTestRun: vi.fn(),
    findTestRun: vi.fn(),
    listTestRuns: vi.fn(),
  };

  const mockQueue = {
    enqueue: vi.fn(),
    requeue: vi.fn(),
    state: vi.fn(),
    counts: vi.fn(),
  };

  const mockOutbox = {} as any;
  const mockRedis = {} as any;
  const mockConfig = { jobRecoveryMs: 60000 } as any;

  const service = new BotsRunnerService(
    mockRepo as any,
    mockOutbox,
    mockRedis,
    mockQueue as any,
    mockConfig,
  );

  const studentAlpha: SessionUser = {
    id: 'usr_an',
    role: 'student',
    displayName: 'Nguyễn An',
    teamId: 'team_alpha',
    demo: false,
  };

  const studentBeta: SessionUser = {
    id: 'usr_chi',
    role: 'student',
    displayName: 'Lê Chi',
    teamId: 'team_beta',
    demo: false,
  };

  it('tạo lượt đấu thử thành công và đẩy job vào BullMQ', async () => {
    mockRepo.findBotVersion.mockResolvedValueOnce({
      id: 'bot_alpha_1',
      teamId: 'team_alpha',
      version: 1,
      status: 'valid',
      label: 'Alpha v1',
    });

    mockRepo.createTestRun.mockResolvedValueOnce({
      id: 'test_run_123',
      botVersionId: 'bot_alpha_1',
      mySide: 'blue',
      opponentType: 'demo',
      opponentTarget: 'greedy',
      status: 'queued',
      createdAt: new Date(),
    });

    const run = await service.createTestRun(studentAlpha, 'bot_alpha_1', {
      botVersionId: 'bot_alpha_1',
      opponentType: 'demo',
      opponentTarget: 'greedy',
      mySide: 'blue',
    });

    expect(run).toBeDefined();
    expect(run.id).toBe('test_run_123');
    expect(run.status).toBe('queued');
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'test_run_123',
        kind: 'test_run',
      }),
    );
  });

  it('từ chối nếu sinh viên đội khác cố tình kích hoạt đấu thử bot không thuộc đội mình', async () => {
    mockRepo.findBotVersion.mockResolvedValueOnce({
      id: 'bot_alpha_1',
      teamId: 'team_alpha',
      version: 1,
      status: 'valid',
    });

    await expect(
      service.createTestRun(studentBeta, 'bot_alpha_1', {
        botVersionId: 'bot_alpha_1',
        opponentType: 'demo',
        opponentTarget: 'random',
      }),
    ).rejects.toThrow(/Bạn chỉ có thể đấu thử với bot của đội mình/);
  });

  it('lấy chi tiết kết quả ván đấu thử kèm mảng sự kiện bàn giao TV4', async () => {
    mockRepo.findTestRun.mockResolvedValueOnce({
      id: 'test_run_123',
      botVersionId: 'bot_alpha_1',
      mySide: 'blue',
      opponentType: 'demo',
      opponentTarget: 'greedy',
      status: 'succeeded',
      winner: 'blue',
      reason: 'eliminate',
      plies: 12,
      piecesBlue: 8,
      piecesPink: 5,
      events: [
        { seq: 1, ply: 1, side: 'blue', from: 'B2', to: 'B3', capture: null },
        { seq: 2, ply: 2, side: 'pink', from: 'H8', to: 'H7', capture: null },
      ],
      createdAt: new Date(),
      finishedAt: new Date(),
      botVersion: {
        teamId: 'team_alpha',
      },
    });

    const detail = await service.getTestRun(studentAlpha, 'test_run_123');

    expect(detail).toBeDefined();
    expect(detail.status).toBe('succeeded');
    expect(detail.winner).toBe('blue');
    expect(detail.reason).toBe('eliminate');
    expect(detail.events).toHaveLength(2);
    expect(detail.events?.[0].seq).toBe(1);
  });
});
