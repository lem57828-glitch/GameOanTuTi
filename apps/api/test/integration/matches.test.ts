// TV4 trên PostgreSQL/Redis và worker thật: phòng theo cặp TV3. Sơ loại dùng bot đội chốt cho cả mức (chạy ngay);
// loại trực tiếp chọn kín bot/quân thứ 10 từng hiệp → khóa (sẵn sàng hoặc hết giờ)
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
  // Đặt lại phần thi đấu đã xóa cặp → tìm trận theo giai đoạn của giải để dọn đủ phòng/trận.
  const stageIds = (await prisma.stage.findMany({ where: { tournamentId: tid }, select: { id: true } })).map(
    (x) => x.id,
  );
  const byStage = await prisma.match.findMany({
    where: { stageId: { in: stageIds } },
    select: { roomId: true },
  });
  const roomIds = [
    ...new Set([...pairings.map((p) => pairingRoomId(p.id)), ...byStage.map((m) => m.roomId)]),
  ];
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

it('sơ loại: đội trưởng chốt một bot cho cả mức, trận Swiss chạy ngay không chờ chọn, kết quả trận về TV3', async () => {
  // 17 đội → mức 1 chọn 32 (tất cả đi tiếp) → cây 32 chỉ có một cặp thật (hạt giống 16 gặp 17).
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/demo/teams`, 'POST', { count: 17 })).data.created,
  ).toBe(17);
  const teams = await prisma.team.findMany({ where: { tournamentId: tid }, orderBy: { createdAt: 'asc' } });
  // acc_an làm đội trưởng đội đầu tiên trong giải kiểm thử (giải mới nhất đang chạy = giải hiện tại của phiên).
  await prisma.team.update({ where: { id: teams[0]!.id }, data: { captainId: 'acc_an' } });
  await prisma.membership.create({ data: { teamId: teams[0]!.id, accountId: 'acc_an', tournamentId: tid } });
  // Đội có hai bot: v2 mới hơn là mặc định; đội trưởng chủ động chọn v1.
  const v1 = await prisma.botVersion.findFirstOrThrow({ where: { teamId: teams[0]!.id } });
  const v2 = await prisma.botVersion.create({
    data: { ...v1, id: `${v1.id}_v2`, version: v1.version + 1, label: 'v2', createdAt: new Date() },
  });
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
    targets: [32],
    rounds: 1,
    ...reason,
  });
  await login('acc_an');
  const before = (await call('acc_an', `/tournaments/${tid}/qualifier/my-bot`)).data;
  expect(before).toMatchObject({ level: { ord: 1, status: 'planned' }, canChoose: true });
  expect(before.current).toMatchObject({ botVersionId: v2.id, source: 'default' });
  const other = await prisma.botVersion.findFirstOrThrow({ where: { teamId: teams[5]!.id } });
  expect(
    (await call('acc_an', `/tournaments/${tid}/qualifier/my-bot`, 'POST', { botVersionId: other.id })).status,
  ).toBe(403);
  expect(
    (await call('acc_an', `/tournaments/${tid}/qualifier/my-bot`, 'POST', { botVersionId: v1.id })).status,
  ).toBe(201);

  // Khóa mức: bot được chốt cho cả 17 đội (đội chưa chọn: tự chốt), không đổi được nữa.
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason);
  const locked = (await call('acc_an', `/tournaments/${tid}/qualifier/my-bot`)).data;
  expect(locked).toMatchObject({ canChoose: false, current: { botVersionId: v1.id, source: 'chosen' } });
  expect(
    (await call('acc_an', `/tournaments/${tid}/qualifier/my-bot`, 'POST', { botVersionId: v2.id })).status,
  ).toBe(409);
  const level = await prisma.qualifierLevel.findFirstOrThrow({ where: { tournamentId: tid, ord: 1 } });
  expect(await prisma.levelBot.count({ where: { levelId: level.id } })).toBe(17);
  expect(await prisma.levelBot.count({ where: { levelId: level.id, auto: true } })).toBe(16);

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
  // Không có bước chọn theo hiệp ở sơ loại.
  const sel = (await call('acc_an', `/rooms/${roomId}/my-selection`)).data;
  expect(sel).toMatchObject({ isCaptain: true, canChoose: false });
  expect(sel.reason).toMatch(/Sơ loại/);
  expect((await call('acc_an', `/rooms/${roomId}/choices`, 'POST', { botVersionId: v2.id })).status).toBe(409);

  // Hạn chọn 2 giây không liên quan: các trận chạy ngay; worker chạy 2 ván đổi màu cho mỗi cặp.
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
    include: { games: { include: { choices: true } }, selections: true },
  });
  expect(match.status).toBe('completed');
  expect(match.games).toHaveLength(2);
  // Ván 2 đổi màu so với ván 1; cả hai hiệp dùng đúng bot đội trưởng đã chốt cho mức, không có lựa chọn tự động.
  expect(match.games[0]!.blueTeamId).not.toBe(match.games[1]!.blueTeamId);
  for (const g of match.games) expect(g.choices.find((c) => c.teamId === teams[0]!.id)!.botVersionId).toBe(v1.id);
  expect(match.selections.every((x) => !x.auto)).toBe(true);
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

it('gửi bù kết quả trận bị mất giữa chừng; đặt lại phần thi đấu thì trận cũ tự hủy; tóm tắt phòng đúng trạng thái', async () => {
  // Trận mở lại sau khiếu nại (test trước) chạy xong và về TV3.
  const real = await prisma.pairing.findFirstOrThrow({
    where: { tournamentId: tid, phase: 'r32', matchId: { not: null } },
  });
  await waitFor(
    async () => (await prisma.pairing.findUniqueOrThrow({ where: { id: real.id } })).status === 'done',
    180_000,
    'trận mở lại có kết quả',
  );
  const match = await prisma.match.findFirstOrThrow({ where: { id: real.matchId! } });
  expect(match.reportedAt).not.toBeNull();

  // Giả lập tiến trình dừng ngay sau khi trận xong, trước khi gửi kết quả cho TV3.
  await prisma.pairing.update({
    where: { id: real.id },
    data: {
      status: 'scheduled',
      result: null,
      winnerTeamId: null,
      scoreA: 0,
      scoreB: 0,
      games: [],
      decidedBy: null,
      source: null,
    },
  });
  // Khi chưa gửi, vòng loại trực tiếp vẫn đang thi (chưa có cặp nào báo xong).
  await prisma.bracketRound.updateMany({ where: { tournamentId: tid, phase: 'r32' }, data: { status: 'running' } });
  await prisma.match.update({ where: { id: match.id }, data: { reportedAt: null, pauseReason: null } });
  await waitFor(
    async () => (await prisma.pairing.findUniqueOrThrow({ where: { id: real.id } })).source === 'match',
    20_000,
    'gửi bù kết quả',
  );
  const resent = await prisma.pairing.findUniqueOrThrow({ where: { id: real.id } });
  expect(resent.status).toBe('done');
  expect(resent.games).toEqual(match.outcomes);

  // Thi lại → mở trận mới (đang chọn) → BTC đặt lại phần thi đấu: trận không còn cặp đấu phải tự hủy.
  const appeal = await prisma.appeal.create({
    data: {
      pairingId: real.id,
      teamId: real.teamAId!,
      accountId: 'acc_an',
      body: 'Yêu cầu thi lại để kiểm thử hủy trận.',
    },
  });
  await call('acc_referee', `/admin/appeals/${appeal.id}/decision`, 'POST', {
    decision: 'accept',
    action: 'rerun',
    reason: 'Kiểm thử',
  });
  await call('acc_admin', `/admin/tournaments/${tid}/matches/open`, 'POST');
  const summary = (await call('acc_referee', `/admin/tournaments/${tid}/matches/summary`)).data;
  expect(summary).toMatchObject({ pending: 1, notOpened: 0 });
  expect(summary.selecting + summary.running).toBe(1);
  expect(summary.byGame).toHaveLength(1);
  expect(summary.byGame[0].selecting + summary.byGame[0].running).toBe(1);
  const fresh = await prisma.match.findFirstOrThrow({
    where: { pairId: real.id },
    orderBy: { createdAt: 'desc' },
  });
  await prisma.appeal.deleteMany({ where: { pairingId: real.id } });
  await call('acc_admin', `/admin/tournaments/${tid}/competition/reset`, 'POST', reason);
  await waitFor(
    async () => (await prisma.match.findUniqueOrThrow({ where: { id: fresh.id } })).status === 'cancelled',
    20_000,
    'trận mồ côi bị hủy',
  );
}, 240_000);
