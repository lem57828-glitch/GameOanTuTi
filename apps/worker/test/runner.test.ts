import { expect, it } from 'vitest';
import type { GameRequest, MoveRecord } from '@arena/contracts';
import { DEMO_RULESET_ID } from '@arena/game-engine';
import { SimulatedRunner } from '../src/runner/simulated-runner.js';
import { loadConfig } from '../src/config.js';

const request: GameRequest = {
  contractVersion: 1,
  requestKey: 'test:determinism',
  gameId: 'game_test',
  rulesetId: DEMO_RULESET_ID,
  seed: 42,
  choices: {
    blue: { botVersionId: 'bot_blue', extraType: null },
    pink: { botVersionId: 'bot_pink', extraType: null },
  },
  limits: { cpuMsPerMove: 200, wallMsPerMove: 1000, startupMs: 3000, maxPlies: 120, maxErrorsPerGame: 3 },
};
it('refuses the simulation worker in production or without demo mode', () => {
  const env = { DATABASE_URL: 'postgresql://test', REDIS_URL: 'redis://localhost' };
  expect(() => loadConfig({ ...env, NODE_ENV: 'production', DEMO_MODE: 'true' })).toThrow(/M0/);
  expect(() => loadConfig({ ...env, NODE_ENV: 'test', DEMO_MODE: 'false' })).toThrow(/M0/);
});
it('reproduces identical moves and result from persisted seed and choices', async () => {
  const runner = new SimulatedRunner(async () => 'greedy');
  const a: MoveRecord[] = [];
  const b: MoveRecord[] = [];
  const first = await runner.run(request, async (m) => {
    a.push(m);
  });
  const second = await runner.run(request, async (m) => {
    b.push(m);
  });
  expect(a.length).toBeGreaterThan(0);
  expect(a).toEqual(b);
  expect(first).toEqual(second);
});
it('refuses unknown or untrusted bot policies', async () => {
  await expect(
    new SimulatedRunner(async () => 'uploaded-python').run(request, async () => {}),
  ).rejects.toThrow(/mô phỏng/);
});
