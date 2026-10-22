// Dịch vụ của module rooms-matches (TV4).
// Phụ thuộc: TV3 getPair() + sự kiện pair.assigned; TV2 validVersions(), requestGame(), engine + sự kiện game.*;
// TV1 isCaptain(), notify() và nền chat.
const events = require('../../core/events');
const { todo } = require('../../core/errors');

const OWNER = 'TV4';

const listRooms = () => todo(OWNER, 'danh sách phòng: lọc live/sắp tới/đã xong, tìm đội (khách xem được)');
const roomDetail = () => todo(OWNER, 'thông tin phòng công khai: hai đội, luật, đồng hồ máy chủ, điểm từng hiệp — không lộ lựa chọn kín');
const registerBotSet = () => todo(OWNER, 'đội trưởng đăng ký bộ 1–3 bot hợp lệ cho vòng, khóa theo hạn');
const submitChoice = () => todo(OWNER, 'đội trưởng chọn bot + quân thứ 10 cho hiệp (kín, khóa nguyên tử, chống gửi đồng thời)');
const setReady = () => todo(OWNER, 'sẵn sàng; cả hai sẵn sàng hoặc hết 10 phút → công bố đồng thời, tung xu, gọi TV2 requestGame');
const roomEvents = () => todo(OWNER, 'luồng sự kiện phòng (polling/SSE) theo mốc id, khôi phục đúng tiến độ khi tải lại trang');
const replay = () => todo(OWNER, 'replay một hiệp/lần chạy: bàn đầu, quân thứ 10, bot/phiên bản, màu, tung xu, nước; log riêng chỉ cho đội');
const postComment = () => todo(OWNER, 'ý kiến khán giả trong phòng (dùng nền chat TV1, chống spam)');
const submitAppeal = () => todo(OWNER, 'đội trưởng gửi khiếu nại chính thức giữa hiệp → phát appeal.submitted cho TV3');

function onPairAssigned(/* event */) {
  // TODO(TV4): tạo phòng (matches) cho cặp knockout, mã phòng, thông báo hai đội qua TV1.
}
function onGameFinished(/* event */) {
  // TODO(TV4): ghi kết quả vào game_runs/match_games, cộng điểm 3/1/0 theo run có hiệu lực (không cộng trùng),
  // chuyển hiệp; đủ 5 hiệp (hoặc 7 khi hòa) thì phát match.completed cho TV3.
}

function init() {
  events.on('pair.assigned', onPairAssigned);
  events.on('game.finished', onGameFinished);
  // TODO(TV4): nghe 'decision.made' (tạm hoãn/chạy lại) và 'game.failed' (lỗi hạ tầng → chạy lại cùng lựa chọn).
}

module.exports = { listRooms, roomDetail, registerBotSet, submitChoice, setReady, roomEvents, replay, postComment, submitAppeal, init };
