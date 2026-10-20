// Client HTTP dùng chung. Cùng origin với API (proxy Vite) nên cookie phiên tự đi kèm.
// Lỗi luôn được chuyển thành ApiError có mã ổn định và requestId để báo BTC.
import type { ErrorCode } from '@arena/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        accept: 'application/json',
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Kiểm tra API đã chạy chưa.');
  }
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code: ErrorCode; message: string; requestId?: string; details?: unknown };
  } | null;
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Lỗi ${res.status}`,
      err?.requestId,
      err?.details,
    );
  }
  return body.data as T;
}

export const isApiError = (e: unknown, code?: string): e is ApiError =>
  e instanceof ApiError && (!code || e.code === code);
