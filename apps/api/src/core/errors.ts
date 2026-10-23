// Lỗi nghiệp vụ có mã ổn định (packages/contracts ErrorCode). Bộ lọc lỗi chuyển thành
// { error: { code, message, details?, requestId } } với HTTP status cố định.
import { ERROR_STATUS, type ErrorCode } from '@arena/contracts';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export const unauthenticated = () => new AppError('UNAUTHENTICATED', 'Bạn cần đăng nhập.');
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.') =>
  new AppError('FORBIDDEN', message);
export const notFound = (what: string) => new AppError('NOT_FOUND', `Không tìm thấy ${what}.`);
export const conflict = (message: string, details?: unknown) => new AppError('CONFLICT', message, details);
export const validationError = (message: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', message, details);

/**
 * Nghiệp vụ chưa làm trong M0. `owner` là thành viên phụ trách (TV1–TV4) để người gọi biết hỏi ai.
 * Không trả dữ liệu giả cho các endpoint này.
 */
export function notImplemented(feature: string, owner: 'TV1' | 'TV2' | 'TV3' | 'TV4'): never {
  throw new AppError('FEATURE_NOT_IMPLEMENTED', `Chức năng "${feature}" chưa được triển khai ở M0.`, {
    owner,
  });
}
