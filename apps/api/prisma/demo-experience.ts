// Chuẩn bị "Giải trải nghiệm · Chạy bot thật" cho kịch bản hai góc nhìn (BTC + sinh viên) — chỉ chạy ở profile demo.
//
//   pnpm demo:experience                    # 3 đội đối thủ (cộng đội của sinh viên = 4 đội Swiss)
//   pnpm demo:experience -- --opponents 7   # 7 đối thủ: cộng đội sinh viên = 8 đội → tứ kết có trận thật
//
// Tạo (hoặc cập nhật, chạy lại an toàn):
//   - Giải demo loại "experience", đã công bố, đang mở đăng ký; 2 giai đoạn đã duyệt.
//   - Các đội đối thủ đã duyệt, mỗi đội một đội trưởng là tài khoản mẫu (đăng nhập ở /demo-login).
//   - Bot đối thủ là bot GitHub thật: repo dự án, commit cố định, mã nguồn lấy đúng bản ở commit đó. Bot ở trạng thái
//     "pending" kèm sự kiện outbox như khi nộp qua web → worker kiểm tra hợp lệ trong sandbox như bot của thí sinh.
//   - Bộ bot giai đoạn của đối thủ đã lưu (chưa khóa): BTC khóa theo luồng thường.
//   - Hai tài khoản sinh viên mẫu CHƯA có đội để tự đi hành trình: tạo đội, đăng ký giải, nộp bot, chọn bot.
// Không tạo mật khẩu, không sinh kết quả, không đụng dữ liệu ngoài phạm vi id của giải này.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

if (
  process.env.ARENA_PROFILE === 'official' ||
  process.env.NODE_ENV === 'production' ||
  process.env.DEMO_MODE !== 'true'
)
  throw new Error('Kịch bản giải trải nghiệm chỉ chạy ở profile demo (pnpm demo:experience).');

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OPPONENTS = Number(flag('opponents') ?? 3);
if (!Number.isInteger(OPPONENTS) || OPPONENTS < 1 || OPPONENTS > 15)
  throw new Error('--opponents phải là số nguyên 1–15.');
const TID = flag('id') ?? 'tour_experience';
if (!/^[a-z0-9_]{3,40}$/.test(TID)) throw new Error('--id chỉ gồm chữ thường, số, gạch dưới (3–40 ký tự).');
const NAME = flag('name') ?? 'Giải trải nghiệm Bot Arena';

// Repo công khai của dự án và commit đã chứa các bot mẫu (examples/bots, apps/api/prisma/sample-bots).
const REPO = 'https://github.com/lem57828-glitch/GameOanTuTi';
const COMMIT = '02d3c15ac4a4e80e3958098d4d3d7177f8b33b89';
// Không dùng examples/bots/tinh_truoc.py cho đối thủ: để sinh viên nộp bot đó qua GitHub mà không bị báo trùng mã.
const BOT_SOURCES = [
  { path: 'examples/bots/san_loai.py', label: 'Săn một loại quân' },
  { path: 'examples/bots/phong_thu.py', label: 'Phòng thủ' },
  { path: 'examples/bots/tien_cong.py', label: 'Tiến công' },
  { path: 'apps/api/prisma/sample-bots/than_trong.py', label: 'Thận trọng' },
  { path: 'apps/api/prisma/sample-bots/tham_an.py', label: 'Tham ăn' },
  { path: 'examples/bots/ngau_nhien_an_toan.py', label: 'Ngẫu nhiên an toàn' },
];
const TEAM_NAMES = [
  'Búa Thép',
  'Bao Gió',
  'Kéo Bạc',
  'Cờ Xanh',
  'Đỉnh Hồng',
  'Mũi Tên',
  'Lá Chắn',
  'Ngựa Ô',
  'Sao Bắc',
  'Sóng Ngầm',
  'Tháp Canh',
  'Gió Lốc',
  'Hổ Mây',
  'Rồng Đá',
  'Ưng Vàng',
];

const prisma = new PrismaClient();
// Chạy với cwd = apps/api (pnpm demo:experience), giống seed.
const root = join(process.cwd(), '..', '..');
/** Cùng cách chuẩn hóa tên đội của TV1 (bỏ dấu, chữ thường) để chống trùng tên trong giải. */
const teamKey = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const BOM = String.fromCharCode(0xfeff);

function sourceAt(path: string): string {
  try {
    const raw = execFileSync('git', ['show', `${COMMIT}:${path}`], { cwd: root, encoding: 'utf8' });
    return (raw.startsWith(BOM) ? raw.slice(1) : raw).replace(/\r\n/g, '\n');
  } catch {
    throw new Error(
      `Không đọc được ${path} ở commit ${COMMIT.slice(0, 7)}. Cần git và lịch sử repo (git fetch).`,
    );
  }
}

async function main() {
  const now = Date.now();
  const hour = 3600_000;
  const existing = await prisma.tournament.findUnique({ where: { id: TID }, include: { levels: true } });
  if (existing && existing.demoKind !== 'experience')
    throw new Error(`Giải ${TID} đã có và không phải giải trải nghiệm. Dùng --id khác.`);
  if (existing?.levels.some((l) => l.status !== 'planned'))
    throw new Error(
      `${existing.name} đã bắt đầu sơ loại; không đổi đội/bot giữa chừng. Dùng "Bắt đầu lại phần thi đấu" trên trang BTC, hoặc --id khác để tạo giải mới.`,
    );

  // 1) Giải: công bố, đang mở đăng ký (đủ 4 mốc để trạng thái đăng ký là "open").
  const dates = {
    registrationOpensAt: new Date(now - hour),
    registrationClosesAt: new Date(now + 72 * hour),
    teamLockAt: new Date(now + 96 * hour),
    botLockAt: new Date(now + 120 * hour),
  };
  await prisma.tournament.upsert({
    where: { id: TID },
    update: { name: NAME, ...(existing?.status === 'draft' ? { status: 'registration' } : {}) },
    create: {
      id: TID,
      name: NAME,
      description:
        'Giải trải nghiệm: BTC và sinh viên cùng thao tác trên một giải; mọi kết quả đến từ phòng đấu do worker chạy bot.',
      status: 'registration',
      configStatus: 'confirmed',
      isDemo: true,
      demoKind: 'experience',
      ...dates,
    },
  });
  for (const s of [
    { ord: 1, kind: 'qualifier', name: 'Sơ loại (Swiss)' },
    { ord: 2, kind: 'knockout', name: 'Loại trực tiếp 32 → 4' },
  ]) {
    await prisma.stage.upsert({
      where: { tournamentId_ord: { tournamentId: TID, ord: s.ord } },
      update: {},
      create: { id: `${TID}_stage_${s.ord}`, tournamentId: TID, ...s, configStatus: 'confirmed' },
    });
  }
  const stages = await prisma.stage.findMany({ where: { tournamentId: TID } });

  // 2) Đội đối thủ + đội trưởng (tài khoản mẫu, không mật khẩu) + bot GitHub + bộ bot giai đoạn (chưa khóa).
  const created: string[] = [];
  for (let i = 0; i < OPPONENTS; i++) {
    const n = i + 1;
    const accountId = `${TID}_dt${n}`;
    const teamId = `${TID}_doi_${n}`;
    const name = `Đội ${TEAM_NAMES[i]}`;
    await prisma.account.upsert({
      where: { id: accountId },
      update: {},
      create: {
        id: accountId,
        username: `${TID}_dt${n}`,
        email: `${TID}_dt${n}@demo.bot-arena.local`,
        displayName: `Đội trưởng ${TEAM_NAMES[i]} (mẫu)`,
        role: 'student',
        isDemo: true,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.team.upsert({
      where: { id: teamId },
      update: { status: 'approved' },
      create: {
        id: teamId,
        tournamentId: TID,
        name,
        nameKey: teamKey(name),
        captainId: accountId,
        status: 'approved',
        isDemo: true,
      },
    });
    await prisma.membership.upsert({
      where: { teamId_accountId: { teamId, accountId } },
      update: {},
      create: { teamId, accountId, tournamentId: TID },
    });

    const src = BOT_SOURCES[i % BOT_SOURCES.length]!;
    const botId = `${teamId}_bot`;
    if (!(await prisma.botVersion.findUnique({ where: { id: botId } }))) {
      const code = sourceAt(src.path);
      await prisma.$transaction(async (tx) => {
        await tx.botVersion.create({
          data: {
            id: botId,
            teamId,
            version: 1,
            label: `${src.label} (GitHub ${COMMIT.slice(0, 7)})`,
            sourceHash: createHash('sha256').update(code).digest('hex'),
            sourceCode: code,
            githubRepo: REPO,
            commitSha: COMMIT,
            sourcePath: src.path,
            submittedById: accountId,
            rulesetId: 'standard-32-4',
            status: 'pending',
            isDemo: false,
          },
        });
        // Giống nộp bot qua web: worker kiểm tra hợp lệ trong sandbox rồi mới chuyển "valid".
        await tx.outboxEvent.create({
          data: {
            type: 'bot.validation.requested',
            aggregateId: botId,
            payload: { jobId: botId, requestKey: `validation:${botId}`, kind: 'validate_bot' },
          },
        });
      });
      created.push(`${name}: ${src.path}`);
    }
    for (const stage of stages) {
      await prisma.botStageSelection.upsert({
        where: { teamId_stageId: { teamId, stageId: stage.id } },
        update: {},
        create: { teamId, stageId: stage.id, botVersionIds: [botId], locked: false },
      });
    }
  }
  // Chạy lại với ít đối thủ hơn: đội thừa (chỉ đội do kịch bản tạo) chuyển "withdrawn", không xóa dữ liệu.
  const extra = await prisma.team.updateMany({
    where: {
      tournamentId: TID,
      id: {
        startsWith: `${TID}_doi_`,
        notIn: Array.from({ length: OPPONENTS }, (_, i) => `${TID}_doi_${i + 1}`),
      },
      status: { not: 'withdrawn' },
    },
    data: { status: 'withdrawn' },
  });

  // 3) Sinh viên mẫu chưa có đội: tự lập đội, đăng ký giải, nộp bot (đội trưởng) / tham gia bằng mã (thành viên).
  for (const [n, label] of [
    [1, 'Sinh viên trải nghiệm (đội trưởng)'],
    [2, 'Sinh viên trải nghiệm (thành viên)'],
  ] as const) {
    await prisma.account.upsert({
      where: { id: `${TID}_sv${n}` },
      update: {},
      create: {
        id: `${TID}_sv${n}`,
        username: `${TID}_sv${n}`,
        email: `${TID}_sv${n}@demo.bot-arena.local`,
        displayName: label,
        role: 'student',
        isDemo: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  const teams = await prisma.team.count({
    where: { tournamentId: TID, status: { in: ['approved', 'locked'] } },
  });
  console.log(`Giải trải nghiệm: ${NAME} (${TID}) — ${teams} đội đối thủ đã duyệt.`);
  if (created.length) console.log(`Bot GitHub mới (chờ worker kiểm tra):\n  - ${created.join('\n  - ')}`);
  if (extra.count) console.log(`${extra.count} đội đối thủ thừa từ lần chạy trước đã chuyển "withdrawn".`);
  console.log(
    `Sinh viên mẫu (đăng nhập ở /demo-login): ${TID}_sv1 (lập đội), ${TID}_sv2 (tham gia bằng mã đội).\n` +
      `Bot GitHub cho sinh viên: ${REPO} · commit ${COMMIT} · examples/bots/tinh_truoc.py\n` +
      'Kịch bản từng bước: docs/DEMO_HAI_GOC_NHIN.md',
  );
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
