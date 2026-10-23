ALTER TABLE "Account" ADD COLUMN "studentId" TEXT, ADD COLUMN "className" TEXT, ADD COLUMN "faculty" TEXT;
CREATE UNIQUE INDEX "Account_studentId_key" ON "Account"("studentId");
