// Tiện ích HTTP dùng chung: requestId, kiểm tra đầu vào bằng zod, bọc kết quả { data, meta? }, bộ lọc lỗi.
import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import type { SessionUser } from '@arena/contracts';
import { AppError } from './errors.js';

export interface ArenaRequest extends Request {
  requestId: string;
  user: SessionUser | null;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as ArenaRequest).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** Kiểm tra dữ liệu tại biên HTTP. Kiểu TypeScript không bảo vệ dữ liệu lúc chạy. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Dữ liệu gửi lên không hợp lệ.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const ok = <T, M = undefined>(data: T, meta?: M) => (meta === undefined ? { data } : { data, meta });

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<ArenaRequest>();
    const res = ctx.getResponse<Response>();
    const requestId = req.requestId ?? randomUUID();
    let status = 500;
    let body: { code: string; message: string; details?: unknown };

    if (exception instanceof AppError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code =
        status === 404
          ? 'NOT_FOUND'
          : status === 413 || status === 400
            ? 'VALIDATION_ERROR'
            : status === 429
              ? 'RATE_LIMITED'
              : 'INTERNAL_ERROR';
      body = { code, message: status === 404 ? 'Không tìm thấy đường dẫn.' : exception.message };
    } else if (isBodyParserError(exception)) {
      status = exception.status;
      body = {
        code: 'VALIDATION_ERROR',
        message: status === 413 ? 'Dữ liệu gửi lên quá lớn.' : 'JSON không hợp lệ.',
      };
    } else {
      // Không đưa stack trace ra ngoài; chỉ ghi log kèm requestId.
      this.log.error(
        `[${requestId}] ${req.method} ${req.path}: ${(exception as Error)?.stack ?? String(exception)}`,
      );
      body = { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ. Báo BTC kèm mã yêu cầu.' };
    }
    if (status >= 500 && status !== 501) this.log.warn(`[${requestId}] ${status} ${body.code}`);
    res.status(status).json({ error: { ...body, requestId } });
  }
}

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'type' in e &&
    'status' in e &&
    typeof (e as { status: unknown }).status === 'number'
  );
}
