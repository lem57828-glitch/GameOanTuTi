// WORKER CHẠY BOT — TV2 hiện thực (đặc tả mục 4.2). Chạy tách tiến trình web: `npm run worker`.
//
// Yêu cầu:
//  - Lấy việc từ bảng game_jobs (ưu tiên priority thấp trước), mỗi việc chỉ một worker nhận (chống xử lý trùng).
//  - Gửi heartbeat; việc mất heartbeat được đưa lại hàng đợi (phục hồi khi worker chết giữa trận).
//  - Chạy hai bot Python trong môi trường cách ly: giới hạn CPU/RAM/thời gian/tiến trình, chặn mạng và dữ liệu đội khác.
//    Đóng gói web bằng Docker KHÔNG thay thế sandbox riêng cho mã bot.
//  - Thông số cơ sở: 200 ms CPU/nước, 1 s chờ phản hồi, 3 s khởi động; 2 lỗi đầu đi thay, lỗi thứ 3 thua hiệp;
//    crash/không khởi động/quá hạn chờ thua hiệp ngay. RAM chưa chốt (Q10).
//  - Phân biệt lỗi bot (ghi vào kết quả) với lỗi hạ tầng (phát 'game.failed', không ghi kết quả).
//  - Kết thúc: ghi GameResult vào game_jobs.result và phát sự kiện 'game.finished' { requestKey, result };
//    phát 'game.move' cho từng nước để phòng trực tiếp (TV4) hiển thị.
//
// Lưu ý: event bus core chạy trong một tiến trình. Nếu worker tách tiến trình, phòng (TV4) đọc sự kiện
// qua core/events.since() (bảng event_log) — cần chốt cách này ở M0.
const { todo } = require('../../core/errors');

function start() {
  todo('TV2', 'worker: vòng lặp nhận việc, heartbeat, sandbox, chạy hiệp, ghi kết quả');
}

module.exports = { start };
