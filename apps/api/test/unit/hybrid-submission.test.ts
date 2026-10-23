import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@arena/contracts';
import type { PrismaService } from '../../src/core/prisma.service.js';
import { BotsRunnerRepository } from '../../src/modules/bots-runner/bots-runner.repository.js';
import { BotsRunnerService } from '../../src/modules/bots-runner/bots-runner.service.js';
import { eligibleForCompetition } from '../../src/modules/bots-runner/submission-policy.js';

const github = {
  githubRepo: 'https://github.com/team/bots',
  commitSha: 'a'.repeat(40),
  sourcePath: 'bot.py',
};
const student: SessionUser = {
  id: 'captain',
  teamId: 'team',
  displayName: 'Captain',
  role: 'student',
  demo: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function service(repo: object, demoMode = false) {
  return new BotsRunnerService(
    repo as never,
    { poke: vi.fn() } as never,
    {} as never,
    {} as never,
    { demoMode } as never,
  );
}

describe('hybrid submission and competition eligibility', () => {
  it('direct uploads cannot enter competition, including in demo mode; demo fixtures need demo mode', () => {
    expect(eligibleForCompetition({})).toBe(false);
    expect(eligibleForCompetition({}, true)).toBe(false);
    expect(eligibleForCompetition({ ...github, commitSha: 'main' })).toBe(false);
    expect(eligibleForCompetition(github)).toBe(true);
    expect(eligibleForCompetition({ isDemo: true })).toBe(false);
    expect(eligibleForCompetition({ isDemo: true }, true)).toBe(true);
  });

  it('rejects direct bot selection at the transaction boundary and accepts a pinned GitHub version', async () => {
    const upsert = vi.fn().mockResolvedValue({ locked: true });
    const bots = vi.fn().mockResolvedValue([{ id: 'bot', status: 'valid' }]);
    const tx = {
      $queryRaw: vi.fn(),
      stage: { findUnique: vi.fn().mockResolvedValue({ tournamentId: 'tour', kind: 'qualifier' }) },
      team: { findUnique: vi.fn().mockResolvedValue({ tournamentId: 'tour' }) },
      botStageSelection: { findUnique: vi.fn().mockResolvedValue(null), upsert },
      botVersion: { findMany: bots },
    };
    const db = { $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) };
    const repo = new BotsRunnerRepository(db as unknown as PrismaService);
    await expect(repo.saveSelection('team', 'stage', ['bot'], true, true)).rejects.toThrow('GitHub');
    expect(upsert).not.toHaveBeenCalled();
    tx.botStageSelection.findUnique.mockResolvedValueOnce({ locked: true, botVersionIds: ['bot'] } as never);
    await expect(repo.saveSelection('team', 'stage', ['bot'], true)).rejects.toThrow('GitHub');
    bots.mockResolvedValue([{ id: 'bot', status: 'valid', ...github }]);
    await expect(repo.saveSelection('team', 'stage', ['bot'], true)).resolves.toEqual({ locked: true });
  });

  it('blocks a previously locked direct-upload bot before an official job can be created', async () => {
    const repo = {
      selection: vi.fn().mockResolvedValue({ locked: true, botVersionIds: ['direct'] }),
      listBots: vi.fn().mockResolvedValue([{ id: 'direct', status: 'valid' }]),
    };
    await expect(service(repo).lockedBotIds('team', 'stage')).rejects.toThrow('GitHub');
    expect(await service(repo).botsForMatch('team', 'stage')).toEqual({ locked: true, bots: [] });
  });

  it('stores fetched code and its hash as a snapshot without accepting a branch name', async () => {
    vi.stubEnv('GITHUB_BOT_PRIVATE_REPOS', '{}');
    const source = '\uFEFFdef make_move(state):\r\n    return state["legal_moves"][0]\r\n';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sha: github.commitSha }))
      .mockResolvedValueOnce(
        Response.json({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(source),
          content: Buffer.from(source).toString('base64'),
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const create = vi
      .fn()
      .mockImplementation(async (data) => ({ ...data, id: 'github-bot', version: 1, createdAt: new Date() }));
    const repo = {
      findTeam: vi.fn().mockResolvedValue({ id: 'team' }),
      findBotByHash: vi.fn().mockResolvedValue(null),
      createBotVersion: create,
    };
    const svc = service(repo);
    vi.spyOn(svc, 'validatePythonSource').mockResolvedValue({ valid: true, log: 'OK' });
    await expect(
      svc.submitBot(student, { teamId: 'team', label: 'Pinned', ...github, commitSha: 'main' }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    const result = await svc.submitBot(student, { teamId: 'team', label: 'Pinned', ...github });
    const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    expect(result.submissionMethod).toBe('github');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...github,
        sourceCode: normalized,
        sourceHash: createHash('sha256').update(normalized).digest('hex'),
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows a practice opponent owned by the same team and rejects one belonging to another team', async () => {
    const bot = { id: 'my-bot', teamId: 'team', status: 'valid' };
    const create = vi.fn().mockImplementation(async (data) => ({
      ...data,
      id: 'practice',
      status: 'queued',
      createdAt: new Date(),
    }));
    const repo = { findBotVersion: vi.fn(), createTestRun: create };
    const svc = service(repo);
    const input = {
      botVersionId: bot.id,
      opponentType: 'bot',
      opponentTarget: 'other-bot',
      extraType: 'ROCK',
    };
    repo.findBotVersion
      .mockResolvedValueOnce(bot)
      .mockResolvedValueOnce({ id: 'other-bot', teamId: 'another-team', status: 'valid' });
    await expect(svc.createTestRun(student, bot.id, input)).rejects.toThrow('thuộc đội mình');
    expect(create).not.toHaveBeenCalled();
    repo.findBotVersion
      .mockResolvedValueOnce(bot)
      .mockResolvedValueOnce({ id: 'other-bot', teamId: 'team', status: 'valid' });
    const result = await svc.createTestRun(student, bot.id, input);
    expect(result.status).toBe('queued');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        opponentType: 'bot',
        opponentTarget: 'other-bot',
        extraType: 'ROCK',
        opponentExtraType: 'PAPER',
      }),
    );
  });
});
