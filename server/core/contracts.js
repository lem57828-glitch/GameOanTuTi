// HỢP ĐỒNG DỮ LIỆU GIỮA CÁC MODULE (đặc tả mục 9.5). Đây là bản ĐỀ XUẤT ở mốc M0: cả nhóm duyệt rồi mới
// viết tách nhánh. Sửa hợp đồng = sửa ở đây + docs/CONTRACTS.md + test/core/contracts.test.js, qua review của
// cả bên cung cấp lẫn bên dùng.
//
// Quy ước: định danh là số nguyên (id trong CSDL); thời gian là chuỗi ISO 8601 UTC do máy chủ tạo;
// màu quân là 'blue' (Xanh, đi trước, đích I9) hoặc 'pink' (Hồng, đích A1); loại quân là 'ROCK'|'PAPER'|'SCISSORS'.

const PIECE_TYPES = ['ROCK', 'PAPER', 'SCISSORS'];
const SIDES = ['blue', 'pink'];
const GAME_END_REASONS = ['goal', 'eliminate', 'no_moves', 'repetition', 'max_plies', 'errors', 'crash', 'timeout', 'startup'];

/**
 * TV2 → TV3/TV4. Một phiên bản bot BẤT BIẾN: đã lưu mã và kiểm thử. Không bao giờ sửa sau khi tạo.
 * @typedef {object} BotVersion
 * @property {number} id
 * @property {number} teamId
 * @property {string} sha256          băm nội dung mã đã lưu trong CSDL
 * @property {string|null} repo       repository GitHub nếu nhận từ GitHub
 * @property {string|null} commitSha  commit nguồn nếu có
 * @property {'pending'|'valid'|'invalid'} status
 */

/**
 * TV4 → TV2. Yêu cầu chạy MỘT hiệp đã khóa lựa chọn. Chạy lại (retry) phải gửi lại đúng các giá trị cũ.
 * @typedef {object} GameRequest
 * @property {string} requestKey        khóa chống chạy trùng, ví dụ `match:12/game:3/run:1`
 * @property {number} blueBotVersionId
 * @property {number} pinkBotVersionId
 * @property {string} [blueExtraType]   quân thứ 10 của Xanh (vòng 32→4); bỏ trống = bố trí chuẩn (Q06)
 * @property {string} [pinkExtraType]
 * @property {number} rulesetId
 * @property {number} seed
 * @property {{ cpuMsPerMove: number, wallMsPerMove: number, startupMs: number, maxPlies: number, maxErrors: number }} limits
 */

/**
 * TV2 → TV3/TV4. Kết quả chuẩn của một hiệp.
 * @typedef {object} GameResult
 * @property {string} requestKey
 * @property {'blue'|'pink'|null} winner   null = hòa
 * @property {string} reason               một trong GAME_END_REASONS
 * @property {number} plies
 * @property {{ blue: number, pink: number }} pieces  số quân còn lại
 * @property {Array<{ side: string, from?: string, to?: string, type?: string, capture?: string, err?: string }>} moves
 */

/**
 * TV3 → TV4. Một cặp đấu cần phòng.
 * @typedef {object} PairAssignment
 * @property {number} pairId
 * @property {number} stageId
 * @property {'qualifier'|'knockout'} kind
 * @property {number} teamA
 * @property {number} teamB
 * @property {number|null} seedA
 * @property {number|null} seedB
 * @property {string} lockAt     hạn khóa bot (ISO)
 */

/**
 * TV4 → TV3. Trận kết thúc, chờ TV3 chốt chính thức và chuyển nhánh.
 * @typedef {object} MatchCompleted
 * @property {number} pairId
 * @property {number} matchId
 * @property {number} resultVersion     tăng mỗi khi kết quả thay đổi do chạy lại
 * @property {Array<{ no: number, extra: boolean, winnerTeam: number|null, pointsA: number, pointsB: number }>} games
 * @property {number} pointsA
 * @property {number} pointsB
 * @property {number} winnerTeam
 * @property {'points'|'extra'|'lot'} decidedBy
 */

const isInt = (v) => Number.isInteger(v) && v > 0;
const problems = (checks) => checks.filter(([ok]) => !ok).map(([, msg]) => msg);

function validateGameRequest(r) {
  return problems([
    [r && typeof r.requestKey === 'string' && r.requestKey.length > 0, 'requestKey bắt buộc'],
    [r && isInt(r.blueBotVersionId) && isInt(r.pinkBotVersionId), 'blueBotVersionId/pinkBotVersionId phải là id'],
    [r && (r.blueExtraType == null || PIECE_TYPES.includes(r.blueExtraType)), 'blueExtraType không hợp lệ'],
    [r && (r.pinkExtraType == null || PIECE_TYPES.includes(r.pinkExtraType)), 'pinkExtraType không hợp lệ'],
    [r && isInt(r.rulesetId), 'rulesetId phải là id'],
    [r && Number.isInteger(r.seed), 'seed phải là số nguyên'],
    [r && r.limits && ['cpuMsPerMove', 'wallMsPerMove', 'startupMs', 'maxPlies', 'maxErrors'].every((k) => Number.isFinite(r.limits[k])), 'limits thiếu trường'],
  ]);
}

function validateGameResult(r) {
  return problems([
    [r && typeof r.requestKey === 'string', 'requestKey bắt buộc'],
    [r && (r.winner === null || SIDES.includes(r.winner)), 'winner phải là blue, pink hoặc null'],
    [r && GAME_END_REASONS.includes(r.reason), 'reason không hợp lệ'],
    [r && Number.isInteger(r.plies) && r.plies >= 0, 'plies không hợp lệ'],
    [r && r.pieces && Number.isInteger(r.pieces.blue) && Number.isInteger(r.pieces.pink), 'pieces thiếu'],
    [r && Array.isArray(r.moves), 'moves phải là danh sách'],
  ]);
}

function validateMatchCompleted(m) {
  return problems([
    [m && isInt(m.pairId) && isInt(m.matchId), 'pairId/matchId bắt buộc'],
    [m && Number.isInteger(m.resultVersion) && m.resultVersion >= 1, 'resultVersion >= 1'],
    [m && Array.isArray(m.games) && (m.games.length === 5 || m.games.length === 7), 'games phải có 5 hoặc 7 hiệp (vòng 32→4)'],
    [m && isInt(m.winnerTeam), 'winnerTeam bắt buộc'],
    [m && ['points', 'extra', 'lot'].includes(m.decidedBy), 'decidedBy không hợp lệ'],
  ]);
}

module.exports = { PIECE_TYPES, SIDES, GAME_END_REASONS, validateGameRequest, validateGameResult, validateMatchCompleted };
