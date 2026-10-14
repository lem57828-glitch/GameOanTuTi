// Kiểm thử tích hợp: chạy bot Python thật, CSDL tạm, API qua HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-test-'));
process.env.DATA_DIR = TMP;
process.env.SWISS_ROUNDS = '3';

const db = require('../src/db');
const auth = require('../src/auth');
const subs = require('../src/services/submissions');
const T = require('../src/services/tournament');
const { runMatch } = require('../src/runner/match');
const board = require('../src/game/board');
const { Worker } = require('../src/services/queue');
const handlers = require('../src/handlers');

const RS = { moves: ['ROCK', 'PAPER', 'SCISSORS'], beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] } };
const botFile = (name, code) => {
  const dir = path.join(TMP, 'adhoc', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bot.py'), code);
  return path.join(dir, 'bot.py');
};
const RANDOM = botFile('random', 'import random\ndef make_move(state):\n    return random.choice(state["legal_moves"])\n');
const RUSHER = path.join(__dirname, '..', 'sample-bots', 'rusher_bot.py');
const SMART = path.join(__dirname, '..', 'sample-bots', 'smart_bot.py');
const play = (botA, botB, extra = {}) => runMatch({ botA, botB, ruleset: RS, games: 2, extraGames: 0, maxPlies: 60, decisive: false, seed: 1, ...extra });
/** Các nước của bên A trong ván i. */
const movesOfA = (r, i = 0) => r.games[i].moves.filter((m) => m.side === (r.games[i].blue === 'a' ? 'blue' : 'pink'));

db.open();
const worker = new Worker(handlers, 4).start();
test.after(() => { worker.stop(); db.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

// ------------------------------------------------------------ bộ chạy bot

test('trận 2 ván đổi màu, mọi nước đều hợp lệ và ván kết thúc đúng luật', async () => {
  const r = await play(SMART, RANDOM, { maxPlies: 200 });
  assert.equal(r.games.length, 2);
  assert.equal(r.games[0].blue, 'a');
  assert.equal(r.games[1].blue, 'b');
  for (const g of r.games) {
    assert.ok(['goal', 'eliminate', 'no_moves', 'repetition', 'max_plies'].includes(g.reason), g.reason);
    assert.ok(g.moves.every((m) => !m.err));
    // Dựng lại ván từ danh sách nước: từng nước phải hợp lệ.
    let st = board.newGame(200);
    for (const m of g.moves) st = board.applyMove(RS, st, board.findLegal(RS, st, m)).state;
    assert.equal(st.ply, g.plies);
  }
  assert.equal(r.winsA + r.winsB + r.draws, 2);
});

test('bot nhận đúng trạng thái: màu, ô đích, nước hợp lệ, bàn cờ', async () => {
  const check = botFile('check', [
    'def make_move(state):',
    '    assert state["me"] in ("blue", "pink")',
    '    assert state["my_goal"] == ("I9" if state["me"] == "blue" else "A1")',
    '    assert len(state["my_pieces"]) <= 10 and state["legal_moves"]',
    '    m = state["legal_moves"][0]',
    '    assert state["board"][m["from"]]["side"] == state["me"]',
    '    assert state["beats"]["ROCK"] == ["SCISSORS"]',
    '    return m["from"] + "-" + m["to"]',
  ].join('\n'));
  const r = await play(check, RANDOM, { maxPlies: 20 });
  assert.equal(movesOfA(r, 0).filter((m) => m.err).length, 0);
  assert.equal(movesOfA(r, 1).filter((m) => m.err).length, 0);
});

test('nước sai: hệ thống đi thay, lỗi lần thứ 3 thì thua ván', async () => {
  const bad = botFile('bad', 'def make_move(state):\n    return "Z9-Z9"\n');
  const r = await play(bad, RANDOM);
  for (const g of r.games) {
    assert.equal(g.reason, 'errors');
    assert.equal(g.result, 'b');
  }
  const mine = movesOfA(r);
  assert.equal(mine.length, 3);
  assert.ok(mine[0].auto && mine[1].auto, 'hai lỗi đầu được đi thay');
  assert.match(mine[0].err, /không hợp lệ/);
  assert.equal(r.result, 'b');
});

test('bot crash khi khởi động: thua ván', async () => {
  const crash = botFile('crash', 'raise SystemExit("hỏng")\ndef make_move(state):\n    return None\n');
  const r = await play(crash, RANDOM);
  assert.ok(r.games.every((g) => g.result === 'b' && g.reason === 'crash'));
});

test('bot thiếu make_move bị báo lỗi', async () => {
  const none = botFile('none', 'x = 1\n');
  const r = await play(none, RANDOM, { games: 1 });
  assert.match(r.games[0].moves[0].err, /make_move/);
});

test('vòng lặp vô hạn: bot bị dừng, thua ván, trận không treo', async () => {
  const loop = botFile('loop', 'def make_move(state):\n    while True:\n        pass\n');
  const t0 = Date.now();
  const r = await play(loop, RANDOM, { games: 1 });
  assert.equal(r.games[0].reason, 'crash');
  assert.equal(r.games[0].result, 'b');
  assert.ok(Date.now() - t0 < 5000);
});

test('vượt CPU một nước: tính là lỗi, hệ thống đi thay, bot vẫn chạy tiếp', async () => {
  const slow = botFile('slow', 'import time, random\ndef make_move(state):\n    if state["ply"] < 2:\n        t = time.process_time()\n        while time.process_time() - t < 0.5:\n            pass\n    return random.choice(state["legal_moves"])\n');
  const r = await play(slow, RANDOM, { games: 1, maxPlies: 10 });
  const mine = movesOfA(r);
  assert.match(mine[0].err, /CPU/);
  assert.ok(!mine[1].err);
});

test('chặn mạng, tiến trình con và đọc tệp ngoài thư mục bot', async () => {
  const evil = botFile('evil', [
    'import random',
    'def make_move(state):',
    '    n = len(state["history"]) // 2',
    '    if n == 0:',
    '        import socket',
    '    if n == 1:',
    `        open(${JSON.stringify(RANDOM)}).read()`,
    '    return random.choice(state["legal_moves"])',
  ].join('\n'));
  const r = await play(evil, RANDOM, { games: 1, maxPlies: 10 });
  const mine = movesOfA(r);
  assert.match(mine[0].err || '', /PermissionError/);
  assert.match(mine[1].err || '', /PermissionError/);
  assert.ok(!mine[2].err, 'bot vẫn chạy sau khi bị chặn');
  const sub = botFile('sub', 'def make_move(state):\n    import os\n    os.system("echo hi")\n');
  const r2 = await play(sub, RANDOM, { games: 1, maxPlies: 10 });
  assert.match(movesOfA(r2)[0].err, /PermissionError/);
});

test('print của bot vào log, không làm hỏng giao thức', async () => {
  const chatty = botFile('chatty', 'import random\ndef make_move(state):\n    print("xin chào", state["ply"])\n    return random.choice(state["legal_moves"])\n');
  const r = await play(chatty, RANDOM, { games: 1, maxPlies: 6 });
  assert.ok(movesOfA(r).every((m) => !m.err));
  assert.match(r.logA, /xin chào 4/);
});

test('vòng loại trực tiếp: hòa thì đấu phụ, vẫn hòa thì bốc thăm theo seed', async () => {
  const opts = { maxPlies: 4, decisive: true, extraGames: 2, seed: 77 }; // 4 nước, đủ quân hai bên -> hòa mọi ván
  const r1 = await play(RANDOM, RANDOM, opts);
  const r2 = await play(RANDOM, RANDOM, opts);
  assert.equal(r1.games.length, 4);
  assert.equal(r1.decidedBy, 'lot');
  assert.equal(r1.result, r2.result, 'bốc thăm tái lập được');
});

test('cùng seed cho cùng diễn biến (bot dùng random)', async () => {
  const a = await play(RANDOM, SMART, { seed: 5 });
  const b = await play(RANDOM, SMART, { seed: 5 });
  assert.deepEqual(a.games.map((g) => g.moves), b.games.map((g) => g.moves));
});

test('bot mẫu lao về đích thắng được bot ngẫu nhiên', async () => {
  const r = await play(RUSHER, RANDOM, { maxPlies: 200, seed: 9 });
  assert.ok(r.winsA >= 1);
});

// ------------------------------------------------------------ luồng giải

const pw = auth.hashPassword('matkhau123');
function makeTeam(i, code) {
  const uid = Number(db.run('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)', `u${i}@t.local`, `U${i}`, pw).lastInsertRowid);
  const tid = Number(db.run('INSERT INTO teams (name, captain_id, invite_code) VALUES (?,?,?)', `T${i}`, uid, `C${i}`).lastInsertRowid);
  db.run('UPDATE users SET team_id = ? WHERE id = ?', tid, uid);
  const team = db.get('SELECT * FROM teams WHERE id = ?', tid);
  const sid = subs.submit({ user: { id: uid }, team, filename: 'b.py', code });
  return { uid, tid, sid, file: db.get('SELECT path FROM submissions WHERE id = ?', sid).path };
}
const teams = [];

test('nộp bài: kiểm tra định dạng', () => {
  assert.throws(() => subs.checkFormat('a.txt', 'def make_move(s): pass'), /\.py/);
  assert.throws(() => subs.checkFormat('a.py', 'print(1)'), /make_move/);
  assert.throws(() => subs.checkFormat('a.py', `def make_move(s):\n    pass\n#${'x'.repeat(1024 * 1024)}`), /1 MB/);
});

test('kiểm thử bài nộp: bot tốt hợp lệ, bot trả sai không hợp lệ; bản hợp lệ đầu tiên thành bản thi', async () => {
  const sample = (n) => fs.readFileSync(path.join(__dirname, '..', 'sample-bots', `${n}.py`), 'utf8');
  const codes = [
    `# đội 1\n${sample('random_bot')}`,
    sample('greedy_bot'),
    sample('rusher_bot'),
    sample('smart_bot'),
    sample('starter_bot'),
    'def make_move(state):\n    return "NOPE"\n',
  ];
  codes.forEach((c, i) => teams.push(makeTeam(i + 1, c)));
  await worker.drain();
  const st = teams.map((t) => db.get('SELECT status FROM submissions WHERE id = ?', t.sid).status);
  assert.deepEqual(st, ['valid', 'valid', 'valid', 'valid', 'valid', 'invalid']);
  assert.equal(db.get('SELECT official_submission_id AS o FROM teams WHERE id = ?', teams[0].tid).o, teams[0].sid);
  assert.equal(db.get('SELECT official_submission_id AS o FROM teams WHERE id = ?', teams[5].tid).o, null);
});

test('nộp trùng nội dung bị từ chối; khóa nộp bài chặn bài mới', () => {
  const team = db.get('SELECT * FROM teams WHERE id = ?', teams[0].tid);
  assert.throws(() => subs.submit({ user: { id: teams[0].uid }, team, filename: 'b.py', code: fs.readFileSync(teams[0].file, 'utf8') }), /trùng/);
  db.setSetting('submissions_open', 'false');
  assert.throws(() => subs.submit({ user: { id: teams[0].uid }, team, filename: 'c.py', code: 'def make_move(state):\n    return state["legal_moves"][0]\n' }), /khóa/);
  db.setSetting('submissions_open', 'true');
});

test('chạy thử: tối đa 1 trận đang chạy mỗi đội', async () => {
  const team = db.get('SELECT * FROM teams WHERE id = ?', teams[0].tid);
  T.requestPractice({ user: { id: teams[0].uid }, team, sampleBot: 'random_bot' });
  assert.throws(() => T.requestPractice({ user: { id: teams[0].uid }, team, sampleBot: 'random_bot' }), /đang có một trận/);
  await worker.drain();
});

test('khóa Swiss: chỉ đội có bot hợp lệ; đổi bản sau khi khóa không ảnh hưởng giai đoạn', async () => {
  assert.equal(T.lockPhase('swiss', 1), 5);
  // Đội 1 nộp bản mới và chọn làm bản thi sau khi khóa.
  const team = db.get('SELECT * FROM teams WHERE id = ?', teams[0].tid);
  const newSid = subs.submit({ user: { id: teams[0].uid }, team, filename: 'v2.py', code: 'def make_move(state):\n    return state["legal_moves"][-1]\n' });
  await worker.drain();
  db.run('UPDATE teams SET official_submission_id = ? WHERE id = ?', newSid, teams[0].tid);
  assert.equal(db.get(`SELECT submission_id FROM entries WHERE phase_key = 'swiss' AND team_id = ?`, teams[0].tid).submission_id, teams[0].sid);
});

test('vòng Swiss số lẻ có bye; phải xác nhận vòng trước mới ghép vòng sau', async () => {
  const r1 = T.startSwissRound(1);
  assert.equal(r1.pairs, 2);
  assert.ok(r1.bye);
  assert.throws(() => T.startSwissRound(1), /chưa được xác nhận|Còn/);
  await worker.drain();
  const m = db.get(`SELECT * FROM matches WHERE kind = 'swiss' AND (team_a = ? OR team_b = ?)`, teams[0].tid, teams[0].tid);
  if (m) assert.equal(m.team_a === teams[0].tid ? m.sub_a : m.sub_b, teams[0].sid, 'trận dùng bản đã khóa');
  T.confirmRound(1, 1);
  const s = T.swissStandings();
  assert.equal(s.provisional, false);
  assert.equal(s.rows.reduce((sum, r) => sum + r.points, 0) >= 3 * 2 + 3 - 2, true);
});

test('chạy lại trận không cộng điểm hai lần', async () => {
  const before = T.swissStandings().rows.map((r) => [r.teamId, r.points, r.played]);
  const m = db.get(`SELECT id FROM matches WHERE kind = 'swiss' AND round_no = 1 LIMIT 1`);
  T.rerunMatch(m.id, 1);
  await worker.drain();
  T.confirmRound(1, 1);
  const after = T.swissStandings().rows.map((r) => [r.teamId, r.points, r.played]);
  assert.deepEqual(after.sort(), before.sort());
  assert.equal(db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n, 2, 'lịch sử hai lần chạy được giữ');
});

test('worker bị tắt giữa trận: tác vụ được đưa lại hàng đợi và chạy xong', async () => {
  const queue = require('../src/services/queue');
  const r2 = T.startSwissRound(1);
  assert.equal(r2.round, 2);
  // Giả lập: một worker khác nhận tác vụ rồi "chết" (không gửi nhịp tim).
  worker.stop();
  const job = queue.claim('dead-worker');
  db.run(`UPDATE matches SET status = 'running' WHERE id = ?`, job.ref_id);
  db.run('UPDATE jobs SET heartbeat_at = ? WHERE id = ?', Date.now() - 120_000, job.id);
  assert.equal(queue.recoverStale(), 1);
  const w2 = new Worker(handlers, 4).start();
  await w2.drain();
  w2.stop();
  assert.equal(db.get('SELECT status FROM matches WHERE id = ?', job.ref_id).status, 'done');
  worker.stopped = false;
  worker.start();
});

// ------------------------------------------------------------ API & phân quyền

test('API: phân quyền giữa hai đội và quyền quản trị', async () => {
  const express = require('express');
  const app = express().use('/api', require('../src/routes/api'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (email) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'matkhau123' }) });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie').split(';')[0];
  };
  try {
    const c1 = await login('u1@t.local');
    const c2 = await login('u2@t.local');
    const get = (p, c) => fetch(`${base}${p}`, { headers: c ? { cookie: c } : {} });

    const other = teams[1].sid;
    assert.equal((await get(`/bots/${other}`, c1)).status, 404, 'không xem được mã đội khác');
    assert.equal((await get('/admin/overview', c1)).status, 403);
    assert.equal((await get('/bots', null)).status, 401);
    const mine = await (await get(`/bots/${teams[0].sid}`, c1)).json();
    assert.match(mine.code, /đội 1/);

    // Trận chạy thử của đội 1 không xem được từ đội 2.
    const pr = db.get(`SELECT id FROM matches WHERE kind = 'practice' AND team_a = ?`, teams[0].tid);
    assert.equal((await get(`/matches/${pr.id}`, c2)).status, 403);
    assert.equal((await get(`/matches/${pr.id}`, c1)).status, 200);

    // Trận Swiss: đội trong trận xem lại được ván; người ngoài chỉ thấy kết quả từng ván.
    const sm = db.get(`SELECT * FROM matches WHERE kind = 'swiss' AND status = 'done' AND team_a = ?`, teams[0].tid)
      || db.get(`SELECT * FROM matches WHERE kind = 'swiss' AND status = 'done' AND team_b = ?`, teams[0].tid);
    if (sm) {
      const v1 = await (await get(`/matches/${sm.id}`, c1)).json();
      assert.ok(v1.games[0].moves.length > 0, 'đội trong trận xem được diễn biến');
      assert.equal(v1.logB, undefined, 'không thấy log đối thủ');
      const anon = await (await get(`/matches/${sm.id}`)).json();
      assert.equal(anon.games[0].moves, undefined, 'người ngoài chỉ thấy kết quả ván');
      assert.ok(anon.games[0].reason);
    }

    // Chỉ đội trưởng chọn bản thi; thành viên thường bị từ chối.
    const uid = Number(db.run('INSERT INTO users (email, name, password_hash, team_id) VALUES (?,?,?,?)', 'member@t.local', 'M', pw, teams[0].tid).lastInsertRowid);
    assert.ok(uid);
    const cm = await login('member@t.local');
    const r = await fetch(`${base}/bots/${teams[0].sid}/official`, { method: 'POST', headers: { cookie: cm } });
    assert.equal(r.status, 403);

    // Cookie giả mạo không được chấp nhận.
    assert.equal((await get('/bots', 'arena_session=eyJ1aWQiOjF9.fake')).status, 401);
  } finally {
    server.close();
  }
});

// ------------------------------------------------------------ người vs bot mẫu trên bàn cờ

test('người vs bot mẫu: chỉ nhận nước hợp lệ, bot đi ngay sau, ván dở dang chơi tiếp được', () => {
  const pl = require('../src/services/play');
  const g = pl.start(teams[0].uid, teams[0].tid, 'random_bot', 'blue');
  assert.equal(g.toMove, 'blue');
  assert.equal(g.maxPlies, 200);
  assert.ok(g.legal.length > 0);
  assert.throws(() => pl.move(teams[0].uid, g.id, { from: 'B5', to: 'B7' }), /không hợp lệ/);
  assert.throws(() => pl.move(teams[0].uid, g.id, { from: 'H5', to: 'H4' }), /không hợp lệ/, 'không đi quân đối phương');
  const v = pl.move(teams[0].uid, g.id, g.legal[0]);
  assert.equal(v.ply, 2, 'bot đã trả lời');
  assert.equal(v.toMove, 'blue');
  assert.equal(pl.current(teams[0].uid).id, g.id);
  // Cầm Hồng: bot Xanh đi trước ngay khi bắt đầu.
  const p = pl.start(teams[1].uid, teams[1].tid, 'smart_bot', 'pink');
  assert.equal(p.ply, 1);
  assert.equal(p.toMove, 'pink');
  pl.abandon(teams[1].uid, p.id);
  assert.equal(pl.current(teams[1].uid), null);
});

test('người vs bot mẫu: chơi hết ván thì có kết quả và không đi thêm được', () => {
  const pl = require('../src/services/play');
  let g = pl.start(teams[2].uid, teams[2].tid, 'random_bot', 'blue');
  const d = (s) => { const [x, y] = board.parseSq(s); return Math.max(8 - x, 8 - y); };
  while (!g.end) {
    // Người chơi lao thẳng về I9.
    const mv = g.legal.reduce((a, b) => (d(b.to) < d(a.to) ? b : a));
    g = pl.move(teams[2].uid, g.id, mv);
  }
  assert.ok(['W', 'L', 'D'].includes(g.result));
  assert.ok(g.end.reason);
  assert.throws(() => pl.move(teams[2].uid, g.id, { from: 'B5', to: 'B6' }), /kết thúc/);
  assert.equal(pl.current(teams[2].uid), null);
});

// ------------------------------------------------------------ đăng ký & đăng nhập

test('đăng ký/đăng nhập: chỉ đếm lần sai, nhiều người cùng IP vẫn đăng nhập được', async () => {
  const express = require('express');
  const server = express().use('/api', require('../src/routes/api')).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (p, body, cookie) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  try {
    // Đăng ký: tên tiếng Việt, email không phân biệt hoa thường, tự đăng nhập sau khi đăng ký.
    const r = await post('/auth/register', { email: 'Lan.Anh@Truong.edu.vn', name: 'Trần Lan Anh', password: 'matkhau123' });
    assert.equal(r.status, 200);
    const me = await (await fetch(`${base}/me`, { headers: { cookie: r.headers.get('set-cookie').split(';')[0] } })).json();
    assert.equal(me.user.name, 'Trần Lan Anh');
    assert.equal(me.user.email, 'lan.anh@truong.edu.vn');
    assert.equal((await post('/auth/register', { email: 'LAN.ANH@truong.edu.vn', name: 'X Y', password: 'matkhau123' })).status, 409);
    assert.equal((await post('/auth/register', { email: 'x@y.vn', name: 'X Y', password: 'ngan' })).status, 400);
    assert.equal((await post('/auth/register', { email: 'khong-phai-email', name: 'X Y', password: 'matkhau123' })).status, 400);

    // 30 lần đăng nhập đúng liên tiếp từ cùng một IP (như cả lớp dùng chung Wi-Fi): không bị chặn.
    for (let i = 0; i < 30; i++) assert.equal((await post('/auth/login', { email: 'lan.anh@truong.edu.vn', password: 'matkhau123' })).status, 200);

    // Sai 5 lần thì khóa riêng tài khoản đó, kể cả khi lần sau nhập đúng; tài khoản khác không bị ảnh hưởng.
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/login', { email: 'u1@t.local', password: 'sai-mat-khau' })).status, 401);
    assert.equal((await post('/auth/login', { email: 'u1@t.local', password: 'matkhau123' })).status, 429);
    assert.equal((await post('/auth/login', { email: 'u2@t.local', password: 'matkhau123' })).status, 200);

    // Đăng xuất xóa phiên.
    const lo = await post('/auth/logout', {});
    assert.match(lo.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    server.close();
  }
});
