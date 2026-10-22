// Module rooms-matches — TV4: phòng đấu, điều phối hiệp (5+2), chọn kín, tung xu, phòng trực tiếp, replay, khán giả.
const path = require('node:path');
const { defineModule } = require('../../core/module');
const s = require('./service');

const routes = [
  { method: 'get', path: '/rooms', auth: 'public', desc: 'Danh sách phòng (live/sắp tới/đã xong, tìm đội)' },
  { method: 'get', path: '/rooms/:code', auth: 'public', desc: 'Thông tin phòng công khai' },
  { method: 'get', path: '/rooms/:code/events', auth: 'public', desc: 'Sự kiện phòng sau mốc id (cập nhật trực tiếp, kết nối lại)' },
  { method: 'get', path: '/rooms/:code/games/:no/replay', auth: 'public', desc: 'Replay một hiệp (log riêng chỉ cho đội)' },
  { method: 'post', path: '/rooms/:code/bot-set', auth: 'user', desc: 'Đăng ký bộ 1–3 bot cho vòng (đội trưởng)' },
  { method: 'post', path: '/rooms/:code/choice', auth: 'user', desc: 'Chọn bot + quân thứ 10 cho hiệp (đội trưởng, kín)' },
  { method: 'post', path: '/rooms/:code/ready', auth: 'user', desc: 'Sẵn sàng bắt đầu hiệp' },
  { method: 'post', path: '/rooms/:code/comments', auth: 'user', desc: 'Ý kiến khán giả' },
  { method: 'post', path: '/rooms/:code/appeals', auth: 'user', desc: 'Khiếu nại chính thức (đội trưởng, giữa hiệp)' },
];

module.exports = defineModule({
  name: 'rooms-matches',
  owner: 'TV4',
  title: 'Phòng đấu, điều phối hiệp và khán giả',
  migrations: path.join(__dirname, 'migrations'),
  routes,
  init: s.init,
  service: s,
});
