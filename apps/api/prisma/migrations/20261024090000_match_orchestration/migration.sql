-- TV4: điều phối trận nhiều hiệp theo cặp đấu TV3, lựa chọn kín bot/quân thứ 10 từng hiệp.

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "currentNo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'demo',
ADD COLUMN     "outcomes" JSONB,
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "scoreA" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scoreB" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "teamAId" TEXT,
ADD COLUMN     "teamBId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "pairingId" TEXT;

-- CreateTable
CREATE TABLE "MatchSelection" (
    "matchId" TEXT NOT NULL,
    "gameNo" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "botVersionId" TEXT NOT NULL,
    "extraType" TEXT NOT NULL DEFAULT 'PAPER',
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSelection_pkey" PRIMARY KEY ("matchId","gameNo","teamId")
);

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Room_pairingId_key" ON "Room"("pairingId");

-- AddForeignKey
ALTER TABLE "MatchSelection" ADD CONSTRAINT "MatchSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
