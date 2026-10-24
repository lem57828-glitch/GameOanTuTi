-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "demoKind" TEXT;

-- Giải demo đã có giữ hành vi cũ (cho phép mô phỏng nhanh).
UPDATE "Tournament" SET "demoKind" = 'simulation' WHERE "isDemo" = true;
