/* Trang của module bots-runner — TV2. Chỉ TV2 sửa tệp này. */
'use strict';
(() => {
  const { page, placeholder } = window.Arena;
  const OWNER = 'TV2';
  const holder = (title, tasks, apis) => (root) => { root.innerHTML = placeholder({ owner: OWNER, title, tasks, apis }); };

  page({ path: '/bot', nav: 'Bot của đội', roles: ['student'], title: 'Bot của đội', owner: OWNER,
    render: holder('Bot của đội', [
      'Liên kết GitHub, chọn commit để hệ thống nhận (ghi repo + commit SHA)',
      'Danh sách phiên bản/commit hệ thống THỰC SỰ đã nhận, trạng thái kiểm thử, log lỗi',
      'Kênh dự phòng nộp tệp .py (nếu nhóm chốt, Q09)', 'Tải bot mẫu và mô tả state/nước đi',
    ], ['/api/bots']) });
  page({ path: '/dau-thu', nav: 'Đấu thử', roles: ['student'], title: 'Đấu thử', owner: OWNER,
    render: holder('Đấu thử', ['Đấu với bot mẫu hoặc giữa hai phiên bản của đội', 'Giới hạn lượt, ưu tiên tài nguyên cho trận chính thức', 'Xem log và replay; không tính điểm'],
      ['/api/practice']) });
  page({ path: '/quan-tri/trung-ma', nav: 'Trùng mã', roles: ['referee', 'admin'], title: 'Báo cáo trùng mã', owner: OWNER,
    render: holder('Báo cáo trùng mã', ['Liệt kê phiên bản trùng sha256 giữa các đội để BTC xem xét (không tự xử loại)'], ['/api/admin/bots']) });
})();
