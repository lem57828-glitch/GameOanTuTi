// Thành tích, tiền thưởng, chứng nhận điện tử và phòng chung kết.
const crypto = require('node:crypto');
const db = require('../db');
const rules = require('../rules');
const { UserError } = require('./submissions');

const STAGES = [
  { key: 'swiss', label: 'Hoàn thành sơ loại Swiss' },
  { key: 'r32', label: 'Vào vòng chính (Top 32)' },
  { key: 'r16', label: 'Vào vòng 16' },
  { key: 'qf', label: 'Vào tứ kết' },
  { key: 'sf', label: 'Vào bán kết' },
  { key: 'final', label: 'Vào chung kết' },
];

const PRIZES = { top32: 200_000, champion: 5_000_000, runnerUp: 3_000_000, semifinal: 1_500_000, side: 800_000 };
const SIDE_AWARDS = { progress: 'Tiến bộ nổi bật', idea: 'Ý tưởng chiến thuật' };

function inPhase(key, teamId) {
  return !!db.get('SELECT 1 FROM series WHERE phase_key = ? AND (team_a = ? OR team_b = ?)', key, teamId, teamId);
}
const loserOf = (s) => (s.winner == null ? null : s.winner === s.team_a ? s.team_b : s.team_a);

/** Thành tích cao nhất của đội; null nếu chưa đủ điều kiện hoàn thành (chỉ đăng ký thì không tính). */
function achievement(teamId) {
  const swissDone = db.get(`SELECT status FROM phases WHERE key = 'swiss'`).status === 'done';
  const played = db.get(`SELECT 1 FROM entries WHERE phase_key = 'swiss' AND team_id = ?`, teamId)
    && db.get(`SELECT 1 FROM matches WHERE kind IN ('swiss','bye') AND (team_a = ? OR team_b = ?)`, teamId, teamId);
  if (!swissDone || !played) return null;
  let label = STAGES[0].label;
  for (const st of STAGES.slice(1)) if (inPhase(st.key, teamId)) label = st.label;
  const fin = db.get(`SELECT * FROM series WHERE phase_key = 'final' AND status = 'done'`);
  if (fin && fin.winner === teamId) label = 'Vô địch';
  else if (fin && loserOf(fin) === teamId) label = 'Á quân';
  return label;
}

/** Tiền thưởng theo đội, cộng dồn. */
function prizes() {
  const out = new Map();
  const add = (teamId, title, amount) => {
    if (teamId == null) return;
    if (!out.has(teamId)) out.set(teamId, { teamId, items: [], total: 0 });
    const t = out.get(teamId);
    t.items.push({ title, amount });
    t.total += amount;
  };
  for (const s of db.all(`SELECT team_a, team_b FROM series WHERE phase_key = 'r32'`)) {
    add(s.team_a, 'Top 32', PRIZES.top32);
    add(s.team_b, 'Top 32', PRIZES.top32);
  }
  for (const s of db.all(`SELECT * FROM series WHERE phase_key = 'sf' AND status = 'done'`)) add(loserOf(s), 'Dừng ở bán kết', PRIZES.semifinal);
  const fin = db.get(`SELECT * FROM series WHERE phase_key = 'final' AND status = 'done'`);
  if (fin) {
    add(fin.winner, 'Giải nhất', PRIZES.champion);
    add(loserOf(fin), 'Giải nhì', PRIZES.runnerUp);
  }
  for (const a of db.all('SELECT * FROM awards')) add(a.team_id, a.title, a.amount);
  const names = new Map(db.all('SELECT id, name FROM teams').map((t) => [t.id, t.name]));
  const list = [...out.values()].map((t) => ({ ...t, name: names.get(t.teamId) })).sort((a, b) => b.total - a.total);
  return { list, total: list.reduce((s, t) => s + t.total, 0) };
}

function setSideAward(key, teamId, note, adminId) {
  if (!SIDE_AWARDS[key]) throw new UserError('Giải phụ không hợp lệ');
  db.tx(() => {
    db.run('DELETE FROM awards WHERE award_key = ?', key);
    if (teamId) db.run('INSERT INTO awards (team_id, award_key, title, amount, note) VALUES (?,?,?,?,?)', teamId, key, SIDE_AWARDS[key], PRIZES.side, note || null);
  });
  db.audit(adminId, 'side_award', { key, teamId, note });
}

/** Cấp (hoặc cập nhật) chứng nhận cho mọi thành viên đủ điều kiện. Mã xác minh giữ nguyên khi cập nhật. */
function issueCertificates(adminId) {
  const pz = new Map(prizes().list.map((p) => [p.teamId, p.items.map((i) => i.title)]));
  let n = 0;
  db.tx(() => {
    for (const team of db.all('SELECT * FROM teams')) {
      const ach = achievement(team.id);
      if (!ach) continue;
      for (const u of db.all('SELECT id, name FROM users WHERE team_id = ?', team.id)) {
        const awards = JSON.stringify(pz.get(team.id) || []);
        const existing = db.get('SELECT code FROM certificates WHERE user_id = ?', u.id);
        if (existing) {
          db.run('UPDATE certificates SET team_id = ?, member_name = ?, team_name = ?, achievement = ?, awards = ?, revoked = 0 WHERE code = ?',
            team.id, u.name, team.name, ach, awards, existing.code);
        } else {
          db.run('INSERT INTO certificates (code, user_id, team_id, member_name, team_name, achievement, awards) VALUES (?,?,?,?,?,?,?)',
            newCode(), u.id, team.id, u.name, team.name, ach, awards);
        }
        n++;
      }
    }
  });
  db.audit(adminId, 'issue_certificates', { count: n });
  return n;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `BA-${s.slice(0, 5)}-${s.slice(5)}`;
}

function verify(code) {
  const c = db.get('SELECT * FROM certificates WHERE code = ?', String(code).toUpperCase());
  if (!c) return null;
  return { ...c, awards: JSON.parse(c.awards || '[]'), competition: db.setting('competition_name', 'BOT ARENA - Cuộc thi Bot Oẳn Tù Tì'), organizer: db.setting('organizer', 'Ban tổ chức BOT ARENA') };
}

// ---------------------------------------------------------------- phòng chung kết

function finalSession() {
  const f = db.get('SELECT * FROM final_session WHERE id = 1');
  if (f && f.status === 'running' && Date.now() >= Date.parse(f.ends_at)) {
    db.run(`UPDATE final_session SET status = 'ended' WHERE id = 1`);
    f.status = 'ended';
  }
  return f ? { ...f, data: f.data_json ? JSON.parse(f.data_json) : null, ruleset: db.ruleset(f.ruleset_id) } : null;
}

/**
 * Soạn luật mới cho chung kết. Dữ liệu thắng/thua lấy từ một trận Swiss đã xác nhận, chọn ngẫu nhiên có ghi nhận.
 */
function configureFinal({ name, moves, beats, description, briefing, durationMin, includeMoves, reveal }, adminId) {
  const cur = finalSession();
  if (cur && cur.status !== 'draft') throw new UserError('Phiên chung kết đã bắt đầu, không sửa luật được');
  const err = rules.validateRuleset({ moves, beats });
  if (err) throw new UserError(err);
  const duration = Number(durationMin) || 75;
  if (duration < 15 || duration > 240) throw new UserError('Thời lượng 15-240 phút');

  const pool = db.all(`SELECT m.id FROM matches m WHERE m.kind = 'swiss' AND m.status = 'done' AND m.confirmed = 1`);
  let data = null;
  if (pool.length) {
    const pick = pool[Math.floor(Math.random() * pool.length)].id;
    const run = db.get(`SELECT turns_json FROM runs WHERE match_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1`, pick);
    const turns = JSON.parse(run.turns_json);
    data = {
      source: `Trận Swiss #${pick} (ẩn tên đội)`,
      note: 'Kết quả từng lượt theo góc nhìn bên A: W thắng, L thua, D hòa. Đây là dữ liệu dưới luật cũ.',
      results: turns.map((t) => (t.r === 'a' ? 'W' : t.r === 'b' ? 'L' : 'D')),
      moves: includeMoves ? turns.map((t) => [t.a, t.b]) : undefined,
    };
  }
  db.tx(() => {
    const rsId = Number(db.run('INSERT INTO rulesets (name, moves, beats, description) VALUES (?,?,?,?)',
      name || 'Luật chung kết', JSON.stringify(moves), JSON.stringify(beats), description || '').lastInsertRowid);
    db.run(`UPDATE phases SET ruleset_id = ?, reveal_opponent = ? WHERE key = 'final'`, rsId, reveal ? 1 : 0);
    db.run(`INSERT INTO final_session (id, ruleset_id, briefing, data_json, duration_min, status) VALUES (1,?,?,?,?, 'draft')
      ON CONFLICT(id) DO UPDATE SET ruleset_id = excluded.ruleset_id, briefing = excluded.briefing, data_json = excluded.data_json,
      duration_min = excluded.duration_min`, rsId, briefing || '', data ? JSON.stringify(data) : null, duration);
  });
  db.audit(adminId, 'configure_final', { moves, beats, duration, dataSource: data && data.source });
}

function startFinal(adminId) {
  const f = finalSession();
  if (!f) throw new UserError('Chưa soạn luật chung kết');
  if (f.status !== 'draft') throw new UserError('Phiên đã bắt đầu');
  const s = db.get(`SELECT * FROM series WHERE phase_key = 'final' AND slot = 0`);
  if (!s || s.team_a == null || s.team_b == null) throw new UserError('Chưa xác định hai đội chung kết');
  // Giờ máy chủ quyết định hạn nộp, không dựa vào đồng hồ trình duyệt.
  const start = new Date();
  const end = new Date(start.getTime() + f.duration_min * 60_000);
  db.run(`UPDATE final_session SET status = 'running', started_at = ?, ends_at = ? WHERE id = 1`, start.toISOString(), end.toISOString());
  db.audit(adminId, 'start_final', { ends_at: end.toISOString() });
}

function endFinal(adminId) {
  db.run(`UPDATE final_session SET status = 'ended', ends_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1 AND status = 'running'`);
  db.audit(adminId, 'end_final', null);
}

module.exports = { achievement, prizes, setSideAward, issueCertificates, verify, finalSession, configureFinal, startFinal, endFinal, PRIZES, SIDE_AWARDS };
