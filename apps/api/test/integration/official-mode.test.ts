import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/modules/accounts-teams/password.js';
import { encodeSession } from '../../src/core/auth/session-codec.js';

// Uses the integration runner's isolated schema. No real SMTP messages are sent.
const db = new PrismaClient();
const suffix = randomUUID();
const accountId = `official-${suffix}`;
const email = `official-${suffix}@vnu.edu.vn`;
const password = 'Official-test-password-123';
const secret = `official-test-${randomUUID()}`;
const base = 'http://localhost:3216';
let child: ChildProcess | undefined;
let cookie = '';
const tournamentIds: string[] = [];
beforeAll(async () => {
  await db.account.create({
    data: {
      id: accountId,
      username: accountId,
      email,
      displayName: 'BTC thật kiểm thử',
      role: 'admin',
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      isDemo: false,
    },
  });
  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('.'),
    stdio: 'ignore',
    env: {
      ...process.env,
      ARENA_PROFILE: '',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      API_PORT: '3216',
      WEB_ORIGIN: base,
      QUEUE_PREFIX: `official-test-${suffix}`,
      SESSION_SECRET: secret,
      SESSION_COOKIE_NAME: 'arena_official_session',
      MAIL_TRANSPORT: 'local',
      SERVE_WEB: 'true',
    },
  });
  for (let n = 0; n < 150; n++) {
    if (
      await fetch(`${base}/api/v1/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    if (child.exitCode !== null) throw new Error('Official test API did not start. Build web/API first.');
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Official test API startup timeout.');
}, 25_000);
afterAll(async () => {
  if (child && child.exitCode === null) {
    const closed = new Promise((done) => child!.once('exit', done));
    child.kill();
    await closed;
  }
  await db.stage.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await db.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await db.auditLog.deleteMany({ where: { actorId: accountId } });
  await db.account.deleteMany({ where: { id: accountId } });
  await db.$disconnect();
});
const request = (path: string, method = 'GET', body?: unknown, session = cookie) =>
  fetch(`${base}/api/v1${path}`, {
    method,
    headers: { cookie: session, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it('serves the built SPA, keeps API 404s JSON, and reports demo disabled', async () => {
  const page = await fetch(`${base}/rooms/a-real-room`, { headers: { accept: 'text/html' } });
  expect(page.status).toBe(200);
  expect(page.headers.get('content-type')).toContain('text/html');
  expect(await page.text()).toContain('<div id="root">');
  const missing = await request('/does-not-exist');
  expect(missing.status).toBe(404);
  expect(missing.headers.get('content-type')).toContain('application/json');
  expect((await (await request('/health')).json()).data.demoMode).toBe(false);
});

it('logs in with a real password and blocks every demo action even for BTC', async () => {
  const login = await request('/auth/login', 'POST', { email, password });
  expect(login.status).toBe(200);
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect(cookie).toMatch(/^arena_official_session=/);
  expect((await (await request('/session')).json()).data.user.id).toBe(accountId);
  for (const [path, method] of [
    ['/dev/accounts', 'GET'],
    ['/dev/session', 'POST'],
    ['/dev/mailbox', 'GET'],
    ['/demo/games', 'POST'],
    ['/admin/tournaments/tour_demo/demo/teams', 'POST'],
    ['/admin/tournaments/tour_demo/demo/simulate', 'POST'],
  ]) {
    const response = await request(path!, method!, method === 'POST' ? {} : undefined);
    expect(response.status, path).toBe(404);
    expect((await response.json()).error.code).toBe('DEMO_DISABLED');
  }
  const bots = await request('/bots');
  expect(bots.status).toBe(200);
  const demoTournament = await request('/admin/tournaments', 'POST', {
    name: 'Không được tạo giải mẫu',
    isDemo: true,
  });
  expect(demoTournament.status).toBe(403);
  const created = await request('/admin/tournaments', 'POST', {
    name: 'Giải thật kiểm thử',
    description: '',
  });
  expect(created.status).toBe(201);
  const tournament = (await created.json()).data;
  tournamentIds.push(tournament.id);
  expect((await db.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).isDemo).toBe(false);
});

it('does not accept demo cookies or a demo session claim in official mode', async () => {
  const token = encodeSession({ sub: accountId, demo: true, iat: Date.now() }, secret);
  for (const session of [`arena_demo_session=${token}`, `arena_official_session=${token}`])
    expect((await (await request('/session', 'GET', undefined, session)).json()).data.user).toBeNull();
  const logout = await request('/session', 'DELETE');
  expect(logout.headers.get('set-cookie')).toMatch(/^arena_official_session=/);
});
