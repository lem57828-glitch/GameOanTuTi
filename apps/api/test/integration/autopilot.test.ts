// Demo một thí sinh (giải trải nghiệm tự điều hành): đội của acc_an + 7 đội mẫu. Thí sinh chỉ bấm "Tiếp theo";
// máy chủ làm các bước BTC, worker chạy mọi trận thật. Kiểm tra: đi trọn Swiss → loại trực tiếp → Top 4, không có
// kết quả mô phỏng, thao tác BTC ghi nhật ký là hệ thống, người ngoài giải / giải không bật tự điều hành bị từ chối.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pairingRoomId, redisKeys } from '@arena/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const port = 3216;
const base = `http://localhost:${port}/api/v1`;
const prefix = `test-autopilot-${randomUUID()}`;
const prisma = new PrismaClient();
const tid = `tour_auto_${randomUUID().slice(0, 8)}`;
const children: ChildProcess[] = [];
let logs = '';
const cookies: Record<string, string> = {};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(who: string, path: string, method = 'GET', json?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { cookie: cookies[who]!, ...(json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as { data?: Loose; error?: { message: string } } | null;
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
function launch(cwd: string, extra: Record<string, string>) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      QUEUE_PREFIX: prefix,
      SESSION_SECRET: 'integration-secret-01234567890123456789',
      ...extra,
    },
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
      name: 'Giải kiểm thử tự điều hành',
      status: 'registration',
      isDemo: true,
      demoKind: 'experience',
      autopilot: true,
      configStatus: 'confirmed',
      stages: {
        create: [
          { ord: 1, kind: 'qualifier', name: 'Sơ loại', configStatus: 'confirmed' },
          { ord: 2, kind: 'knockout', name: 'Loại trực tiếp 32 → 4', configStatus: 'confirmed' },
        ],
      },
    },
  });
  launch(resolve('.'), { API_PORT: String(port), MATCH_SELECT_SECONDS: '600' });
  launch(resolve('../worker'), {
    WORKER_ID: 'autopilot-test',
    SIM_MOVE_DELAY_MS: '0',
    WORKER_CONCURRENCY: '4',
  });
  let up = false;
  for (let i = 0; i < 450 && !up; i++) {
    up = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (!up) await pause(100);
  }
  if (!up) throw new Error(`API không khởi động: ${logs.slice(-3000)}`);
  for (const a of ['acc_admin', 'acc_chi']) await login(a);
  // 7 đội mẫu (đội do hệ thống cầm) + đội của acc_an (đội thật: chọn kín ở loại trực tiếp do người bấm).
  expect((await call('acc_admin', `/admin/tournaments/${tid}/demo/teams`, 'POST', { count: 7 })).status).toBe(
    201,
  );
  const team = await prisma.team.create({
    data: {
      id: `${tid}_sv`,
      tournamentId: tid,
      name: 'Đội Thí Sinh',
      nameKey: 'doi thi sinh',
      captainId: 'acc_an',
      status: 'approved',
    },
  });
  await prisma.membership.create({ data: { teamId: team.id, accountId: 'acc_an', tournamentId: tid } });
  await prisma.botVersion.create({
    data: {
      id: `${tid}_sv_bot`,
      teamId: team.id,
      version: 1,
      label: 'bot thí sinh',
      sourceHash: 'b'.repeat(64),
      rulesetId: 'standard-32-4',
      status: 'valid',
      isDemo: true,
      demoPolicy: 'greedy',
    },
  });
  await login('acc_an');
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
    prisma.finalSubmission.deleteMany({ where: { tournamentId: tid } }),
    prisma.pairing.deleteMany({ where: { tournamentId: tid } }),
    prisma.bracketRound.deleteMany({ where: { tournamentId: tid } }),
    prisma.qualifierLevel.deleteMany({ where: { tournamentId: tid } }),
    prisma.botStageSelection.deleteMany({ where: { teamId: { in: teams.map((t) => t.id) } } }),
    prisma.botVersion.deleteMany({ where: { teamId: { in: teams.map((t) => t.id) } } }),
    prisma.membership.deleteMany({ where: { tournamentId: tid } }),
    prisma.team.deleteMany({ where: { tournamentId: tid } }),
    prisma.auditLog.deleteMany({ where: { target: { in: [tid, ...matches.map((m) => m.id)] } } }),
    prisma.stage.deleteMany({ where: { tournamentId: tid } }),
    prisma.tournament.delete({ where: { id: tid } }),
  ]);
  await prisma.$disconnect();
}, 60_000);

it('thí sinh chỉ bấm "Tiếp theo": đi trọn Swiss → loại trực tiếp → Top 4 bằng trận thật, BTC tự động ghi nhật ký hệ thống', async () => {
  // Người ngoài giải không điều khiển được.
  expect((await call('acc_chi', `/tournaments/${tid}/demo/autopilot`)).status).toBe(403);
  const first = (await call('acc_an', `/tournaments/${tid}/demo/autopilot`)).data;
  expect(first).toMatchObject({ enabled: true, canAdvance: true, done: false });

  const start = Date.now();
  let clicks = 0;
  let defaults = 0;
  let v: Loose = first;
  while (!v.done) {
    if (Date.now() - start > 420_000) {
      const ps = await prisma.pairing.findMany({ where: { tournamentId: tid, status: 'scheduled' } });
      const ms = await prisma.match.findMany({
        where: { id: { in: ps.flatMap((p) => (p.matchId ? [p.matchId] : [])) } },
        include: { selections: true, games: { select: { status: true } } },
      });
      throw new Error(`Quá lâu ở bước "${v.step}"\n${JSON.stringify({ v, ms }, null, 1)}`);
    }
    if (v.needsChoice.length) {
      // Loại trực tiếp: đội thật chọn kín — dùng lựa chọn mặc định cho nhanh (người dùng thật vào phòng chọn).
      v = (await call('acc_an', `/tournaments/${tid}/demo/autopilot/advance`, 'POST', { useDefault: true }))
        .data;
      defaults++;
    } else if (v.canAdvance) {
      const r = await call('acc_an', `/tournaments/${tid}/demo/autopilot/advance`, 'POST', {});
      expect(r.status, r.error?.message).toBe(201);
      v = r.data;
      clicks++;
    } else {
      await pause(500);
      v = (await call('acc_an', `/tournaments/${tid}/demo/autopilot`)).data;
    }
  }
  expect(clicks).toBeGreaterThanOrEqual(4); // 3 vòng Swiss + chốt mức/sang loại trực tiếp
  expect(defaults).toBeGreaterThan(0); // tứ kết có hiệp đội thật phải chọn

  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
  expect((t.top4 as string[]).length).toBe(4);
  // Sau Top 4, "Tiếp theo" đi tiếp bán kết → chung kết (thu bài USB được giả lập bằng bot hợp lệ của mỗi đội).
  expect(t.champion).toBeTruthy();
  const finals = await prisma.pairing.findMany({
    where: { tournamentId: tid, kind: { in: ['semifinal', 'final'] } },
  });
  expect(finals.map((p) => p.kind).sort()).toEqual(['final', 'semifinal', 'semifinal']);
  const all = await prisma.pairing.findMany({ where: { tournamentId: tid } });
  // Không có kết quả mô phỏng: Swiss/tứ kết từ phòng đấu, các vòng thiếu đối thủ là xử thắng vắng mặt.
  expect(all.some((p) => p.source === 'simulation')).toBe(false);
  for (const p of all.filter((x) => x.kind === 'swiss' || (x.kind === 'knockout' && x.teamAId && x.teamBId)))
    expect(p.source).toBe('match');
  expect(all.filter((p) => p.kind === 'swiss' && p.confirmed)).toHaveLength(12);
  // Thao tác BTC do hệ thống làm (actorId null), có lý do ghi rõ.
  const audit = await prisma.auditLog.findMany({ where: { target: tid, action: 'qualifier.round.confirm' } });
  expect(audit).toHaveLength(3);
  for (const a of audit) {
    expect(a.actorId).toBeNull();
    expect(a.reason).toMatch(/Tự điều hành/);
  }
  // Đội mẫu ở loại trực tiếp dùng lựa chọn mặc định (auto), đội thật chỉ auto khi chính thí sinh bấm mặc định.
  const ko = all.filter((p) => p.kind === 'knockout' && p.matchId);
  const sel = await prisma.matchSelection.findMany({ where: { matchId: { in: ko.map((p) => p.matchId!) } } });
  expect(sel.filter((s) => s.teamId !== `${tid}_sv`).every((s) => s.auto)).toBe(true);
  // Lời nhắc cho thí sinh: mở chọn bot cho mức khi lập kế hoạch; mỗi hiệp loại trực tiếp mở chọn kín.
  const notes = await prisma.notification.findMany({ where: { accountId: 'acc_an' } });
  expect(notes.some((n) => n.sourceKey.startsWith('comp:level-open:'))).toBe(true);
  const select = notes.filter((n) => n.sourceKey.startsWith('match:select:'));
  expect(select.length).toBeGreaterThanOrEqual(5);
  expect(select[0]!.title).toMatch(/Hiệp \d+: chọn bot và quân thứ 10/);
  expect(select[0]!.href).toMatch(/^\/rooms\//);
}, 480_000);

it('giải không bật tự điều hành thì nút Tiếp theo bị từ chối', async () => {
  await prisma.tournament.update({ where: { id: tid }, data: { autopilot: false } });
  const r = await call('acc_an', `/tournaments/${tid}/demo/autopilot/advance`, 'POST', {});
  expect(r.status).toBe(403);
  expect(r.error?.message).toMatch(/tự điều hành/);
});

it('BTC tự động duyệt đội tự lập khi đủ điều kiện (2–3 thành viên), báo lý do khi chưa đủ', async () => {
  const tid2 = `${tid}_b`;
  await prisma.tournament.create({
    data: {
      id: tid2,
      name: 'Giải tự điều hành B',
      status: 'registration',
      isDemo: true,
      demoKind: 'experience',
      autopilot: true,
      configStatus: 'confirmed',
    },
  });
  const team = await prisma.team.create({
    data: {
      tournamentId: tid2,
      name: 'Đội Tự Lập',
      nameKey: 'doi tu lap',
      captainId: 'acc_chi',
      status: 'draft',
    },
  });
  await prisma.membership.create({ data: { teamId: team.id, accountId: 'acc_chi', tournamentId: tid2 } });
  try {
    await login('acc_chi');
    const before = (await call('acc_chi', `/tournaments/${tid2}/demo/autopilot`)).data;
    expect(before).toMatchObject({ canAdvance: true });
    expect(before.message).toMatch(/chờ duyệt/);
    const one = (await call('acc_chi', `/tournaments/${tid2}/demo/autopilot/advance`, 'POST', {})).data;
    expect(one.message).toMatch(/Chưa duyệt được: Đội Tự Lập: Đội phải có từ 2/);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).status).toBe('draft');
    await prisma.membership.create({ data: { teamId: team.id, accountId: 'acc_dung', tournamentId: tid2 } });
    const two = (await call('acc_chi', `/tournaments/${tid2}/demo/autopilot/advance`, 'POST', {})).data;
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).status).toBe('approved');
    // Đội chưa có bot hợp lệ: không khóa mức, chỉ hướng dẫn nộp bot.
    expect(two.message).toMatch(/chưa có bot hợp lệ/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { target: team.id, action: 'team.admin.update' },
    });
    expect(audit.actorId).toBeNull();
  } finally {
    await prisma.notification.deleteMany({
      where: { accountId: { in: ['acc_chi', 'acc_dung'] }, sourceKey: { startsWith: 'admin-team:' } },
    });
    await prisma.auditLog.deleteMany({ where: { target: team.id } });
    await prisma.membership.deleteMany({ where: { teamId: team.id } });
    await prisma.team.delete({ where: { id: team.id } });
    await prisma.tournament.delete({ where: { id: tid2 } });
  }
});
