-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "avoidRematch" TEXT NOT NULL DEFAULT 'level',
ADD COLUMN     "top4" JSONB;

-- CreateTable
CREATE TABLE "QualifierLevel" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "teamTarget" INTEGER NOT NULL,
    "rounds" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "seed" INTEGER,
    "teamsIn" INTEGER,
    "entrants" JSONB,
    "cutState" JSONB,
    "qualified" JSONB,
    "botLockAt" TIMESTAMP(3),
    "publishAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "QualifierLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "BracketRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pairing" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "levelId" TEXT,
    "round" INTEGER NOT NULL,
    "phase" TEXT,
    "slot" INTEGER,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "seedA" INTEGER,
    "seedB" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "seed" INTEGER NOT NULL,
    "result" TEXT,
    "winnerTeamId" TEXT,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "games" JSONB,
    "decidedBy" TEXT,
    "source" TEXT,
    "resultVersion" INTEGER NOT NULL DEFAULT 0,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "pairingId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gameNo" INTEGER,
    "moveNo" INTEGER,
    "body" TEXT NOT NULL,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "action" TEXT,
    "decision" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualifierLevel_tournamentId_ord_key" ON "QualifierLevel"("tournamentId", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "BracketRound_tournamentId_phase_key" ON "BracketRound"("tournamentId", "phase");

-- CreateIndex
CREATE INDEX "Pairing_tournamentId_kind_levelId_round_idx" ON "Pairing"("tournamentId", "kind", "levelId", "round");

-- CreateIndex
CREATE INDEX "Pairing_tournamentId_phase_idx" ON "Pairing"("tournamentId", "phase");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- AddForeignKey
ALTER TABLE "QualifierLevel" ADD CONSTRAINT "QualifierLevel_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketRound" ADD CONSTRAINT "BracketRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pairing" ADD CONSTRAINT "Pairing_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pairing" ADD CONSTRAINT "Pairing_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "QualifierLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "Pairing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
