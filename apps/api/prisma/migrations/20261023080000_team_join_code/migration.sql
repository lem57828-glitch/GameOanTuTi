ALTER TABLE "Team" ADD COLUMN "joinCode" TEXT NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 10));
CREATE UNIQUE INDEX "Team_joinCode_key" ON "Team"("joinCode");
