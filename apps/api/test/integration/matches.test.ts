// TV4 trên PostgreSQL/Redis và worker thật: phòng theo cặp TV3 → chọn kín bot/quân thứ 10 → khóa (sẵn sàng hoặc hết giờ)
// → tung xu → worker chạy từng hiệp → trận đủ hiệp → kết quả về TV3 (nguồn 'match'). Kèm loại trực tiếp 5+2 hiệp,
// quyền đội trưởng, không lộ lựa chọn chưa khóa, và mở lại trận trong cùng phòng sau khi chấp nhận khiếu nại.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pairingRoomId, redisKeys } from '@arena/contracts';

// Dữ liệu phản hồi đọc linh hoạt trong test; hợp đồng đã được kiểm bằng zod ở phía máy chủ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const port = 3214;
const base = `http://localhost:${port}/api/v1`;
const prefix = `test-tv4-${randomUUID()}`;
const prisma = new PrismaClient();
const tid = `tour_tv4_${randomUUID().slice(0, 8)}`;
const children: ChildProcess[] = [];
let logs = '';
const cookies: Record<string, string> = {};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(who: string | null, path: string, method = 'GET', json?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(who ? { cookie: cookies[who]! } : {}),
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as {
    data?: Loose;
    error?: { code: string; message: string };
  } | null;
  return { status: res.status, data: body?.data, error: body?.error, text };
}
async function login(accountId: string) {
  const res = await fetch(`${base}/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  cookies[accountId] = res.headers.get('set-cookie')!.split(';')[0]!;
}
async function waitFor(check: () => Promise<boolean>, timeout: number, label: string) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error(`Hết thời gian chờ: ${label}\n${logs.slice(-3000)}`);
    await pause(250);
  }
}
const reason = { reason: 'Kiểm thử tích hợp TV4' };
const overview = async () => (await call(null, `/tournaments/${tid}/competition`)).data;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DEMO_MODE: 'true',
  QUEUE_PREFIX: prefix,
  SESSION_SECRET: 'integration-secret-01234567890123456789',
};
function launch(cwd: string, extra: Record<string, string>) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd,
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (b) => (logs += String(b)));
  child.stderr?.on('data', (b) => (logs += String(b)));
  children.push(child);
}

beforeAll(async () => {
  await prisma.tournament.create({
    data: {
      id: tid,
      name: 'Giải kiểm thử TV4',
      status: 'registration',
      isDemo: true,
      configStatus: 'confirmed',
      stages: {
        create: [
          { ord: 1, kind: 'qualifier', name: 'Sơ loại', configStatus: 'confirmed' },
          { ord: 2, kind: 'knockout', name: 'Loại trực tiếp 32 → 4', configStatus: 'confirmed' },
        ],
      },
    },
  });
  // Hạn chọn 2 giây để thử cả khóa do hết giờ (lựa chọn dự phòng) mà không làm test chậm.
  launch(resolve('.'), { API_PORT: String(port), MATCH_SELECT_SECONDS: '2' });
  launch(resolve('../worker'), { WORKER_ID: 'tv4-test', SIM_MOVE_DELAY_MS: '0', WORKER_CONCURRENCY: '4' });
  let up = false;
  for (let i = 0; i < 450 && !up; i++) {
    up = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (!up) await pause(100);
  }
  if (!up) throw new Error(`API không khởi động: ${logs.slice(-3000)}`);
  await waitFor(async () => (await call(null, '/health')).data?.workerAlive === true, 60_000, 'worker');
  for (const a of ['acc_admin', 'acc_referee']) await login(a);
}, 120_000);

afterAll(async () => {
  for (const c of children) {
    if (c.exitCode === null && c.signalCode === null) {
      const exited = new Promise((r) => c.once('exit', r));
      c.kill('SIGKILL');
      await exited;
    }
  }
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queue = new Queue(redisKeys(prefix).gameQueue, { connection: redis, prefix });
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
  redis.disconnect();
  const pairings = await prisma.pairing.findMany({ where: { tournamentId: tid }, select: { id: true } });
  const roomIds = pairings.map((p) => pairingRoomId(p.id));
  const games = await prisma.game.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } });
  const gameIds = games.map((g) => g.id);
  const jobs = await prisma.gameJob.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const matches = await prisma.match.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } });
  const teams = await prisma.team.findMany({ where: { tournamentId: tid }, select: { id: true } });
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: jobIds } } }),
    prisma.runAttempt.deleteMany({ where: { jobId: { in: jobIds } } }),
    prisma.gameJob.deleteMany({ where: { id: { in: jobIds } } }),
    prisma.gameEvent.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.gameChoice.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.game.deleteMany({ where: { id: { in: gameIds } } }),
    prisma.matchSelection.deleteMany({ where: { matchId: { in: matches.map((m) => m.id) } } }),
    prisma.match.deleteMany({ where: { roomId: { in: roomIds } } }),
    prisma.room.deleteMany({ where: { id: { in: roomIds } } }),
    prisma.appeal.deleteMany({ where: { pairingId: { in: pairings.map((p) => p.id) } } }),
    prisma.pairing.deleteMany({ where: { tournamentId: tid } }),
    prisma.bracketRound.deleteMany({ where: { tournamentId: tid } }),
    prisma.qualifierLevel.deleteMany({ where: { tournamentId: tid } }),
    prisma.botVersion.deleteMany({ where: { teamId: { in: teams.map((t) => t.id) } } }),
    prisma.membership.deleteMany({ where: { tournamentId: tid } }),
    prisma.team.deleteMany({ where: { tournamentId: tid } }),
    prisma.auditLog.deleteMany({ where: { target: { in: [tid, ...matches.map((m) => m.id)] } } }),
    prisma.stage.deleteMany({ where: { tournamentId: tid } }),
    prisma.tournament.delete({ where: { id: tid } }),
  ]);
  await prisma.$disconnect();
}, 60_000);

it('sơ loại: phòng theo cặp, chọn kín của đội trưởng, khóa khi hết giờ, kết quả trận về TV3', async () => {
  // 17 đội → mức 1 chọn 32 (tất cả đi tiếp) → cây 32 chỉ có một cặp thật (hạt giống 16 gặp 17).
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/demo/teams`, 'POST', { count: 17 })).data.created,
  ).toBe(17);
  const teams = await prisma.team.findMany({ where: { tournamentId: tid }, orderBy: { createdAt: 'asc' } });
  // acc_an làm đội trưởng đội đầu tiên trong giải kiểm thử (giải mới nhất đang chạy = giải hiện tại của phiên).
  await prisma.team.update({ where: { id: teams[0]!.id }, data: { captainId: 'acc_an' } });
  await prisma.membership.create({ data: { teamId: teams[0]!.id, accountId: 'acc_an', tournamentId: tid } });
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
    targets: [32],
    rounds: 1,
    ...reason,
  });
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason);
  await login('acc_an');
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason)).data,
  ).toMatchObject({ pairs: 8 });

  // Sinh viên không mở phòng được; BTC mở phòng cho 8 cặp, mở lại không tạo trận trùng.
  expect((await call('acc_an', `/admin/tournaments/${tid}/matches/open`, 'POST')).status).toBe(403);
  expect((await call('acc_admin', `/admin/tournaments/${tid}/matches/open`, 'POST')).data.opened).toBe(8);
  expect((await call('acc_admin', `/admin/tournaments/${tid}/matches/open`, 'POST')).data.opened).toBe(0);

  const mine = await prisma.pairing.findFirstOrThrow({
    where: { tournamentId: tid, kind: 'swiss', OR: [{ teamAId: teams[0]!.id }, { teamBId: teams[0]!.id }] },
  });
  const roomId = pairingRoomId(mine.id);
  const sel = (await call('acc_an', `/rooms/${roomId}/my-selection`)).data;
  expect(sel).toMatchObject({ isCaptain: true, canChoose: true, gameNo: 1 });
  expect(sel.allowedBots.length).toBeGreaterThan(0);
  // Bot của đội khác bị từ chối; đội trưởng chọn bot của đội, chưa bấm sẵn sàng.
  const other = await prisma.botVersion.findFirstOrThrow({ where: { teamId: teams[5]!.id } });
  expect((await call('acc_an', `/rooms/${roomId}/choices`, 'POST', { botVersionId: other.id })).status).toBe(
    403,
  );
  const chosen = sel.allowedBots[0].id;
  expect(
    (await call('acc_an', `/rooms/${roomId}/choices`, 'POST', { botVersionId: chosen, ready: false })).status,
  ).toBe(201);
  // Khán giả chỉ thấy "đã chọn", không thấy bot đã chọn.
  const spectator = await call(null, `/rooms/${roomId}`);
  const side = mine.teamAId === teams[0]!.id ? 'a' : 'b';
  expect(spectator.data.match.selection[side]).toEqual({ chosen: true, ready: false });
  expect(spectator.text).not.toContain(chosen);
  expect(
    (await call('acc_referee', `/rooms/${roomId}/choices`, 'POST', { botVersionId: chosen })).status,
  ).toBe(403);

  // Hết hạn 2 giây: đội chưa chọn dùng lựa chọn dự phòng; worker chạy 2 ván đổi màu cho mỗi cặp.
  await waitFor(
    async () => (await overview()).levels[0].roundsDetail[0]?.done === 8,
    150_000,
    '8 cặp Swiss có kết quả từ phòng đấu',
  );
  const swiss = await prisma.pairing.findMany({ where: { tournamentId: tid, kind: 'swiss' } });
  for (const p of swiss) {
    expect(p.source).toBe('match');
    expect((p.games as unknown[]).length).toBe(2);
  }
  const match = await prisma.match.findFirstOrThrow({
    where: { pairId: mine.id },
    include: { games: { include: { choices: true } } },
  });
  expect(match.status).toBe('completed');
  expect(match.games).toHaveLength(2);
  // Ván 2 đổi màu so với ván 1; lựa chọn của đội trưởng được dùng ở hiệp 1.
  expect(match.games[0]!.blueTeamId).not.toBe(match.games[1]!.blueTeamId);
  expect(match.games[0]!.choices.find((c) => c.teamId === teams[0]!.id)!.botVersionId).toBe(chosen);
  const snap = (await call(null, `/rooms/${roomId}`)).data;
  expect(snap.match).toMatchObject({ status: 'completed', kind: 'swiss', mainGames: 2, chooseExtra: false });
  expect(snap.match.games).toHaveLength(2);
}, 240_000);

it('loại trực tiếp: 5 hiệp (+2 khi hòa) có quân thứ 10, tung xu từng hiệp; thi lại sau khiếu nại mở trận mới cùng phòng', async () => {
  await call('acc_referee', `/admin/tournaments/${tid}/qualifier/rounds/1/confirm`, 'POST', reason);
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/finish`, 'POST', reason);
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/knockout/r32/start`, 'POST', reason)).status,
  ).toBe(201);
  const real = await prisma.pairing.findFirstOrThrow({
    where: { tournamentId: tid, phase: 'r32', status: 'scheduled' },
  });
  expect((await call('acc_admin', `/admin/tournaments/${tid}/matches/open`, 'POST')).data.opened).toBe(1);
  await waitFor(
    async () => (await prisma.pairing.findUniqueOrThrow({ where: { id: real.id } })).status === 'done',
    180_000,
    'cặp r32 có kết quả',
  );
  const done = await prisma.pairing.findUniqueOrThrow({ where: { id: real.id } });
  expect(done.source).toBe('match');
  expect([5, 7]).toContain((done.games as unknown[]).length);
  const room = (await call(null, `/rooms/${pairingRoomId(real.id)}`)).data;
  expect(room.match).toMatchObject({
    kind: 'knockout',
    mainGames: 5,
    chooseExtra: true,
    status: 'completed',
  });
  expect(room.match.winnerTeamId).toBe(done.winnerTeamId);
  const choices = await prisma.gameChoice.findMany({ where: { game: { roomId: pairingRoomId(real.id) } } });
  expect(choices.every((c) => ['ROCK', 'PAPER', 'SCISSORS'].includes(c.extraType!))).toBe(true);

  // Khiếu nại được chấp nhận + thi lại: TV3 gỡ trận cũ; BTC mở lại → trận mới trong CÙNG phòng.
  const appeal = await prisma.appeal.create({
    data: {
      pairingId: real.id,
      teamId: real.teamAId!,
      accountId: 'acc_an',
      body: 'Bot đối thủ đi sai nước ở hiệp 2.',
    },
  });
  await call('acc_referee', `/admin/appeals/${appeal.id}/decision`, 'POST', {
    decision: 'accept',
    action: 'rerun',
    reason: 'Xác minh lỗi hạ tầng',
  });
  expect((await call('acc_admin', `/admin/tournaments/${tid}/matches/open`, 'POST')).data.opened).toBe(1);
  const matches = await prisma.match.findMany({ where: { pairId: real.id }, orderBy: { createdAt: 'asc' } });
  expect(matches).toHaveLength(2);
  expect(new Set(matches.map((m) => m.roomId)).size).toBe(1);
  expect((await call(null, `/rooms/${pairingRoomId(real.id)}`)).data.match.matchId).toBe(matches[1]!.id);
}, 240_000);
