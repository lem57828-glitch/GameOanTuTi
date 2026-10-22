// Diễn tập một giải giả đầy đủ: đội, bot (kể cả bot lỗi), Swiss, tranh suất Top 32, nhánh chính, chung kết đổi luật, chứng nhận.
//   npm run demo                         -> chạy hết, dữ liệu ở data/
//   npm run demo -- --teams 60 --stop final-room   -> dừng khi phòng chung kết đang mở (để xem giao diện)
//   --stop: swiss | bracket | final-room | none
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const N = Number(args.teams || 40);
const STOP = args.stop || 'none';

if (fs.existsSync(config.DB_FILE)) {
  if (args.reset !== 'true') {
    console.error(`Đã có dữ liệu ở ${config.DATA_DIR}. Thêm --reset để xóa và tạo lại.`);
    process.exit(1);
  }
  fs.rmSync(config.DATA_DIR, { recursive: true, force: true });
}

const db = require('../src/db');
const auth = require('../src/auth');
const subs = require('../src/services/submissions');
const T = require('../src/services/tournament');
const R = require('../src/services/results');
const { Worker } = require('../src/services/queue');
const handlers = require('../src/handlers');

const sample = (n) => fs.readFileSync(path.join(config.ROOT, 'sample-bots', `${n}.py`), 'utf8');
const BOTS = {
  random: sample('random_bot'),
  greedy: sample('greedy_bot'),
  rusher: sample('rusher_bot'),
  smart: sample('smart_bot'),
  starter: sample('starter_bot'),
  // Ưu tiên quân Búa: đi Búa nếu được, còn lại ngẫu nhiên.
  rockFirst: `import random
def make_move(state):
    rocks = [m for m in state["legal_moves"] if state["board"][m["from"]]["type"] == "ROCK"]
    return random.choice(rocks or state["legal_moves"])
`,
  crashLate: `import random
def make_move(state):
    if state["ply"] >= 60:
        raise RuntimeError("lỗi giả lập từ nước 60")
    return random.choice(state["legal_moves"])
`,
  invalid: `def make_move(state):
    return "Z9-Z9"
`,
};
const kinds = Object.keys(BOTS);

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function main() {
  db.open();
  db.setSetting('competition_name', 'BOT ARENA - Giải diễn tập');
  const worker = new Worker(handlers).start();
  const pw = auth.hashPassword('matkhau123');
  const adminId = Number(db.run(`INSERT INTO users (email, name, password_hash, role) VALUES ('admin@arena.local','Ban tổ chức',?,'admin')`, auth.hashPassword('admin12345')).lastInsertRowid);

  db.run('INSERT INTO announcements (title, body) VALUES (?,?)', 'Mở đăng ký mùa đầu tiên',
    'Tải bot mẫu, nộp bài và chạy thử với bot mẫu. Sơ loại Swiss 10 vòng chọn 32 đội vào vòng chính.');

  log(`Tạo ${N} đội...`);
  for (let i = 1; i <= N; i++) {
    const size = 2 + (i % 3);
    const ids = [];
    for (let k = 0; k < size; k++) {
      ids.push(Number(db.run('INSERT INTO users (email, name, student_id, school, password_hash) VALUES (?,?,?,?,?)',
        `sv${i}_${k + 1}@demo.local`, `Sinh viên ${i}.${k + 1}`, `SV${String(i * 10 + k).padStart(5, '0')}`, 'Trường Demo', pw).lastInsertRowid));
    }
    const teamId = Number(db.run('INSERT INTO teams (name, captain_id, invite_code) VALUES (?,?,?)', `Team ${String(i).padStart(2, '0')}`, ids[0], `DEMO${i}`).lastInsertRowid);
    for (const u of ids) db.run('UPDATE users SET team_id = ? WHERE id = ?', teamId, u);
    const kind = i === N ? 'invalid' : kinds[i % (kinds.length - 1)];
    const team = db.get('SELECT * FROM teams WHERE id = ?', teamId);
    subs.submit({ user: { id: ids[0] }, team, filename: `${kind}.py`, code: `# ${kind}\n${BOTS[kind]}` });
  }
  await worker.drain();
  const valid = db.get(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'valid'`).n;
  log(`Kiểm thử bài nộp: ${valid} hợp lệ, ${N - valid} không hợp lệ.`);

  // Một đội chạy thử với bot mẫu.
  T.requestPractice({ user: { id: 2 }, team: db.get('SELECT * FROM teams WHERE id = 1'), sampleBot: 'smart_bot' });
  await worker.drain();

  if (STOP === 'swiss') return done(worker, 'Đã có đội và bot, chưa khóa Swiss: vào Quản trị để khóa bản và chạy vòng.');
  log(`Khóa Swiss: ${T.lockPhase('swiss', adminId)} đội.`);
  const rounds = Number(db.setting('swiss_rounds'));
  for (let r = 1; r <= rounds; r++) {
    const info = T.startSwissRound(adminId);
    await worker.drain();
    T.confirmRound(r, adminId);
    log(`Vòng Swiss ${r}: ${info.pairs} trận${info.bye ? ', 1 bye' : ''}${info.rematches ? `, ${info.rematches} tái đấu` : ''}.`);
  }
  T.finishSwiss(adminId);
  for (;;) {
    await worker.drain();
    const st = db.jsonSetting('cut_state');
    if (st.done) {
      log(`Chốt Top 32: ${st.history.length ? `${st.history.length} bước tranh suất ở ranh giới` : 'không cần tranh suất'}.`);
      break;
    }
  }
  if (STOP === 'bracket') return done(worker, 'Đã lập nhánh 32, chưa đấu vòng chính.');

  for (const key of ['r32', 'r16', 'qf', 'sf']) {
    T.startPhase(key, adminId);
    await worker.drain();
    log(`${key.toUpperCase()} xong.`);
  }

  R.configureFinal({
    name: 'Luật chung kết: đảo chiều khắc chế',
    beats: { ROCK: ['PAPER'], PAPER: ['SCISSORS'], SCISSORS: ['ROCK'] },
    description: 'Đảo chiều: búa ăn bao, bao ăn kéo, kéo ăn búa. Quân cùng loại vẫn chặn nhau.',
    briefing: 'Sửa make_move theo bảng khắc chế mới. Không dùng AI hay hỗ trợ bên ngoài.',
    durationMin: 75, includeMoves: true, reveal: true,
  }, adminId);
  R.startFinal(adminId);
  log('Phòng chung kết mở.');
  if (STOP === 'final-room') return done(worker, 'Phòng chung kết đang mở 75 phút.');

  const fin = db.get(`SELECT * FROM series WHERE phase_key = 'final'`);
  for (const tid of [fin.team_a, fin.team_b]) {
    const team = db.get('SELECT * FROM teams WHERE id = ?', tid);
    subs.submit({ user: { id: team.captain_id }, team, filename: 'final.py', code: BOTS.smart });
  }
  await worker.drain();
  R.endFinal(adminId);
  T.startPhase('final', adminId);
  await worker.drain();
  const champ = db.get(`SELECT t.name FROM series s JOIN teams t ON t.id = s.winner WHERE s.phase_key = 'final'`);
  log(`Vô địch: ${champ.name}`);

  const top = R.prizes().list;
  R.setSideAward('progress', top[top.length - 1].teamId, 'Cải thiện rõ giữa các vòng', adminId);
  R.setSideAward('idea', top[top.length - 2].teamId, 'Giải thích chiến thuật tốt', adminId);
  log(`Tổng thưởng đã phân bổ: ${R.prizes().total.toLocaleString('vi-VN')}đ`);
  log(`Cấp ${R.issueCertificates(adminId)} chứng nhận.`);
  return done(worker, 'Giải diễn tập hoàn tất.');
}

function done(worker, msg) {
  worker.stop();
  log(msg);
  console.log('\nĐăng nhập quản trị: admin@arena.local / admin12345');
  console.log('Đăng nhập thí sinh: sv1_1@demo.local / matkhau123 (đội trưởng Team 01)');
  console.log('Chạy web: npm start  ->  http://localhost:' + config.PORT);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
