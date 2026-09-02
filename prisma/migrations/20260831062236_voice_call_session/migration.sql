-- CreateEnum
CREATE TYPE "VoiceCallStatus" AS ENUM ('ACTIVE', 'PROCESSING', 'COMPLETED', 'DISCONNECTED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_CALL_STARTED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_TRANSCRIPT_UPDATED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_AI_UPDATED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_CALL_DISCONNECTED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_CALL_COMPLETED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_ASR_FAILED';
ALTER TYPE "CaseUpdateType" ADD VALUE 'VOICE_TTS_FALLBACK';

-- CreateTable
CREATE TABLE "voice_call_sessions" (
    "id" TEXT NOT NULL,
    "emergencyCaseId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'TWILIO',
    "providerCallSid" TEXT NOT NULL,
    "callerNumber" TEXT NOT NULL,
    "status" "VoiceCallStatus" NOT NULL DEFAULT 'ACTIVE',
    "detectedLanguage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "recordingReference" TEXT,
    "transcriptText" TEXT,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,

    CONSTRAINT "voice_call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_call_turns" (
    "id" TEXT NOT NULL,
    "voiceCallSessionId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "recordingReference" TEXT,
    "detectedLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_call_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_call_sessions_providerCallSid_key" ON "voice_call_sessions"("providerCallSid");

-- CreateIndex
CREATE INDEX "voice_call_sessions_providerCallSid_idx" ON "voice_call_sessions"("providerCallSid");

-- CreateIndex
CREATE INDEX "voice_call_sessions_emergencyCaseId_idx" ON "voice_call_sessions"("emergencyCaseId");

-- CreateIndex
CREATE INDEX "voice_call_sessions_status_idx" ON "voice_call_sessions"("status");

-- CreateIndex
CREATE INDEX "voice_call_turns_voiceCallSessionId_createdAt_idx" ON "voice_call_turns"("voiceCallSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "voice_call_sessions" ADD CONSTRAINT "voice_call_sessions_emergencyCaseId_fkey" FOREIGN KEY ("emergencyCaseId") REFERENCES "emergency_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_call_turns" ADD CONSTRAINT "voice_call_turns_voiceCallSessionId_fkey" FOREIGN KEY ("voiceCallSessionId") REFERENCES "voice_call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
