// Operator-only bootstrap, never an HTTP endpoint or a demo seed.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/accounts-teams/password.js';
import { loadConfig } from '../src/core/config.js';

const db = new PrismaClient();
async function main() {
  const cfg = loadConfig();
  if (process.env.ARENA_PROFILE !== 'official' || cfg.demoMode)
    throw new Error('Chạy bằng pnpm admin:create:official.');
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Ban tổ chức';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12)
    throw new Error(
      'Điền BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD (ít nhất 12 ký tự) trong .env.official.',
    );
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(24102026)`;
    if (await tx.account.findFirst({ where: { role: 'admin', isDemo: false } }))
      throw new Error('Đã có BTC thật; bootstrap không ghi đè tài khoản hay mật khẩu hiện có.');
    const account = await tx.account.create({
      data: {
        username: `admin:${email}`,
        email,
        displayName: name,
        role: 'admin',
        isDemo: false,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { actorId: account.id, action: 'account.bootstrap-admin', target: account.id },
    });
  });
  console.log(
    'Đã tạo BTC thật. Đăng nhập bằng email/mật khẩu; xóa BOOTSTRAP_ADMIN_PASSWORD khỏi file cấu hình.',
  );
}
main()
  .catch(() => {
    console.error(
      'Không tạo được BTC. Kiểm tra cấu hình, migration, tài khoản đã tồn tại và mật khẩu bootstrap.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
