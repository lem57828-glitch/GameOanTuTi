// XÓA TOÀN BỘ dữ liệu trong database của DATABASE_URL rồi seed lại. Tách riêng khỏi seed và cần xác nhận rõ:
//   pnpm db:reset -- --yes
// Từ chối chạy khi NODE_ENV=production.
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  if (
    process.env.ARENA_PROFILE === 'official' ||
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'test' && process.env.DEMO_MODE !== 'true')
  )
    throw new Error('Không reset database chính thức. Reset chỉ dành cho demo/test.');
  if (!process.argv.includes('--yes')) {
    const target = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//***@');
    console.error(
      `Lệnh này XÓA TOÀN BỘ dữ liệu tại ${target}.\nChạy lại kèm xác nhận: pnpm db:reset -- --yes`,
    );
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
    if (tables.length) {
      const list = tables.map((t) => `"${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
    }
    console.log(`Đã xóa dữ liệu ${tables.length} bảng.`);
  } finally {
    await prisma.$disconnect();
  }
  execSync('tsx prisma/seed.ts', { stdio: 'inherit' });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
