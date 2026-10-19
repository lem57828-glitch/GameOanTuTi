// Tiện ích HTTP dùng chung: bọc handler, chuẩn hóa lỗi, đọc tham số an toàn.
const { AppError } = require('./errors');

/** Bọc handler (đồng bộ hoặc async). Giá trị trả về được gửi dạng JSON; lỗi đi qua errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.then((v) => v !== undefined && !res.headersSent && res.json(v)).catch(next);
    else if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { next(e); }
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'JSON không hợp lệ' } });
  }
  if (err && /UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } });
}

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : null);

module.exports = { h, errorHandler, str, int };
