// Dịch vụ của module bots-runner (TV2).
//
// PHẦN 1 — GIAO DIỆN CHO MODULE KHÁC (bản tối thiểu để TV3/TV4 làm song song; giữ nguyên chữ ký).
// PHẦN 2 — NGHIỆP VỤ CỦA TV2 (đang todo()).
const db = require('../../core/db');
const { validateGameRequest } = require('../../core/contracts');
const { AppError, todo } = require('../../core/errors');

const OWNER = 'TV2';

// ---------------------------------------------------------------- PHẦN 1: giao diện dùng chung

/** BotVersion (core/contracts.js) theo id, không kèm mã nguồn. */
function getBotVersion(id) {
  const v = db.get('SELECT id, team_id, version, sha256, repo, commit_sha, status, created_at FROM bot_versions WHERE id = ?', id);
  return v ? { id: v.id, teamId: v.team_id, version: v.version, sha256: v.sha256, repo: v.repo, commitSha: v.commit_sha, status: v.status, createdAt: v.created_at } : null;
}

/** Các phiên bản hợp lệ của đội (để TV4 cho đội chọn bộ 1–3 bot). */
function validVersions(teamId) {
  return db.all(`SELECT id FROM bot_versions WHERE team_id = ? AND status = 'valid' ORDER BY version DESC`, teamId).map((r) => getBotVersion(r.id));
}

/**
 * TV4 gọi để yêu cầu chạy MỘT hiệp đã khóa lựa chọn. Gọi lại cùng requestKey không tạo việc mới
 * (chống chạy trùng khi người xem kết nối lại hoặc gửi trùng). Kết quả trả về qua sự kiện 'game.finished'.
 * @param {import('../../core/contracts').GameRequest} req
 * @param {{ priority?: number }} [opts]
 * @returns {{ jobId: number, created: boolean }}
 */
function requestGame(req, { priority = 0 } = {}) {
  const errs = validateGameRequest(req);
  if (errs.length) throw new AppError('VALIDATION', 'GameRequest không hợp lệ', errs);
  const existing = db.get('SELECT id FROM game_jobs WHERE request_key = ?', req.requestKey);
  if (existing) return { jobId: existing.id, created: false };
  const id = Number(db.run('INSERT INTO game_jobs (request_key, request, priority) VALUES (?,?,?)', req.requestKey, JSON.stringify(req), priority).lastInsertRowid);
  return { jobId: id, created: true };
}

/** Trạng thái và kết quả (nếu đã xong) của một yêu cầu. */
function gameStatus(requestKey) {
  const j = db.get('SELECT status, result, error FROM game_jobs WHERE request_key = ?', requestKey);
  return j ? { status: j.status, result: j.result ? JSON.parse(j.result) : null, error: j.error } : null;
}

// ---------------------------------------------------------------- PHẦN 2: nghiệp vụ TV2 (chưa làm)

const linkGithub = () => todo(OWNER, 'liên kết repository GitHub của đội (không gửi token xuống trình duyệt, Q09)');
const fetchCommit = () => todo(OWNER, 'tải một commit, lưu snapshot mã bất biến (source_code + sha256 + commit_sha), đưa vào kiểm thử hợp lệ');
const uploadFile = () => todo(OWNER, 'kênh dự phòng: nhận tệp .py trực tiếp (nếu nhóm chốt dùng)');
const listVersions = () => todo(OWNER, 'danh sách phiên bản và commit hệ thống đã thực sự nhận của đội (chỉ thành viên đội xem)');
const versionDetail = () => todo(OWNER, 'chi tiết phiên bản: log kiểm thử; mã nguồn chỉ cho thành viên đội');
const duplicateReport = () => todo(OWNER, 'báo cáo trùng mã chính xác (sha256) cho BTC');
const practice = () => todo(OWNER, 'đấu thử với bot mẫu hoặc giữa hai phiên bản của đội; giới hạn lượt; không tính điểm');
const sampleBots = () => todo(OWNER, 'danh sách và tải bot mẫu Python make_move(state)');

module.exports = {
  getBotVersion, validVersions, requestGame, gameStatus,
  linkGithub, fetchCommit, uploadFile, listVersions, versionDetail, duplicateReport, practice, sampleBots,
};
