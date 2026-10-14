const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const db = require('../db');
const config = require('../config');
const auth = require('../auth');
const queue = require('../services/queue');
const T = require('../services/tournament');
const R = require('../services/results');
const play = require('../services/play');
const subs = require('../services/submissions');
const board = require('../game/board');

const { UserError } = subs;
const api = express.Router();
api.use(express.json({ limit: '2mb' }));
api.use(auth.loadUser);

// Bọc handler: lỗi người dùng trả 4xx, lỗi khác 500.
const h = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.then((v) => v !== undefined && res.json(v)).catch((e) => sendError(res, e));
    else if (out !== undefined) res.json(out);
  } catch (e) { sendError(res, e); }
};
function sendError(res, e) {
  if (e instanceof UserError) return res.status(e.status).json({ error: e.message });
  if (/UNIQUE constraint failed/.test(e.message)) return res.status(409).json({ error: 'Dữ liệu đã tồn tại' });
  console.error(e);
  res.status(500).json({ error: 'Lỗi máy chủ' });
}
const need = (cond, msg, status = 400) => { if (!cond) throw new UserError(msg, status); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const teamName = (id) => (id == null ? null : db.get('SELECT name FROM teams WHERE id = ?', id)?.name ?? null);
const isAdmin = (req) => req.user && req.user.role === 'admin';

// Chống dò mật khẩu. Chỉ đếm lần đăng nhập SAI, vì cả phòng thi/sự kiện thường dùng chung một IP:
// mỗi tài khoản tối đa 5 lần sai/15 phút, mỗi IP tối đa 50 lần sai/phút. Đăng ký: mỗi IP 60 tài khoản/10 phút.
const buckets = new Map();
function hits(key, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  buckets.set(key, list);
  return list;
}
const record = (key) => buckets.get(key).push(Date.now());
const LOGIN_FAIL = { perEmail: [5, 15 * 60_000], perIp: [50, 60_000] };
const REGISTER = [60, 10 * 60_000];
setInterval(() => { for (const [k, v] of buckets) if (!v.length || Date.now() - v[v.length - 1] > 15 * 60_000) buckets.delete(k); }, 5 * 60_000).unref();

// ================================================================ công khai

api.get('/overview', h(() => {
  const phases = db.all('SELECT key, title, status FROM phases ORDER BY ord');
  const fin = R.finalSession();
  return {
    competition: db.setting('competition_name', 'BOT ARENA'),
    submissionsOpen: db.setting('submissions_open') === 'true',
    practiceOpen: db.setting('practice_open') === 'true',
    currentPhase: db.setting('current_phase'),
    phases,
    stats: {
      users: db.get(`SELECT COUNT(*) AS n FROM users WHERE role = 'student'`).n,
      teams: db.get('SELECT COUNT(*) AS n FROM teams WHERE withdrawn = 0').n,
      validBots: db.get(`SELECT COUNT(*) AS n FROM teams t JOIN submissions s ON s.id = t.official_submission_id AND s.status = 'valid'`).n,
      matches: db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind IN ('swiss','knockout','tiebreak') AND status = 'done'`).n,
    },
    prizeFund: 19_000_000,
    announcements: db.all('SELECT * FROM announcements ORDER BY id DESC LIMIT 10'),
    final: fin ? { status: fin.status, startedAt: fin.started_at, endsAt: fin.ends_at } : null,
    limits: config.limits,
    match: config.match,
    swissRounds: Number(db.setting('swiss_rounds')),
    serverTime: new Date().toISOString(),
  };
}));

api.get('/rules', h(() => {
  const rs = db.ruleset(db.get(`SELECT ruleset_id FROM phases WHERE key = 'swiss'`).ruleset_id);
  return { ruleset: rs, sampleBots: subs.SAMPLE_BOTS, prizes: R.PRIZES, swiss: config.swiss, match: config.match,
    setup: board.initialPieces(), goals: board.GOAL };
}));

api.get('/sample-bots/:name', (req, res) => {
  const name = req.params.name;
  if (!(name in subs.SAMPLE_BOTS) && name !== 'starter_bot') return res.status(404).end();
  res.type('text/x-python').attachment(`${name}.py`).send(fs.readFileSync(subs.samplePath(name), 'utf8'));
});

api.get('/standings', h(() => T.swissStandings()));
api.get('/bracket', h(() => T.bracket()));
api.get('/prizes', h(() => R.prizes()));

api.get('/verify/:code', h((req) => {
  const c = R.verify(req.params.code);
  need(c, 'Không tìm thấy chứng nhận', 404);
  return { code: c.code, member: c.member_name, team: c.team_name, achievement: c.achievement, awards: c.awards,
    competition: c.competition, organizer: c.organizer, issuedAt: c.issued_at, revoked: !!c.revoked };
}));

/**
 * Chi tiết trận theo quyền dữ liệu (bàn cờ):
 * - Quản trị: toàn bộ diễn biến, lỗi và log hai bên.
 * - Đội trong trận: toàn bộ diễn biến (bàn cờ vốn công khai với hai bên), chỉ thấy lỗi và log của bot mình.
 * - Người ngoài: kết quả từng ván; diễn biến chỉ công khai ở giai đoạn bật "công khai" (mặc định chung kết).
 */
api.get('/matches/:id', h((req) => {
  const m = db.get('SELECT * FROM matches WHERE id = ?', req.params.id);
  need(m, 'Không có trận này', 404);
  const my = req.team && req.team.id;
  const side = my && m.team_a === my ? 'a' : my && m.team_b === my ? 'b' : null;
  if (m.kind === 'practice') need(isAdmin(req) || side === 'a', 'Không có quyền xem trận chạy thử của đội khác', 403);
  const run = db.get(`SELECT * FROM runs WHERE match_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1`, m.id);
  const out = {
    id: m.id, kind: m.kind, phase: m.phase_key, round: m.round_no, game: m.game_no, status: m.status,
    teamA: m.team_a, teamB: m.team_b, nameA: teamName(m.team_a), nameB: m.sample_bot ? `Bot mẫu: ${subs.SAMPLE_BOTS[m.sample_bot]}` : teamName(m.team_b),
    winsA: m.wins_a, winsB: m.wins_b, draws: m.draws, result: m.result, decidedBy: m.decided_by, extraGames: m.extra_turns_used,
    confirmed: !!m.confirmed, finishedAt: m.finished_at, side, reveal: !!m.reveal_opponent, seed: isAdmin(req) ? m.seed : undefined,
    ruleset: db.ruleset(m.ruleset_id), setup: board.initialPieces(), goals: board.GOAL,
  };
  if (!run) return out;
  const games = JSON.parse(run.turns_json);
  const admin = isAdmin(req);
  const full = admin || side || m.reveal_opponent;
  out.games = games.map((g) => {
    const base = { blue: g.blue, result: g.result, reason: g.reason, plies: g.plies, pieces: g.pieces };
    if (!full) return base;
    // Lỗi của bot đối thủ là thông tin riêng của đội đó.
    const mine = side && (g.blue === side ? 'blue' : 'pink');
    const moves = g.moves.map((mv) => (admin || mv.side === mine ? mv : { ...mv, err: mv.err ? 'lỗi' : undefined }));
    return { ...base, moves };
  });
  if (!full) out.hiddenNote = 'Diễn biến trận ở giai đoạn này chỉ hiển thị cho hai đội trong trận.';
  if (admin) { out.logA = run.log_a; out.logB = run.log_b; out.runs = db.all('SELECT id, attempt, status, worker, started_at, finished_at, error FROM runs WHERE match_id = ?', m.id); }
  else if (side) out.myLog = side === 'a' ? run.log_a : run.log_b;
  return out;
}));

// ================================================================ tài khoản

api.post('/auth/register', h((req, res) => {
  const ipKey = `reg:${req.ip}`;
  need(hits(ipKey, REGISTER[1]).length < REGISTER[0], 'Có quá nhiều tài khoản được tạo từ mạng này, thử lại sau ít phút', 429);
  const email = str(req.body.email, 120).toLowerCase();
  const name = str(req.body.name, 80);
  const password = String(req.body.password || '');
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Email không hợp lệ');
  need(name.length >= 2, 'Nhập họ tên');
  need(password.length >= 8, 'Mật khẩu tối thiểu 8 ký tự');
  need(password.length <= 200, 'Mật khẩu tối đa 200 ký tự');
  need(!db.get('SELECT 1 FROM users WHERE email = ?', email), 'Email đã được đăng ký', 409);
  const id = db.run('INSERT INTO users (email, name, student_id, school, password_hash) VALUES (?,?,?,?,?)',
    email, name, str(req.body.student_id, 30), str(req.body.school, 120), auth.hashPassword(password)).lastInsertRowid;
  record(ipKey);
  auth.setSession(res, Number(id));
  return { ok: true };
}));

api.post('/auth/login', h((req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const emailKey = `fail:${email}`, ipKey = `failip:${req.ip}`;
  need(hits(emailKey, LOGIN_FAIL.perEmail[1]).length < LOGIN_FAIL.perEmail[0], 'Tài khoản này nhập sai quá nhiều lần, thử lại sau 15 phút', 429);
  need(hits(ipKey, LOGIN_FAIL.perIp[1]).length < LOGIN_FAIL.perIp[0], 'Có quá nhiều lần đăng nhập sai từ mạng này, chờ 1 phút', 429);
  const u = password.length <= 200 && db.get('SELECT * FROM users WHERE email = ?', email);
  if (!u || !auth.checkPassword(password, u.password_hash)) {
    record(emailKey);
    record(ipKey);
    throw new UserError('Sai email hoặc mật khẩu', 401);
  }
  buckets.delete(emailKey);
  auth.setSession(res, u.id);
  return { ok: true };
}));

api.post('/auth/logout', h((req, res) => { auth.clearSession(res); return { ok: true }; }));

api.get('/me', h((req) => {
  if (!req.user) return { user: null };
  const team = req.team && {
    ...req.team,
    invite_code: req.team.captain_id === req.user.id ? req.team.invite_code : undefined,
    members: db.all('SELECT id, name, email, student_id FROM users WHERE team_id = ?', req.team.id),
    isCaptain: req.team.captain_id === req.user.id,
    achievement: R.achievement(req.team.id),
  };
  const certificate = db.get('SELECT code, achievement FROM certificates WHERE user_id = ? AND revoked = 0', req.user.id);
  const fin = R.finalSession();
  const finalist = !!(req.team && db.get(`SELECT 1 FROM series WHERE phase_key = 'final' AND (team_a = ? OR team_b = ?)`, req.team.id, req.team.id));
  return { user: req.user, team, certificate, finalist, finalRunning: fin && fin.status === 'running' };
}));

// ================================================================ đội

const teamsLocked = () => db.get(`SELECT status FROM phases WHERE key = 'swiss'`).status !== 'pending';
const inviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

api.post('/teams', auth.requireUser, h((req) => {
  need(!req.user.team_id, 'Bạn đã thuộc một đội');
  need(!teamsLocked(), 'Đã khóa thành lập đội');
  const name = str(req.body.name, 60);
  need(name.length >= 2, 'Tên đội tối thiểu 2 ký tự');
  db.tx(() => {
    const id = db.run('INSERT INTO teams (name, captain_id, invite_code) VALUES (?,?,?)', name, req.user.id, inviteCode()).lastInsertRowid;
    db.run('UPDATE users SET team_id = ? WHERE id = ?', id, req.user.id);
  });
  return { ok: true };
}));

api.post('/teams/join', auth.requireUser, h((req) => {
  need(!req.user.team_id, 'Bạn đã thuộc một đội');
  need(!teamsLocked(), 'Đã khóa thay đổi thành viên');
  const t = db.get('SELECT * FROM teams WHERE invite_code = ?', str(req.body.code, 20).toUpperCase());
  need(t, 'Mã mời không đúng', 404);
  need(db.get('SELECT COUNT(*) AS n FROM users WHERE team_id = ?', t.id).n < 3, 'Đội đã đủ 3 thành viên');
  db.run('UPDATE users SET team_id = ? WHERE id = ?', t.id, req.user.id);
  return { ok: true, team: t.name };
}));

api.post('/teams/leave', auth.requireTeam, h((req) => {
  need(!teamsLocked(), 'Đã khóa thay đổi thành viên');
  const members = db.all('SELECT id FROM users WHERE team_id = ?', req.team.id);
  need(req.team.captain_id !== req.user.id || members.length === 1, 'Đội trưởng cần chuyển quyền hoặc mời thành viên rời trước');
  db.tx(() => {
    db.run('UPDATE users SET team_id = NULL WHERE id = ?', req.user.id);
    if (members.length === 1 && !db.get('SELECT 1 FROM submissions WHERE team_id = ?', req.team.id)) db.run('DELETE FROM teams WHERE id = ?', req.team.id);
  });
  return { ok: true };
}));

api.post('/teams/kick', auth.requireTeam, auth.requireCaptain, h((req) => {
  need(!teamsLocked(), 'Đã khóa thay đổi thành viên');
  const uid = Number(req.body.userId);
  need(uid !== req.user.id, 'Không thể tự mời mình rời đội');
  db.run('UPDATE users SET team_id = NULL WHERE id = ? AND team_id = ?', uid, req.team.id);
  return { ok: true };
}));

api.post('/teams/captain', auth.requireTeam, auth.requireCaptain, h((req) => {
  const uid = Number(req.body.userId);
  need(db.get('SELECT 1 FROM users WHERE id = ? AND team_id = ?', uid, req.team.id), 'Không phải thành viên đội');
  db.run('UPDATE teams SET captain_id = ? WHERE id = ?', uid, req.team.id);
  return { ok: true };
}));

api.post('/teams/invite', auth.requireTeam, auth.requireCaptain, h((req) => {
  db.run('UPDATE teams SET invite_code = ? WHERE id = ?', inviteCode(), req.team.id);
  return { ok: true };
}));

// ================================================================ bot của tôi

api.get('/bots', auth.requireTeam, h((req) => ({
  official: req.team.official_submission_id,
  locked: db.all('SELECT phase_key, submission_id FROM entries WHERE team_id = ?', req.team.id),
  submissions: db.all(`SELECT s.id, s.version, s.filename, s.sha256, s.size, s.status, s.phase_key, s.created_at, s.env_version, u.name AS submitter
    FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.team_id = ? ORDER BY s.id DESC`, req.team.id),
  queue: queue.stats(),
})));

api.get('/bots/:id', auth.requireTeam, h((req) => {
  const s = db.get('SELECT * FROM submissions WHERE id = ? AND team_id = ?', req.params.id, req.team.id);
  need(s, 'Không có phiên bản này', 404);
  return { ...s, path: undefined, code: fs.readFileSync(s.path, 'utf8') };
}));

api.post('/bots', auth.requireTeam, h((req) => {
  const id = subs.submit({ user: req.user, team: req.team, filename: str(req.body.filename, 100), code: String(req.body.code || '') });
  return { id };
}));

api.post('/bots/:id/official', auth.requireTeam, auth.requireCaptain, h((req) => {
  const s = db.get('SELECT * FROM submissions WHERE id = ? AND team_id = ?', req.params.id, req.team.id);
  need(s, 'Không có phiên bản này', 404);
  need(s.status === 'valid', 'Chỉ chọn được bản đã hợp lệ');
  db.run('UPDATE teams SET official_submission_id = ? WHERE id = ?', s.id, req.team.id);
  db.audit(req.user.id, 'choose_official', { team: req.team.id, submission: s.id, version: s.version });
  return { ok: true };
}));

// ================================================================ chạy thử & chơi thử

api.get('/practice', auth.requireTeam, h((req) => ({
  used: db.get(`SELECT COUNT(*) AS n FROM matches WHERE kind = 'practice' AND team_a = ? AND date(created_at) = date('now')`, req.team.id).n,
  limit: config.limits.practicePerDay,
  sampleBots: subs.SAMPLE_BOTS,
  matches: db.all(`SELECT m.id, m.sample_bot, m.status, m.result, m.wins_a, m.wins_b, m.draws, m.created_at, s.version
    FROM matches m JOIN submissions s ON s.id = m.sub_a WHERE m.kind = 'practice' AND m.team_a = ? ORDER BY m.id DESC LIMIT 30`, req.team.id),
})));

api.post('/practice', auth.requireTeam, h((req) => {
  const sampleBot = str(req.body.sampleBot, 40);
  need(sampleBot in subs.SAMPLE_BOTS, 'Chọn bot mẫu');
  return { id: T.requestPractice({ user: req.user, team: req.team, sampleBot, submissionId: Number(req.body.submissionId) || null }) };
}));

api.get('/play', auth.requireUser, h((req) => ({ game: play.current(req.user.id) })));
api.post('/play', auth.requireUser, h((req) => play.start(req.user.id, req.team && req.team.id, str(req.body.bot, 40), str(req.body.color, 10))));
api.delete('/play/:id', auth.requireUser, h((req) => { play.abandon(req.user.id, Number(req.params.id)); return { ok: true }; }));
api.post('/play/:id', auth.requireUser, h((req) => play.move(req.user.id, Number(req.params.id), { from: str(req.body.from, 3), to: str(req.body.to, 3) })));

api.get('/team/matches', auth.requireTeam, h((req) => db.all(`SELECT id, kind, phase_key, round_no, game_no, team_a, team_b, status, result,
    wins_a, wins_b, draws, decided_by, confirmed FROM matches WHERE kind IN ('swiss','bye','tiebreak','knockout') AND (team_a = ? OR team_b = ?)
    ORDER BY id DESC`, req.team.id, req.team.id).map((m) => ({ ...m, name_a: teamName(m.team_a), name_b: teamName(m.team_b) }))));

// ================================================================ phòng chung kết

api.get('/final', h((req) => {
  const f = R.finalSession();
  const s = db.get(`SELECT * FROM series WHERE phase_key = 'final' AND slot = 0`);
  const base = { status: f ? f.status : 'none', startedAt: f?.started_at, endsAt: f?.ends_at, durationMin: f?.duration_min,
    serverTime: new Date().toISOString(), teams: s ? [teamName(s.team_a), teamName(s.team_b)] : [],
    setup: board.initialPieces(), goals: board.GOAL };
  if (!f) return base;
  const finalist = req.team && s && (s.team_a === req.team.id || s.team_b === req.team.id);
  const finalDone = db.get(`SELECT status FROM phases WHERE key = 'final'`).status === 'done';
  // Luật mới và dữ liệu chỉ phát cho hai đội chung kết khi phiên bắt đầu; công khai sau khi chung kết xong.
  if (isAdmin(req) || (finalist && f.status !== 'draft') || finalDone) {
    Object.assign(base, { ruleset: f.ruleset, briefing: f.briefing, data: f.data,
      reveal: !!db.get(`SELECT reveal_opponent FROM phases WHERE key = 'final'`).reveal_opponent });
  }
  if (finalist) {
    base.finalist = true;
    base.submissions = db.all(`SELECT id, version, status, created_at FROM submissions WHERE team_id = ? AND phase_key = 'final' ORDER BY id DESC`, req.team.id);
    base.official = req.team.official_submission_id;
  }
  return base;
}));

// ================================================================ hỗ trợ

api.get('/tickets', auth.requireUser, h((req) => db.all('SELECT * FROM tickets WHERE user_id = ? ORDER BY id DESC', req.user.id)));
api.post('/tickets', auth.requireUser, h((req) => {
  const subject = str(req.body.subject, 120), body = str(req.body.body, 4000);
  need(subject && body, 'Nhập tiêu đề và nội dung');
  db.run('INSERT INTO tickets (user_id, team_id, match_id, subject, body) VALUES (?,?,?,?,?)',
    req.user.id, req.user.team_id, Number(req.body.matchId) || null, subject, body);
  return { ok: true };
}));

// ================================================================ quản trị

const admin = express.Router();
admin.use(auth.requireAdmin);
api.use('/admin', admin);

admin.get('/overview', h(() => ({
  queue: queue.stats(),
  phases: db.all('SELECT p.*, r.name AS ruleset_name FROM phases p JOIN rulesets r ON r.id = p.ruleset_id ORDER BY ord'),
  settings: Object.fromEntries(db.all('SELECT key, value FROM settings').filter((s) => !['cut_state', 'qualified'].includes(s.key)).map((s) => [s.key, s.value])),
  swissRound: db.get(`SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')`).r || 0,
  rounds: db.all(`SELECT round_no, COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'error') AS errors, MIN(confirmed) AS confirmed
    FROM matches WHERE kind IN ('swiss','bye') GROUP BY round_no ORDER BY round_no`),
  cut: db.jsonSetting('cut_state'),
  failedJobs: db.all(`SELECT * FROM jobs WHERE status = 'failed' ORDER BY id DESC LIMIT 20`),
  sandbox: config.SANDBOX,
})));

admin.get('/teams', h(() => db.all(`SELECT t.id, t.name, t.withdrawn, t.created_at, u.name AS captain,
    (SELECT COUNT(*) FROM users WHERE team_id = t.id) AS members,
    (SELECT COUNT(*) FROM submissions WHERE team_id = t.id) AS submissions,
    s.version AS official_version, s.status AS official_status
  FROM teams t JOIN users u ON u.id = t.captain_id LEFT JOIN submissions s ON s.id = t.official_submission_id ORDER BY t.id`)));

admin.post('/teams/:id/withdraw', h((req) => {
  db.run('UPDATE teams SET withdrawn = ? WHERE id = ?', req.body.withdrawn ? 1 : 0, req.params.id);
  db.audit(req.user.id, 'withdraw_team', { team: Number(req.params.id), withdrawn: !!req.body.withdrawn });
  return { ok: true };
}));

const EDITABLE = ['submissions_open', 'practice_open', 'swiss_rounds', 'competition_name', 'organizer'];
admin.post('/settings', h((req) => {
  const key = str(req.body.key, 40);
  need(EDITABLE.includes(key), 'Không sửa được khóa này');
  if (key === 'swiss_rounds') {
    const n = Number(req.body.value);
    need(Number.isInteger(n) && n >= 1 && n <= 20, 'Số vòng 1-20');
    need(n >= (db.get(`SELECT MAX(round_no) AS r FROM matches WHERE kind IN ('swiss','bye')`).r || 0), 'Không nhỏ hơn số vòng đã chạy');
  }
  db.setSetting(key, str(req.body.value, 200));
  db.audit(req.user.id, 'setting', { key, value: req.body.value });
  return { ok: true };
}));

admin.post('/phases/:key/lock', h((req) => ({ teams: T.lockPhase(req.params.key, req.user.id) })));
admin.post('/phases/:key/start', h((req) => { T.startPhase(req.params.key, req.user.id); return { ok: true }; }));
admin.post('/swiss/round', h((req) => T.startSwissRound(req.user.id)));
admin.post('/swiss/confirm', h((req) => { T.confirmRound(Number(req.body.round), req.user.id); return { ok: true }; }));
admin.post('/swiss/finish', h((req) => { T.finishSwiss(req.user.id); return { ok: true }; }));

admin.get('/matches', h((req) => {
  const where = ["kind != 'practice'"], params = [];
  if (req.query.phase) { where.push('phase_key = ?'); params.push(req.query.phase); }
  if (req.query.round) { where.push('round_no = ?'); params.push(Number(req.query.round)); }
  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  return db.all(`SELECT id, kind, phase_key, round_no, game_no, team_a, team_b, status, result, wins_a, wins_b, draws, decided_by, confirmed
    FROM matches WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 300`, ...params)
    .map((m) => ({ ...m, name_a: teamName(m.team_a), name_b: teamName(m.team_b) }));
}));
admin.post('/matches/:id/rerun', h((req) => { T.rerunMatch(Number(req.params.id), req.user.id); return { ok: true }; }));

admin.post('/final/configure', h((req) => {
  const b = req.body;
  R.configureFinal({ name: str(b.name, 80), moves: b.moves, beats: b.beats, description: str(b.description, 2000),
    briefing: str(b.briefing, 4000), durationMin: b.durationMin, includeMoves: !!b.includeMoves, reveal: !!b.reveal }, req.user.id);
  return { ok: true };
}));
admin.post('/final/start', h((req) => { R.startFinal(req.user.id); return { ok: true }; }));
admin.post('/final/end', h((req) => { R.endFinal(req.user.id); return { ok: true }; }));

admin.post('/awards', h((req) => { R.setSideAward(str(req.body.key, 20), Number(req.body.teamId) || null, str(req.body.note, 500), req.user.id); return { ok: true }; }));
admin.post('/certificates/issue', h((req) => ({ issued: R.issueCertificates(req.user.id) })));
admin.get('/certificates', h(() => db.all('SELECT * FROM certificates ORDER BY team_name, member_name')));

admin.post('/announcements', h((req) => {
  const title = str(req.body.title, 120), body = str(req.body.body, 4000);
  need(title && body, 'Nhập tiêu đề và nội dung');
  db.run('INSERT INTO announcements (title, body) VALUES (?,?)', title, body);
  return { ok: true };
}));
admin.delete('/announcements/:id', h((req) => { db.run('DELETE FROM announcements WHERE id = ?', req.params.id); return { ok: true }; }));

admin.get('/tickets', h(() => db.all(`SELECT k.*, u.name AS user_name, t.name AS team_name FROM tickets k
  JOIN users u ON u.id = k.user_id LEFT JOIN teams t ON t.id = k.team_id ORDER BY k.status = 'closed', k.id DESC`)));
admin.post('/tickets/:id', h((req) => {
  db.run('UPDATE tickets SET reply = ?, status = ? WHERE id = ?', str(req.body.reply, 4000), req.body.status === 'closed' ? 'closed' : 'answered', req.params.id);
  db.audit(req.user.id, 'ticket_reply', { ticket: Number(req.params.id) });
  return { ok: true };
}));

admin.get('/audit', h(() => db.all(`SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300`)));

module.exports = api;
