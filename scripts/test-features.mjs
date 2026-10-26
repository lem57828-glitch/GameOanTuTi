// Kiểm thử chức năng cho cả nhóm: một lệnh chạy các bước theo thứ tự, in bảng tổng kết, thoát mã 1 nếu có bước lỗi.
//
//   pnpm test:features            đủ bộ: engine, bộ kiểm thử offline, unit API/web, integration các luồng chính
//   pnpm test:features -- --quick bỏ integration (không cần PostgreSQL/Redis, ~1 phút)
//   pnpm test:features -- --live  thêm kiểm tra server đang chạy (pnpm dev:demo / dev:official)
//
// Integration chạy trên schema PostgreSQL riêng tạo mới mỗi lần rồi xóa, không đụng dữ liệu demo/chính thức.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const live = args.has('--live');
const python = process.env.PYTHON_CMD ?? 'python';
const shell = process.platform === 'win32';

/** Luồng nghiệp vụ được kiểm thử end-to-end (API + worker thật, bot Python thật). */
const FLOWS = [
  ['competition', 'Sơ loại Swiss → cây 32 → Top 4 → mở bán kết'],
  ['matches', 'Phòng đấu, chọn kín, bot của mức, chặn xóa bot đang được chọn'],
  ['autopilot', 'Demo một thí sinh: bấm "Tiếp theo" tới vô địch'],
  ['finals', 'Bán kết/chung kết offline: nộp USB, khóa, kiểm tra, BO5/BO7, vô địch'],
];

const steps = [
  ['Build contracts + game-engine', 'pnpm', ['--filter', '@arena/game-engine...', 'build']],
  [
    'Engine: luật chuẩn, vật cản, ô đặc biệt, đối chiếu bộ offline',
    'pnpm',
    ['--filter', '@arena/game-engine', 'test'],
  ],
  ['Bộ kiểm thử offline: in luật chung kết', python, ['offline-kit/arena_offline.py', '--rules', 'final']],
  [
    'Bộ kiểm thử offline: bot mẫu đấu 3 ván luật chung kết',
    python,
    [
      'offline-kit/arena_offline.py',
      '--ruleset',
      'final',
      '--blue',
      'offline-kit/bot_mau.py',
      '--pink',
      'greedy',
      '--games',
      '3',
    ],
  ],
  ['Contracts', 'pnpm', ['--filter', '@arena/contracts', 'test']],
  ['API unit (chấm điểm BO5/BO7, Swiss, nộp bot...)', 'pnpm', ['--filter', '@arena/api', 'test']],
  ['Web unit (phòng đấu, replay, ô đổi loại...)', 'pnpm', ['--filter', '@arena/web', 'test']],
  ['Worker unit', 'pnpm', ['--filter', '@arena/worker', 'test']],
];
if (!quick) {
  steps.push(
    [
      'Build API + worker (integration chạy bản build)',
      'pnpm',
      ['--filter', '@arena/api', '--filter', '@arena/worker', 'build'],
    ],
    ...FLOWS.map(([file, label]) => [
      `Integration: ${label}`,
      'pnpm',
      ['--filter', '@arena/api', 'test:integration', file],
    ]),
  );
}

const results = [];
for (const [label, cmd, cmdArgs] of steps) {
  console.log(`\n━━ ${label}`);
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  results.push({ label, ok: r.status === 0, secs: Math.round((Date.now() - started) / 1000) });
  if (r.error) console.error(`Không chạy được "${cmd}": ${r.error.message}`);
}

if (live) {
  for (const [name, port] of [
    ['demo', 3100],
    ['chính thức', 3101],
  ]) {
    const label = `Server ${name} (cổng ${port}) đang chạy, worker sống`;
    try {
      const res = await fetch(`http://localhost:${port}/api/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json();
      results.push({ label, ok: res.ok && body.data?.workerAlive === true, secs: 0 });
    } catch {
      results.push({ label, ok: false, secs: 0 });
    }
  }
}

console.log('\n══════ Kết quả kiểm thử chức năng');
for (const r of results)
  console.log(`${r.ok ? ' ĐẠT ' : ' LỖI '} ${r.label}${r.secs ? ` (${r.secs}s)` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} bước lỗi — kéo lên xem log của bước đó.` : '\nTất cả đều đạt.');
process.exitCode = failed ? 1 : 0;
