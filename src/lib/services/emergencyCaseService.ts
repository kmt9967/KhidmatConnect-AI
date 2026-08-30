import { prisma } from '@/lib/db/prisma';
import { generateCaseToken } from '@/lib/services/caseTokenService';
import type { CreateEmergencyCaseInput } from '@/lib/validation/emergencyCase';
import type { AiAnalysisResponse } from '@/lib/ai/schemas';

/**
 * Generate a human-readable unique case code: KC-YYYY-NNNNNN
 */
async function generateCaseCode(): Promise<string> {
  const year = new Date().getFullYear();
  // Find the highest case number for this year and increment
  const latestCase = await prisma.emergencyCase.findFirst({
    where: { caseCode: { startsWith: `KC-${year}-` } },
    orderBy: { caseCode: 'desc' },
    select: { caseCode: true },
  });

  let nextNum = 1;
  if (latestCase) {
    const parts = latestCase.caseCode.split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `KC-${year}-${nextNum.toString().padStart(6, '0')}`;
}

/**
 * Create an emergency case with categories, initial audit entry, and access token.
 * Uses a transaction for atomicity.
 * AI fields are optional — case creation must work without AI.
 */
export async function createEmergencyCase(input: CreateEmergencyCaseInput) {
  const caseCode = await generateCaseCode();

  // Use transaction: create case + categories + initial update + token
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the emergency case
    const emergencyCase = await tx.emergencyCase.create({
      data: {
        caseCode,
        source: input.source,
        primaryContact: input.primaryContact,
        alternateContact: input.alternateContact,
        originalMessage: input.originalMessage,
        transcript: input.transcript,
        locationText: input.locationText,
        latitude: input.latitude,
        longitude: input.longitude,
        locationAccuracy: input.locationAccuracy,
        detectedLanguage: input.detectedLanguage,
        aiSummary: input.aiSummary,
        aiReasoning: input.aiReasoning,
        urgency: input.urgency,
        aiConfidence: input.aiConfidence,
        status: 'NEW',
      },
    });

    // 2. Create category relations
    await tx.emergencyCaseCategory.createMany({
      data: input.categories.map((category) => ({
        caseId: emergencyCase.id,
        category,
      })),
    });

    // 3. Create initial CASE_CREATED audit entry
    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: emergencyCase.id,
        updateType: 'CASE_CREATED',
        message: `Emergency case ${caseCode} created via ${input.source}.`,
      },
    });

    return emergencyCase;
  });

  // 4. Generate secure access token (outside transaction — separate write)
  const { rawToken, tokenExpiresAt } = await generateCaseToken(result.id);

  return {
    id: result.id,
    caseCode: result.caseCode,
    status: result.status,
    createdAt: result.createdAt,
    caseAccessToken: rawToken,
    tokenExpiresAt,
  };
}

/**
 * Retrieve a case by caseCode with safe requester-facing fields.
 * Does NOT expose operator-only notes, token hashes, or internal data.
 */
export async function getCaseByCode(caseCode: string) {
  const caseRecord = await prisma.emergencyCase.findUnique({
    where: { caseCode },
    include: {
      categories: {
        select: { category: true },
      },
      updates: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          updateType: true,
          message: true,
          createdAt: true,
        },
      },
      assignments: {
        select: {
          id: true,
          status: true,
          assignedAt: true,
          acceptedAt: true,
          enRouteAt: true,
          arrivedAt: true,
          completedAt: true,
          resource: {
            select: {
              name: true,
              type: true,
              phone: true,
            },
          },
          ambulance: {
            select: {
              identifier: true,
              vehicleNumber: true,
            },
          },
          responder: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!caseRecord) return null;

  // Return requester-safe response (no operator-only AI reasoning, confidence, or internal flags)
  return {
    caseCode: caseRecord.caseCode,
    source: caseRecord.source,
    status: caseRecord.status,
    urgency: caseRecord.urgency,
    originalMessage: caseRecord.originalMessage,
    locationText: caseRecord.locationText,
    categories: caseRecord.categories.map((c) => c.category),
    aiSummary: caseRecord.aiSummary,
    keyNeeds: caseRecord.keyNeeds,
    specialNeeds: caseRecord.specialNeeds,
    missingInformation: caseRecord.missingInformation,
    followUpQuestion: caseRecord.followUpQuestion,
    peopleAffected: caseRecord.peopleAffected,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    closedAt: caseRecord.closedAt,
    updates: caseRecord.updates,
    assignments: caseRecord.assignments,
  };
}

/**
 * Enrich an existing emergency case with AI analysis results.
 * Updates case fields, replaces categories, and creates audit entry.
 * Designed to be called AFTER the case creation transaction completes.
 */
export async function enrichCaseWithAiAnalysis(
  caseId: string,
  analysis: AiAnalysisResponse
) {
  // Update case with AI analysis fields + categories + audit in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update the case with AI results
    await tx.emergencyCase.update({
      where: { id: caseId },
      data: {
        detectedLanguage: analysis.detectedLanguage,
        aiSummary: analysis.summary,
        aiReasoning: analysis.reasoning,
        urgency: analysis.urgency,
        aiConfidence: analysis.confidence,
        keyNeeds: analysis.keyNeeds,
        specialNeeds: analysis.specialNeeds,
        missingInformation: analysis.missingInformation,
        followUpQuestion: analysis.followUpQuestion || null,
        potentiallyCritical: analysis.potentiallyCritical,
        peopleAffected: analysis.peopleAffected,
        locationTextDetected: analysis.locationTextDetected || null,
      },
    });

    // 2. Replace categories with AI-detected ones
    await tx.emergencyCaseCategory.deleteMany({
      where: { caseId },
    });

    if (analysis.categories.length > 0) {
      await tx.emergencyCaseCategory.createMany({
        data: analysis.categories.map((category) => ({
          caseId,
          category,
        })),
      });
    }

    // 3. Create AI_ANALYSIS_COMPLETED audit entry
    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: caseId,
        updateType: 'AI_ANALYSIS_COMPLETED',
        message: 'AI triage completed. Human review required before operational action.',
      },
    });
  });
}

/**
 * Record an AI analysis failure in the audit trail.
 */
export async function recordAiAnalysisFailure(caseId: string, error: string) {
  await prisma.caseUpdate.create({
    data: {
      emergencyCaseId: caseId,
      updateType: 'AI_ANALYSIS_FAILED',
      message: `AI analysis failed: ${error.substring(0, 200)}. Human review required.`,
    },
  });
}

/**
 * Add a requester information update to a case.
 */
export async function addRequesterUpdate(caseId: string, message: string) {
  return prisma.caseUpdate.create({
    data: {
      emergencyCaseId: caseId,
      updateType: 'REQUESTER_INFORMATION_ADDED',
      message,
    },
  });
}
