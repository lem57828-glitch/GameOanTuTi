// Nộp bài: kiểm tra định dạng → lưu kèm mã băm → kiểm thử cách ly trong hàng đợi → hợp lệ/không hợp lệ.
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const queue = require('./queue');
const { runMatch } = require('../runner/match');
const { newSeed } = require('../rules');

const SAMPLE_DIR = path.join(config.ROOT, 'sample-bots');
const SAMPLE_BOTS = {
  random_bot: 'Ngẫu nhiên',
  greedy_bot: 'Tham ăn (ăn quân khi được)',
  rusher_bot: 'Lao về đích',
  smart_bot: 'Nhìn trước một nước',
};
const samplePath = (name) => path.join(SAMPLE_DIR, `${name}.py`);
// Bài cũ có đường dẫn Windows tuyệt đối; định vị lại sau khi chuyển sang Linux.
const { materialize: botPath, readSource } = require('../bot-source');

let envVersion;
function environmentVersion() {
  if (!envVersion) {
    let py = 'python ?';
    try {
      py = require('node:child_process').execFileSync(config.PYTHON_BIN, ['--version'], { encoding: 'utf8' }).trim();
    } catch { /* ghi nhận là không xác định */ }
    envVersion = `${py}; sandbox=${config.SANDBOX}; node ${process.version}`;
  }
  return envVersion;
}

class UserError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

function checkFormat(filename, code) {
  if (!/\.py$/i.test(filename || '')) throw new UserError('Chỉ nhận tệp Python .py');
  const size = Buffer.byteLength(code || '', 'utf8');
  if (!size) throw new UserError('Tệp rỗng');
  if (size > config.limits.codeBytes) throw new UserError('Tệp vượt quá 1 MB');
  if (!/^\s*def\s+make_move\s*\(/m.test(code)) throw new UserError('Không tìm thấy hàm make_move(state)');
  return size;
}

/** Bản nộp nhắm tới giai đoạn nào: trong phiên chung kết, đội chung kết nộp bản 'final'. */
function targetPhase(teamId) {
  const fs_ = db.get('SELECT status FROM final_session WHERE id = 1');
  if (fs_ && fs_.status === 'running') {
    const finalist = db.get(`SELECT 1 FROM series WHERE phase_key = 'final' AND (team_a = ? OR team_b = ?)`, teamId, teamId);
    if (finalist) return 'final';
  }
  return 'main';
}

function submit({ user, team, filename, code }) {
  const phaseKey = targetPhase(team.id);
  if (phaseKey === 'main' && db.setting('submissions_open') !== 'true') throw new UserError('Đang khóa nộp bài', 403);
  if (phaseKey === 'final') {
    const fsn = db.get('SELECT ends_at FROM final_session WHERE id = 1');
    if (Date.now() > Date.parse(fsn.ends_at)) throw new UserError('Đã hết giờ phiên chung kết', 403);
  }
  const size = checkFormat(filename, code);
  const sha = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  const dup = db.get('SELECT version FROM submissions WHERE team_id = ? AND sha256 = ? AND phase_key = ?', team.id, sha, phaseKey);
  if (dup) throw new UserError(`Nội dung trùng với phiên bản v${dup.version}`);

  return db.tx(() => {
    const version = (db.get('SELECT MAX(version) AS v FROM submissions WHERE team_id = ?', team.id).v || 0) + 1;
    const dir = path.join(config.BOT_DIR, `team_${team.id}`, `v${version}`);
    const file = path.join(dir, 'bot.py');
    const id = db.run(`INSERT INTO submissions (team_id, user_id, version, filename, sha256, size, path, source_code, phase_key, env_version)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, team.id, user.id, version, path.basename(filename), sha, size, file, code, phaseKey, environmentVersion()).lastInsertRowid;
    queue.enqueue('validate', id, queue.PRIORITY.validate);
    db.audit(user.id, 'submit', { team: team.id, submission: id, version, sha256: sha, phase: phaseKey });
    return Number(id);
  });
}

function rulesFor(phaseKey) {
  const phase = db.get('SELECT ruleset_id, reveal_opponent FROM phases WHERE key = ?', phaseKey === 'final' ? 'final' : 'swiss');
  return { ruleset: db.ruleset(phase.ruleset_id), reveal: !!phase.reveal_opponent };
}

/** Kiểm thử hợp lệ: mỗi màu một ván ngắn với bot ngẫu nhiên. Chỉ loại bot lỗi (không khởi động được, trả nước sai, quá giờ), không loại vì chiến thuật yếu. */
async function validate(job) {
  const sub = db.get('SELECT * FROM submissions WHERE id = ?', job.ref_id);
  if (!sub || sub.status !== 'pending') return;
  const { ruleset } = rulesFor(sub.phase_key);
  const res = await runMatch({
    botA: botPath(sub), botB: samplePath('random_bot'), ruleset, games: 2, extraGames: 0,
    maxPlies: config.match.validationPlies, decisive: false, seed: newSeed(),
  });
  const errors = [];
  res.games.forEach((g, i) => {
    const mySide = g.blue === 'a' ? 'blue' : 'pink';
    for (const m of g.moves) if (m.side === mySide && m.err) errors.push(`Ván ${i + 1} (${mySide === 'blue' ? 'Xanh' : 'Hồng'}), nước ${g.moves.indexOf(m) + 1}: ${m.err}`);
  });
  const ok = errors.length === 0;
  const report = [
    ok ? `HỢP LỆ: chạy 2 ván (mỗi màu một ván, tối đa ${config.match.validationPlies} nước) với luật "${ruleset.name}" không có lỗi.`
      : `KHÔNG HỢP LỆ: ${errors.length} nước lỗi.`,
    ...errors.slice(0, 20),
    res.logA ? `--- Log của bot ---\n${res.logA.slice(0, 20000)}` : '',
  ].filter(Boolean).join('\n');
  db.tx(() => {
    db.run('UPDATE submissions SET status = ?, check_log = ? WHERE id = ?', ok ? 'valid' : 'invalid', report, sub.id);
    const team = db.get('SELECT official_submission_id FROM teams WHERE id = ?', sub.team_id);
    // Bản hợp lệ đầu tiên (hoặc bản chung kết đầu tiên) tự thành bản thi; đội trưởng đổi được trước khi khóa.
    const current = team.official_submission_id && db.get('SELECT phase_key FROM submissions WHERE id = ?', team.official_submission_id);
    if (ok && (!current || (sub.phase_key === 'final' && current.phase_key !== 'final'))) {
      db.run('UPDATE teams SET official_submission_id = ? WHERE id = ?', sub.id, sub.team_id);
    }
  });
}

module.exports = { submit, validate, checkFormat, SAMPLE_BOTS, samplePath, botPath, readSource, UserError, environmentVersion };
