// Kiểm tra quyền tại server. Ẩn nút ở giao diện không thay thế các guard này.
//   @Authenticated()        cần đăng nhập
//   @Roles('admin', ...)    cần một trong các vai trò
//   @DemoOnly()             chỉ mở khi DEMO_MODE bật ở development/test (ngược lại trả 404 DEMO_DISABLED)
// Endpoint không gắn decorator nào là công khai.
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, SessionUser } from '@arena/contracts';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AppError, forbidden, unauthenticated } from '../errors.js';
import type { ArenaRequest } from '../http.js';

const ROLES = 'arena:roles';
const AUTH = 'arena:auth';
const DEMO = 'arena:demo';

export const Authenticated = () => SetMetadata(AUTH, true);
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(AUTH, true), SetMetadata(ROLES, roles));
export const DemoOnly = () => SetMetadata(DEMO, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | null => {
  return ctx.switchToHttp().getRequest<ArenaRequest>().user ?? null;
});

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    const demoOnly = this.reflector.getAllAndOverride<boolean>(DEMO, targets);
    if (demoOnly && !this.cfg.demoMode)
      throw new AppError('DEMO_DISABLED', 'Chức năng demo đang tắt ở môi trường này.');
    const needsAuth = this.reflector.getAllAndOverride<boolean>(AUTH, targets);
    if (!needsAuth) return true;
    const user = ctx.switchToHttp().getRequest<ArenaRequest>().user;
    if (!user) throw unauthenticated();
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw forbidden();
    return true;
  }
}
