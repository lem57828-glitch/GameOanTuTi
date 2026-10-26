-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "champion" TEXT;

-- AlterTable
ALTER TABLE "BracketRound" ADD COLUMN "lockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinalSubmission" (
    "tournamentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "botVersionId" TEXT NOT NULL,
    "extraType" TEXT NOT NULL DEFAULT 'PAPER',
    "fileName" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinalSubmission_pkey" PRIMARY KEY ("tournamentId","phase","teamId")
);
