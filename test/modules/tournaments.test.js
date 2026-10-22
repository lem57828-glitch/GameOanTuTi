// Kiểm thử module tournaments — TV3. Mỗi mục test.todo lấy từ việc cần làm và checklist nghiệm thu (đặc tả mục 11).
// Khi hiện thực, thay test.todo bằng test(...) thật. Dùng require('../helpers').setupApp() để có CSDL tạm và máy chủ HTTP.
const test = require('node:test');

test.todo("TV3: mức sơ loại: mọi đội cùng số vòng; vòng đầu ngẫu nhiên có seed; sau đó gần điểm");
test.todo("TV3: không tái đấu ngoài chính sách; không ghép được thì báo BTC thay vì lặp cặp");
test.todo("TV3: điểm 3/1/0; sang mức mới đặt điểm về 0 nhưng giữ lịch sử mức trước");
test.todo("TV3: không cộng trùng điểm khi chạy lại trận (theo resultVersion)");
test.todo("TV3: tiêu chí phụ và tranh suất ranh giới (Q04) trước khi chốt Top 32");
test.todo("TV3: số đội nhỏ hơn mốc/nhỏ hơn 32 (Q05)");
test.todo("TV3: cây 32 lá sinh đúng 16+8+4 cặp, nhánh cố định, dừng ở 4 đội, không tự chạy bán kết/chung kết");
test.todo("TV3: không chuyển vòng khi kết quả chưa chốt hoặc còn khiếu nại mở");
test.todo("TV3: quyết định trọng tài ghi người, lý do, bằng chứng (audit) và phát decision.made");
test.todo("TV3: mốc khóa theo giờ máy chủ, không theo đồng hồ trình duyệt");
