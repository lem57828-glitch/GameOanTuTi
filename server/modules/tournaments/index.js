// Module tournaments — TV3: cấu hình giải, sơ loại chia mức + Swiss, Top 32, cây 32→4, kết quả, khiếu nại.
const path = require('node:path');
const { defineModule } = require('../../core/module');
const s = require('./service');

const routes = [
  { method: 'get', path: '/tournaments/current', auth: 'public', desc: 'Giải hiện tại: lịch, mức, mốc khóa' },
  { method: 'get', path: '/stages/:id/standings', auth: 'public', desc: 'Bảng xếp hạng một mức' },
  { method: 'get', path: '/stages/:id/pairs', auth: 'public', desc: 'Các cặp đấu theo vòng' },
  { method: 'get', path: '/bracket', auth: 'public', desc: 'Cây 32→4' },

  { method: 'post', path: '/admin/tournaments', auth: 'admin', desc: 'Tạo giải' },
  { method: 'put', path: '/admin/tournaments/:id', auth: 'admin', desc: 'Cấu hình giải' },
  { method: 'post', path: '/admin/tournaments/:id/stages', auth: 'admin', desc: 'Tạo mức/vòng' },
  { method: 'post', path: '/admin/stages/:id/open', auth: 'admin', desc: 'Mở mức, khóa bot theo mốc' },
  { method: 'post', path: '/admin/stages/:id/pair-round', auth: 'admin', desc: 'Ghép vòng Swiss tiếp theo' },
  { method: 'post', path: '/admin/stages/:id/finalize', auth: 'admin', desc: 'Chốt mức, xử lý tranh suất' },
  { method: 'post', path: '/admin/tournaments/:id/bracket', auth: 'admin', desc: 'Lập hạt giống và cây 32' },
  { method: 'post', path: '/admin/pairs/:id/confirm', auth: 'referee', desc: 'Chốt kết quả cặp' },

  { method: 'get', path: '/referee/appeals', auth: 'referee', desc: 'Danh sách khiếu nại' },
  { method: 'post', path: '/referee/appeals/:id/decision', auth: 'referee', desc: 'Quyết định khiếu nại (hoãn/chạy lại/chốt)' },
];

module.exports = defineModule({
  name: 'tournaments',
  owner: 'TV3',
  title: 'Giải đấu, sơ loại và kết quả chính thức',
  migrations: path.join(__dirname, 'migrations'),
  routes,
  init: s.init,
  service: s,
});
