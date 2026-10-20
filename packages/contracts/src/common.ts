// Quy ước chung của API v1 (đặc tả M0 mục 15).
//   Thành công: { data, meta? }      Lỗi: { error: { code, message, details?, requestId } }
import { z } from 'zod';

/** Phiên bản hợp đồng. Tăng khi đổi cấu trúc dữ liệu theo cách không tương thích ngược. */
export const CONTRACT_VERSION = 1 as const;

/** Mã lỗi ổn định dùng ở mọi module. Thêm mã mới qua review chung. */
export const ErrorCode = z.enum([
  'VALIDATION_ERROR', // 400
  'UNAUTHENTICATED', // 401
  'FORBIDDEN', // 403
  'NOT_FOUND', // 404
  'CONFLICT', // 409
  'RATE_LIMITED', // 429
  'INTERNAL_ERROR', // 500
  'FEATURE_NOT_IMPLEMENTED', // 501 — nghiệp vụ chưa làm trong M0
  'DEMO_DISABLED', // 404 — endpoint chỉ có khi DEMO_MODE bật ở development/test
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  FEATURE_NOT_IMPLEMENTED: 501,
  DEMO_DISABLED: 404,
};

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export interface ApiSuccess<T, M = undefined> {
  data: T;
  meta?: M;
}

export const IsoDateTime = z.string().datetime({ offset: true });
export const Id = z.string().min(1).max(64);

export const Role = z.enum(['student', 'referee', 'admin']);
export type Role = z.infer<typeof Role>;
