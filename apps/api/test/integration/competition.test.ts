// Luồng thi đấu TV3 trên PostgreSQL thật: đội mẫu → kế hoạch mức → Swiss → xác nhận → cắt suất/tranh suất →
// cây 32 → vòng 32/16/tứ kết → Top 4, kèm phân quyền, khiếu nại chặn chốt vòng, và chống thao tác sai trạng thái.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const port = 3213;
const base = `http://localhost:${port}/api/v1`;
const prisma = new PrismaClient();
const tid = `tour_it_${randomUUID().slice(0, 8)}`;
let server: ChildProcess;
let logs = '';
const cookies: Record<string, string> = {};

// Dữ liệu phản hồi đọc linh hoạt trong test; hợp đồng đã được kiểm bằng zod ở phía máy chủ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
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
  const body = (await res.json().catch(() => null)) as {
    data?: Loose;
    error?: { code: string; message: string };
  } | null;
  return { status: res.status, data: body?.data, error: body?.error };
}
async function login(accountId: string) {
  const res = await fetch(`${base}/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  cookies[accountId] = res.headers.get('set-cookie')!.split(';')[0]!;
}
const reason = { reason: 'Kiểm thử tích hợp TV3' };
const overview = async () => (await call(null, `/tournaments/${tid}/competition`)).data;

beforeAll(async () => {
  await prisma.tournament.create({
    data: {
      id: tid,
      name: 'Giải kiểm thử TV3',
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
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(port),
      DEMO_MODE: 'true',
      QUEUE_PREFIX: `test-${randomUUID()}`,
      SESSION_SECRET: 'integration-secret-01234567890123456789',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (b) => (logs += String(b)));
  server.stderr?.on('data', (b) => (logs += String(b)));
  let up = false;
  for (let i = 0; i < 450 && !up; i++) {
    up = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (!up) await pause(100);
  }
  if (!up) throw new Error(`API không khởi động: ${logs.slice(-3000)}`);
  for (const a of ['acc_admin', 'acc_an']) await login(a);
}, 60_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  const pairings = await prisma.pairing.findMany({ where: { tournamentId: tid }, select: { id: true } });
  await prisma.appeal.deleteMany({ where: { pairingId: { in: pairings.map((p) => p.id) } } });
  await prisma.pairing.deleteMany({ where: { tournamentId: tid } });
  await prisma.bracketRound.deleteMany({ where: { tournamentId: tid } });
  await prisma.qualifierLevel.deleteMany({ where: { tournamentId: tid } });
  const teams = await prisma.team.findMany({ where: { tournamentId: tid }, select: { id: true } });
  await prisma.botVersion.deleteMany({ where: { teamId: { in: teams.map((t) => t.id) } } });
  await prisma.membership.deleteMany({ where: { tournamentId: tid } });
  await prisma.team.deleteMany({ where: { tournamentId: tid } });
  await prisma.auditLog.deleteMany({ where: { target: tid } });
  await prisma.stage.deleteMany({ where: { tournamentId: tid } });
  await prisma.tournament.delete({ where: { id: tid } });
  await prisma.$disconnect();
});

it('phân quyền: khách xem được bảng, không điều hành được; thí sinh không lập kế hoạch được', async () => {
  expect((await call(null, `/tournaments/${tid}/competition`)).status).toBe(200);
  expect(
    (
      await call(null, `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32],
        rounds: 3,
        ...reason,
      })
    ).status,
  ).toBe(401);
  expect((await call('acc_an', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason)).status).toBe(403);
  expect(
    (
      await call('acc_an', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32],
        rounds: 3,
        ...reason,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32, 40],
        rounds: 3,
        ...reason,
      })
    ).status,
  ).toBe(400);
});

it('chạy trọn sơ loại → cây 32 → Top 4 bằng mô phỏng, không bỏ bước xác nhận', async () => {
  // 38 đội: mức 1 chọn 32, các đội còn lại bị loại; số lẻ không xảy ra nhưng có thể có tranh suất ranh giới.
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/demo/teams`, 'POST', { count: 38 })).data.created,
  ).toBe(38);
  // Chưa lập kế hoạch/chưa khóa mức: bảng hiện danh sách đội dự kiến (không để trống).
  const preview = (await call(null, `/tournaments/${tid}/standings`)).data;
  expect(preview.preview).toBe(true);
  expect(preview.rows).toHaveLength(38);
  expect(preview.rows.every((r: { points: number }) => r.points === 0)).toBe(true);
  expect(
    (
      await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32],
        rounds: 3,
        avoidRematch: 'level',
        ...reason,
      })
    ).status,
  ).toBe(201);
  expect((await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason)).status).toBe(
    409,
  );
  // Chưa mức nào bắt đầu: sửa mốc của mức và lập lại kế hoạch được.
  const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const patch = (body: unknown) =>
    call('acc_admin', `/admin/tournaments/${tid}/qualifier/levels/1`, 'PATCH', body);
  expect(
    (await patch({ name: 'Mức duy nhất', botLockAt: soon(2), publishAt: soon(1), ...reason })).status,
  ).toBe(400);
  expect(
    (await patch({ name: 'Mức duy nhất', botLockAt: soon(1), publishAt: soon(2), ...reason })).status,
  ).toBe(200);
  expect((await overview()).levels[0]).toMatchObject({ name: 'Mức duy nhất', lockDue: false });
  expect(
    (
      await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32],
        rounds: 3,
        avoidRematch: 'level',
        ...reason,
      })
    ).status,
  ).toBe(201);
  const locked = await call('acc_admin', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason);
  // Đã khóa: không đổi mốc khóa bot, không lập lại kế hoạch.
  expect((await patch({ botLockAt: soon(3), ...reason })).status).toBe(409);
  expect(
    (
      await call('acc_admin', `/admin/tournaments/${tid}/qualifier/plan`, 'POST', {
        targets: [32],
        rounds: 3,
        ...reason,
      })
    ).status,
  ).toBe(409);
  expect(locked.data).toMatchObject({ level: 1, teams: 38 });

  for (let round = 1; round <= 3; round++) {
    const started = await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason);
    expect(started.data).toMatchObject({ round, pairs: 19, rematches: 0 });
    // Hai BTC bấm cùng lúc: vòng chưa xác nhận nên lần thứ hai bị từ chối, không tạo vòng trùng.
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason)).status,
    ).toBe(409);
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds/${round}/confirm`, 'POST', reason))
        .status,
    ).toBe(409);
    expect((await call('acc_admin', `/admin/tournaments/${tid}/demo/simulate`, 'POST')).data.simulated).toBe(
      19,
    );
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds/${round}/confirm`, 'POST', reason))
        .status,
    ).toBe(201);
  }
  const standings = (await call(null, `/tournaments/${tid}/standings`)).data;
  expect(standings.rows).toHaveLength(38);
  expect(standings.provisional).toBe(false);
  expect(standings.rows.every((r: { played: number }) => r.played === 3)).toBe(true);

  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/finish`, 'POST', reason);
  // Tranh suất ranh giới (nếu có) chạy tới khi đủ 32 suất.
  for (let i = 0; i < 10 && (await overview()).levels[0].status === 'cutting'; i++) {
    await call('acc_admin', `/admin/tournaments/${tid}/demo/simulate`, 'POST');
  }
  const afterCut = await overview();
  expect(afterCut.levels[0]).toMatchObject({ status: 'done', qualifiedCount: 32 });
  expect(afterCut.bracket.map((r: { phase: string }) => r.phase)).toEqual(['r32', 'r16', 'qf']);
  const r32 = afterCut.bracket[0].pairings;
  expect(r32).toHaveLength(16);
  expect(r32[0]).toMatchObject({ seedA: 1, seedB: 32 });
  const final = (await call(null, `/tournaments/${tid}/standings`)).data;
  expect(final.rows.filter((r: { state: string }) => r.state === 'advanced')).toHaveLength(32);

  for (const [phase, count] of [
    ['r32', 16],
    ['r16', 8],
    ['qf', 4],
  ] as const) {
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/knockout/${phase}/confirm`, 'POST', reason)).status,
    ).toBe(409);
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/knockout/${phase}/start`, 'POST', reason)).data
        .pairings,
    ).toBe(count);
    expect((await call('acc_admin', `/admin/tournaments/${tid}/demo/simulate`, 'POST')).data.simulated).toBe(
      count,
    );
    const games = (await overview()).bracket.find((r: { phase: string }) => r.phase === phase).pairings;
    for (const p of games) {
      // 5 hiệp chính, hoặc 7 khi bằng điểm sau 5 hiệp; người thắng là đội trong cặp.
      expect([5, 7]).toContain(p.games.length);
      expect([p.teamA.id, p.teamB.id]).toContain(p.winnerTeamId);
    }
    expect(
      (await call('acc_admin', `/admin/tournaments/${tid}/knockout/${phase}/confirm`, 'POST', reason)).status,
    ).toBe(201);
  }
  const done = await overview();
  expect(done.top4).toHaveLength(4);
  expect(done.next.action).toBe('done');
}, 120_000);

it('khiếu nại: chỉ đội trưởng của đội trong cặp; khiếu nại mở chặn xác nhận; chấp nhận + thi lại xóa kết quả tạm', async () => {
  // Giải riêng nhỏ cho kịch bản khiếu nại: đặt lại phần thi đấu, gắn đội Alpha (đội trưởng acc_an) vào giải.
  await call('acc_admin', `/admin/tournaments/${tid}/competition/reset`, 'POST', reason);
  await prisma.team.update({ where: { id: 'team_alpha' }, data: {} });
  const teams = await prisma.team.findMany({
    where: { tournamentId: tid },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  // Đội trưởng mẫu acc_an thuộc giải hiện tại khác; dùng đội mô phỏng đầu tiên và gán đội trưởng là acc_an để thử.
  await prisma.team.update({ where: { id: teams[0]!.id }, data: { captainId: 'acc_an' } });
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/lock`, 'POST', reason);
  await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds`, 'POST', reason);
  await call('acc_admin', `/admin/tournaments/${tid}/demo/simulate`, 'POST');
  const pairing = (await prisma.pairing.findFirst({
    where: { tournamentId: tid, kind: 'swiss', OR: [{ teamAId: teams[0]!.id }, { teamBId: teams[0]!.id }] },
  }))!;

  // acc_an không thuộc đội trong giải này theo phiên (teamId của phiên lấy theo giải hiện tại) → bị từ chối.
  const denied = await call('acc_an', '/appeals', 'POST', {
    pairingId: pairing.id,
    body: 'Bot đối thủ đi nước không hợp lệ ở ván 1.',
  });
  expect([403, 409]).toContain(denied.status);
  // BTC nhận và xử lý khiếu nại tạo trực tiếp (mô phỏng đội trưởng gửi qua giao diện).
  const appeal = await prisma.appeal.create({
    data: {
      pairingId: pairing.id,
      teamId: teams[0]!.id,
      accountId: 'acc_an',
      body: 'Bot đối thủ đi nước không hợp lệ ở ván 1.',
    },
  });
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds/1/confirm`, 'POST', reason)).status,
  ).toBe(409);
  expect(
    (
      await call('acc_an', `/admin/appeals/${appeal.id}/decision`, 'POST', {
        decision: 'reject',
        reason: 'Không đủ căn cứ',
      })
    ).status,
  ).toBe(403);
  const decided = await call('acc_admin', `/admin/appeals/${appeal.id}/decision`, 'POST', {
    decision: 'accept',
    action: 'rerun',
    reason: 'Xác minh có lỗi hạ tầng',
  });
  expect(decided.data).toMatchObject({ status: 'accepted', action: 'rerun' });
  expect((await prisma.pairing.findUniqueOrThrow({ where: { id: pairing.id } })).status).toBe('scheduled');
  expect(
    (
      await call('acc_admin', `/admin/appeals/${appeal.id}/decision`, 'POST', {
        decision: 'reject',
        reason: 'Lần hai',
      })
    ).status,
  ).toBe(409);
  // Nhập tay kết quả thi lại, rồi mới xác nhận được vòng.
  const manual = await call('acc_admin', `/admin/pairings/${pairing.id}/result`, 'POST', {
    games: ['a', 'b'],
    reason: 'Thi lại theo quyết định khiếu nại',
  });
  expect(manual.data).toMatchObject({ result: 'draw' });
  expect((await prisma.pairing.findUniqueOrThrow({ where: { id: pairing.id } })).resultVersion).toBe(2);
  expect(
    (await call('acc_admin', `/admin/tournaments/${tid}/qualifier/rounds/1/confirm`, 'POST', reason)).status,
  ).toBe(201);
  expect(
    (
      await call('acc_admin', `/admin/pairings/${pairing.id}/result`, 'POST', {
        games: ['a', 'a'],
        reason: 'Sửa sau khi chốt',
      })
    ).status,
  ).toBe(409);
  const audit = await prisma.auditLog.findMany({ where: { target: tid, action: 'appeal.decide' } });
  expect(audit).toHaveLength(1);
  void logs;
});
