// Dữ liệu mẫu cho M0. CHẠY LẠI AN TOÀN: mọi bản ghi có id cố định và được upsert; ván mẫu chỉ tạo khi chưa có.
// Không xóa dữ liệu nào — xóa sạch chỉ có trong `pnpm db:reset` (prisma/reset.ts), cần xác nhận rõ.
// Tất cả bản ghi gắn isDemo = true; không dùng để kết luận hệ thống đủ điều kiện tổ chức thi thật.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { STANDARD_RULESET, STANDARD_RULESET_ID, countPieces, simulate } from '@arena/game-engine';

const prisma = new PrismaClient();
// Chạy seed với cwd = apps/api (pnpm db:seed).
const SAMPLE_BOTS = join(process.cwd(), 'prisma', 'sample-bots');

const TOURNAMENT = 'tour_demo';
const ACCOUNTS = [
  { id: 'acc_admin', username: 'btc', displayName: 'BTC Demo', role: 'admin' },
  { id: 'acc_referee', username: 'trongtai', displayName: 'Trọng tài Demo', role: 'referee' },
  { id: 'acc_an', username: 'an', displayName: 'Nguyễn An', role: 'student' },
  { id: 'acc_binh', username: 'binh', displayName: 'Trần Bình', role: 'student' },
  { id: 'acc_chi', username: 'chi', displayName: 'Lê Chi', role: 'student' },
  { id: 'acc_dung', username: 'dung', displayName: 'Phạm Dũng', role: 'student' },
  { id: 'acc_em', username: 'em', displayName: 'Hoàng Em (chưa có đội)', role: 'student' },
] as const;
const TEAMS = [
  { id: 'team_alpha', name: 'Đội Alpha (mẫu)', captainId: 'acc_an', members: ['acc_an', 'acc_binh'] },
  { id: 'team_beta', name: 'Đội Beta (mẫu)', captainId: 'acc_chi', members: ['acc_chi', 'acc_dung'] },
];
const BOTS = [
  {
    id: 'bot_alpha_1',
    teamId: 'team_alpha',
    version: 1,
    label: 'Alpha v1 — đi ngẫu nhiên',
    status: 'valid',
    demoPolicy: 'random',
  },
  {
    id: 'bot_alpha_2',
    teamId: 'team_alpha',
    version: 2,
    label: 'Alpha v2 — ưu tiên ăn quân',
    status: 'valid',
    demoPolicy: 'greedy',
  },
  {
    id: 'bot_beta_1',
    teamId: 'team_beta',
    version: 1,
    label: 'Beta v1 — lao về đích',
    status: 'valid',
    demoPolicy: 'rusher',
  },
  {
    id: 'bot_beta_2',
    teamId: 'team_beta',
    version: 2,
    label: 'Beta v2 — lỗi kiểm thử (mẫu)',
    status: 'invalid',
    demoPolicy: null,
  },
];
const ROOM = {
  id: 'room_demo_1',
  code: 'demo-1',
  title: 'Phòng mẫu: Alpha vs Beta',
  teamAId: 'team_alpha',
  teamBId: 'team_beta',
};
const SEED_GAME = {
  id: 'game_seed_1',
  matchId: 'match_seed_1',
  jobId: 'job_seed_1',
  runId: 'run_seed_1',
  requestKey: 'seed:room_demo_1:game-1',
  seed: 20261020,
  maxPlies: 120,
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const nameKey = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function main(): Promise<void> {
  await prisma.tournament.upsert({
    where: { id: TOURNAMENT },
    update: {},
    create: {
      id: TOURNAMENT,
      name: 'Giải mẫu Bot Arena (dữ liệu demo)',
      status: 'registration',
      isDemo: true,
    },
  });
  const stages = [
    { ord: 1, kind: 'qualifier', name: 'Sơ loại (Swiss — số vòng chưa chốt)' },
    { ord: 2, kind: 'knockout', name: 'Loại trực tiếp Top 32 → Top 4' },
  ];
  for (const s of stages) {
    await prisma.stage.upsert({
      where: { tournamentId_ord: { tournamentId: TOURNAMENT, ord: s.ord } },
      update: { name: s.name, kind: s.kind },
      create: { id: `stage_demo_${s.ord}`, tournamentId: TOURNAMENT, ...s },
    });
  }

  for (const a of ACCOUNTS) {
    await prisma.account.upsert({
      where: { id: a.id },
      update: { displayName: a.displayName, role: a.role, isDemo: true },
      create: { ...a, email: `${a.username}@demo.bot-arena.local`, isDemo: true },
    });
  }
  for (const t of TEAMS) {
    await prisma.team.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        tournamentId: TOURNAMENT,
        name: t.name,
        nameKey: nameKey(t.name),
        captainId: t.captainId,
        status: 'approved',
        isDemo: true,
      },
    });
    for (const accountId of t.members) {
      await prisma.membership.upsert({
        where: { teamId_accountId: { teamId: t.id, accountId } },
        update: {},
        create: { teamId: t.id, accountId, tournamentId: TOURNAMENT },
      });
    }
  }
  for (const b of BOTS) {
    await prisma.botVersion.upsert({
      where: { id: b.id },
      update: {},
      create: {
        ...b,
        rulesetId: STANDARD_RULESET_ID,
        sourceHash: sha256(`demo-bot:${b.id}:${b.demoPolicy ?? 'none'}`),
        isDemo: true,
      },
    });
  }
  await seedPythonBots();
  await prisma.room.upsert({ where: { id: ROOM.id }, update: {}, create: { ...ROOM, isDemo: true } });

  await seedFinishedGame();
  console.log(
    'Seed xong: 7 tài khoản mẫu, 2 đội, 6 phiên bản bot (2 bot Python có mã nguồn), 1 phòng, 1 ván mẫu đã kết thúc.',
  );
}

/** Một ván mẫu đã chạy xong (job, lần thử, sự kiện, kết quả) để các trang có dữ liệu ngay sau khi seed. */
async function seedFinishedGame(): Promise<void> {
  if (await prisma.game.findUnique({ where: { id: SEED_GAME.id } })) return;
  const blue = BOTS[1]!; // Alpha v2 (greedy)
  const pink = BOTS[2]!; // Beta v1 (rusher)
  const sim = simulate(
    STANDARD_RULESET,
    { blue: blue.demoPolicy!, pink: pink.demoPolicy! },
    SEED_GAME.seed,
    SEED_GAME.maxPlies,
  );
  const pieces = countPieces(sim.finalBoard);
  const winnerTeamId =
    sim.end.winner === 'blue' ? blue.teamId : sim.end.winner === 'pink' ? pink.teamId : null;
  const decidedAt = new Date('2026-10-20T08:00:00.000Z');
  const coin = {
    winnerTeamId: blue.teamId,
    blueTeamId: blue.teamId,
    pinkTeamId: pink.teamId,
    decidedAt: decidedAt.toISOString(),
  };
  const streamId = `game:${SEED_GAME.id}`;
  const request = {
    contractVersion: 1,
    requestKey: SEED_GAME.requestKey,
    gameId: SEED_GAME.id,
    choices: {
      blue: { botVersionId: blue.id, extraType: 'PAPER' },
      pink: { botVersionId: pink.id, extraType: 'PAPER' },
    },
    rulesetId: STANDARD_RULESET_ID,
    seed: SEED_GAME.seed,
    limits: {
      cpuMsPerMove: 200,
      wallMsPerMove: 1000,
      startupMs: 3000,
      maxPlies: SEED_GAME.maxPlies,
      maxErrorsPerGame: 3,
    },
  };
  const finishedPayload = {
    gameId: SEED_GAME.id,
    winner: sim.end.winner,
    winnerTeamId,
    reason: sim.end.reason,
    plies: sim.moves.length,
    piecesLeft: pieces,
  };
  const events = [
    {
      type: 'game.created',
      ply: null,
      payload: { gameId: SEED_GAME.id, rulesetId: STANDARD_RULESET_ID, coin },
    },
    {
      type: 'game.started',
      ply: null,
      payload: { gameId: SEED_GAME.id, attemptId: SEED_GAME.runId, attemptNo: 1 },
    },
    ...sim.moves.map((m) => ({ type: 'game.move', ply: m.ply, payload: { gameId: SEED_GAME.id, move: m } })),
    { type: 'game.finished', ply: null, payload: finishedPayload },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.match.create({ data: { id: SEED_GAME.matchId, roomId: ROOM.id, status: 'finished' } });
    await tx.game.create({
      data: {
        id: SEED_GAME.id,
        matchId: SEED_GAME.matchId,
        roomId: ROOM.id,
        no: 1,
        rulesetId: STANDARD_RULESET_ID,
        seed: SEED_GAME.seed,
        maxPlies: SEED_GAME.maxPlies,
        status: 'finished',
        coinResult: coin,
        blueTeamId: blue.teamId,
        pinkTeamId: pink.teamId,
        lastSeq: events.length,
        finishedAt: decidedAt,
      },
    });
    await tx.gameChoice.createMany({
      data: [
        { gameId: SEED_GAME.id, side: 'blue', teamId: blue.teamId, botVersionId: blue.id },
        { gameId: SEED_GAME.id, side: 'pink', teamId: pink.teamId, botVersionId: pink.id },
      ],
    });
    await tx.gameJob.create({
      data: {
        id: SEED_GAME.jobId,
        requestKey: SEED_GAME.requestKey,
        gameId: SEED_GAME.id,
        roomId: ROOM.id,
        payload: request,
        status: 'succeeded',
        attempts: 1,
      },
    });
    await tx.runAttempt.create({
      data: {
        id: SEED_GAME.runId,
        jobId: SEED_GAME.jobId,
        attemptNo: 1,
        workerId: 'seed',
        status: 'succeeded',
        finishedAt: decidedAt,
      },
    });
    await tx.gameEvent.createMany({
      data: events.map((e, i) => ({
        gameId: SEED_GAME.id,
        streamId,
        seq: i + 1,
        type: e.type,
        ply: e.ply,
        payload: e.payload,
        occurredAt: decidedAt,
      })),
    });
    await tx.gameResult.create({
      data: {
        gameId: SEED_GAME.id,
        attemptId: SEED_GAME.runId,
        requestKey: SEED_GAME.requestKey,
        winner: sim.end.winner,
        winnerTeamId,
        reason: sim.end.reason,
        plies: sim.moves.length,
        piecesBlue: pieces.blue,
        piecesPink: pieces.pink,
        rulesetId: STANDARD_RULESET_ID,
      },
    });
    // Chỉ gắn ván mẫu vào phòng nếu phòng chưa có ván nào (không đè ván demo mới hơn).
    await tx.room.updateMany({
      where: { id: ROOM.id, currentGameId: null },
      data: { currentGameId: SEED_GAME.id, status: 'finished' },
    });
  });
}

/**
 * Bot Python mẫu CÓ MÃ NGUỒN cho đội Alpha/Beta, để đăng nhập thí sinh mẫu là xem, chạy thử và "sửa"
 * (nộp phiên bản mới từ mã cũ) được ngay. Mã nằm ở prisma/sample-bots/*.py. Đây là bot thật chạy trong sandbox
 * (isDemo = false), khác bot mô phỏng dựng sẵn trong engine. Chỉ tạo khi chưa có; không đè phiên bản đội đã nộp.
 */
async function seedPythonBots(): Promise<void> {
  const samples = [
    {
      id: 'bot_alpha_py',
      teamId: 'team_alpha',
      file: 'tham_an.py',
      label: 'Alpha — Python mẫu "Tham ăn"',
      submittedById: 'acc_an',
    },
    {
      id: 'bot_beta_py',
      teamId: 'team_beta',
      file: 'than_trong.py',
      label: 'Beta — Python mẫu "Thận trọng"',
      submittedById: 'acc_chi',
    },
  ];
  for (const b of samples) {
    if (await prisma.botVersion.findUnique({ where: { id: b.id } })) continue;
    // Chuẩn hóa xuống dòng kiểu Unix để mã băm giống nhau trên mọi máy.
    const sourceCode = readFileSync(join(SAMPLE_BOTS, b.file), 'utf8').split('\r\n').join('\n');
    const last = await prisma.botVersion.findFirst({
      where: { teamId: b.teamId },
      orderBy: { version: 'desc' },
    });
    await prisma.botVersion.create({
      data: {
        id: b.id,
        teamId: b.teamId,
        version: (last?.version ?? 0) + 1,
        label: b.label,
        sourceCode,
        sourceHash: sha256(sourceCode.trim()),
        submittedById: b.submittedById,
        rulesetId: STANDARD_RULESET_ID,
        status: 'valid',
        validationLog:
          'Bot mẫu của hệ thống (seed): đã chạy thử trọn một ván với engine chuẩn, không có nước sai.',
        isDemo: false,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
