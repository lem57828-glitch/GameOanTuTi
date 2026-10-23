-- AlterTable
ALTER TABLE "BotVersion" ADD COLUMN "sourceCode" TEXT;
ALTER TABLE "BotVersion" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "BotVersion" ADD COLUMN "duplicateOfId" TEXT;
ALTER TABLE "BotVersion" ADD COLUMN "validationLog" TEXT;
