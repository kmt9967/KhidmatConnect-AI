-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CITIZEN', 'OPERATOR', 'RESPONDER');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'UR');

-- CreateEnum
CREATE TYPE "EmergencySource" AS ENUM ('WEB', 'VOICE_CALL');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'ASSIGNED', 'RESPONDER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CLOSED', 'DUPLICATE', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "EmergencyCategory" AS ENUM ('RESCUE', 'MEDICAL', 'FOOD', 'WATER', 'SHELTER', 'TRANSPORT', 'SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AMBULANCE', 'RESCUE_TEAM', 'MEDICAL_CENTER', 'FOOD_CENTER', 'WATER_POINT', 'SHELTER', 'TRANSPORT', 'SUPPLY_CENTER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'OFFLINE', 'MAINTENANCE', 'LIMITED', 'BUSY', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResponderType" AS ENUM ('PARAMEDIC', 'DRIVER', 'COORDINATOR', 'FIELD_RESCUER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseUpdateType" AS ENUM ('CASE_CREATED', 'AI_TRIAGED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'REQUESTER_INFORMATION_ADDED', 'AMBULANCE_ASSIGNED', 'RESPONDER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'OPERATOR_NOTE', 'CASE_CLOSED');

-- CreateEnum
CREATE TYPE "NormalRequestStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CITIZEN',
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_cases" (
    "id" TEXT NOT NULL,
    "caseCode" TEXT NOT NULL,
    "source" "EmergencySource" NOT NULL,
    "primaryContact" TEXT NOT NULL,
    "alternateContact" TEXT,
    "originalMessage" TEXT NOT NULL,
    "transcript" TEXT,
    "locationText" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAccuracy" DOUBLE PRECISION,
    "locationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "detectedLanguage" TEXT,
    "aiSummary" TEXT,
    "aiReasoning" TEXT,
    "urgency" "Urgency",
    "aiConfidence" DOUBLE PRECISION,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "emergency_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_case_categories" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "EmergencyCategory" NOT NULL,

    CONSTRAINT "emergency_case_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_access_tokens" (
    "id" TEXT NOT NULL,
    "emergencyCaseId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "capacity" TEXT,
    "currentCapacity" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "responderType" "ResponderType" NOT NULL,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'OFFLINE',
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastLocationUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambulances" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "responderId" TEXT,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastLocationUpdateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambulances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "emergencyCaseId" TEXT NOT NULL,
    "resourceId" TEXT,
    "ambulanceId" TEXT,
    "responderId" TEXT,
    "assignedByOperatorId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_updates" (
    "id" TEXT NOT NULL,
    "emergencyCaseId" TEXT NOT NULL,
    "updateType" "CaseUpdateType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responder_locations" (
    "id" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "ambulanceId" TEXT,
    "assignmentId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responder_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normal_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NormalRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_cases_caseCode_key" ON "emergency_cases"("caseCode");

-- CreateIndex
CREATE INDEX "emergency_cases_status_idx" ON "emergency_cases"("status");

-- CreateIndex
CREATE INDEX "emergency_cases_createdAt_idx" ON "emergency_cases"("createdAt");

-- CreateIndex
CREATE INDEX "emergency_cases_urgency_idx" ON "emergency_cases"("urgency");

-- CreateIndex
CREATE INDEX "emergency_case_categories_caseId_idx" ON "emergency_case_categories"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_case_categories_caseId_category_key" ON "emergency_case_categories"("caseId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "case_access_tokens_tokenHash_key" ON "case_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "case_access_tokens_tokenHash_idx" ON "case_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "case_access_tokens_emergencyCaseId_idx" ON "case_access_tokens"("emergencyCaseId");

-- CreateIndex
CREATE INDEX "case_access_tokens_expiresAt_idx" ON "case_access_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "resources_type_idx" ON "resources"("type");

-- CreateIndex
CREATE INDEX "resources_availabilityStatus_idx" ON "resources"("availabilityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "responders_userId_key" ON "responders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ambulances_identifier_key" ON "ambulances"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "ambulances_vehicleNumber_key" ON "ambulances"("vehicleNumber");

-- CreateIndex
CREATE INDEX "assignments_emergencyCaseId_idx" ON "assignments"("emergencyCaseId");

-- CreateIndex
CREATE INDEX "assignments_status_idx" ON "assignments"("status");

-- CreateIndex
CREATE INDEX "case_updates_emergencyCaseId_createdAt_idx" ON "case_updates"("emergencyCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "responder_locations_responderId_recordedAt_idx" ON "responder_locations"("responderId", "recordedAt");

-- CreateIndex
CREATE INDEX "responder_locations_recordedAt_idx" ON "responder_locations"("recordedAt");

-- CreateIndex
CREATE INDEX "normal_requests_userId_idx" ON "normal_requests"("userId");

-- CreateIndex
CREATE INDEX "normal_requests_status_idx" ON "normal_requests"("status");

-- AddForeignKey
ALTER TABLE "emergency_case_categories" ADD CONSTRAINT "emergency_case_categories_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "emergency_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_access_tokens" ADD CONSTRAINT "case_access_tokens_emergencyCaseId_fkey" FOREIGN KEY ("emergencyCaseId") REFERENCES "emergency_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responders" ADD CONSTRAINT "responders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambulances" ADD CONSTRAINT "ambulances_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "responders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_emergencyCaseId_fkey" FOREIGN KEY ("emergencyCaseId") REFERENCES "emergency_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "responders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assignedByOperatorId_fkey" FOREIGN KEY ("assignedByOperatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_updates" ADD CONSTRAINT "case_updates_emergencyCaseId_fkey" FOREIGN KEY ("emergencyCaseId") REFERENCES "emergency_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_updates" ADD CONSTRAINT "case_updates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responder_locations" ADD CONSTRAINT "responder_locations_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "responders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responder_locations" ADD CONSTRAINT "responder_locations_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normal_requests" ADD CONSTRAINT "normal_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
