// Module bots-runner — TV2: nhận bot (GitHub/tệp), phiên bản bất biến, engine luật cờ, worker cách ly, đấu thử.
const path = require('node:path');
const { defineModule } = require('../../core/module');
const s = require('./service');

const routes = [
  { method: 'post', path: '/bots/github', auth: 'user', desc: 'Liên kết repository GitHub của đội' },
  { method: 'post', path: '/bots/github/fetch', auth: 'user', desc: 'Nhận một commit thành phiên bản bot' },
  { method: 'post', path: '/bots/upload', auth: 'user', desc: 'Nộp tệp .py trực tiếp (kênh dự phòng)' },
  { method: 'get', path: '/bots/team/:teamId', auth: 'user', desc: 'Danh sách phiên bản của đội' },
  { method: 'get', path: '/bots/versions/:id', auth: 'user', desc: 'Chi tiết phiên bản và log kiểm thử' },
  { method: 'get', path: '/bots/samples', auth: 'public', desc: 'Bot mẫu Python' },
  { method: 'post', path: '/practice', auth: 'user', desc: 'Đấu thử (bot mẫu hoặc hai phiên bản của đội)' },
  { method: 'get', path: '/practice/:id', auth: 'user', desc: 'Kết quả và replay trận đấu thử' },
  { method: 'get', path: '/admin/bots/duplicates', auth: 'referee', desc: 'Báo cáo trùng mã cho BTC' },
];

module.exports = defineModule({
  name: 'bots-runner',
  owner: 'TV2',
  title: 'Bot, luật cờ và worker cách ly',
  migrations: path.join(__dirname, 'migrations'),
  routes,
  service: s,
});
