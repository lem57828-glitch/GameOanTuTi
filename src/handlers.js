// Ánh xạ loại tác vụ trong hàng đợi → hàm xử lý.
const db = require('./db');
const T = require('./services/tournament');
const subs = require('./services/submissions');

module.exports = {
  match: (job, workerId) => T.executeMatch(job, workerId),
  validate: (job) => subs.validate(job),
  onFail(job, err) {
    // Hết lượt thử: đánh dấu để quản trị xem xét và chạy lại thủ công.
    if (job.type === 'match') db.run(`UPDATE matches SET status = 'error' WHERE id = ?`, job.ref_id);
    if (job.type === 'validate') db.run(`UPDATE submissions SET status = 'invalid', check_log = ? WHERE id = ?`, `Lỗi hệ thống khi kiểm thử: ${err.message}`, job.ref_id);
  },
};
