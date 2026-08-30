-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseUpdateType" ADD VALUE 'AI_ANALYSIS_COMPLETED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'AI_ANALYSIS_FAILED';

-- AlterTable
ALTER TABLE "emergency_cases" ADD COLUMN     "followUpQuestion" TEXT,
ADD COLUMN     "keyNeeds" TEXT[],
ADD COLUMN     "locationTextDetected" TEXT,
ADD COLUMN     "missingInformation" TEXT[],
ADD COLUMN     "peopleAffected" INTEGER,
ADD COLUMN     "potentiallyCritical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialNeeds" TEXT[];
