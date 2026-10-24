-- CreateTable
CREATE TABLE "LevelBot" (
    "levelId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "botVersionId" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "chosenById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelBot_pkey" PRIMARY KEY ("levelId","teamId")
);

-- AddForeignKey
ALTER TABLE "LevelBot" ADD CONSTRAINT "LevelBot_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "QualifierLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
