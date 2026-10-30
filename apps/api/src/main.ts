import 'reflect-metadata';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module.js';
import { loadConfig, type AppConfig } from './core/config.js';
import { requestIdMiddleware } from './core/http.js';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Request, Response, NextFunction } from 'express';

/** Socket.IO cùng cổng với HTTP; giới hạn kích thước thông điệp và thời gian kết nối. */
class ArenaIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly cfg: AppConfig,
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.cfg.webOrigins, credentials: true },
      maxHttpBufferSize: 10_000,
      pingInterval: 20_000,
      pingTimeout: 20_000,
      connectTimeout: 10_000,
    });
  }
}

async function bootstrap(): Promise<void> {
  const log = new Logger('Bootstrap');
  // Kiểm tra cấu hình trước khi dựng ứng dụng: production + DEMO_MODE → dừng ngay.
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: false,
  });
  app.useBodyParser('json', { limit: '4mb' });
  app.use(requestIdMiddleware);
  app.disable('x-powered-by');
  // Mặc định chỉ tin proxy trên cùng máy (Caddy/Nginx). Sau proxy của nền tảng (Fly.io...) đặt TRUST_PROXY=1
  // (số tầng proxy) để lấy đúng IP người dùng cho giới hạn đăng nhập; không đặt thì mọi người chung một IP.
  const trustProxy = process.env.TRUST_PROXY;
  app.set(
    'trust proxy',
    trustProxy ? (/^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy) : 'loopback',
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: cfg.webOrigins, credentials: true });
  app.useWebSocketAdapter(new ArenaIoAdapter(app, cfg));
  app.enableShutdownHooks();
  if (cfg.serveWeb) {
    const webRoot = resolve(__dirname, '../../web/dist');
    if (!existsSync(resolve(webRoot, 'index.html')))
      throw new Error('Thiếu web/dist. Chạy pnpm build trước.');
    app.useStaticAssets(webRoot, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method !== 'GET' ||
        /^\/(?:api|socket\.io)(?:\/|$)/.test(req.path) ||
        extname(req.path) ||
        !req.accepts('html')
      )
        return next();
      res.sendFile(resolve(webRoot, 'index.html'));
    });
  }
  await app.listen(cfg.port);
  log.log(
    `API chạy tại http://localhost:${cfg.port}/api/v1 (môi trường ${cfg.env}, demo ${cfg.demoMode ? 'BẬT' : 'tắt'})`,
  );
}

bootstrap().catch((e: Error) => {
  console.error(`Không khởi động được API: ${e.message}`);
  process.exit(1);
});
