// Module accounts-teams — TV1: tài khoản, hồ sơ, đội, thông báo, chat. Xem README.md cùng thư mục.
const path = require('node:path');
const { defineModule } = require('../../core/module');
const s = require('./service');

// Bảng API của module. Chưa gắn handler = chưa làm (tự trả 501). Gắn handler khi hiện thực xong, ví dụ:
//   { method: 'post', path: '/accounts/register', auth: 'public', desc: '...', handler: s.register },
// Hàm trong service nhận (req, res) hoặc bạn tự viết hàm bọc đọc req.body rồi gọi service.
const routes = [
  { method: 'post', path: '/accounts/register', auth: 'public', desc: 'Đăng ký tài khoản sinh viên' },
  { method: 'post', path: '/accounts/login', auth: 'public', desc: 'Đăng nhập bằng mật khẩu' },
  { method: 'post', path: '/accounts/verify-email', auth: 'public', desc: 'Xác minh email' },
  { method: 'post', path: '/accounts/forgot-password', auth: 'public', desc: 'Yêu cầu khôi phục mật khẩu' },
  { method: 'post', path: '/accounts/reset-password', auth: 'public', desc: 'Đặt lại mật khẩu' },
  { method: 'get', path: '/accounts/profile', auth: 'user', desc: 'Xem hồ sơ' },
  { method: 'put', path: '/accounts/profile', auth: 'user', desc: 'Cập nhật hồ sơ' },
  { method: 'get', path: '/accounts/:id/history', auth: 'public', desc: 'Lịch sử thi đấu và thành tích' },

  { method: 'post', path: '/teams', auth: 'user', desc: 'Tạo đội' },
  { method: 'get', path: '/teams/mine', auth: 'user', desc: 'Đội của tôi' },
  { method: 'get', path: '/teams/check-name', auth: 'user', desc: 'Kiểm tra trùng tên đội' },
  { method: 'post', path: '/teams/:id/invites', auth: 'user', desc: 'Mời thành viên (đội trưởng)' },
  { method: 'post', path: '/teams/join', auth: 'user', desc: 'Tham gia đội bằng mã mời' },
  { method: 'post', path: '/teams/:id/leave', auth: 'user', desc: 'Rời đội' },
  { method: 'post', path: '/teams/:id/transfer', auth: 'user', desc: 'Chuyển đội trưởng' },

  { method: 'get', path: '/notifications', auth: 'user', desc: 'Danh sách thông báo' },
  { method: 'post', path: '/notifications/:id/read', auth: 'user', desc: 'Đánh dấu đã đọc' },
  { method: 'get', path: '/chat/:channel', auth: 'user', desc: 'Đọc tin nhắn kênh (đội, phòng)' },
  { method: 'post', path: '/chat/:channel', auth: 'user', desc: 'Gửi tin nhắn' },
];

module.exports = defineModule({
  name: 'accounts-teams',
  owner: 'TV1',
  title: 'Tài khoản, đội và giao tiếp',
  migrations: path.join(__dirname, 'migrations'),
  routes,
  init: s.init,
  service: s,
});
