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
const { Worker } = require('../src/services/queue');
const handlers = require('../src/handlers');

const RPS = { moves: ['ROCK', 'PAPER', 'SCISSORS'], beats: { ROCK: ['SCISSORS'], PAPER: ['ROCK'], SCISSORS: ['PAPER'] } };
const botFile = (name, code) => {
  const dir = path.join(TMP, 'adhoc', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bot.py'), code);
  return path.join(dir, 'bot.py');
};
const ROCK = botFile('rock', 'def make_move(state):\n    return "ROCK"\n');
const PAPER = botFile('paper', 'def make_move(state):\n    return "PAPER"\n');
const play = (botA, botB, extra = {}) => runMatch({ botA, botB, ruleset: RPS, turns: 10, reveal: false, decisive: false, extraTurns: 0, seed: 1, ...extra });

db.open();
const worker = new Worker(handlers, 4).start();
test.after(() => { worker.stop(); db.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

// ------------------------------------------------------------ bộ chạy bot

test('bot luôn búa / luôn bao: kết quả đúng', async () => {
  const r = await play(ROCK, PAPER);
  assert.equal(r.winsB, 10);
  assert.equal(r.result, 'b');
});

test('bot trả sai lựa chọn thua lượt đó', async () => {
  const bad = botFile('bad', 'def make_move(state):\n    return "BANANA"\n');
  const r = await play(bad, ROCK);
  assert.equal(r.winsB, 10);
  assert.match(r.turns[0].ea, /không hợp lệ/);
});

test('bot crash khi khởi động: thua mọi lượt, có log lỗi', async () => {
  const crash = botFile('crash', 'raise SystemExit("hỏng")\ndef make_move(state):\n    return "ROCK"\n');
  const r = await play(crash, ROCK);
  assert.equal(r.winsB, 10);
  assert.ok(r.turns.every((t) => t.ea));
});

test('bot thiếu make_move bị báo lỗi', async () => {
  const none = botFile('none', 'x = 1\n');
  const r = await play(none, ROCK);
  assert.match(r.turns[0].ea, /make_move/);
});

test('vòng lặp vô hạn: bot bị dừng, thua các lượt còn lại, trận không treo', async () => {
  const loop = botFile('loop', 'def make_move(state):\n    while True:\n        pass\n');
  const t0 = Date.now();
  const r = await play(loop, ROCK, { turns: 5 });
  assert.equal(r.winsB, 5);
  assert.ok(Date.now() - t0 < 5000);
});

test('vượt CPU mỗi lượt thua lượt đó nhưng bot vẫn chạy tiếp', async () => {
  const slow = botFile('slow', 'import time\ndef make_move(state):\n    if state["turn"] == 0:\n        t = time.process_time()\n        while time.process_time() - t < 0.3:\n            pass\n    return "PAPER"\n');
  const r = await play(slow, ROCK, { turns: 3 });
  assert.match(r.turns[0].ea, /CPU/);
  assert.equal(r.turns[1].r, 'a');
});

test('chặn mạng, tiến trình con và đọc tệp ngoài thư mục bot', async () => {
  const evil = botFile('evil', [
    'def make_move(state):',
    '    t = state["turn"]',
    '    if t == 0:',
    '        import socket',
    '    if t == 1:',
    '        import subprocess',
    '    if t == 2:',
    `        open(${JSON.stringify(ROCK)}).read()`,
    '    if t == 3:',
    '        import os; os.system("echo hi")',
    '    return "PAPER"',
  ].join('\n'));
  const r = await play(evil, ROCK, { turns: 5 });
  for (let i = 0; i < 4; i++) assert.match(r.turns[i].ea || '', /PermissionError/, `lượt ${i}`);
  assert.equal(r.turns[4].r, 'a', 'bot vẫn chạy sau khi bị chặn');
});

test('print của bot vào log, không làm hỏng giao thức', async () => {
  const chatty = botFile('chatty', 'def make_move(state):\n    print("xin chào", state["turn"])\n    return "PAPER"\n');
  const r = await play(chatty, ROCK, { turns: 3 });
  assert.equal(r.winsA, 3);
  assert.match(r.logA, /xin chào 2/);
});

test('giai đoạn giấu dữ liệu: bot không thấy lựa chọn và kết quả của đối thủ', async () => {
  const spy = botFile('spy', 'def make_move(state):\n    assert state["opponent_moves"] is None and state["results"] is None\n    assert len(state["my_moves"]) == state["turn"]\n    return "PAPER"\n');
  const hidden = await play(spy, ROCK, { turns: 4 });
  assert.equal(hidden.winsA, 4);
  const shown = await play(spy, ROCK, { turns: 4, reveal: true });
  assert.ok(shown.turns.slice(1).every((t) => t.ea), 'khi công khai thì assert trong bot thất bại');
});

test('vòng loại trực tiếp: hòa thì đấu phụ, vẫn hòa thì bốc thăm theo seed', async () => {
  const r1 = await play(ROCK, ROCK, { decisive: true, extraTurns: 5, seed: 77 });
  const r2 = await play(ROCK, ROCK, { decisive: true, extraTurns: 5, seed: 77 });
  assert.equal(r1.turns.length, 15);
  assert.equal(r1.decidedBy, 'lot');
  assert.equal(r1.result, r2.result, 'bốc thăm tái lập được');
});

test('cùng seed cho cùng kết quả (bot dùng random)', async () => {
  const rnd = botFile('rnd', 'import random\ndef make_move(state):\n    return random.choice(state["moves"])\n');
  const a = await play(rnd, rnd, { turns: 30, seed: 5 });
  const b = await play(rnd, rnd, { turns: 30, seed: 5 });
  assert.deepEqual(a.turns, b.turns);
});

// ------------------------------------------------------------ luồng giải

const pw = auth.hashPassword('matkhau123');
function makeTeam(i, code) {
  const uid = Number(db.run('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)', `u${i}@t.local`, `U${i}`, pw).lastInsertRowid);
  const tid = Number(db.run('INSERT INTO teams (name, captain_id, invite_code) VALUES (?,?,?)', `T${i}`, uid, `C${i}`).lastInsertRowid);
  db.run('UPDATE users SET team_id = ? WHERE id = ?', tid, uid);
  const team = db.get('SELECT * FROM teams WHERE id = ?', tid);
  const sid = subs.submit({ user: { id: uid }, team, filename: 'b.py', code });
  return { uid, tid, sid };
}
const teams = [];

test('nộp bài: kiểm tra định dạng', () => {
  assert.throws(() => subs.checkFormat('a.txt', 'def make_move(s): pass'), /\.py/);
  assert.throws(() => subs.checkFormat('a.py', 'print(1)'), /make_move/);
  assert.throws(() => subs.checkFormat('a.py', `def make_move(s):\n    pass\n#${'x'.repeat(1024 * 1024)}`), /1 MB/);
});

test('kiểm thử bài nộp: bot tốt hợp lệ, bot trả sai không hợp lệ; bản hợp lệ đầu tiên thành bản thi', async () => {
  const codes = [
    'def make_move(state):\n    return "ROCK"\n',
    'def make_move(state):\n    return "PAPER"\n',
    'def make_move(state):\n    return "SCISSORS"\n',
    'import random\ndef make_move(state):\n    return random.choice(state["moves"])\n',
    'def make_move(state):\n    return state["moves"][state["turn"] % 3]\n',
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
  assert.throws(() => subs.submit({ user: { id: teams[0].uid }, team, filename: 'b.py', code: 'def make_move(state):\n    return "ROCK"\n' }), /trùng/);
  db.setSetting('submissions_open', 'false');
  assert.throws(() => subs.submit({ user: { id: teams[0].uid }, team, filename: 'c.py', code: 'def make_move(state):\n    return "PAPER"\n' }), /khóa/);
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
  const newSid = subs.submit({ user: { id: teams[0].uid }, team, filename: 'v2.py', code: 'def make_move(state):\n    return "PAPER"\n' });
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
    assert.match(mine.code, /ROCK/);

    // Trận chạy thử của đội 1 không xem được từ đội 2.
    const pr = db.get(`SELECT id FROM matches WHERE kind = 'practice' AND team_a = ?`, teams[0].tid);
    assert.equal((await get(`/matches/${pr.id}`, c2)).status, 403);
    assert.equal((await get(`/matches/${pr.id}`, c1)).status, 200);

    // Trận Swiss giấu dữ liệu: người trong trận chỉ thấy lựa chọn của mình; người ngoài không thấy diễn biến.
    const sm = db.get(`SELECT * FROM matches WHERE kind = 'swiss' AND status = 'done' AND team_a = ?`, teams[0].tid)
      || db.get(`SELECT * FROM matches WHERE kind = 'swiss' AND status = 'done' AND team_b = ?`, teams[0].tid);
    if (sm) {
      const v1 = await (await get(`/matches/${sm.id}`, c1)).json();
      assert.ok(v1.turns.every((t) => Object.keys(t).every((k) => ['mine', 'err'].includes(k))));
      assert.equal(v1.logB, undefined);
      const anon = await (await get(`/matches/${sm.id}`)).json();
      assert.equal(anon.turns, undefined);
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
