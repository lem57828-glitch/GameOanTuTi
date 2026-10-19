// Kiểm thử module accounts-teams — TV1. Mỗi mục test.todo lấy từ việc cần làm và checklist nghiệm thu (đặc tả mục 11).
// Khi hiện thực, thay test.todo bằng test(...) thật. Dùng require('../helpers').setupApp() để có CSDL tạm và máy chủ HTTP.
const test = require('node:test');

test.todo("TV1: đăng ký đúng miền email sinh viên (Q01); username/email trùng bị từ chối ở máy chủ và ràng buộc CSDL");
test.todo("TV1: mật khẩu được băm; đăng nhập sai nhiều lần bị giới hạn; không lộ tài khoản tồn tại");
test.todo("TV1: xác minh email và khôi phục mật khẩu bằng mã có hạn");
test.todo("TV1: hồ sơ chưa đủ trường bắt buộc thì không lập đội/không được duyệt");
test.todo("TV1: đội 2–4 người; đội nháp 1 người không được duyệt; một người một đội trong cùng giải");
test.todo("TV1: tên đội chuẩn hóa (Unicode, khoảng trắng, hoa/thường) và không trùng trong giải");
test.todo("TV1: mời/tham gia/rời/chuyển đội trưởng; mã mời không lộ thông tin riêng của đội");
test.todo("TV1: hết hạn đăng ký thì khóa thay đổi thành viên (phát team.roster_locked)");
test.todo("TV1: thông báo: lưu, chưa đọc/đã đọc, chỉ chủ sở hữu đọc được");
test.todo("TV1: chat đội: chỉ thành viên đọc/gửi; chống spam");
