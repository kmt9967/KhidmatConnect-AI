/**
 * Full-Chain Voice Test: Human Audio → Chirp 2 → Qwen-turbo → Emergency Interpretation
 * 
 * Tests the complete emergency intake pipeline with real human recordings.
 */

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

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

interface TestResult {
  file: string;
  asrTranscript: string | null;
  asrConfidence: number | null;
  asrLatencyMs: number;
  asrSuccess: boolean;
  asrError?: string;
  
  qwenInterpretation?: any;
  qwenLatencyMs?: number;
  qwenSuccess?: boolean;
  qwenError?: string;
  
  // Extracted fields
  emergencyCategory?: string;
  severity?: string;
  criticalCondition?: string;
  peopleCount?: number;
  location?: string;
  locationConfirmed?: boolean;
  requestedResource?: string;
  inventedFacts?: string[];
}

interface RecordingMetadata {
  file: string;
  actualContent: {
    emergencyType: string;
    condition?: string;
    location?: string;
    people?: number;
    keywords: string[];
  };
}

// Corrected metadata based on actual recordings
const RECORDING_METADATA: RecordingMetadata[] = [
  {
    file: 'urdu-A.webm',
    actualContent: {
      emergencyType: 'medical',
      condition: 'unconscious',
      keywords: ['والدہ', 'بیہوش', 'unconscious', 'mother'],
    },
  },
  {
    file: 'urdu-B.webm',
    actualContent: {
      emergencyType: 'medical',
      condition: 'heart attack',
      keywords: ['ہارٹ اٹیک', 'heart attack', 'ایمبولینس', 'ambulance'],
    },
  },
  {
    file: 'urdu-C.webm',
    actualContent: {
      emergencyType: 'fire',
      condition: 'building fire',
      keywords: ['بلڈنگ', 'اگ', 'fire', 'building', 'مدد', 'help'],
    },
  },
  {
    file: 'urdu-D.webm',
    actualContent: {
      emergencyType: 'accident',
      location: 'Block 7',
      people: 2,
      condition: 'injured',
      keywords: ['ایکسیڈنٹ', 'accident', 'بلاک سات', 'Block 7', 'دو لوگ', 'two people', 'زخمی', 'injured'],
    },
  },
  {
    file: 'urdu-E.webm',
    actualContent: {
      emergencyType: 'medical',
      condition: 'not breathing',
      location: 'Nazimabad',
      keywords: ['بھائی', 'brother', 'سانس نہیں', 'not breathing', 'ناظم اباد', 'Nazimabad'],
    },
  },
  {
    file: 'roman-F.webm',
    actualContent: {
      emergencyType: 'medical',
      location: 'Gulshan Block 7',
      keywords: ['گلشن', 'Gulshan', 'بلاک', 'Block', 'ایمبولینس', 'ambulance'],
    },
  },
];

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  if (!fs.existsSync(adcPath)) {
    throw new Error('ADC not found');
  }

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Token refresh failed: ' + response.status);
  }

  const data = await response.json() as any;
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken!;
}

async function transcribeWithChirp2(filePath: string): Promise<{
  transcript: string | null;
  confidence: number | null;
  latencyMs: number;
  success: boolean;
  error?: string;
}> {
  const audioBuffer = fs.readFileSync(filePath);
  
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    return {
      transcript: null,
      confidence: null,
      latencyMs: 0,
      success: false,
      error: 'AUTH_FAILED: ' + (error instanceof Error ? error.message : String(error)),
    };
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
  const location = 'asia-southeast1';
  const model = 'chirp_2';

  const audioContent = audioBuffer.toString('base64');
  const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

  const requestBody = {
    config: {
      model: model,
      languageCodes: ['ur-PK'],
      features: { enableAutomaticPunctuation: true },
      autoDecodingConfig: {},
    },
    content: audioContent,
  };

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const latencyMs = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      return {
        transcript: null,
        confidence: null,
        latencyMs,
        success: false,
        error: `API_ERROR_${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    const data = JSON.parse(responseText);
    const results = data.results || [];

    if (results.length === 0 || !results[0].alternatives || results[0].alternatives.length === 0) {
      return {
        transcript: null,
        confidence: null,
        latencyMs,
        success: false,
        error: 'NO_RESULTS',
      };
    }

    const best = results[0].alternatives[0];
    return {
      transcript: best.transcript || null,
      confidence: best.confidence || null,
      latencyMs,
      success: true,
    };

  } catch (error) {
    return {
      transcript: null,
      confidence: null,
      latencyMs: Date.now() - startTime,
      success: false,
      error: 'REQUEST_FAILED: ' + (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function interpretWithQwen(transcript: string): Promise<{
  interpretation: any;
  latencyMs: number;
  success: boolean;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.ALIBABA_MODEL_STUDIO_API_KEY,
      baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    const response = await openai.chat.completions.create({
      model: 'qwen-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an emergency call interpreter for KhidmatConnect AI.

Extract structured emergency information from the caller's transcript.

Return JSON with these fields:
- emergencyCategory: "medical" | "accident" | "fire" | "crime" | "other"
- severity: "critical" | "serious" | "moderate" | "minor"
- criticalCondition: specific condition if mentioned (e.g., "unconscious", "not breathing", "heart attack", "injured", "burned") or null
- peopleCount: number of people affected if mentioned, or null
- location: location/landmark if mentioned, or null
- locationConfirmed: true if location is specific, false if vague/unclear
- requestedResource: "ambulance" | "fire brigade" | "police" | "rescue" | null
- inventedFacts: array of any facts you might have invented (should be empty if you only extracted)

CRITICAL RULES:
1. Only extract what is actually said. Never invent facts.
2. If location is unclear, set locationConfirmed = false
3. If no people count mentioned, set peopleCount = null
4. Preserve the raw transcript exactly as received
5. Respond in the same language as the transcript (Urdu or English)

Example output:
{
  "emergencyCategory": "medical",
  "severity": "critical",
  "criticalCondition": "unconscious",
  "peopleCount": 1,
  "location": "Nazimabad",
  "locationConfirmed": true,
  "requestedResource": "ambulance",
  "inventedFacts": []
}`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      return {
        interpretation: null,
        latencyMs,
        success: false,
        error: 'NO_CONTENT',
      };
    }

    const interpretation = JSON.parse(content);
    return {
      interpretation,
      latencyMs,
      success: true,
    };

  } catch (error) {
    return {
      interpretation: null,
      latencyMs: Date.now() - startTime,
      success: false,
      error: 'QWEN_FAILED: ' + (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function testFullChain(filePath: string, metadata: RecordingMetadata): Promise<TestResult> {
  const fileName = path.basename(filePath);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${fileName}`);
  console.log(`Expected: ${metadata.actualContent.emergencyType}${metadata.actualContent.condition ? ' / ' + metadata.actualContent.condition : ''}`);
  console.log('='.repeat(80));

  // Step 1: ASR
  console.log('\n[1/2] Google Chirp 2 ASR...');
  const asrResult = await transcribeWithChirp2(filePath);
  
  const result: TestResult = {
    file: fileName,
    asrTranscript: asrResult.transcript,
    asrConfidence: asrResult.confidence,
    asrLatencyMs: asrResult.latencyMs,
    asrSuccess: asrResult.success,
    asrError: asrResult.error,
  };

  if (!asrResult.success || !asrResult.transcript) {
    console.log(`  ✗ ASR FAILED: ${asrResult.error}`);
    return result;
  }

  console.log(`  ✓ Transcript: ${asrResult.transcript}`);
  console.log(`  ✓ Confidence: ${asrResult.confidence?.toFixed(4)}`);
  console.log(`  ✓ Latency: ${asrResult.latencyMs}ms`);

  // Step 2: Qwen interpretation
  console.log('\n[2/2] Alibaba qwen-turbo interpretation...');
  const qwenResult = await interpretWithQwen(asrResult.transcript);
  
  result.qwenLatencyMs = qwenResult.latencyMs;
  result.qwenSuccess = qwenResult.success;
  result.qwenError = qwenResult.error;

  if (!qwenResult.success || !qwenResult.interpretation) {
    console.log(`  ✗ QWEN FAILED: ${qwenResult.error}`);
    return result;
  }

  const interp = qwenResult.interpretation;
  result.qwenInterpretation = interp;
  result.emergencyCategory = interp.emergencyCategory;
  result.severity = interp.severity;
  result.criticalCondition = interp.criticalCondition;
  result.peopleCount = interp.peopleCount;
  result.location = interp.location;
  result.locationConfirmed = interp.locationConfirmed;
  result.requestedResource = interp.requestedResource;
  result.inventedFacts = interp.inventedFacts || [];

  console.log(`  ✓ Emergency: ${interp.emergencyCategory} (${interp.severity})`);
  if (interp.criticalCondition) console.log(`  ✓ Condition: ${interp.criticalCondition}`);
  if (interp.peopleCount !== null && interp.peopleCount !== undefined) {
    console.log(`  ✓ People: ${interp.peopleCount}`);
  }
  if (interp.location) {
    console.log(`  ✓ Location: ${interp.location} ${interp.locationConfirmed ? '(confirmed)' : '(unconfirmed)'}`);
  }
  if (interp.requestedResource) {
    console.log(`  ✓ Resource: ${interp.requestedResource}`);
  }
  if (interp.inventedFacts && interp.inventedFacts.length > 0) {
    console.log(`  ⚠ INVENTED FACTS: ${interp.inventedFacts.join(', ')}`);
  } else {
    console.log(`  ✓ No invented facts`);
  }
  console.log(`  ✓ Qwen latency: ${qwenResult.latencyMs}ms`);

  return result;
}

function evaluateAccuracy(result: TestResult, metadata: RecordingMetadata): {
  categoryMatch: boolean;
  conditionMatch: boolean;
  peopleMatch: boolean;
  locationMatch: boolean;
  safetyPass: boolean;
  details: string[];
} {
  const details: string[] = [];
  
  if (!result.qwenSuccess || !result.qwenInterpretation) {
    return {
      categoryMatch: false,
      conditionMatch: false,
      peopleMatch: false,
      locationMatch: false,
      safetyPass: false,
      details: ['Full chain failed'],
    };
  }

  const interp = result.qwenInterpretation;
  const expected = metadata.actualContent;

  // Category match
  const categoryMatch = interp.emergencyCategory === expected.emergencyType;
  details.push(`${categoryMatch ? '✓' : '✗'} Category: ${interp.emergencyCategory} (expected: ${expected.emergencyType})`);

  // Condition match
  let conditionMatch = false;
  if (expected.condition && interp.criticalCondition) {
    const condStr = interp.criticalCondition.toLowerCase();
    const expStr = expected.condition.toLowerCase();
    conditionMatch = condStr.includes(expStr) || expStr.includes(condStr);
  } else if (!expected.condition && !interp.criticalCondition) {
    conditionMatch = true;
  }
  if (expected.condition) {
    details.push(`${conditionMatch ? '✓' : '✗'} Condition: ${interp.criticalCondition || 'null'} (expected: ${expected.condition})`);
  }

  // People count match
  let peopleMatch = false;
  if (expected.people !== undefined && interp.peopleCount !== null && interp.peopleCount !== undefined) {
    peopleMatch = interp.peopleCount === expected.people;
    details.push(`${peopleMatch ? '✓' : '✗'} People: ${interp.peopleCount} (expected: ${expected.people})`);
  } else if (expected.people === undefined && (interp.peopleCount === null || interp.peopleCount === undefined)) {
    peopleMatch = true;
  }

  // Location match
  let locationMatch = false;
  if (expected.location && interp.location) {
    const locStr = interp.location.toLowerCase();
    const expStr = expected.location.toLowerCase();
    locationMatch = locStr.includes(expStr) || expStr.includes(locStr);
    details.push(`${locationMatch ? '✓' : '✗'} Location: ${interp.location} ${interp.locationConfirmed ? '(confirmed)' : '(unconfirmed)'} (expected: ${expected.location})`);
  }

  // Safety check
  const safetyPass = !interp.inventedFacts || interp.inventedFacts.length === 0;
  if (!safetyPass) {
    details.push(`✗ SAFETY FAIL: Invented facts: ${interp.inventedFacts.join(', ')}`);
  } else {
    details.push('✓ Safety: No invented facts');
  }

  return {
    categoryMatch,
    conditionMatch,
    peopleMatch,
    locationMatch,
    safetyPass,
    details,
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Full-Chain Voice Test: ASR → Qwen → Emergency Intel    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const audioDir = path.join(__dirname, 'voice-test-audio');
  const results: TestResult[] = [];
  const accuracies: ReturnType<typeof evaluateAccuracy>[] = [];

  for (const metadata of RECORDING_METADATA) {
    const filePath = path.join(audioDir, metadata.file);
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠ Skipping ${metadata.file} (not found)`);
      continue;
    }

    const result = await testFullChain(filePath, metadata);
    results.push(result);

    const accuracy = evaluateAccuracy(result, metadata);
    accuracies.push(accuracy);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const asrSuccess = results.filter(r => r.asrSuccess);
  const qwenSuccess = results.filter(r => r.qwenSuccess);

  console.log(`\nTotal recordings: ${results.length}`);
  console.log(`ASR success: ${asrSuccess.length}/${results.length}`);
  console.log(`Qwen success: ${qwenSuccess.length}/${results.length}`);

  if (asrSuccess.length === 0) {
    console.log('\n⚠ TEST INVALID — no successful ASR results.');
    return;
  }

  // Calculate metrics
  const avgAsrConfidence = asrSuccess.reduce((sum, r) => sum + (r.asrConfidence || 0), 0) / asrSuccess.length;
  const avgAsrLatency = asrSuccess.reduce((sum, r) => sum + r.asrLatencyMs, 0) / asrSuccess.length;
  const avgQwenLatency = qwenSuccess.reduce((sum, r) => sum + (r.qwenLatencyMs || 0), 0) / qwenSuccess.length;
  const avgTotalLatency = qwenSuccess.reduce((sum, r) => sum + r.asrLatencyMs + (r.qwenLatencyMs || 0), 0) / qwenSuccess.length;

  const categoryAccurate = accuracies.filter(a => a.categoryMatch).length;
  const conditionAccurate = accuracies.filter(a => a.conditionMatch).length;
  const peopleAccurate = accuracies.filter(a => a.peopleMatch).length;
  const locationAccurate = accuracies.filter(a => a.locationMatch).length;
  const safetyPass = accuracies.filter(a => a.safetyPass).length;

  console.log('\n--- ASR Metrics ---');
  console.log(`Average confidence: ${avgAsrConfidence.toFixed(4)}`);
  console.log(`Average ASR latency: ${avgAsrLatency.toFixed(0)}ms`);

  console.log('\n--- Qwen Metrics ---');
  console.log(`Average Qwen latency: ${avgQwenLatency.toFixed(0)}ms`);

  console.log('\n--- Full-Chain Metrics ---');
  console.log(`Average total latency: ${avgTotalLatency.toFixed(0)}ms`);
  console.log(`Emergency category accuracy: ${categoryAccurate}/${qwenSuccess.length} (${((categoryAccurate / qwenSuccess.length) * 100).toFixed(1)}%)`);
  console.log(`Critical condition accuracy: ${conditionAccurate}/${qwenSuccess.length} (${((conditionAccurate / qwenSuccess.length) * 100).toFixed(1)}%)`);
  console.log(`People count accuracy: ${peopleAccurate}/${qwenSuccess.length} (${((peopleAccurate / qwenSuccess.length) * 100).toFixed(1)}%)`);
  console.log(`Location accuracy: ${locationAccurate}/${qwenSuccess.length} (${((locationAccurate / qwenSuccess.length) * 100).toFixed(1)}%)`);
  console.log(`Safety (no invented facts): ${safetyPass}/${qwenSuccess.length} (${((safetyPass / qwenSuccess.length) * 100).toFixed(1)}%)`);

  // Detailed results
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('='.repeat(80));

  results.forEach((result, idx) => {
    const metadata = RECORDING_METADATA[idx];
    const accuracy = accuracies[idx];

    console.log(`\n${result.file}`);
    console.log(`  ASR: ${result.asrSuccess ? '✓' : '✗'} ${result.asrTranscript || result.asrError}`);
    if (result.asrConfidence) console.log(`       Confidence: ${result.asrConfidence.toFixed(4)}, Latency: ${result.asrLatencyMs}ms`);
    
    if (result.qwenSuccess) {
      console.log(`  Qwen: ✓ Latency: ${result.qwenLatencyMs}ms`);
      console.log(`       Category: ${result.emergencyCategory} (${result.severity})`);
      if (result.criticalCondition) console.log(`       Condition: ${result.criticalCondition}`);
      if (result.peopleCount !== null && result.peopleCount !== undefined) console.log(`       People: ${result.peopleCount}`);
      if (result.location) console.log(`       Location: ${result.location} ${result.locationConfirmed ? '(confirmed)' : '(unconfirmed)'}`);
      if (result.requestedResource) console.log(`       Resource: ${result.requestedResource}`);
    } else {
      console.log(`  Qwen: ✗ ${result.qwenError}`);
    }

    console.log(`  Accuracy:`);
    accuracy.details.forEach(d => console.log(`    ${d}`));
  });

  // Acceptance decision
  console.log('\n' + '='.repeat(80));
  console.log('ACCEPTANCE DECISION');
  console.log('='.repeat(80));

  const categoryRate = (categoryAccurate / qwenSuccess.length) * 100;
  const conditionRate = (conditionAccurate / qwenSuccess.length) * 100;
  const safetyRate = (safetyPass / qwenSuccess.length) * 100;

  console.log(`\nEmergency category accuracy: ${categoryRate.toFixed(1)}%`);
  console.log(`Critical condition accuracy: ${conditionRate.toFixed(1)}%`);
  console.log(`Safety (no invented facts): ${safetyRate.toFixed(1)}%`);

  if (categoryRate >= 90 && conditionRate >= 90 && safetyRate === 100) {
    console.log('\n✅ ACCEPTED: Full-chain voice intake meets acceptance criteria');
    console.log('   READY FOR TWILIO END-TO-END TEST');
  } else if (categoryRate >= 70 && conditionRate >= 70 && safetyRate === 100) {
    console.log('\n⚠️  CONDITIONAL: Voice intake needs improvement');
    console.log('   Consider: better prompts, dual-pass ASR, or clarification flow');
  } else {
    console.log('\n❌ REJECTED: Voice intake does not meet acceptance criteria');
  }

  // Save results
  const reportPath = path.join(__dirname, 'full-chain-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, accuracies }, null, 2));
  console.log(`\n📄 Results saved to: ${reportPath}`);
}

main().catch(console.error);
