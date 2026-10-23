import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@arena/contracts';
import { BotsRunnerService } from '../../src/modules/bots-runner/bots-runner.service.js';

describe('BotsRunnerService — Gói việc 1 (Quản lý phiên bản & Nộp bot)', () => {
  const mockRepo = {
    findTeam: vi.fn(),
    findBotByHash: vi.fn(),
    findBotVersion: vi.fn(),
    getMaxVersion: vi.fn(),
    createBotVersion: vi.fn(),
  };

  const mockOutbox = { register: vi.fn(), add: vi.fn(), poke: vi.fn() };
  const mockRedis = { client: { get: vi.fn() } };
  const mockQueue = { enqueue: vi.fn(), counts: vi.fn(), state: vi.fn(), requeue: vi.fn() };
  const mockConfig = { jobRecoveryMs: 10000, queuePrefix: 'test' };

  const service = new BotsRunnerService(
    mockRepo as any,
    mockOutbox as any,
    mockRedis as any,
    mockQueue as any,
    mockConfig as any,
  );

  const studentUser: SessionUser = {
    id: 'user_1',
    displayName: 'Thí sinh 1',
    role: 'student',
    teamId: 'team_alpha',
    demo: true,
  };

  const otherStudent: SessionUser = {
    id: 'user_2',
    displayName: 'Thí sinh 2',
    role: 'student',
    teamId: 'team_beta',
    demo: true,
  };

  const adminUser: SessionUser = {
    id: 'admin_1',
    displayName: 'Admin BTC',
    role: 'admin',
    teamId: null,
    demo: true,
  };

  it('validatePythonSource phát hiện hàm make_move và kiểm tra AST', async () => {
    const validCode = `
def make_move(state):
    return {"from": "A1", "to": "A2"}
`;
    const res1 = await service.validatePythonSource(validCode);
    expect(res1.valid).toBe(true);
    expect(res1.log).toContain('hợp lệ');

    const invalidCode = `
def compute():
    return 42
`;
    const res2 = await service.validatePythonSource(invalidCode);
    expect(res2.valid).toBe(false);
    expect(res2.log).toContain('thiếu định nghĩa hàm "def make_move(state)"');

    const riskyCode = `
import socket
import subprocess

def make_move(state):
    return {}
`;
    const res3 = await service.validatePythonSource(riskyCode);
    expect(res3.valid).toBe(true);
    expect(res3.log).toContain('hợp lệ');
    expect((await service.validatePythonSource('# def make_move(state): pass')).valid).toBe(false);
    expect((await service.validatePythonSource('def make_move(state) broken')).valid).toBe(false);
    expect((await service.validatePythonSource('def make_move(): pass')).valid).toBe(false);
  });

  it('submitBot từ chối khi thí sinh nộp bot cho đội khác', async () => {
    await expect(
      service.submitBot(studentUser, {
        teamId: 'team_beta',
        label: 'Bot Hack',
        sourceCode: 'def make_move(state): pass',
      }),
    ).rejects.toThrow('Bạn chỉ có thể nộp bot cho đội của mình.');
  });

  it('submitBot tính đúng mã hash SHA-256, tự tăng version và phát hiện trùng lặp', async () => {
    mockRepo.findTeam.mockResolvedValueOnce({ id: 'team_alpha', name: 'Alpha' });
    mockRepo.getMaxVersion.mockResolvedValueOnce(1); // Đã có v1, lần này sẽ là v2
    mockRepo.findBotByHash.mockResolvedValueOnce({
      id: 'bot_orig',
      teamId: 'team_other',
      version: 1,
      label: 'Bot Gốc',
    });

    const code = 'def make_move(state):\n    return {"action": "stay"}';
    mockRepo.createBotVersion.mockImplementationOnce((data) => ({
      ...data,
      version: 2,
      id: 'bot_new_2',
      createdAt: new Date(),
    }));

    const result = await service.submitBot(studentUser, {
      teamId: 'team_alpha',
      label: 'Bot v2 Cải tiến',
      sourceCode: code,
    });

    expect(result.version).toBe(2);
    expect(result.label).toBe('Bot v2 Cải tiến');
    expect(result.duplicateOfId).toBe('bot_orig');
    expect(mockRepo.createBotVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team_alpha',
        submittedById: 'user_1',
        duplicateOfId: 'bot_orig',
        validationLog: expect.stringContaining('Cảnh báo trùng lặp'),
      }),
    );
  });

  it('getBotSource cho phép người trong đội xem nhưng chặn người đội khác', async () => {
    mockRepo.findBotVersion.mockResolvedValue({
      id: 'bot_alpha_1',
      teamId: 'team_alpha',
      version: 1,
      label: 'Bot Alpha v1',
      sourceCode: 'def make_move(state): pass',
      sourceHash: 'a'.repeat(64),
      status: 'valid',
      submittedById: 'user_1',
      duplicateOfId: null,
      validationLog: 'OK',
      createdAt: new Date(),
    });

    // Thí sinh cùng đội: ĐƯỢC XEM
    const source1 = await service.getBotSource(studentUser, 'bot_alpha_1');
    expect(source1.sourceCode).toBe('def make_move(state): pass');

    // Admin: ĐƯỢC XEM
    const sourceAdmin = await service.getBotSource(adminUser, 'bot_alpha_1');
    expect(sourceAdmin.sourceCode).toBe('def make_move(state): pass');

    // Thí sinh đội khác: BỊ CHẶN 403
    await expect(service.getBotSource(otherStudent, 'bot_alpha_1')).rejects.toThrow(
      'Bạn không có quyền xem mã nguồn của đội khác.',
    );
  });
});
