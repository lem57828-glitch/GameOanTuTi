// Live GitHub -> persisted snapshot -> container validation -> locked roster -> TV4 -> TV3.
// All database writes live in a fresh test-owned schema, never the user's public schema.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { Redis } = require('ioredis');
const { Queue } = require('bullmq');
const { pairingRoomId, redisKeys } = require('@arena/contracts');
const apiDir = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(apiDir, '../..');
process.loadEnvFile(resolve(root, '.env'));
assert.equal(
  process.env.BOT_SANDBOX_MODE ?? 'docker',
  'docker',
  'This live test requires container sandbox mode',
);

const suffix = randomUUID().replaceAll('-', '');
const schema = `arena_github_e2e_${suffix}`;
assert.match(schema, /^arena_github_e2e_[a-f0-9]{32}$/);
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const prefix = `github-e2e-${suffix}`;
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  QUEUE_PREFIX: prefix,
  NODE_ENV: 'test',
  DEMO_MODE: 'false',
  MAIL_TRANSPORT: 'local',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  OUTBOX_POLL_MS: '100',
  SIM_MOVE_DELAY_MS: '0',
  WORKER_CONCURRENCY: '2',
  MATCH_SELECT_SECONDS: '600',
};
const db = new PrismaClient({ datasourceUrl: url.href });
const adminDb = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const children = [];
const cookies = {};
const report = { startedAt: new Date().toISOString(), schema, demoMode: false, sandbox: 'docker', steps: [] };
const repo = 'https://github.com/lem57828-glitch/GameOanTuTi';
const commit = 'a8d405825d469c1271f2e022688d0bff2ad106bf';
let logs = '';
let base;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (name) => {
  report.steps.push(name);
  console.log(`PASS: ${name}`);
};

async function command(script, args, cwd = apiDir) {
  await new Promise((done, fail) => {
    const p = spawn(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' });
    p.on('error', fail);
    p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`Setup command exited ${code}`))));
  });
}
function launch(cwd, extra) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd,
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logs = (logs + String(data)).slice(-40000);
    });
  children.push(child);
  return child;
}
async function wait(check, label, timeout = 120000) {
  const start = Date.now();
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}\n${logs.slice(-5000)}`);
    await sleep(250);
  }
}
async function call(who, path, method = 'GET', body, status) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(cookies[who] ? { cookie: cookies[who] } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json();
  if (status !== undefined)
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(json)}`);
  return { response, ...json };
}
async function login(who, email, password) {
  const result = await call(null, '/auth/login', 'POST', { email, password }, 200);
  cookies[who] = result.response.headers.get('set-cookie')?.split(';')[0];
  assert(cookies[who], 'Real login must issue a session cookie');
  assert.equal(result.data.user.demo, false);
}
async function validateBot(id) {
  return wait(async () => {
    const bot = await db.botVersion.findUniqueOrThrow({ where: { id } });
    if (bot.status === 'invalid') throw new Error(`Validation rejected bot: ${bot.validationLog}`);
    return bot.status === 'valid' && bot;
  }, `container validation ${id}`);
}

try {
  await command(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  step('Fresh isolated database: all migrations applied');
  const server = createServer();
  await new Promise((r, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', r);
  });
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  base = `http://127.0.0.1:${port}/api/v1`;
  const tid = `tour_${suffix}`;
  const stage = await db.stage.create({
    data: {
      tournament: {
        create: {
          id: tid,
          name: 'Live GitHub integration',
          status: 'registration',
          configStatus: 'confirmed',
          isDemo: false,
        },
      },
      ord: 1,
      kind: 'qualifier',
      name: 'Live Swiss',
      configStatus: 'confirmed',
      lockAt: new Date(Date.now() + 900000),
    },
  });
  const password = `Aa3-${randomUUID()}`;
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  for (const who of ['admin', 'a', 'b']) {
    const account = await db.account.create({
      data: {
        id: `account_${who}_${suffix}`,
        username: `${who}_${suffix}`,
        email: `${who}-${suffix}@vnu.edu.vn`,
        displayName: `Live ${who}`,
        role: who === 'admin' ? 'admin' : 'student',
        passwordHash,
        emailVerifiedAt: new Date(),
        studentId: `${who}_${suffix}`,
        className: 'Integration',
        faculty: 'Test',
        isDemo: false,
      },
    });
    if (who !== 'admin')
      await db.team.create({
        data: {
          id: `team_${who}_${suffix}`,
          tournamentId: tid,
          name: `Team ${who}`,
          nameKey: who,
          captainId: account.id,
          status: 'approved',
          isDemo: false,
          members: { create: { accountId: account.id, tournamentId: tid } },
        },
      });
  }
  launch(apiDir, { API_PORT: String(port) });
  launch(resolve(apiDir, '../worker'), {
    NODE_ENV: 'production',
    DEMO_MODE: 'false',
    WORKER_ID: `github-live-${suffix}`,
  });
  await wait(
    async () =>
      fetch(`${base}/health`)
        .then((r) => r.ok)
        .catch(() => false),
    'API startup',
    60000,
  );
  await wait(async () => (await call(null, '/health')).data.workerAlive, 'container worker startup', 60000);
  for (const who of ['admin', 'a', 'b']) await login(who, `${who}-${suffix}@vnu.edu.vn`, password);
  step('Real account login; API demo disabled; container worker online');

  const direct = await call(
    'a',
    '/bots',
    'POST',
    {
      teamId: `team_a_${suffix}`,
      label: 'Practice only',
      sourceCode: 'def make_move(state):\n    return state["legal_moves"][0]\n',
    },
    201,
  );
  await validateBot(direct.data.id);
  await call(
    'a',
    `/stages/${stage.id}/bot-selection`,
    'POST',
    { teamId: `team_a_${suffix}`, botVersionIds: [direct.data.id] },
    400,
  );
  step('Direct upload validates for practice but is rejected from official roster');
  await call(
    'a',
    '/bots',
    'POST',
    { teamId: `team_a_${suffix}`, label: 'Mutable reference rejected', githubRepo: repo, commitSha: 'main' },
    400,
  );
  step('Mutable GitHub branch reference rejected');

  const botIds = {};
  const hashes = {};
  for (const [who, file] of [
    ['a', 'tham_an.py'],
    ['b', 'than_trong.py'],
  ]) {
    const path = `apps/api/prisma/sample-bots/${file}`;
    const submitted = await call(
      who,
      '/bots',
      'POST',
      {
        teamId: `team_${who}_${suffix}`,
        label: `GitHub ${file}`,
        githubRepo: repo,
        commitSha: commit,
        sourcePath: path,
      },
      201,
    );
    assert.equal(submitted.data.submissionMethod, 'github');
    botIds[who] = submitted.data.id;
    const stored = await validateBot(botIds[who]);
    const remoteResponse = await fetch(
      `https://api.github.com/repos/lem57828-glitch/GameOanTuTi/contents/${path}?ref=${commit}`,
      { headers: { 'user-agent': 'BotArena-live-test' } },
    );
    assert.equal(remoteResponse.status, 200);
    const remote = await remoteResponse.json();
    const normalized = Buffer.from(remote.content, 'base64')
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');
    hashes[who] = createHash('sha256').update(normalized).digest('hex');
    assert.equal(stored.sourceCode, normalized);
    assert.equal(stored.sourceHash, hashes[who]);
    assert.equal(stored.commitSha, commit);
    assert.equal(stored.isDemo, false);
    assert.match(stored.validationLog, /hai màu/);
    await call(
      who,
      `/stages/${stage.id}/bot-selection`,
      'POST',
      { teamId: `team_${who}_${suffix}`, botVersionIds: [botIds[who]] },
      201,
    );
    await call(
      'admin',
      `/stages/${stage.id}/bot-selection/lock`,
      'POST',
      { teamId: `team_${who}_${suffix}`, botVersionIds: [botIds[who]] },
      201,
    );
  }
  report.source = { repository: repo, commit, botIds, hashes };
  step('Two real GitHub files fetched, normalized, hashed, container-validated in both colors, and locked');
  await call(
    'a',
    `/stages/${stage.id}/bot-selection`,
    'POST',
    { teamId: `team_a_${suffix}`, botVersionIds: [direct.data.id] },
    409,
  );
  step('Changing a locked official roster is rejected');

  const reason = { reason: 'Live GitHub integration verification' };
  await call(
    'admin',
    `/admin/tournaments/${tid}/qualifier/plan`,
    'POST',
    { targets: [32], rounds: 1, ...reason },
    201,
  );
  await call('admin', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason, 201);
  await call('admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason, 201);
  const pair = await db.pairing.findFirstOrThrow({ where: { tournamentId: tid, kind: 'swiss' } });
  const opened = await call('admin', `/admin/tournaments/${tid}/matches/open`, 'POST', undefined, 201);
  assert.equal(opened.data.opened, 1);
  const roomId = pairingRoomId(pair.id);
  step('TV3 generated Swiss pairing and TV4 opened its official room');

  for (const gameNo of [1, 2]) {
    const match = await wait(
      async () => {
        const m = await db.match.findFirst({ where: { pairId: pair.id } });
        if (m?.status === 'paused')
          throw new Error(`Official match paused: ${m.pauseReason}\n${logs.slice(-4000)}`);
        return m?.status === 'selecting' && m.currentNo === gameNo && m;
      },
      `selection phase ${gameNo}`,
      180000,
    );
    for (const who of ['a', 'b']) {
      const selection = await call(who, `/rooms/${roomId}/my-selection`, 'GET', undefined, 200);
      assert.deepEqual(
        selection.data.allowedBots.map((b) => b.id),
        [botIds[who]],
      );
      assert.equal(selection.data.canChoose, true);
    }
    await call('a', `/rooms/${roomId}/choices`, 'POST', { botVersionId: botIds.a, ready: false }, 201);
    const spectator = await call(null, `/rooms/${roomId}`, 'GET', undefined, 200);
    assert.equal(spectator.data.match.chooseExtra, false);
    assert(!JSON.stringify(spectator.data).includes(botIds.a), 'Unpublished selection must remain private');
    await call('a', `/rooms/${roomId}/choices`, 'POST', { botVersionId: botIds.a, ready: true }, 201);
    await call('b', `/rooms/${roomId}/choices`, 'POST', { botVersionId: botIds.b, ready: true }, 201);
    step(`Official game ${gameNo}: locked GitHub bots selected privately and readied`);
    assert(match.id);
  }
  const finished = await wait(
    async () => {
      const m = await db.match.findFirst({ where: { pairId: pair.id } });
      if (m?.status === 'paused') throw new Error(`Official match paused: ${m.pauseReason}`);
      return m?.status === 'completed' && m.reportedAt && m;
    },
    'match completion and TV3 report',
    180000,
  );
  const games = await db.game.findMany({
    where: { matchId: finished.id },
    orderBy: { no: 'asc' },
    include: { choices: true, result: true },
  });
  assert.equal(games.length, 2);
  assert.notEqual(games[0].blueTeamId, games[1].blueTeamId);
  for (const game of games) {
    assert(game.result, 'A persisted result is required');
    assert(game.result.plies > 0, 'Python bot must actually play moves');
    assert(!['errors', 'crash', 'timeout'].includes(game.result.reason), `Bot failed: ${game.result.reason}`);
    assert.deepEqual(game.choices.map((c) => c.botVersionId).sort(), Object.values(botIds).sort());
    const job = await db.gameJob.findUniqueOrThrow({ where: { gameId: game.id } });
    assert.equal(job.status, 'succeeded');
    assert.equal(job.payload.stageId, stage.id, 'Official job must enforce locked roster');
    assert(
      (await db.gameEvent.count({ where: { gameId: game.id, type: 'game.move' } })) > 0,
      'Replay events must be persisted',
    );
  }
  const reported = await db.pairing.findUniqueOrThrow({ where: { id: pair.id } });
  assert.equal(reported.source, 'match');
  assert.equal(reported.status, 'done');
  assert.equal(reported.games.length, 2);
  await call('admin', `/admin/tournaments/${tid}/qualifier/rounds/1/confirm`, 'POST', reason, 201);
  const rankings = await call(null, `/tournaments/${tid}/standings?level=1`, 'GET', undefined, 200);
  assert(rankings.data);
  step(
    'Two container-played games finished, colors swapped, replay saved, TV3 result received and round confirmed',
  );

  const practice = await call(
    'a',
    `/bots/${botIds.a}/test-runs`,
    'POST',
    { botVersionId: botIds.a, opponentType: 'bot', opponentTarget: botIds.a, extraType: 'SCISSORS' },
    201,
  );
  const practiceResult = await wait(async () => {
    const r = await db.botTestRun.findUniqueOrThrow({ where: { id: practice.data.id } });
    if (r.status === 'failed') throw new Error(`Practice failed: ${r.error}`);
    return r.status === 'succeeded' && r;
  }, 'own GitHub bot practice');
  assert(practiceResult.plies > 0);
  assert.equal(practiceResult.events.length, practiceResult.plies);
  assert.equal(
    Object.values(practiceResult.initialBoard).filter((p) => p.side === 'blue' && p.type === 'SCISSORS')
      .length,
    4,
  );
  for (const who of ['a', 'b']) {
    const stored = await db.botVersion.findUniqueOrThrow({ where: { id: botIds[who] } });
    assert.equal(stored.sourceHash, hashes[who]);
    assert.equal(stored.commitSha, commit);
  }
  step(
    'GitHub bot can practice against own submitted version; extra piece and replay data are correct; official snapshots unchanged',
  );
  report.match = {
    id: finished.id,
    reportedAt: finished.reportedAt,
    games: games.map((g) => ({ id: g.id, plies: g.result.plies, reason: g.result.reason })),
  };
  report.practice = { id: practiceResult.id, plies: practiceResult.plies };
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  console.error(error.message);
  console.error(logs.slice(-6000));
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill();
      await exited;
    }
  }
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  const queue = new Queue(redisKeys(prefix).gameQueue, { connection: redis, prefix });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
    redis.disconnect();
  }
  await db.$disconnect();
  await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminDb.$disconnect();
  report.cleanedUp = true;
  report.finishedAt = new Date().toISOString();
  mkdirSync(resolve(root, '.tools'), { recursive: true });
  writeFileSync(resolve(root, '.tools/github-match-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
