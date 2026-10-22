// Mã lỗi dùng chung cho mọi module (mục 9.5: "mã lỗi phải được duyệt chung").
// Thêm mã mới vào đây qua review, không tự đặt chuỗi lỗi riêng trong từng module.
// API luôn trả lỗi dạng: { error: { code, message, details? } }

const CODES = {
  VALIDATION: 400,          // dữ liệu gửi lên sai
  UNAUTHENTICATED: 401,     // chưa đăng nhập
  FORBIDDEN: 403,           // không có quyền
  NOT_FOUND: 404,
  CONFLICT: 409,            // trùng tên/email, thao tác đồng thời, sai trạng thái
  LOCKED: 423,              // đã khóa theo thời gian (đội hình, bot, lựa chọn hiệp)
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,     // chức năng chưa có người làm xong (khung init)
  INTERNAL: 500,
};

class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    if (!CODES[code]) throw new Error(`Mã lỗi chưa đăng ký: ${code}`);
    this.code = code;
    this.status = CODES[code];
    this.details = details;
  }
}

/** Ném lỗi khi điều kiện sai: need(user, 'UNAUTHENTICATED', 'Cần đăng nhập'). */
function need(cond, code, message, details) {
  if (!cond) throw new AppError(code, message, details);
}

/** Đánh dấu chức năng chưa làm, để khung init chạy được và ai cũng thấy việc còn lại của ai. */
function todo(owner, what) {
  throw new AppError('NOT_IMPLEMENTED', `Chưa làm (${owner}): ${what}`, { owner });
}

module.exports = { CODES, AppError, need, todo };
