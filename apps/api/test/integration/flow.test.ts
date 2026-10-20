import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection, createServer, type Socket as TcpSocket } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { io, type Socket } from 'socket.io-client';
import { redisKeys, type MoveRecord } from '@arena/contracts';

const prefix = `test-${randomUUID()}`;
const roomId = `room_${randomUUID()}`;
const port = 3211;
const base = `http://localhost:${port}`;
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const queue = new Queue(redisKeys(prefix).gameQueue, { connection: redis, prefix });
let server: ChildProcess;
let cookie = '';
let gameId = '';
let jobId = '';
let socket: Socket | undefined;
let worker: ChildProcess | undefined;
let logs = '';
let blockRedis = false;
const proxySockets = new Set<TcpSocket>();
const redisTarget = new URL(process.env.REDIS_URL!);
let apiRedisUrl = process.env.REDIS_URL!;
const proxy = createServer((client) => {
  if (blockRedis) {
    client.destroy();
    return;
  }
  const upstream = createConnection({ host: redisTarget.hostname, port: Number(redisTarget.port) || 6379 });
  for (const connection of [client, upstream]) {
    proxySockets.add(connection);
    connection.on('close', () => proxySockets.delete(connection));
  }
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
});
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check: () => Promise<boolean>, timeout = 15000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${logs.slice(-2000)}`);
    await pause(100);
  }
}
async function start() {
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(port),
      DEMO_MODE: 'true',
      QUEUE_PREFIX: prefix,
      OUTBOX_POLL_MS: '100',
      SESSION_SECRET: 'integration-secret-01234567890123456789',
      REDIS_URL: apiRedisUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (b) => {
    logs += String(b);
  });
  server.stderr?.on('data', (b) => {
    logs += String(b);
  });
  await waitFor(async () =>
    fetch(`${base}/api/v1/health`)
      .then((r) => r.ok)
      .catch(() => false),
  );
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
}
async function request(path: string, method = 'GET', json?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/v1${path}`, {
    method,
    headers: { cookie, ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}
beforeAll(async () => {
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('Missing proxy address');
  const target = new URL(process.env.REDIS_URL!);
  target.hostname = '127.0.0.1';
  target.port = String(address.port);
  apiRedisUrl = target.href;
  await prisma.room.create({
    data: {
      id: roomId,
      code: roomId,
      title: 'Integration test',
      teamAId: 'team_alpha',
      teamBId: 'team_beta',
      isDemo: true,
    },
  });
  await start();
}, 20000);
afterAll(async () => {
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    const exit = new Promise((r) => worker!.once('exit', r));
    worker.kill('SIGKILL');
    await exit;
  }
  socket?.disconnect();
  await stop();
  for (const connection of proxySockets) connection.destroy();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await queue.obliterate({ force: true });
  await queue.close();
  redis.disconnect();
  const games = await prisma.game.findMany({ where: { roomId }, select: { id: true } });
  const ids = games.map((g) => g.id);
  const jobs = await prisma.gameJob.findMany({ where: { roomId }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: jobIds } } }),
    prisma.auditLog.deleteMany({ where: { target: { in: ids } } }),
    prisma.runAttempt.deleteMany({ where: { jobId: { in: jobIds } } }),
    prisma.gameJob.deleteMany({ where: { roomId } }),
    prisma.gameEvent.deleteMany({ where: { gameId: { in: ids } } }),
    prisma.gameResult.deleteMany({ where: { gameId: { in: ids } } }),
    prisma.gameChoice.deleteMany({ where: { gameId: { in: ids } } }),
    prisma.game.deleteMany({ where: { roomId } }),
    prisma.match.deleteMany({ where: { roomId } }),
    prisma.room.deleteMany({ where: { id: roomId } }),
  ]);
  await prisma.$disconnect();
}, 20000);

it('enforces roles, origin, validation and explicit placeholders', async () => {
  expect((await request('/demo/games', 'POST', {})).status).toBe(401);
  let login = await request('/dev/session', 'POST', { accountId: 'acc_an' });
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect((await request('/demo/games', 'POST', {})).status).toBe(403);
  expect((await request('/bots?teamId=team_beta')).status).toBe(403);
  login = await request('/dev/session', 'POST', { accountId: 'acc_admin' });
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/);
  expect((await request('/demo/games', 'POST', {}, { origin: 'https://other.invalid' })).status).toBe(403);
  const invalid = await request('/demo/games', 'POST', {});
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.requestId).toBeTruthy();
  const todo = await request('/bots', 'POST', {});
  expect(todo.status).toBe(501);
  expect((await todo.json()).error.code).toBe('FEATURE_NOT_IMPLEMENTED');
});

it('creates exactly one game/job/outbox for simultaneous identical requests; reads never enqueue', async () => {
  const requestKey = `integration:${randomUUID()}`;
  const results = await Promise.all([
    request('/demo/games', 'POST', { requestKey, roomId }),
    request('/demo/games', 'POST', { requestKey, roomId }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
  const bodies = await Promise.all(results.map((r) => r.json()));
  expect(bodies[0].data.gameId).toBe(bodies[1].data.gameId);
  gameId = bodies[0].data.gameId;
  jobId = bodies[0].data.job.id;
  expect(await prisma.gameJob.count({ where: { requestKey } })).toBe(1);
  expect(await prisma.outboxEvent.count({ where: { aggregateId: jobId } })).toBe(1);
  const a = (await (await request(`/rooms/${roomId}`)).json()).data;
  const b = (await (await request(`/rooms/${roomId}`)).json()).data;
  expect(a.coinResult).toEqual(b.coinResult);
  expect(a.status).toBe('waiting');
  expect(await prisma.game.count({ where: { roomId } })).toBe(1);
  await waitFor(async () => !!(await queue.getJob(jobId)));
});

it('resumes a partial run with unchanged seed/coin, rejects duplicate leases and saves one ordered result', async () => {
  const processorPath = pathToFileURL(resolve('../worker/dist/process-game.js')).href;
  const runnerPath = pathToFileURL(resolve('../worker/dist/runner/simulated-runner.js')).href;
  const { GameProcessor, LeaseBusyError } = await import(processorPath);
  const { SimulatedRunner } = await import(runnerPath);
  const runner = new SimulatedRunner(async () => 'greedy');
  const input = {
    jobId,
    requestKey: (await prisma.gameJob.findUniqueOrThrow({ where: { id: jobId } })).requestKey,
  };
  const before = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const deps = {
    prisma,
    runner,
    signal: async () => {},
    workerId: 'integration-worker',
    leaseMs: 30000,
    moveDelayMs: 0,
    log: () => {},
  };
  let entered!: () => void;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const interrupted = new GameProcessor({
    ...deps,
    runner: {
      run: async (req: unknown, onMove: (move: MoveRecord) => Promise<void>) =>
        runner.run(req, async (m: MoveRecord) => {
          await onMove(m);
          if (m.ply === 2) {
            entered();
            await gate;
            throw new Error('simulated worker interruption');
          }
        }),
    },
  });
  const attempt = interrupted.process(input);
  const rejected = expect(attempt).rejects.toThrow(/interruption/);
  await started;
  await expect(new GameProcessor(deps).process(input)).rejects.toBeInstanceOf(LeaseBusyError);
  release();
  await rejected;
  const processor = new GameProcessor(deps);
  await processor.process(input);
  expect((await processor.process(input)).status).toBe('already_succeeded');
  expect(await prisma.gameResult.count({ where: { gameId } })).toBe(1);
  const events = await prisma.gameEvent.findMany({ where: { gameId }, orderBy: { seq: 'asc' } });
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  const moves = events.filter((e) => e.type === 'game.move');
  expect(new Set(moves.map((e) => e.ply)).size).toBe(moves.length);
  const after = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  expect(after.seed).toBe(before.seed);
  expect(after.coinResult).toEqual(before.coinResult);
  expect(await prisma.runAttempt.count({ where: { jobId } })).toBe(2);
}, 20000);

it('restores the same public snapshot on socket rejoin and replays pending outbox after API restart', async () => {
  const snap = (await (await request(`/rooms/${roomId}`)).json()).data;
  for (let i = 0; i < 2; i++) {
    socket = io(base, { transports: ['websocket'], forceNew: true });
    const got = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket timeout')), 5000);
      socket!.on('connect', () => socket!.emit('room.join', { roomId }));
      socket!.on('room.snapshot', (s) => {
        clearTimeout(timer);
        resolve(s);
      });
    });
    expect(got.board).toEqual(snap.board);
    expect(got.seq).toBe(snap.seq);
    expect(got.coinResult).toEqual(snap.coinResult);
    socket.disconnect();
  }
  await stop();
  await prisma.outboxEvent.create({
    data: {
      type: 'game.requested',
      aggregateId: jobId,
      payload: {
        jobId,
        requestKey: (await prisma.gameJob.findUniqueOrThrow({ where: { id: jobId } })).requestKey,
      },
    },
  });
  await start();
  await waitFor(
    async () => (await prisma.outboxEvent.count({ where: { aggregateId: jobId, status: 'pending' } })) === 0,
  );
  expect(await prisma.gameResult.count({ where: { gameId } })).toBe(1);
}, 20000);

it('recovers a worker killed mid-game through BullMQ stalled detection without duplicate results', async () => {
  const requestKey = `crash:${randomUUID()}`;
  const response = await request('/demo/games', 'POST', { requestKey, roomId });
  expect(response.status).toBe(201);
  const { data } = await response.json();
  const launchWorker = (delay: number) => {
    worker = spawn(process.execPath, ['dist/main.js'], {
      cwd: resolve('../worker'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEMO_MODE: 'true',
        QUEUE_PREFIX: prefix,
        WORKER_ID: `crash-test-${delay}`,
        LEASE_MS: '1000',
        WORKER_LOCK_MS: '1000',
        WORKER_STALLED_MS: '1000',
        SIM_MOVE_DELAY_MS: String(delay),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    worker.stdout?.on('data', (b) => {
      logs += String(b);
    });
    worker.stderr?.on('data', (b) => {
      logs += String(b);
    });
  };
  launchWorker(300);
  await waitFor(
    async () => (await prisma.gameEvent.count({ where: { gameId: data.gameId, type: 'game.move' } })) >= 2,
  );
  const before = await prisma.game.findUniqueOrThrow({ where: { id: data.gameId } });
  const exit = new Promise((r) => worker!.once('exit', r));
  worker!.kill('SIGKILL');
  await exit;
  await pause(1500);
  launchWorker(0);
  await waitFor(
    async () =>
      (await prisma.gameJob.findUniqueOrThrow({ where: { id: data.job.id } })).status === 'succeeded',
    20000,
  );
  const after = await prisma.game.findUniqueOrThrow({ where: { id: data.gameId } });
  expect(after.seed).toBe(before.seed);
  expect(after.coinResult).toEqual(before.coinResult);
  expect(await prisma.gameResult.count({ where: { gameId: data.gameId } })).toBe(1);
  const runs = await prisma.runAttempt.findMany({
    where: { jobId: data.job.id },
    orderBy: { attemptNo: 'asc' },
  });
  expect(runs.map((r) => r.status)).toEqual(['superseded', 'succeeded']);
  const events = await prisma.gameEvent.findMany({ where: { gameId: data.gameId }, orderBy: { seq: 'asc' } });
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  const stopped = new Promise((r) => worker!.once('exit', r));
  worker!.kill('SIGKILL');
  await stopped;
}, 30000);

it('persists pending outbox while Redis is unreachable and dispatches after reconnection', async () => {
  blockRedis = true;
  for (const connection of proxySockets) connection.destroy();
  const health = await request('/admin/health');
  expect(health.status).toBe(200);
  const healthBody = (await health.json()).data;
  expect(healthBody.redis).toBe(false);
  expect(healthBody.status).toBe('degraded');
  const requestKey = `redis-outage:${randomUUID()}`;
  const response = await request('/demo/games', 'POST', { requestKey, roomId });
  expect(response.status).toBe(201);
  const { data } = await response.json();
  expect(await prisma.outboxEvent.count({ where: { aggregateId: data.job.id, status: 'pending' } })).toBe(1);
  blockRedis = false;
  await waitFor(
    async () =>
      (await prisma.outboxEvent.count({ where: { aggregateId: data.job.id, status: 'pending' } })) === 0,
    15000,
  );
  expect(await queue.getJob(data.job.id)).toBeTruthy();
  expect((await prisma.gameJob.findUniqueOrThrow({ where: { id: data.job.id } })).status).toBe('dispatched');
}, 20000);
