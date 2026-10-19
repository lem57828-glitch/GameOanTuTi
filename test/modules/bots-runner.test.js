// Kiểm thử module bots-runner — TV2. Mỗi mục test.todo lấy từ việc cần làm và checklist nghiệm thu (đặc tả mục 11).
// Khi hiện thực, thay test.todo bằng test(...) thật. Dùng require('../helpers').setupApp() để có CSDL tạm và máy chủ HTTP.
const test = require('node:test');

test.todo("TV2: nhận đúng commit, lưu mã nguồn + sha256 + commit; phiên bản bất biến");
test.todo("TV2: commit mới trên GitHub sau khi khóa không đổi bot thi");
test.todo("TV2: engine: nước hợp lệ, ăn quân, chặn đường, tới đích, ăn hết một loại, hết nước, lặp 3 lần, 200 nước");
test.todo("TV2: engine: 9 quân cố định + quân thứ 10 tùy chọn (khi Q06/Q07 chốt)");
test.todo("TV2: bot trả nước sai: 2 lần đầu đi thay, lần 3 thua hiệp; crash/không khởi động/quá hạn thua ngay");
test.todo("TV2: bot không đọc được secret, file đội khác, không ra mạng, không tạo tiến trình");
test.todo("TV2: worker chết giữa hiệp: việc được đưa lại hàng đợi, không chạy trùng, không ghi kết quả hai lần");
test.todo("TV2: phân biệt lỗi bot (vào kết quả) và lỗi hạ tầng (game.failed)");
test.todo("TV2: cùng seed cho cùng diễn biến");
test.todo("TV2: benchmark: số hiệp/giờ trên máy thi (Q10)");
