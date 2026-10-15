// Thách đấu giữa hai đội: đội A mời, đội B đồng ý và chọn phiên bản bot của mình, rồi hệ thống chạy một trận
// 2 ván đổi màu như trận thật. Không tính điểm giải; chỉ hai đội (và quản trị) xem được diễn biến.
const db = require('../db');
const config = require('../config');
const { UserError } = require('./submissions');

const PER_DAY = 10;                 // số lời thách đấu một đội gửi được mỗi ngày
const EXPIRE_MS = 24 * 3600_000;    // lời mời quá 24 giờ chưa trả lời thì hết hạn

const teamName = (id) => db.get('SELECT name FROM teams WHERE id = ?', id)?.name;

function expireOld() {
  db.run(`UPDATE challenges SET status = 'expired' WHERE status = 'pending' AND created_at < ?`, new Date(Date.now() - EXPIRE_MS).toISOString());
}

function ensureOpen() {
  if (db.setting('challenges_open') !== 'true') throw new UserError('Ban tổ chức đang tạm khóa thách đấu', 403);
}

/** Bản bot hợp lệ của đội, thuộc bộ luật thường (không dùng bản nộp riêng cho chung kết). */
function validSub(teamId, subId) {
  const s = db.get(`SELECT * FROM submissions WHERE id = ? AND team_id = ? AND status = 'valid' AND phase_key = 'main'`, subId, teamId);
  if (!s) throw new UserError('Chọn một phiên bản bot hợp lệ của đội');
  return s;
}

function overview(team) {
  expireOld();
  const row = (c) => ({
    id: c.id, status: c.status, created_at: c.created_at, responded_at: c.responded_at,
    from: { id: c.from_team, name: teamName(c.from_team) }, to: { id: c.to_team, name: teamName(c.to_team) },
    fromVersion: db.get('SELECT version FROM submissions WHERE id = ?', c.from_sub)?.version,
    toVersion: c.to_sub ? db.get('SELECT version FROM submissions WHERE id = ?', c.to_sub)?.version : null,
    match: c.match_id ? db.get('SELECT id, status, result, wins_a, wins_b, draws FROM matches WHERE id = ?', c.match_id) : null,
  });
  return {
    open: db.setting('challenges_open') === 'true',
    perDay: PER_DAY,
    sentToday: db.get(`SELECT COUNT(*) AS n FROM challenges WHERE from_team = ? AND date(created_at) = date('now')`, team.id).n,
    // Đối thủ có thể thách: đội khác, chưa rút, có bản thi hợp lệ.
    teams: db.all(`SELECT t.id, t.name FROM teams t JOIN submissions s ON s.id = t.official_submission_id AND s.status = 'valid'
      WHERE t.id != ? AND t.withdrawn = 0 ORDER BY t.name`, team.id),
    incoming: db.all(`SELECT * FROM challenges WHERE to_team = ? AND status = 'pending' ORDER BY id DESC`, team.id).map(row),
    outgoing: db.all(`SELECT * FROM challenges WHERE from_team = ? AND status = 'pending' ORDER BY id DESC`, team.id).map(row),
    history: db.all(`SELECT * FROM challenges WHERE (from_team = ? OR to_team = ?) AND status != 'pending' ORDER BY id DESC LIMIT 30`, team.id, team.id).map(row),
  };
}

function send({ user, team, toTeamId, submissionId }) {
  ensureOpen();
  expireOld();
  if (team.withdrawn) throw new UserError('Đội đã rút khỏi cuộc thi');
  if (toTeamId === team.id) throw new UserError('Không thể tự thách đấu đội mình');
  const target = db.get('SELECT * FROM teams WHERE id = ? AND withdrawn = 0', toTeamId);
  if (!target) throw new UserError('Không tìm thấy đội được thách đấu', 404);
  if (!target.official_submission_id) throw new UserError('Đội này chưa có bot hợp lệ');
  validSub(team.id, submissionId || team.official_submission_id);
  const sent = db.get(`SELECT COUNT(*) AS n FROM challenges WHERE from_team = ? AND date(created_at) = date('now')`, team.id).n;
  if (sent >= PER_DAY) throw new UserError(`Mỗi đội gửi tối đa ${PER_DAY} lời thách đấu mỗi ngày`, 429);
  if (db.get(`SELECT 1 FROM challenges WHERE status = 'pending' AND ((from_team = ? AND to_team = ?) OR (from_team = ? AND to_team = ?))`,
    team.id, toTeamId, toTeamId, team.id)) throw new UserError('Hai đội đang có một lời thách đấu chờ trả lời');
  const id = db.run('INSERT INTO challenges (from_team, to_team, from_sub, created_by) VALUES (?,?,?,?)',
    team.id, toTeamId, submissionId || team.official_submission_id, user.id).lastInsertRowid;
  db.audit(user.id, 'challenge_send', { from: team.id, to: toTeamId, challenge: Number(id) });
  return Number(id);
}

function pending(id) {
  expireOld();
  const c = db.get('SELECT * FROM challenges WHERE id = ?', id);
  if (!c) throw new UserError('Không có lời thách đấu này', 404);
  if (c.status !== 'pending') throw new UserError('Lời thách đấu không còn chờ trả lời');
  return c;
}

function accept({ user, team, id, submissionId }) {
  ensureOpen();
  const c = pending(id);
  if (c.to_team !== team.id) throw new UserError('Chỉ đội được thách đấu mới đồng ý được', 403);
  const toSub = validSub(team.id, submissionId || team.official_submission_id);
  const T = require('./tournament');
  const ruleset = db.get(`SELECT ruleset_id FROM phases WHERE key = 'swiss'`).ruleset_id;
  return db.tx(() => {
    const matchId = T.createMatch({ kind: 'challenge', team_a: c.from_team, team_b: c.to_team, sub_a: c.from_sub, sub_b: toSub.id,
      ruleset_id: ruleset, games: config.match.games, requested_by: user.id });
    db.run(`UPDATE challenges SET status = 'accepted', to_sub = ?, match_id = ?, responded_by = ?, responded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      toSub.id, matchId, user.id, c.id);
    db.audit(user.id, 'challenge_accept', { challenge: c.id, match: matchId });
    return matchId;
  });
}

function decline({ user, team, id }) {
  const c = pending(id);
  if (c.to_team !== team.id) throw new UserError('Chỉ đội được thách đấu mới từ chối được', 403);
  db.run(`UPDATE challenges SET status = 'declined', responded_by = ?, responded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, user.id, c.id);
}

function cancel({ team, id }) {
  const c = pending(id);
  if (c.from_team !== team.id) throw new UserError('Chỉ đội gửi mới hủy được', 403);
  db.run(`UPDATE challenges SET status = 'cancelled' WHERE id = ?`, c.id);
}

module.exports = { overview, send, accept, decline, cancel, PER_DAY };
