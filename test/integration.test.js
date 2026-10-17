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
test.after(async () => {
  worker.stop();
  db.close();
  // libSQL releases its native file handles asynchronously on Windows.
  await fs.promises.rm(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

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

test('chạy lại cả vòng Swiss giữ lịch sử, lượt nghỉ và không cộng trùng điểm', async () => {
  const before = T.swissStandings().rows.map((r) => [r.teamId, r.points, r.played]).sort();
  const matches = db.all("SELECT id, seed, sub_a, sub_b FROM matches WHERE kind = 'swiss' AND round_no = 1");
  const counts = matches.map((m) => db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n);
  const bye = db.get("SELECT id FROM matches WHERE kind = 'bye' AND round_no = 1");
  assert.throws(() => T.rerunSwissRound(0, 1), /Số vòng/);
  assert.throws(() => T.rerunSwissRound(2, 1), /gần nhất/);
  db.run("UPDATE phases SET status = 'done' WHERE key = 'swiss'");
  assert.throws(() => T.rerunSwissRound(1, 1), /chốt sơ loại/);
  db.run("UPDATE phases SET status = 'running' WHERE key = 'swiss'");
  db.run("UPDATE matches SET status = 'running' WHERE id = ?", matches[0].id);
  assert.throws(() => T.rerunSwissRound(1, 1), /đang chạy/);
  db.run("UPDATE matches SET status = 'done' WHERE id = ?", matches[0].id);
  const res = T.rerunSwissRound(1, 1);
  assert.equal(res.matches, matches.length);
  // Bấm lại khi còn chờ chỉ thay tác vụ chờ, không nhân đôi hàng đợi.
  T.rerunSwissRound(1, 1);
  for (const m of matches) {
    assert.equal(db.get("SELECT COUNT(*) AS n FROM jobs WHERE type = 'match' AND ref_id = ? AND status = 'queued'", m.id).n, 1);
    assert.equal(db.get('SELECT confirmed FROM matches WHERE id = ?', m.id).confirmed, 0);
  }
  if (bye) {
    assert.equal(db.get('SELECT status FROM matches WHERE id = ?', bye.id).status, 'done');
    assert.equal(db.get('SELECT confirmed FROM matches WHERE id = ?', bye.id).confirmed, 0);
  }
  assert.throws(() => T.startSwissRound(1), /chưa được xác nhận/);
  await worker.drain();
  T.confirmRound(1, 1);
  assert.deepEqual(T.swissStandings().rows.map((r) => [r.teamId, r.points, r.played]).sort(), before);
  assert.deepEqual(db.all("SELECT id, seed, sub_a, sub_b FROM matches WHERE kind = 'swiss' AND round_no = 1"), matches);
  matches.forEach((m, i) => assert.equal(db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n, counts[i] + 1));
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

// ------------------------------------------------------------ thách đấu giữa hai đội

test('thách đấu: cần đội kia đồng ý, chạy 2 ván, không tính điểm, chỉ hai đội xem được', async () => {
  const ch = require('../src/services/challenges');
  const team = (i) => db.get('SELECT * FROM teams WHERE id = ?', teams[i].tid);
  const user = (i) => ({ id: teams[i].uid });
  const before = T.swissStandings().rows.map((r) => [r.teamId, r.points]);

  assert.throws(() => ch.send({ user: user(0), team: team(0), toTeamId: teams[0].tid }), /tự thách đấu/);
  assert.throws(() => ch.send({ user: user(0), team: team(0), toTeamId: teams[5].tid }), /chưa có bot hợp lệ/);
  const id = ch.send({ user: user(0), team: team(0), toTeamId: teams[1].tid });
  assert.throws(() => ch.send({ user: user(1), team: team(1), toTeamId: teams[0].tid }), /đang có một lời thách đấu/);
  assert.throws(() => ch.accept({ user: user(0), team: team(0), id }), /Chỉ đội được thách đấu/);
  assert.equal(ch.overview(team(1)).incoming.length, 1);

  const matchId = ch.accept({ user: user(1), team: team(1), id });
  await worker.drain();
  const m = db.get('SELECT * FROM matches WHERE id = ?', matchId);
  assert.equal(m.kind, 'challenge');
  assert.equal(m.status, 'done');
  assert.equal(m.wins_a + m.wins_b + m.draws, 2);
  assert.equal(m.sub_a, team(0).official_submission_id, 'mặc định dùng bản thi hiện tại của đội mời');
  assert.equal(m.sub_b, team(1).official_submission_id);
  assert.deepEqual(T.swissStandings().rows.map((r) => [r.teamId, r.points]), before, 'không ảnh hưởng bảng điểm');
  assert.throws(() => ch.decline({ user: user(1), team: team(1), id }), /không còn chờ/);

  // Từ chối và hủy.
  const id2 = ch.send({ user: user(2), team: team(2), toTeamId: teams[3].tid });
  ch.decline({ user: user(3), team: team(3), id: id2 });
  const id3 = ch.send({ user: user(2), team: team(2), toTeamId: teams[4].tid });
  assert.throws(() => ch.cancel({ team: team(4), id: id3 }), /Chỉ đội gửi/);
  ch.cancel({ team: team(2), id: id3 });
  assert.deepEqual(ch.overview(team(2)).history.map((h) => h.status).sort(), ['cancelled', 'declined']);

  // Ban tổ chức khóa thách đấu.
  db.setSetting('challenges_open', 'false');
  assert.throws(() => ch.send({ user: user(3), team: team(3), toTeamId: teams[4].tid }), /tạm khóa/);
  db.setSetting('challenges_open', 'true');

  // Quyền xem: hai đội trong trận xem được, đội thứ ba thì không.
  const express = require('express');
  const server = express().use('/api', require('../src/routes/api')).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = async (email) => (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'matkhau123' }) })).headers.get('set-cookie').split(';')[0];
  try {
    const view = async (email) => fetch(`${base}/matches/${matchId}`, { headers: { cookie: await cookie(email) } });
    const v = await view('u2@t.local');
    assert.equal(v.status, 200);
    assert.ok((await v.json()).games[0].moves.length > 0);
    assert.equal((await view('u3@t.local')).status, 403);
  } finally {
    server.close();
  }
});

test('chạy lại vòng hiện tại: giữ vòng trước, bản bot, lịch sử và dựng lại nhánh sau', async () => {
  T.confirmRound(2, 1);
  assert.equal(T.currentRound().key, 'swiss');
  assert.throws(() => T.rerunCurrentRound({ key: 'swiss', round: 1 }, 1), /thay đổi/);
  T.rerunCurrentRound({ key: 'swiss', round: 2 }, 1);
  await worker.drain();
  T.confirmRound(2, 1);
  T.startSwissRound(1);
  await worker.drain();
  T.confirmRound(3, 1);
  T.finishSwiss(1);
  await worker.drain();
  assert.equal(T.currentRound().available, false);
  for (const key of ['r32', 'r16', 'qf', 'sf']) {
    T.startPhase(key, 1);
    await worker.drain();
  }
  const before = db.all("SELECT * FROM matches WHERE phase_key IN ('swiss','r32','r16','qf') ORDER BY id");
  const locked = db.all("SELECT * FROM entries WHERE phase_key = 'sf'");
  const oldMatches = db.all("SELECT id,seed,sub_a,sub_b FROM matches WHERE phase_key = 'sf' ORDER BY id");
  const counts = oldMatches.map((m) => db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n);
  assert.equal(T.currentRound().key, 'sf');
  assert.equal(T.currentRound().available, true);
  assert.throws(() => T.rerunCurrentRound({ key: 'qf' }, 1), /thay đổi/);
  const first = oldMatches[0].id;
  db.run("UPDATE matches SET status = 'running' WHERE id = ?", first);
  assert.throws(() => T.rerunCurrentRound({ key: 'sf' }, 1), /đang chạy/);
  db.run("UPDATE matches SET status = 'done' WHERE id = ?", first);
  T.rerunCurrentRound({ key: 'sf' }, 1);
  assert.equal(db.get("SELECT status FROM phases WHERE key = 'sf'").status, 'running');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM series WHERE phase_key = 'final'").n, 0);
  await worker.drain();
  assert.equal(db.get("SELECT status FROM phases WHERE key = 'sf'").status, 'done');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM series WHERE phase_key = 'final'").n, 1);
  assert.deepEqual(db.all("SELECT * FROM matches WHERE phase_key IN ('swiss','r32','r16','qf') ORDER BY id"), before);
  assert.deepEqual(db.all("SELECT * FROM entries WHERE phase_key = 'sf'"), locked);
  assert.deepEqual(db.all("SELECT id,seed,sub_a,sub_b FROM matches WHERE phase_key = 'sf' ORDER BY id"), oldMatches);
  oldMatches.forEach((m, i) => assert.equal(db.get('SELECT COUNT(*) AS n FROM runs WHERE match_id = ?', m.id).n, counts[i] + 1));
  // Không đổi hai đội khi phiên chung kết đã phát luật.
  const rs = db.get("SELECT ruleset_id FROM phases WHERE key = 'final'").ruleset_id;
  db.run("INSERT INTO final_session (id,ruleset_id,duration_min,status) VALUES (1,?,15,'running')", rs);
  assert.equal(T.currentRound().available, false);
  assert.throws(() => T.rerunCurrentRound({ key: 'sf' }, 1), /chung kết/);
  db.run("UPDATE final_session SET status = 'ended' WHERE id = 1");
  T.startPhase('final', 1);
  await worker.drain();
  assert.throws(() => T.rerunCurrentRound({ key: 'sf' }, 1), /thay đổi/);
  const finalIds = db.all("SELECT id FROM matches WHERE phase_key = 'final' ORDER BY game_no");
  const finalSeeds = db.all("SELECT id,seed,sub_a,sub_b FROM matches WHERE phase_key = 'final' ORDER BY game_no");
  // Buộc trạng thái cũ đủ ba trận để kiểm tra best-of dừng sớm sau hai trận khi chạy lại.
  const series = db.get("SELECT * FROM series WHERE phase_key = 'final'");
  if (finalIds.length === 2) {
    const m = db.get('SELECT * FROM matches WHERE id = ?', finalIds[0].id);
    T.createMatch({ kind: 'knockout', phase_key: 'final', series_id: series.id, game_no: 3, round_no: 3,
      team_a: m.team_a, team_b: m.team_b, sub_a: m.sub_a, sub_b: m.sub_b, ruleset_id: rs, decisive: true });
    await worker.drain();
  }
  T.rerunCurrentRound({ key: 'final' }, 1);
  await worker.drain();
  assert.equal(db.get("SELECT status FROM phases WHERE key = 'final'").status, 'done');
  assert.deepEqual(db.all("SELECT id,seed,sub_a,sub_b FROM matches WHERE phase_key = 'final' ORDER BY game_no").slice(0, finalSeeds.length), finalSeeds);
  const played = db.all("SELECT * FROM matches WHERE phase_key = 'final' AND status = 'done' ORDER BY game_no");
  assert.ok(played.length >= 2 && played.length <= 3);
  if (played[0].result === played[1].result) assert.equal(played.length, 2, 'best-of dừng ngay khi đủ hai trận thắng');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").n, 0);
  db.run('DELETE FROM final_session');
});

test('reset giải: chỉ admin được xác nhận, giữ đội và bot, xóa kết quả và bắt đầu lại Swiss', async () => {
  await worker.drain();
  const express = require('express');
  const server = express().use('/api', require('../src/routes/api')).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const adminId = Number(db.run("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')",
    'reset-admin@t.local', 'Admin', pw).lastInsertRowid);
  const counts = () => ['users', 'teams', 'submissions', 'challenges'].map((table) => db.get(`SELECT COUNT(*) AS n FROM ${table}`).n);
  const before = counts();
  const friendly = db.all("SELECT * FROM matches WHERE kind IN ('practice','challenge') ORDER BY id");
  const login = async (email) => (await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'matkhau123' }),
  })).headers.get('set-cookie').split(';')[0];
  const reset = (cookie, confirmation) => fetch(`${base}/admin/tournament/reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ confirmation }),
  });
  try {
    const student = await login('u2@t.local');
    const admin = await login('reset-admin@t.local');
    const rerun = (cookie, key) => fetch(`${base}/admin/tournament/rerun-current`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ key }),
    });
    assert.equal((await rerun(student, 'final')).status, 403);
    assert.equal((await rerun(admin, 'sf')).status, 409, 'từ chối yêu cầu từ trang đã cũ');
    assert.equal((await reset(student, 'RESET')).status, 403);
    assert.equal((await reset(admin, 'wrong')).status, 400);
    const match = db.get("SELECT id FROM matches WHERE kind = 'swiss' LIMIT 1");
    db.run("UPDATE matches SET status = 'running' WHERE id = ?", match.id);
    assert.equal((await reset(admin, 'RESET')).status, 409);
    assert.ok(db.get('SELECT COUNT(*) AS n FROM entries').n);
    db.run("UPDATE matches SET status = 'done' WHERE id = ?", match.id);
    const jobId = db.run("INSERT INTO jobs (type,ref_id,priority,status) VALUES ('validate',?,1,'running')", teams[0].sid).lastInsertRowid;
    assert.throws(() => T.resetTournament(adminId), /đang chạy/);
    db.run('DELETE FROM jobs WHERE id = ?', jobId);
    const R = require('../src/services/results');
    R.configureFinal({ beats: { ROCK: ['PAPER'], PAPER: ['SCISSORS'], SCISSORS: ['ROCK'] }, durationMin: 15 }, adminId);
    db.setSetting('cut_state', JSON.stringify({ done: true }));
    db.setSetting('qualified', JSON.stringify([teams[0].tid]));
    db.run("INSERT INTO awards (team_id,award_key,title,amount) VALUES (?,'idea','Idea',800000)", teams[0].tid);
    db.run("INSERT INTO certificates (code,user_id,team_id,member_name,team_name,achievement) VALUES ('TEST',?,?, 'Name','Team','Top 32')", teams[0].uid, teams[0].tid);
    // Giữ bản chung kết để tham khảo, mùa mới tự quay về bản thường hợp lệ.
    db.run("UPDATE submissions SET phase_key = 'final' WHERE id = ?", teams[0].sid);
    const fallback = db.get("SELECT id FROM submissions WHERE team_id = ? AND phase_key = 'main' AND status = 'valid' ORDER BY version DESC LIMIT 1", teams[0].tid);
    db.run('UPDATE teams SET official_submission_id = ? WHERE id = ?', teams[0].sid, teams[0].tid);
    assert.equal((await reset(admin, 'RESET')).status, 200);
    assert.deepEqual(counts(), before);
    assert.deepEqual(db.all("SELECT * FROM matches WHERE kind IN ('practice','challenge') ORDER BY id"), friendly);
    for (const table of ['entries', 'series', 'awards', 'certificates', 'final_session']) {
      assert.equal(db.get(`SELECT COUNT(*) AS n FROM ${table}`).n, 0, table);
    }
    assert.equal(db.get("SELECT COUNT(*) AS n FROM matches WHERE kind IN ('swiss','bye','tiebreak','knockout')").n, 0);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM runs WHERE match_id NOT IN (SELECT id FROM matches)").n, 0);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM jobs WHERE type = 'match' AND ref_id NOT IN (SELECT id FROM matches)").n, 0);
    assert.ok(db.all('SELECT status,locked_at FROM phases').every((p) => p.status === 'pending' && p.locked_at === null));
    assert.equal(db.jsonSetting('cut_state'), null);
    assert.equal(db.jsonSetting('qualified'), null);
    assert.equal(db.setting('current_phase'), 'swiss');
    assert.equal(db.setting('teams_open'), 'true');
    assert.equal(db.setting('submissions_open'), 'true');
    assert.equal(db.get('SELECT official_submission_id AS sub FROM teams WHERE id = ?', teams[0].tid).sub, fallback?.id ?? null);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM audit WHERE action = 'reset_tournament'").n, 1);
    T.lockPhase('swiss', adminId);
    assert.equal(T.startSwissRound(adminId).round, 1);
    await worker.drain();
    T.confirmRound(1, adminId);
  } finally {
    server.close();
  }
});

test('admin tạo tài khoản mẫu: phân quyền, đội và bot hợp lệ, không trùng và tuân thủ khóa Swiss', async () => {
  const demo = require('../src/services/demo-accounts');
  const adminId = db.get("SELECT id FROM users WHERE email = 'reset-admin@t.local'").id;
  const before = db.get('SELECT COUNT(*) AS n FROM users').n;
  const request = { mode: 'teams', count: 2, members: 2, password: 'demo-password-123', withBots: true };
  assert.throws(() => demo.create(request, adminId), /khóa lập đội/);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM users').n, before);
  T.resetTournament(adminId);
  const express = require('express');
  const server = express().use('/api', require('../src/routes/api')).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (email) => (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'matkhau123' }) })).headers.get('set-cookie').split(';')[0];
  const create = (cookie, body) => fetch(`${base}/admin/demo-accounts`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  try {
    const admin = await login('reset-admin@t.local');
    const student = await login('u2@t.local');
    assert.equal((await create(null, request)).status, 403);
    assert.equal((await create(student, request)).status, 403);
    for (const invalid of [{ count: 0 }, { count: 101 }, { count: 1.5 }, { members: 4 }, { password: 'short' }, { mode: 'admin' }, { withBots: 'true' }]) {
      assert.equal((await create(admin, { ...request, ...invalid })).status, 400);
    }
    assert.equal(db.get('SELECT COUNT(*) AS n FROM users').n, before);
    db.setSetting('submissions_open', 'false');
    assert.equal((await create(admin, request)).status, 409);
    db.setSetting('submissions_open', 'true');
    const res = await create(admin, request);
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.users, 4);
    assert.equal(result.teams, 2);
    assert.equal(result.bots, 2);
    assert.equal(result.accounts.filter((a) => a.captain).length, 2);
    for (const a of result.accounts) {
      const user = db.get('SELECT * FROM users WHERE id = ?', a.id);
      assert.equal(user.role, 'student');
      assert.ok(auth.checkPassword(request.password, user.password_hash));
      const team = db.get('SELECT * FROM teams WHERE id = ?', user.team_id);
      assert.equal(team.name, a.teamName);
      if (a.captain) assert.equal(team.captain_id, a.id);
    }
    await worker.drain();
    for (const a of result.accounts.filter((a) => a.captain)) {
      const user = db.get('SELECT * FROM users WHERE id = ?', a.id);
      const team = db.get('SELECT * FROM teams WHERE id = ?', user.team_id);
      const bot = db.get('SELECT status,source_code FROM submissions WHERE id = ?', team.official_submission_id);
      assert.equal(bot.status, 'valid');
      assert.match(bot.source_code, /def make_move/);
    }
    const second = await (await create(admin, { ...request, withBots: false })).json();
    assert.equal(second.bots, 0);
    assert.notEqual(second.batch, result.batch);
    assert.equal(new Set([...second.accounts, ...result.accounts].map((a) => a.email)).size, 8);
    assert.equal(db.get("SELECT status FROM phases WHERE key = 'swiss'").status, 'pending');
    assert.equal(db.get("SELECT COUNT(*) AS n FROM matches WHERE kind = 'swiss'").n, 0);
    db.setSetting('teams_open', 'false');
    assert.equal((await create(admin, request)).status, 409);
    const standalone = await (await create(admin, { ...request, mode: 'accounts', count: 3 })).json();
    assert.equal(standalone.users, 3);
    assert.equal(standalone.teams, 0);
    assert.equal(standalone.bots, 0);
    for (const a of standalone.accounts) assert.equal(db.get('SELECT team_id FROM users WHERE id = ?', a.id).team_id, null);
    const logs = db.all("SELECT detail FROM audit WHERE action = 'create_demo_accounts'");
    assert.equal(logs.length, 3);
    assert.ok(logs.every((row) => !row.detail.includes(request.password)));
  } finally {
    server.close();
  }
});
