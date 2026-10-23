-- CreateTable
CREATE TABLE "BotTestRun" (
    "id" TEXT NOT NULL,
    "botVersionId" TEXT NOT NULL,
    "mySide" TEXT NOT NULL DEFAULT 'blue',
    "opponentType" TEXT NOT NULL,
    "opponentTarget" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "winner" TEXT,
    "reason" TEXT,
    "plies" INTEGER,
    "piecesBlue" INTEGER,
    "piecesPink" INTEGER,
    "events" JSONB,
    "error" TEXT,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BotTestRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BotTestRun" ADD CONSTRAINT "BotTestRun_botVersionId_fkey" FOREIGN KEY ("botVersionId") REFERENCES "BotVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
