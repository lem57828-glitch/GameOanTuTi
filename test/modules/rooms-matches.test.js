// Kiểm thử module rooms-matches — TV4. Mỗi mục test.todo lấy từ việc cần làm và checklist nghiệm thu (đặc tả mục 11).
// Khi hiện thực, thay test.todo bằng test(...) thật. Dùng require('../helpers').setupApp() để có CSDL tạm và máy chủ HTTP.
const test = require('node:test');

test.todo("TV4: trận chơi đủ 5 hiệp; hòa thì đúng 2 hiệp phụ rồi bốc thăm công khai");
test.todo("TV4: mỗi hiệp 3/1/0; tung xu độc lập mỗi hiệp, lưu và công khai");
test.todo("TV4: chỉ chọn trong bộ 1–3 bot đã khóa; quân thứ 10 hợp lệ");
test.todo("TV4: không lộ lựa chọn đối thủ qua API/sự kiện trước khi công bố đồng thời");
test.todo("TV4: hai đội sẵn sàng thì bắt đầu sớm; hết 10 phút theo chính sách Q08");
test.todo("TV4: gửi chọn/sẵn sàng đồng thời hoặc trùng: không double-start, không double-score");
test.todo("TV4: kết nối lại khôi phục đúng tiến độ, không gọi worker chạy lại hiệp");
test.todo("TV4: chạy lại giữ bot, quân thứ 10, màu và tung xu; chỉ run có hiệu lực được tính điểm");
test.todo("TV4: khách xem phòng/replay nhưng không đọc mã nguồn hoặc log riêng");
test.todo("TV4: gửi match.completed đúng hợp đồng cho TV3; khiếu nại chuyển sang TV3");
