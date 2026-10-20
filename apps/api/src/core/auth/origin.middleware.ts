// Chống CSRF: cookie phiên SameSite=Lax + yêu cầu thay đổi dữ liệu phải đến từ origin web được cấu hình.
// Trình duyệt luôn gửi Origin với POST/PUT/PATCH/DELETE; công cụ dòng lệnh không gửi Origin được chấp nhận
// vì chúng không tự mang cookie của người dùng khác.
import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { forbidden } from '../errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginMiddleware implements NestMiddleware {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!SAFE.has(req.method)) {
      const origin = req.header('origin');
      // Ném lỗi (không gọi next(err)) để bộ lọc lỗi của Nest trả đúng định dạng.
      if (origin && !this.cfg.webOrigins.includes(origin)) throw forbidden('Origin không được phép.');
    }
    next();
  }
}
