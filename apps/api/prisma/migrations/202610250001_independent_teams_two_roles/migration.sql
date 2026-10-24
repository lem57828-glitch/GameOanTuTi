-- Đội được lập độc lập; đăng ký giải là thao tác riêng. Giữ nguyên dữ liệu giải cũ.
ALTER TABLE "Team" ALTER COLUMN "tournamentId" DROP NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "tournamentId" DROP NOT NULL;
CREATE UNIQUE INDEX "Membership_unregistered_account_key" ON "Membership" ("accountId") WHERE "tournamentId" IS NULL;
CREATE UNIQUE INDEX "Team_unregistered_name_key" ON "Team" ("nameKey") WHERE "tournamentId" IS NULL AND "status" <> 'withdrawn';

-- Hợp nhất quyền trọng tài vào BTC, vô hiệu hóa phiên cũ của tài khoản chuyển đổi.
UPDATE "Account" SET "role" = 'admin', "sessionVersion" = "sessionVersion" + 1 WHERE "role" = 'referee';
UPDATE "Account" SET "displayName" = 'BTC hỗ trợ Demo' WHERE "id" = 'acc_referee' AND "isDemo" = true;
ALTER TYPE "Role" RENAME TO "Role_legacy";
CREATE TYPE "Role" AS ENUM ('student', 'admin');
ALTER TABLE "Account" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Account" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "Account" ALTER COLUMN "role" SET DEFAULT 'student';
DROP TYPE "Role_legacy";
