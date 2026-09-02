/**
 * Inspect real call data from the database
 */
import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get latest voice sessions
  const sessions = await prisma.voiceCallSession.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
    include: {
      turns: { orderBy: { createdAt: 'asc' } },
      emergencyCase: {
        include: {
          updates: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  });

  for (const session of sessions) {
    console.log('\n' + '='.repeat(80));
    console.log('VOICE SESSION');
    console.log('='.repeat(80));
    console.log('ID:', session.id);
    console.log('Status:', session.status);
    console.log('Language:', session.detectedLanguage);
    console.log('Turns:', session.turnCount);
    console.log('Created:', session.startedAt);
    console.log('Case ID:', session.emergencyCaseId);
    console.log('\nFull Transcript:');
    console.log(session.transcriptText || '(empty)');

    console.log('\n--- TURNS ---');
    for (const turn of session.turns) {
      console.log(`\n[${turn.speaker}] ${turn.createdAt.toISOString()}`);
      console.log(`  Transcript: ${turn.transcript}`);
      if (turn.recordingReference) console.log(`  Recording: ${turn.recordingReference}`);
      if (turn.detectedLanguage) console.log(`  Language: ${turn.detectedLanguage}`);
    }

    if (session.emergencyCase) {
      const ec = session.emergencyCase;
      console.log('\n--- EMERGENCY CASE ---');
      console.log('Case Code:', ec.caseCode);
      console.log('Source:', ec.source);
      console.log('Urgency:', ec.urgency);
      console.log('AI Summary:', ec.aiSummary);
      console.log('Location:', ec.locationText);
      console.log('Location (detected):', ec.locationTextDetected);
      console.log('Critical:', ec.potentiallyCritical);
      console.log('Transcript:', ec.transcript);

      console.log('\n--- CASE UPDATES ---');
      for (const update of ec.updates) {
        console.log(`\n[${update.updateType}] ${update.createdAt.toISOString()}`);
        console.log(`  ${update.message}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
