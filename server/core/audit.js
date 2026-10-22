// Nhật ký hành động (mục 2, 7: mọi hành động của BTC/trọng tài phải ghi người thực hiện, lý do, thời gian).
const db = require('./db');

/**
 * @param {number|null} actorId người thực hiện
 * @param {string} action ví dụ 'team.approve', 'match.rerun'
 * @param {{ target?: string, reason?: string, data?: any }} [info]
 */
function audit(actorId, action, { target = null, reason = null, data = null } = {}) {
  db.run('INSERT INTO audit_log (actor_id, action, target, reason, data) VALUES (?,?,?,?,?)',
    actorId ?? null, action, target, reason, data == null ? null : JSON.stringify(data));
}

function list({ limit = 200, action } = {}) {
  return action
    ? db.all('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY id DESC LIMIT ?', `${action}%`, limit)
    : db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit);
}

module.exports = { audit, list };
