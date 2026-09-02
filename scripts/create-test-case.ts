import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Load DATABASE_URL from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const p = new PrismaClient();

async function main() {
  // Create a demo emergency case with AI analysis for M11 testing
  const existingCase = await p.emergencyCase.findFirst({
    where: { caseCode: { startsWith: 'KC-2026-' } },
    orderBy: { createdAt: 'desc' },
  });

  if (existingCase) {
    console.log('Case already exists:', existingCase.caseCode);
    return;
  }

  const result = await p.$transaction(async (tx) => {
    // Create case
    const ec = await tx.emergencyCase.create({
      data: {
        caseCode: 'KC-2026-000001',
        source: 'WEB',
        primaryContact: '+92-300-8241992',
        alternateContact: '+92-321-9988221',
        originalMessage: 'My elderly mother (68 yrs) collapsed suddenly and is unresponsive. Struggling to breathe with rapid shallow pulse. Needs ALS oxygen ambulance immediately. We are at Plot B-42, Street 9, Gulshan-e-Iqbal Block 4, Karachi.',
        locationText: 'Plot B-42, Street 9, Gulshan-e-Iqbal Block 4, Karachi',
        latitude: 24.9204,
        longitude: 67.0934,
        locationAccuracy: 15,
        locationConfirmed: true,
        detectedLanguage: 'ENGLISH',
        aiSummary: '68yo female unresponsive post-collapse with acute respiratory distress. Immediate ALS cardiac/oxygen ambulance required.',
        aiReasoning: 'Unconsciousness coupled with shallow breathing indicates potential myocardial infarction or stroke. Critical Grade-1 triage dispatch triggered.',
        urgency: 'CRITICAL',
        aiConfidence: 0.98,
        keyNeeds: ['ALS Ambulance', 'High-flow Oxygen', 'Defibrillator Unit'],
        specialNeeds: ['Stretcher required (2nd floor apartment)', 'O-negative blood standby'],
        missingInformation: [],
        followUpQuestion: 'Are there any known cardiac or diabetic pre-conditions?',
        potentiallyCritical: true,
        peopleAffected: 1,
        locationTextDetected: 'Gulshan-e-Iqbal Block 4, Karachi',
        status: 'NEW',
      },
    });

    // Categories
    await tx.emergencyCaseCategory.createMany({
      data: [
        { caseId: ec.id, category: 'MEDICAL' },
        { caseId: ec.id, category: 'RESCUE' },
      ],
    });

    // Audit trail
    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: ec.id,
        updateType: 'CASE_CREATED',
        message: 'Emergency case KC-2026-000001 created via WEB.',
      },
    });

    await tx.caseUpdate.create({
      data: {
        emergencyCaseId: ec.id,
        updateType: 'AI_ANALYSIS_COMPLETED',
        message: 'AI triage completed. Human review required before operational action.',
      },
    });

    return ec;
  });

  console.log('Created test case:', result.caseCode);
}

main().finally(() => p.$disconnect());
