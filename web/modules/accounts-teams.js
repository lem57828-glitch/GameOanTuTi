/* Trang của module accounts-teams — TV1. Chỉ TV1 sửa tệp này.
 * Hiện là trang giữ chỗ: thay `render` bằng giao diện thật, gọi API qua Arena.api('/accounts/...').
 */
'use strict';
(() => {
  const { page, placeholder } = window.Arena;
  const OWNER = 'TV1';
  const holder = (title, tasks, apis, intro) => (root) => { root.innerHTML = placeholder({ owner: OWNER, title, tasks, apis, intro }); };

  page({ path: '/dang-nhap', title: 'Đăng nhập', owner: OWNER,
    render: holder('Đăng nhập', ['Form đăng nhập email/username + mật khẩu', 'Thông báo lỗi chung, không lộ tài khoản tồn tại', 'Liên kết quên mật khẩu'],
      ['/api/accounts/login', '/api/accounts/forgot', '/api/accounts/reset'],
      'Trong lúc chờ, dùng <a href="#/dev">Đăng nhập giả lập</a> (chỉ khi phát triển).') });
  page({ path: '/dang-ky', title: 'Đăng ký', owner: OWNER,
    render: holder('Đăng ký', ['Kiểm tra miền email sinh viên (Q01), username/email không trùng', 'Gửi và nhập mã xác minh email'],
      ['/api/accounts/register', '/api/accounts/verify']) });
  page({ path: '/ho-so', nav: 'Hồ sơ', roles: ['student', 'referee', 'admin'], title: 'Hồ sơ', owner: OWNER,
    render: holder('Hồ sơ của tôi', ['Avatar, tên, mã sinh viên, lớp/khoa; đánh dấu hoàn tất trường bắt buộc', 'Lịch sử thi đấu, thống kê, thành tích'],
      ['/api/accounts/profile', '/api/accounts/:id']) });
  page({ path: '/doi', nav: 'Đội', roles: ['student'], title: 'Đội', owner: OWNER,
    render: holder('Đội của tôi', ['Tạo đội (kiểm tra trùng tên khi gõ)', 'Mời qua email/ID, mã/link mời; tham gia; rời; chuyển đội trưởng', 'Hiện trạng thái duyệt và hạn khóa đội hình (2–4 người)', 'Chat nội bộ đội'],
      ['/api/teams', '/api/chat']) });
  page({ path: '/thong-bao', nav: 'Thông báo', roles: ['student', 'referee', 'admin'], title: 'Thông báo', owner: OWNER,
    render: holder('Thông báo', ['Danh sách, chưa đọc/đã đọc', 'Chuông số chưa đọc trên thanh menu'], ['/api/notifications']) });
  page({ path: '/huong-dan', nav: 'Hướng dẫn', title: 'Hướng dẫn', owner: OWNER,
    render: holder('Giới thiệu & hướng dẫn', ['Trang chủ giới thiệu giải (thay bảng tiến độ ở #/ khi xong)', 'Hướng dẫn tham gia, tài liệu và thông báo của BTC'], []) });
})();
