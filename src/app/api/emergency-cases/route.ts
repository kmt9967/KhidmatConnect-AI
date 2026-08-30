import { NextRequest, NextResponse } from 'next/server';
import { createEmergencyCaseSchema } from '@/lib/validation/emergencyCase';
import { createEmergencyCase, enrichCaseWithAiAnalysis, recordAiAnalysisFailure } from '@/lib/services/emergencyCaseService';
import { analyzeEmergency } from '@/lib/ai/emergencyAnalysis';

/**
 * POST /api/emergency-cases
 * Create a new emergency case, then attempt AI enrichment.
 * Case creation NEVER depends on AI success.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input with Zod
    const parsed = createEmergencyCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 1. Create case + token (always succeeds regardless of AI)
    const caseResult = await createEmergencyCase(parsed.data);

    // 2. Attempt AI enrichment (outside the creation transaction)
    let aiAnalysisStatus: 'COMPLETED' | 'FAILED' | 'PENDING' = 'PENDING';
    let analysis: Awaited<ReturnType<typeof analyzeEmergency>> | null = null;

    try {
      analysis = await analyzeEmergency({
        originalMessage: parsed.data.originalMessage,
        source: parsed.data.source,
        locationText: parsed.data.locationText,
        transcript: parsed.data.transcript,
      });

      if (analysis.success && analysis.analysis) {
        await enrichCaseWithAiAnalysis(caseResult.id, analysis.analysis);
        aiAnalysisStatus = 'COMPLETED';
      } else {
        await recordAiAnalysisFailure(caseResult.id, analysis.error || 'Unknown AI error');
        aiAnalysisStatus = 'FAILED';
      }
    } catch (aiError) {
      const errorMsg = aiError instanceof Error ? aiError.message : 'Unknown error';
      console.error(`[AI] Enrichment failed for ${caseResult.caseCode}: ${errorMsg.substring(0, 200)}`);
      await recordAiAnalysisFailure(caseResult.id, errorMsg);
      aiAnalysisStatus = 'FAILED';
    }

    // 3. Build safe response (no secrets, no raw AI payload)
    const response: Record<string, unknown> = {
      caseCode: caseResult.caseCode,
      status: caseResult.status,
      createdAt: caseResult.createdAt,
      caseAccessToken: caseResult.caseAccessToken,
      tokenExpiresAt: caseResult.tokenExpiresAt,
      aiAnalysisStatus,
    };

    if (aiAnalysisStatus === 'COMPLETED' && analysis?.analysis) {
      response.analysis = {
        urgency: analysis.analysis.urgency,
        categories: analysis.analysis.categories,
        followUpQuestion: analysis.analysis.followUpQuestion,
        potentiallyCritical: analysis.analysis.potentiallyCritical,
        aiSummary: analysis.analysis.summary,
        keyNeeds: analysis.analysis.keyNeeds,
        missingInformation: analysis.analysis.missingInformation,
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Emergency case creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create emergency case' },
      { status: 500 }
    );
  }
}
