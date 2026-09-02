/**
 * Milestone 9 — Database integration tests for voice call functionality.
 *
 * Tests with real PostgreSQL:
 * 1. Voice session creation
 * 2. EmergencyCase source VOICE_CALL
 * 3. Duplicate CallSid does not duplicate
 * 4. Transcript persistence
 * 5. AI enrichment persistence
 * 6. Location unknown allowed
 * 7. Case survives simulated disconnect
 * 8. Session closes correctly
 * 9. Audit entries
 * 10. Cleanup
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ─── Env Loader ─────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    let val = trimmed.substring(eqIdx + 1);
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const prisma = new PrismaClient();

// ─── Test Harness ───────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL: ' + label);
  }
}

function section(name: string) {
  console.log('\n--- ' + name + ' ---');
}

// ─── Test Data ──────────────────────────────────────────────

const testCallSid = 'CA_TEST_VOICE_' + Date.now().toString(36);
const testCallerNumber = '+923009999888';
let testSessionId = '';
let testCaseId = '';
let testCaseCode = '';

async function run() {
  try {
    // ═══════════════════════════════════════════════════════════
    // 1. Voice Session Creation
    // ═══════════════════════════════════════════════════════════

    section('1. Voice Session Creation');

    const session = await prisma.voiceCallSession.create({
      data: {
        providerCallSid: testCallSid,
        callerNumber: testCallerNumber,
        status: 'ACTIVE',
      },
    });

    testSessionId = session.id;
    assert(!!session.id, 'Voice session created');
    assert(session.status === 'ACTIVE', 'Session starts ACTIVE');
    assert(session.providerCallSid === testCallSid, 'CallSid stored correctly');
    assert(session.callerNumber === testCallerNumber, 'Caller number stored');
    assert(session.turnCount === 0, 'Turn count starts at 0');
    assert(session.provider === 'TWILIO', 'Default provider is TWILIO');

    // ═══════════════════════════════════════════════════════════
    // 2. EmergencyCase Source VOICE_CALL
    // ═══════════════════════════════════════════════════════════

    section('2. EmergencyCase Source VOICE_CALL');

    const year = new Date().getFullYear();
    const caseCode = 'KC-' + year + '-V' + Date.now().toString(36);

    const emergencyCase = await prisma.emergencyCase.create({
      data: {
        caseCode: caseCode,
        source: 'VOICE_CALL',
        primaryContact: testCallerNumber,
        originalMessage: 'Phone emergency call in progress',
        status: 'NEW',
      },
    });

    testCaseId = emergencyCase.id;
    testCaseCode = emergencyCase.caseCode;
    assert(emergencyCase.source === 'VOICE_CALL', 'Case source is VOICE_CALL');
    assert(emergencyCase.status === 'NEW', 'Case starts NEW');
    assert(emergencyCase.originalMessage === 'Phone emergency call in progress', 'Placeholder message set');

    // Link session to case
    await prisma.voiceCallSession.update({
      where: { id: testSessionId },
      data: { emergencyCaseId: testCaseId },
    });

    // Create CASE_CREATED audit
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testCaseId,
        updateType: 'CASE_CREATED',
        message: 'Emergency case ' + caseCode + ' created via voice call.',
      },
    });

    // Create VOICE_CALL_STARTED audit
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testCaseId,
        updateType: 'VOICE_CALL_STARTED',
        message: 'Voice call session started.',
      },
    });

    // ═══════════════════════════════════════════════════════════
    // 3. Duplicate CallSid Does Not Duplicate
    // ═══════════════════════════════════════════════════════════

    section('3. Duplicate CallSid Prevention');

    // Try to create another session with the same CallSid
    let duplicateError = false;
    try {
      await prisma.voiceCallSession.create({
        data: {
          providerCallSid: testCallSid, // Same CallSid
          callerNumber: testCallerNumber,
          status: 'ACTIVE',
        },
      });
    } catch {
      duplicateError = true;
    }
    assert(duplicateError, 'Duplicate CallSid rejected by unique constraint');

    // Verify we can find the original
    const found = await prisma.voiceCallSession.findUnique({
      where: { providerCallSid: testCallSid },
    });
    assert(found !== null, 'Original session findable by CallSid');
    assert(found!.id === testSessionId, 'Found session is the original');

    // ═══════════════════════════════════════════════════════════
    // 4. Transcript Persistence
    // ═══════════════════════════════════════════════════════════

    section('4. Transcript Persistence');

    // Add caller turn
    await prisma.voiceCallTurn.create({
      data: {
        voiceCallSessionId: testSessionId,
        speaker: 'CALLER',
        transcript: 'My mother is unconscious.',
        recordingReference: 'RE_test_recording_1',
        detectedLanguage: 'ENGLISH',
      },
    });

    await prisma.voiceCallSession.update({
      where: { id: testSessionId },
      data: {
        turnCount: { increment: 1 },
        transcriptText: '[CALLER]: My mother is unconscious.\n',
        lastActivityAt: new Date(),
      },
    });

    await prisma.emergencyCase.update({
      where: { id: testCaseId },
      data: { transcript: '[CALLER]: My mother is unconscious.\n' },
    });

    // Verify
    const turns1 = await prisma.voiceCallTurn.findMany({
      where: { voiceCallSessionId: testSessionId },
      orderBy: { createdAt: 'asc' },
    });
    assert(turns1.length === 1, 'One turn recorded');
    assert(turns1[0].speaker === 'CALLER', 'Turn speaker is CALLER');
    assert(turns1[0].transcript === 'My mother is unconscious.', 'Turn transcript correct');

    // Add AI turn
    await prisma.voiceCallTurn.create({
      data: {
        voiceCallSessionId: testSessionId,
        speaker: 'AI',
        transcript: 'Please tell me your location or nearest landmark.',
        detectedLanguage: 'ENGLISH',
      },
    });

    await prisma.voiceCallSession.update({
      where: { id: testSessionId },
      data: {
        turnCount: { increment: 1 },
        transcriptText: '[CALLER]: My mother is unconscious.\n[AI]: Please tell me your location or nearest landmark.\n',
        lastActivityAt: new Date(),
      },
    });

    const turns2 = await prisma.voiceCallTurn.findMany({
      where: { voiceCallSessionId: testSessionId },
      orderBy: { createdAt: 'asc' },
    });
    assert(turns2.length === 2, 'Two turns recorded');
    assert(turns2[1].speaker === 'AI', 'Second turn is AI');

    const updatedSession = await prisma.voiceCallSession.findUnique({
      where: { id: testSessionId },
    });
    assert(updatedSession!.turnCount === 2, 'Turn count is 2');
    assert(updatedSession!.transcriptText!.includes('My mother is unconscious'), 'Cumulative transcript preserved');

    // ═══════════════════════════════════════════════════════════
    // 5. AI Enrichment Persistence
    // ═══════════════════════════════════════════════════════════

    section('5. AI Enrichment Persistence');

    await prisma.emergencyCase.update({
      where: { id: testCaseId },
      data: {
        detectedLanguage: 'ENGLISH',
        aiSummary: 'Unconscious female patient. Ambulance requested.',
        aiReasoning: 'Caller reports unconscious non-responsive person.',
        urgency: 'CRITICAL',
        aiConfidence: 0.92,
        keyNeeds: ['ambulance', 'emergency medical response'],
        specialNeeds: [],
        missingInformation: ['exact location'],
        followUpQuestion: 'What is your exact location?',
        potentiallyCritical: true,
        peopleAffected: 1,
      },
    });

    const enrichedCase = await prisma.emergencyCase.findUnique({
      where: { id: testCaseId },
    });
    assert(enrichedCase!.urgency === 'CRITICAL', 'Urgency set to CRITICAL');
    assert(enrichedCase!.potentiallyCritical === true, 'potentiallyCritical is true');
    assert(enrichedCase!.aiSummary !== null, 'AI summary populated');
    assert(enrichedCase!.aiConfidence === 0.92, 'AI confidence stored');
    assert(enrichedCase!.keyNeeds.length === 2, 'Key needs stored');

    // AI audit
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testCaseId,
        updateType: 'VOICE_AI_UPDATED',
        message: 'AI analysis updated from voice turn. Urgency: CRITICAL',
      },
    });

    // ═══════════════════════════════════════════════════════════
    // 6. Location Unknown Allowed
    // ═══════════════════════════════════════════════════════════

    section('6. Location Unknown Allowed');

    const caseWithNoLocation = await prisma.emergencyCase.findUnique({
      where: { id: testCaseId },
    });
    assert(caseWithNoLocation!.locationText === null, 'Location text is null (unknown)');
    assert(caseWithNoLocation!.latitude === null, 'Latitude is null');
    assert(caseWithNoLocation!.longitude === null, 'Longitude is null');
    assert(caseWithNoLocation!.locationConfirmed === false, 'Location not confirmed');
    // Case still exists and is valid without location
    assert(caseWithNoLocation!.source === 'VOICE_CALL', 'Case valid without location');

    // ═══════════════════════════════════════════════════════════
    // 7. Case Survives Simulated Disconnect
    // ═══════════════════════════════════════════════════════════

    section('7. Case Survives Simulated Disconnect');

    // Simulate disconnect
    await prisma.voiceCallSession.update({
      where: { id: testSessionId },
      data: {
        status: 'DISCONNECTED',
        endedAt: new Date(),
        humanReviewRequired: true,
        failureReason: 'Caller disconnected',
      },
    });

    // Create disconnect audit
    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testCaseId,
        updateType: 'VOICE_CALL_DISCONNECTED',
        message: 'Voice call disconnected. Reason: Caller disconnected',
      },
    });

    // Verify case still exists
    const caseAfterDisconnect = await prisma.emergencyCase.findUnique({
      where: { id: testCaseId },
    });
    assert(caseAfterDisconnect !== null, 'Case survives disconnect');
    assert(caseAfterDisconnect!.source === 'VOICE_CALL', 'Case source preserved');
    assert(caseAfterDisconnect!.aiSummary !== null, 'AI analysis preserved');
    assert(caseAfterDisconnect!.transcript !== null, 'Transcript preserved');

    // Verify session is disconnected
    const sessionAfterDisconnect = await prisma.voiceCallSession.findUnique({
      where: { id: testSessionId },
    });
    assert(sessionAfterDisconnect!.status === 'DISCONNECTED', 'Session marked DISCONNECTED');
    assert(sessionAfterDisconnect!.humanReviewRequired === true, 'Human review required flagged');
    assert(sessionAfterDisconnect!.endedAt !== null, 'End time recorded');

    // ═══════════════════════════════════════════════════════════
    // 8. Session Closes Correctly
    // ═══════════════════════════════════════════════════════════

    section('8. Session Closes Correctly');

    // Transition to COMPLETED
    await prisma.voiceCallSession.update({
      where: { id: testSessionId },
      data: { status: 'COMPLETED' },
    });

    await prisma.caseUpdate.create({
      data: {
        emergencyCaseId: testCaseId,
        updateType: 'VOICE_CALL_COMPLETED',
        message: 'Voice call completed.',
      },
    });

    const finalSession = await prisma.voiceCallSession.findUnique({
      where: { id: testSessionId },
    });
    assert(finalSession!.status === 'COMPLETED', 'Session marked COMPLETED');

    // ═══════════════════════════════════════════════════════════
    // 9. Audit Entries
    // ═══════════════════════════════════════════════════════════

    section('9. Audit Entries');

    const updates = await prisma.caseUpdate.findMany({
      where: { emergencyCaseId: testCaseId },
      orderBy: { createdAt: 'asc' },
    });

    const updateTypes = updates.map(u => u.updateType);
    assert(updateTypes.includes('CASE_CREATED'), 'CASE_CREATED audit exists');
    assert(updateTypes.includes('VOICE_CALL_STARTED'), 'VOICE_CALL_STARTED audit exists');
    assert(updateTypes.includes('VOICE_AI_UPDATED'), 'VOICE_AI_UPDATED audit exists');
    assert(updateTypes.includes('VOICE_CALL_DISCONNECTED'), 'VOICE_CALL_DISCONNECTED audit exists');
    assert(updateTypes.includes('VOICE_CALL_COMPLETED'), 'VOICE_CALL_COMPLETED audit exists');
    assert(updates.length >= 5, 'At least 5 audit entries created');

    // ═══════════════════════════════════════════════════════════
    // 10. Cleanup
    // ═══════════════════════════════════════════════════════════

    section('10. Cleanup');

    await prisma.caseUpdate.deleteMany({ where: { emergencyCaseId: testCaseId } });
    await prisma.voiceCallTurn.deleteMany({ where: { voiceCallSessionId: testSessionId } });
    await prisma.voiceCallSession.deleteMany({ where: { id: testSessionId } });
    await prisma.emergencyCaseCategory.deleteMany({ where: { caseId: testCaseId } });
    await prisma.emergencyCase.deleteMany({ where: { id: testCaseId } });

    const cleanedSession = await prisma.voiceCallSession.findUnique({ where: { id: testSessionId } });
    const cleanedCase = await prisma.emergencyCase.findUnique({ where: { id: testCaseId } });
    assert(cleanedSession === null, 'Voice session cleaned up');
    assert(cleanedCase === null, 'Emergency case cleaned up');

    // ═══════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════

    console.log('\n========================================');
    console.log('Voice DB Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
    console.log('========================================');

  } catch (err) {
    console.error('\nFATAL ERROR:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
    if (failed > 0) process.exit(1);
  }
}

run();
