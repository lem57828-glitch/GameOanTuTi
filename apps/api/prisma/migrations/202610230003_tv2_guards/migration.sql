ALTER TABLE "BotVersion" ADD COLUMN "validationOwner" TEXT, ADD COLUMN "validationLeaseUntil" TIMESTAMP(3);
ALTER TABLE "BotStageSelection" ADD COLUMN "freezeAt" TIMESTAMP(3);
UPDATE "BotStageSelection" b SET "freezeAt"=s."lockAt" FROM "Stage" s WHERE s.id=b."stageId";
CREATE INDEX "BotVersion_sourceHash_idx" ON "BotVersion"("sourceHash");
CREATE INDEX "BotVersion_status_createdAt_idx" ON "BotVersion"("status", "createdAt");
CREATE INDEX "BotTestRun_status_updatedAt_idx" ON "BotTestRun"("status", "updatedAt");
