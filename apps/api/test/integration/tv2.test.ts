import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { redisKeys } from '@arena/contracts';
import { getRuleset, replay } from '@arena/game-engine';

const prisma = new PrismaClient();
const prefix = `tv2-${randomUUID()}`;
const base = 'http://localhost:3212/api/v1';
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const queue = new Queue(redisKeys(prefix).gameQueue, { prefix, connection: redis });
const children: ChildProcess[] = [];
let logs = '';
let cookie = '';
let good = '';
let alternate = '';
let stageId = '';
const source =
  'def make_move(state):\n    moves = state["legal_moves"]\n    for m in moves:\n        if m.get("capture"): return m\n    return moves[0]\n';
async function wait<T>(check: () => Promise<T | false>, ms = 40_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`Timeout: ${logs.slice(-2500)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
function launch(app: string) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('../', app),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      API_PORT: '3212',
      QUEUE_PREFIX: prefix,
      OUTBOX_POLL_MS: '100',
      WORKER_LOCK_MS: '1000',
      WORKER_STALLED_MS: '1000',
      SIM_MOVE_DELAY_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (b) => {
    logs += String(b);
  });
  child.stderr?.on('data', (b) => {
    logs += String(b);
  });
  children.push(child);
}
async function request(path: string, method = 'GET', body?: unknown) {
  return fetch(base + path, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function login(id: string) {
  const response = await request('/dev/session', 'POST', { accountId: id });
  expect(response.status).toBe(201);
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
}
async function submit(code: string, label: string) {
  const response = await request('/bots', 'POST', { teamId: 'team_alpha', sourceCode: code, label });
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json()).data;
}
async function validated(id: string) {
  return wait(async () => {
    const bot = await prisma.botVersion.findUniqueOrThrow({ where: { id } });
    return bot.status === 'pending' ? false : bot;
  });
}
beforeAll(async () => {
  launch('api');
  launch('worker');
  await wait(async () =>
    fetch(base + '/health')
      .then((r) => r.ok)
      .catch(() => false),
  );
  await login('acc_an');
}, 25_000);
afterAll(async () => {
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = new Promise((r) => child.once('exit', r));
      child.kill();
      await exited;
    }),
  );
  await queue.obliterate({ force: true });
  await queue.close();
  redis.disconnect();
  await prisma.$disconnect();
}, 15_000);

it('submits concurrent immutable versions, runs sandbox validation and reports duplicates', async () => {
  const [a, b] = await Promise.all([
    submit(source, 'TV2 greedy'),
    submit(source + '# version 2\n', 'TV2 alternate'),
  ]);
  good = a.id;
  alternate = b.id;
  expect(new Set([a.version, b.version]).size).toBe(2);
  expect(a.status).toBe('pending');
  expect((await validated(good)).status).toBe('valid');
  expect((await validated(alternate)).status).toBe('valid');
  const stored = await prisma.botVersion.findUniqueOrThrow({ where: { id: good } });
  expect(stored.sourceCode).toBe(source);
  const detail = (await (await request(`/bots/${good}/source`)).json()).data;
  expect(detail.validationLog).toContain('hai màu');
  const duplicate = await submit(source, 'TV2 duplicate');
  expect(duplicate.duplicateOfId).toBe(good);
}, 60_000);

it('rejects syntax errors and invalid moves without marking them valid', async () => {
  const syntax = await submit('def make_move(state) broken', 'Syntax error');
  expect(syntax.status).toBe('invalid');
  const bad = await submit('def make_move(state):\n    return {"from":"A1","to":"I9"}\n', 'Invalid moves');
  expect((await validated(bad.id)).status).toBe('invalid');
  expect(
    (
      await request(`/bots/${bad.id}/test-runs`, 'POST', {
        botVersionId: bad.id,
        opponentType: 'demo',
        opponentTarget: 'greedy',
      })
    ).status,
  ).toBe(400);
}, 40_000);

it('runs own versions with independent extra pieces and returns reproducible replay data', async () => {
  const response = await request(`/bots/${good}/test-runs`, 'POST', {
    botVersionId: good,
    opponentType: 'bot',
    opponentTarget: alternate,
    mySide: 'pink',
    extraType: 'ROCK',
    opponentExtraType: 'SCISSORS',
  });
  expect(response.status).toBe(201);
  const run = (await response.json()).data;
  const finished = await wait(async () => {
    const value = (await (await request(`/test-runs/${run.id}`)).json()).data;
    return value.status === 'queued' || value.status === 'running' ? false : value;
  });
  expect(finished.status, finished.error).toBe('succeeded');
  expect(finished.initialBoard.B2).toEqual({ side: 'blue', type: 'SCISSORS' });
  expect(finished.initialBoard.G7).toEqual({ side: 'pink', type: 'ROCK' });
  expect(finished.events.length).toBe(finished.plies);
  const rules = getRuleset(finished.rulesetId, { blue: 'SCISSORS', pink: 'ROCK' });
  expect(rules.setup).toEqual(finished.initialBoard);
  const state = replay(rules, finished.events, finished.maxPlies);
  expect(state.end).toMatchObject({ winner: finished.winner, reason: finished.reason });
  // Re-delivery of a completed job must not run it again.
  const before = await prisma.botTestRun.findUniqueOrThrow({ where: { id: run.id } });
  await queue.add(
    'duplicate',
    { kind: 'test_run', jobId: run.id, requestKey: `testrun:${run.id}` },
    { jobId: `redelivery-${randomUUID()}` },
  );
  await new Promise((r) => setTimeout(r, 500));
  expect((await prisma.botTestRun.findUniqueOrThrow({ where: { id: run.id } })).attempts).toBe(
    before.attempts,
  );
}, 45_000);

it('protects source, results and opponent bots from other teams', async () => {
  await login('acc_chi');
  expect((await request(`/bots/${good}/source`)).status).toBe(403);
  expect((await request(`/bots/${good}/test-runs`)).status).toBe(403);
  expect(
    (
      await request('/bots/bot_beta_1/test-runs', 'POST', {
        botVersionId: 'bot_beta_1',
        opponentType: 'bot',
        opponentTarget: good,
      })
    ).status,
  ).toBe(403);
  await login('acc_an');
});

it('locks valid bot sets per stage and prevents late/unauthorized changes', async () => {
  const stage = await prisma.stage.create({
    data: {
      tournamentId: 'tour_demo',
      ord: 90,
      kind: 'knockout',
      name: 'TV2 acceptance',
      lockAt: new Date(Date.now() + 60_000),
    },
  });
  stageId = stage.id;
  const body = { teamId: 'team_alpha', botVersionIds: [good, alternate] };
  expect((await request(`/stages/${stageId}/bot-selection`, 'POST', body)).status).toBe(201);
  await login('acc_binh');
  expect((await request(`/stages/${stageId}/bot-selection`, 'POST', body)).status).toBe(403);
  await login('acc_admin');
  expect((await request(`/stages/${stageId}/bot-selection/lock`, 'POST', body)).status).toBe(201);
  await login('acc_an');
  expect(
    (await request(`/stages/${stageId}/bot-selection`, 'POST', { ...body, botVersionIds: [good] })).status,
  ).toBe(409);
  const selection = (await (await request(`/stages/${stageId}/bot-selection/team_alpha`)).json()).data;
  expect(selection.locked).toBe(true);
  expect(selection.botVersionIds).toEqual([good, alternate]);
});
