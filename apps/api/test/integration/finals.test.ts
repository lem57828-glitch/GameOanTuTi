// Bán kết, chung kết offline: chốt tứ kết → bán kết nhận bài USB (BTC nhập file .py) → khóa bài → sandbox kiểm tra
// → thi BO5 bằng bot Python thật theo luật vật cản → chốt → chung kết BO7 (vật cản động, ô đặc biệt) → vô địch.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pairingRoomId, redisKeys } from '@arena/contracts';
import { getRuleset, obstaclesAt } from '@arena/game-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const port = 3217;
const base = `http://localhost:${port}/api/v1`;
const prefix = `test-finals-${randomUUID()}`;
const prisma = new PrismaClient();
const tid = `tour_fin_${randomUUID().slice(0, 8)}`;
const team = (i: number) => `${tid}_t${i}`;
const children: ChildProcess[] = [];
let logs = '';
const cookies: Record<string, string> = {};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reason = 'Kiểm thử bán kết chung kết offline';

const GREEDY = `def make_move(state):
    moves = state["legal_moves"]
    caps = [m for m in moves if m["capture"]]
    return (caps or moves)[0]
`;
const RUSHER = `COLS = "ABCDEFGHI"
def make_move(state):
    goal = state["goals"][state["my_side"]]
    gx, gy = COLS.index(goal[0]), int(goal[1])
    def d(m):
        return max(abs(COLS.index(m["to"][0]) - gx), abs(int(m["to"][1]) - gy))
    assert all(m["to"] not in state.get("obstacles", []) for m in state["legal_moves"])
    return min(state["legal_moves"], key=d)
`;
const BROKEN = 'def make_move(state)\n    return None\n';

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
      OUTBOX_POLL_MS: '100',
      SESSION_SECRET: 'integration-secret-01234567890123456789',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (b) => (logs += String(b)));
  child.stderr?.on('data', (b) => (logs += String(b)));
  children.push(child);
}
async function until<T>(what: string, fn: () => Promise<T | false | null | undefined>, ms = 240_000) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`Quá lâu chờ: ${what}\n${logs.slice(-3000)}`);
    await pause(500);
  }
}
const admin = (path: string, json?: unknown) =>
  call('acc_admin', `/admin/tournaments/${tid}${path}`, 'POST', json ?? { reason });
const finals = async () => (await call('acc_admin', `/admin/tournaments/${tid}/finals`)).data;
const submit = (phase: string, teamId: string, sourceCode: string, extraType = 'PAPER') =>
  admin(`/finals/${phase}/submissions`, { teamId, fileName: `${teamId}.py`, sourceCode, extraType, reason });

beforeAll(async () => {
  await prisma.tournament.create({
    data: {
      id: tid,
      name: 'Giải kiểm thử bán kết chung kết',
      status: 'running',
      configStatus: 'confirmed',
      stages: {
        create: [
          { ord: 1, kind: 'qualifier', name: 'Sơ loại', configStatus: 'confirmed', status: 'confirmed' },
          {
            ord: 2,
            kind: 'knockout',
            name: 'Loại trực tiếp 32 → 4',
            configStatus: 'confirmed',
            status: 'running',
          },
        ],
      },
    },
  });
  for (let i = 1; i <= 8; i++)
    await prisma.team.create({
      data: {
        id: team(i),
        tournamentId: tid,
        name: `Đội ${i}`,
        nameKey: `${tid} doi ${i}`,
        captainId: i === 1 ? 'acc_an' : 'acc_chi',
        status: 'locked',
      },
    });
  await prisma.membership.create({ data: { teamId: team(1), accountId: 'acc_an', tournamentId: tid } });
  // Tứ kết đã đấu xong (đội lẻ thắng): chốt tứ kết qua API để hệ thống tạo Top 4 và bán kết.
  await prisma.bracketRound.create({ data: { tournamentId: tid, phase: 'qf', ord: 3, status: 'finished' } });
  for (let s = 0; s < 4; s++)
    await prisma.pairing.create({
      data: {
        tournamentId: tid,
        kind: 'knockout',
        phase: 'qf',
        round: 3,
        slot: s,
        teamAId: team(2 * s + 1),
        teamBId: team(2 * s + 2),
        status: 'done',
        result: 'a',
        winnerTeamId: team(2 * s + 1),
        scoreA: 9,
        scoreB: 3,
        source: 'manual',
        seed: 7 + s,
      },
    });
  launch(resolve('.'), { API_PORT: String(port) });
  launch(resolve('../worker'), { WORKER_ID: 'finals-test', SIM_MOVE_DELAY_MS: '0', WORKER_CONCURRENCY: '4' });
  await until(
    'API khởi động',
    () =>
      fetch(`${base}/health`)
        .then((r) => r.ok)
        .catch(() => false),
    60_000,
  );
  for (const a of ['acc_admin', 'acc_an']) await login(a);
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
  const gameIds = (
    await prisma.game.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } })
  ).map((g) => g.id);
  const jobIds = (
    await prisma.gameJob.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } })
  ).map((j) => j.id);
  const matchIds = (
    await prisma.match.findMany({ where: { roomId: { in: roomIds } }, select: { id: true } })
  ).map((m) => m.id);
  const teamIds = Array.from({ length: 8 }, (_, i) => team(i + 1));
  const botIds = (
    await prisma.botVersion.findMany({ where: { teamId: { in: teamIds } }, select: { id: true } })
  ).map((b) => b.id);
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...jobIds, ...botIds] } } }),
    prisma.runAttempt.deleteMany({ where: { jobId: { in: jobIds } } }),
    prisma.gameJob.deleteMany({ where: { id: { in: jobIds } } }),
    prisma.gameEvent.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.gameChoice.deleteMany({ where: { gameId: { in: gameIds } } }),
    prisma.game.deleteMany({ where: { id: { in: gameIds } } }),
    prisma.matchSelection.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.match.deleteMany({ where: { id: { in: matchIds } } }),
    prisma.room.deleteMany({ where: { id: { in: roomIds } } }),
    prisma.finalSubmission.deleteMany({ where: { tournamentId: tid } }),
    prisma.pairing.deleteMany({ where: { tournamentId: tid } }),
    prisma.bracketRound.deleteMany({ where: { tournamentId: tid } }),
    prisma.botVersion.deleteMany({ where: { id: { in: botIds } } }),
    prisma.notification.deleteMany({ where: { sourceKey: { contains: tid } } }),
    prisma.membership.deleteMany({ where: { tournamentId: tid } }),
    prisma.team.deleteMany({ where: { tournamentId: tid } }),
    prisma.auditLog.deleteMany({ where: { target: { in: [tid, ...matchIds] } } }),
    prisma.stage.deleteMany({ where: { tournamentId: tid } }),
    prisma.tournament.delete({ where: { id: tid } }),
  ]);
  await prisma.$disconnect();
}, 60_000);

/** Khóa bài, chờ sandbox kiểm tra, bắt đầu thi, mở phòng và chờ vòng đấu xong. */
async function runRound(phase: 'sf' | 'final') {
  const early = await admin(`/finals/${phase}/start`);
  expect(early.status).toBe(409); // chưa khóa bài
  expect((await admin(`/finals/${phase}/lock`)).status).toBe(201);
  const late = await submit(phase, phase === 'sf' ? team(1) : team(7), GREEDY);
  expect(late.status).toBe(409);
  expect(late.error?.message).toMatch(/khóa bài/);
  await until('sandbox kiểm tra xong', async () => {
    const r = (await finals()).rounds.find((x: Loose) => x.phase === phase);
    return r.submissions.length > 0 && r.submissions.every((s: Loose) => s.status !== 'pending');
  });
  const started = await admin(`/finals/${phase}/start`);
  expect(started.status, started.error?.message).toBe(201);
  const opened = await admin('/matches/open', {});
  expect(opened.status, opened.error?.message).toBe(201);
  await until(`${phase} đấu xong`, async () => {
    const r = (await finals()).rounds.find((x: Loose) => x.phase === phase);
    return r.status === 'finished' && r;
  });
  return started.data;
}

it('bán kết → chung kết offline: nhận bài USB, khóa, kiểm tra, thi BO5/BO7 theo luật mới, công bố vô địch', async () => {
  const qf = await admin('/knockout/qf/confirm');
  expect(qf.status, qf.error?.message).toBe(201);
  expect(qf.data.top4).toEqual([team(1), team(3), team(5), team(7)]);

  // Khán giả/thí sinh: thấy cặp bán kết W(M25)–W(M26), W(M27)–W(M28); chưa thấy luật mới và bài nộp.
  const pub = (await call('acc_an', `/tournaments/${tid}/competition`)).data.finals;
  const sf = pub.rounds[0];
  expect(sf).toMatchObject({ phase: 'sf', status: 'collecting', bestOf: 5, winsNeeded: 3, rulesetId: '' });
  expect(sf.pairings.map((p: Loose) => [p.teamA.id, p.teamB.id])).toEqual([
    [team(1), team(3)],
    [team(5), team(7)],
  ]);
  expect(pub.rounds[1].status).toBe('waiting');
  expect((await call('acc_an', `/admin/tournaments/${tid}/finals`)).status).toBe(403);
  const studentSubmit = await call('acc_an', `/admin/tournaments/${tid}/finals/sf/submissions`, 'POST', {
    teamId: team(1),
    fileName: 'bot.py',
    sourceCode: GREEDY,
    reason,
  });
  expect(studentSubmit.status).toBe(403);
  const n = await prisma.notification.findMany({
    where: { accountId: 'acc_an', sourceKey: { contains: tid } },
  });
  expect(n.some((x) => x.title === 'Đội bạn vào Bán kết')).toBe(true);

  // BTC nhận bài qua USB: đội 5 nộp mã lỗi cú pháp; đội 3 nộp lại thay bài cũ; đội không thi bị từ chối.
  expect((await submit('sf', team(2), GREEDY)).status).toBe(409);
  const first = await submit('sf', team(1), RUSHER, 'ROCK');
  expect(first.status, first.error?.message).toBe(201);
  expect(first.data.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect((await submit('sf', team(3), RUSHER)).status).toBe(201);
  const again = await submit('sf', team(3), GREEDY, 'SCISSORS');
  expect(again.data.version).toBe(2);
  expect((await submit('sf', team(5), BROKEN)).data.status).toBe('invalid');
  expect((await submit('sf', team(7), RUSHER)).status).toBe(201);
  const adminView = await finals();
  expect(adminView.rounds[0].rulesetId).toBe('semifinal-obstacles-1');
  expect(adminView.rounds[0].submissions.find((s: Loose) => s.teamId === team(3))).toMatchObject({
    version: 2,
    extraType: 'SCISSORS',
  });

  const sfStart = await runRound('sf');
  expect(sfStart.walkovers).toBe(1); // đội 5 không có bài hợp lệ → đội 7 thắng do đối thủ không có bot
  const sfPairs = await prisma.pairing.findMany({
    where: { tournamentId: tid, phase: 'sf' },
    orderBy: { slot: 'asc' },
  });
  expect(sfPairs[1]).toMatchObject({ winnerTeamId: team(7), decidedBy: 'walkover' });
  expect(sfPairs[0]!.source).toBe('match');
  const games0 = sfPairs[0]!.games as Array<'a' | 'b' | null>;
  expect(games0.length).toBeGreaterThanOrEqual(3);
  expect(games0.length).toBeLessThanOrEqual(7);

  // Mọi ván bán kết chạy luật vật cản; quân thứ 10 là quân đội đăng ký khi nộp bài; không nước nào vào vật cản.
  const sfGames = await prisma.game.findMany({
    where: { roomId: pairingRoomId(sfPairs[0]!.id) },
    include: { choices: true, result: true, events: { where: { type: 'game.move' } } },
  });
  expect(sfGames.length).toBe(games0.length);
  const semi = getRuleset('semifinal-obstacles-1');
  for (const g of sfGames) {
    expect(g.rulesetId).toBe('semifinal-obstacles-1');
    expect(g.result?.rulesetId).toBe('semifinal-obstacles-1');
    expect(g.choices.find((c) => c.teamId === team(1))?.extraType).toBe('ROCK');
    expect(g.choices.find((c) => c.teamId === team(3))?.extraType).toBe('SCISSORS');
    for (const e of g.events)
      expect(obstaclesAt(semi, e.ply! - 1)).not.toContain((e.payload as Loose).move.to);
  }

  // Chốt bán kết → chung kết giữa hai đội thắng.
  expect((await admin('/finals/sf/confirm')).status).toBe(201);
  const fin = (await finals()).rounds[1];
  const finalists = [sfPairs[0]!.winnerTeamId!, team(7)];
  expect(fin).toMatchObject({ phase: 'final', status: 'collecting', bestOf: 7, winsNeeded: 4 });
  expect(fin.pairings[0].teamA.id).toBe(finalists[0]);
  expect(fin.pairings[0].teamB.id).toBe(finalists[1]);
  for (const t of finalists)
    expect((await submit('final', t, t === team(7) ? RUSHER : GREEDY)).status).toBe(201);
  const finStart = await runRound('final');
  expect(finStart.walkovers).toBe(0);
  const finPair = (await prisma.pairing.findFirstOrThrow({ where: { tournamentId: tid, phase: 'final' } }))!;
  expect(finPair.source).toBe('match');
  const finGames = await prisma.game.findMany({ where: { roomId: pairingRoomId(finPair.id) } });
  expect(finGames.every((g) => g.rulesetId === 'final-dynamic-1')).toBe(true);
  expect(finGames.length).toBeGreaterThanOrEqual(4);
  expect(finGames.length).toBeLessThanOrEqual(9);

  // Phòng hiển thị biến thể để trình chiếu vật cản/ô đặc biệt.
  const snap = (await call('acc_an', `/rooms/${pairingRoomId(finPair.id)}`)).data;
  expect(snap.variant.special).toHaveLength(4);
  expect(snap.match.kind).toBe('final');

  // Chốt chung kết → vô địch; giải vẫn là giải hiện tại để mọi người xem kết quả.
  const done = await admin('/finals/final/confirm');
  expect(done.status, done.error?.message).toBe(201);
  expect(done.data.champion).toBe(finPair.winnerTeamId);
  const view = (await call('acc_an', `/tournaments/${tid}/competition`)).data;
  expect(view.finals.champion.id).toBe(finPair.winnerTeamId);
  expect(view.finals.rounds[1].rulesetId).toBe('final-dynamic-1');
  expect(view.next.action).toBe('done');
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
  expect(t.champion).toBe(finPair.winnerTeamId);
  expect(t.status).toBe('running');
  const audit = await prisma.auditLog.findMany({ where: { target: tid, action: { startsWith: 'finals.' } } });
  expect(new Set(audit.map((a) => a.action))).toEqual(
    new Set(['finals.submission', 'finals.lock', 'finals.start', 'finals.confirm']),
  );
}, 600_000);
