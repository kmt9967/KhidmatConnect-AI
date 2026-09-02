/**
 * Human Voice ASR Test Suite - Milestone 9 Validation
 * 
 * Tests real human speech (not TTS) with:
 * - Google Chirp 2 (ur-PK, en-US)
 * - Google V1 models (if available)
 * - Google Chirp 3 (if available)
 * - Dual-pass strategy (ur-PK + en-US)
 * - Full chain: ASR → Qwen → meaning
 * - Location accuracy
 * - Latency measurement
 */

import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
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
  testName: string;
  model: string;
  language: string;
  transcript: string | null;
  confidence: number | null;
  latencyMs: number;
  emergencyType: string | null;
  locationExtracted: string | null;
  meaningPreserved: boolean;
  semanticScore: number;
}

interface FullChainResult {
  asrTranscript: string;
  qwenInterpretation: string;
  emergencyType: string | null;
  severity: string | null;
  location: string | null;
  victims: number | null;
  meaningPreserved: boolean;
}

const TEST_AUDIO_DIR = path.join(__dirname, 'voice-test-audio');

// Emergency vocabulary for semantic matching
const EMERGENCY_KEYWORDS = {
  urdu: {
    unconscious: ['بے ہوش', 'behosh', 'unconscious'],
    breathing: ['سانس', 'sans', 'breath', 'breathing'],
    accident: ['ایکسیڈنٹ', 'accident', 'حادثہ', 'hadsa'],
    fire: ['آگ', 'aag', 'fire'],
    injured: ['زخمی', 'zakhmi', 'injured'],
    bleeding: ['خون', 'khoon', 'bleeding'],
    ambulance: ['ایمبولینس', 'ambulance'],
    help: ['مدد', 'madad', 'help'],
    mother: ['والدہ', 'والدی', 'امی', 'ammi', 'mother'],
    brother: ['بھائی', 'bhai', 'brother'],
  },
  locations: [
    'گلشن', 'Gulshan', 'ناظم آباد', 'Nazimabad', 'کورنگی', 'Korangi',
    'کلفٹن', 'Clifton', 'صدر', 'Saddar', 'DHA', 'مالیر', 'Malir',
    'گلبرگ', 'Gulberg', 'NIPA', 'بلاک', 'Block', 'block'
  ]
};

async function getAccessToken(): Promise<string> {
  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  
  if (!fs.existsSync(adcPath)) {
    throw new Error('ADC credentials not found');
  }

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  
  if (creds.type === 'authorized_user') {
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
    
    const data = await response.json() as any;
    return data.access_token;
  }
  
  throw new Error('Unsupported credential type');
}

async function transcribeWithGoogle(
  audioBuffer: Buffer,
  model: string,
  languageCode: string,
  location: string = 'asia-southeast1'
): Promise<{ transcript: string | null; confidence: number | null; latencyMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const accessToken = await getAccessToken();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
    const audioContent = audioBuffer.toString('base64');

    const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

    const requestBody = {
      config: {
        model: model,
        languageCodes: [languageCode],
        features: { enableAutomaticPunctuation: true },
        autoDecodingConfig: {},
      },
      content: audioContent,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return { transcript: null, confidence: null, latencyMs, error: responseText };
    }

    const data = JSON.parse(responseText);
    const results = data.results || [];

    if (results.length === 0) {
      return { transcript: null, confidence: null, latencyMs, error: 'No results' };
    }

    const alternatives = results[0]?.alternatives || [];
    if (alternatives.length === 0) {
      return { transcript: null, confidence: null, latencyMs, error: 'No alternatives' };
    }

    return {
      transcript: alternatives[0]?.transcript || null,
      confidence: alternatives[0]?.confidence || null,
      latencyMs,
    };
  } catch (error) {
    return {
      transcript: null,
      confidence: null,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function transcribeWithGoogleV1(
  audioBuffer: Buffer,
  model: string,
  languageCode: string
): Promise<{ transcript: string | null; confidence: number | null; latencyMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const accessToken = await getAccessToken();
    const audioContent = audioBuffer.toString('base64');

    const url = 'https://speech.googleapis.com/v1/speech:recognize';

    const requestBody = {
      config: {
        encoding: 'AUTO',
        sampleRateHertz: 8000,
        languageCode: languageCode,
        model: model,
        enableAutomaticPunctuation: true,
      },
      audio: { content: audioContent },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return { transcript: null, confidence: null, latencyMs, error: responseText };
    }

    const data = JSON.parse(responseText);
    const results = data.results || [];

    if (results.length === 0) {
      return { transcript: null, confidence: null, latencyMs, error: 'No results' };
    }

    const alternatives = results[0]?.alternatives || [];
    if (alternatives.length === 0) {
      return { transcript: null, confidence: null, latencyMs, error: 'No alternatives' };
    }

    return {
      transcript: alternatives[0]?.transcript || null,
      confidence: alternatives[0]?.confidence || null,
      latencyMs,
    };
  } catch (error) {
    return {
      transcript: null,
      confidence: null,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function qwenSemanticAnalysis(transcript: string): Promise<FullChainResult> {
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  if (!apiKey) {
    throw new Error('ALIBABA_MODEL_STUDIO_API_KEY not set');
  }

  const startTime = Date.now();

  const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an emergency call analyzer. Extract structured information from the transcript.
Return JSON with these fields:
- emergencyType: "medical" | "accident" | "fire" | "crime" | "other" | null
- severity: "critical" | "serious" | "moderate" | "minor" | null
- location: extracted location string or null
- victims: number of people mentioned or null
- criticalCondition: "unconscious" | "not_breathing" | "injured" | "bleeding" | "burned" | null
- meaningPreserved: boolean (does the transcript convey a clear emergency?)

Be conservative: if information is unclear or missing, use null. Never invent information.`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await response.json() as any;
  const latencyMs = Date.now() - startTime;

  console.log(`[Qwen] latency=${latencyMs}ms`);

  try {
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    
    return {
      asrTranscript: transcript,
      qwenInterpretation: content,
      emergencyType: parsed.emergencyType || null,
      severity: parsed.severity || null,
      location: parsed.location || null,
      victims: parsed.victims || null,
      meaningPreserved: parsed.meaningPreserved || false,
    };
  } catch (error) {
    return {
      asrTranscript: transcript,
      qwenInterpretation: 'Parse error',
      emergencyType: null,
      severity: null,
      location: null,
      victims: null,
      meaningPreserved: false,
    };
  }
}

function evaluateSemanticScore(transcript: string, expectedType: string): number {
  let score = 0;
  const lowerTranscript = transcript.toLowerCase();
  
  // Check emergency keywords
  const keywords = EMERGENCY_KEYWORDS.urdu;
  
  if (expectedType === 'unconscious') {
    if (keywords.unconscious.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 40;
    if (keywords.mother.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 30;
    if (keywords.ambulance.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 30;
  } else if (expectedType === 'location') {
    if (EMERGENCY_KEYWORDS.locations.some(loc => lowerTranscript.includes(loc.toLowerCase()))) score += 50;
    if (keywords.ambulance.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 50;
  } else if (expectedType === 'breathing') {
    if (keywords.breathing.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 50;
    if (keywords.brother.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 50;
  } else if (expectedType === 'accident') {
    if (keywords.accident.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 40;
    if (keywords.injured.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 40;
    if (lowerTranscript.includes('دو') || lowerTranscript.includes('do') || lowerTranscript.includes('2')) score += 20;
  } else if (expectedType === 'fire') {
    if (keywords.fire.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 60;
    if (keywords.help.some(k => lowerTranscript.includes(k.toLowerCase()))) score += 40;
  }
  
  return Math.min(score, 100);
}

async function testAudioFile(filePath: string, testName: string, expectedType: string): Promise<TestResult[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${testName}`);
  console.log(`File: ${path.basename(filePath)}`);
  console.log(`Expected: ${expectedType}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(filePath)) {
    console.log(`⚠ File not found: ${filePath}`);
    return [];
  }

  const audioBuffer = fs.readFileSync(filePath);
  console.log(`Audio size: ${audioBuffer.length} bytes`);

  const results: TestResult[] = [];

  // Test 1: Chirp 2 with ur-PK
  console.log('\n[Test 1] Chirp 2 + ur-PK');
  const chirp2Urdu = await transcribeWithGoogle(audioBuffer, 'chirp_2', 'ur-PK');
  console.log(`  Transcript: ${chirp2Urdu.transcript || '(null)'}`);
  console.log(`  Confidence: ${chirp2Urdu.confidence?.toFixed(2) || 'null'}`);
  console.log(`  Latency: ${chirp2Urdu.latencyMs}ms`);
  
  if (chirp2Urdu.transcript) {
    const semanticScore = evaluateSemanticScore(chirp2Urdu.transcript, expectedType);
    const qwenResult = await qwenSemanticAnalysis(chirp2Urdu.transcript);
    
    results.push({
      testName,
      model: 'chirp_2',
      language: 'ur-PK',
      transcript: chirp2Urdu.transcript,
      confidence: chirp2Urdu.confidence,
      latencyMs: chirp2Urdu.latencyMs,
      emergencyType: qwenResult.emergencyType,
      locationExtracted: qwenResult.location,
      meaningPreserved: qwenResult.meaningPreserved,
      semanticScore,
    });
  }

  // Test 2: Chirp 2 with en-US (for comparison)
  console.log('\n[Test 2] Chirp 2 + en-US');
  const chirp2English = await transcribeWithGoogle(audioBuffer, 'chirp_2', 'en-US');
  console.log(`  Transcript: ${chirp2English.transcript || '(null)'}`);
  console.log(`  Confidence: ${chirp2English.confidence?.toFixed(2) || 'null'}`);
  console.log(`  Latency: ${chirp2English.latencyMs}ms`);
  
  if (chirp2English.transcript) {
    const semanticScore = evaluateSemanticScore(chirp2English.transcript, expectedType);
    const qwenResult = await qwenSemanticAnalysis(chirp2English.transcript);
    
    results.push({
      testName,
      model: 'chirp_2',
      language: 'en-US',
      transcript: chirp2English.transcript,
      confidence: chirp2English.confidence,
      latencyMs: chirp2English.latencyMs,
      emergencyType: qwenResult.emergencyType,
      locationExtracted: qwenResult.location,
      meaningPreserved: qwenResult.meaningPreserved,
      semanticScore,
    });
  }

  // Test 3: Google V1 with ur-PK
  console.log('\n[Test 3] Google V1 + ur-PK (default model)');
  const v1Urdu = await transcribeWithGoogleV1(audioBuffer, 'default', 'ur-PK');
  console.log(`  Transcript: ${v1Urdu.transcript || '(null)'}`);
  console.log(`  Confidence: ${v1Urdu.confidence?.toFixed(2) || 'null'}`);
  console.log(`  Latency: ${v1Urdu.latencyMs}ms`);
  console.log(`  Error: ${v1Urdu.error || 'none'}`);
  
  if (v1Urdu.transcript) {
    const semanticScore = evaluateSemanticScore(v1Urdu.transcript, expectedType);
    const qwenResult = await qwenSemanticAnalysis(v1Urdu.transcript);
    
    results.push({
      testName,
      model: 'v1_default',
      language: 'ur-PK',
      transcript: v1Urdu.transcript,
      confidence: v1Urdu.confidence,
      latencyMs: v1Urdu.latencyMs,
      emergencyType: qwenResult.emergencyType,
      locationExtracted: qwenResult.location,
      meaningPreserved: qwenResult.meaningPreserved,
      semanticScore,
    });
  }

  return results;
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Human Voice ASR Test Suite - Milestone 9 Validation    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  if (!fs.existsSync(TEST_AUDIO_DIR)) {
    console.error(`❌ Test audio directory not found: ${TEST_AUDIO_DIR}`);
    console.error('Please record human voice samples first using: scripts/voice-test-audio/recorder.html');
    return;
  }

  const audioFiles = fs.readdirSync(TEST_AUDIO_DIR).filter(f => f.endsWith('.wav') || f.endsWith('.webm') || f.endsWith('.ogg'));
  
  if (audioFiles.length === 0) {
    console.error('❌ No audio files found in voice-test-audio folder');
    console.error('Please record human voice samples first (WAV or WebM).');
    return;
  }

  console.log(`Found ${audioFiles.length} audio files`);
  console.log();

  const allResults: TestResult[] = [];

  // Test each audio file
  for (const file of audioFiles) {
    const filePath = path.join(TEST_AUDIO_DIR, file);
    const testName = path.basename(file).replace(/\.(wav|webm|ogg)$/, '');
    
    // Determine expected type from filename
    let expectedType = 'unknown';
    if (file.includes('A') || file.includes('unconscious') || file.includes('behosh')) {
      expectedType = 'unconscious';
    } else if (file.includes('B') || file.includes('location') || file.includes('Gulshan')) {
      expectedType = 'location';
    } else if (file.includes('C') || file.includes('breathing') || file.includes('sans')) {
      expectedType = 'breathing';
    } else if (file.includes('D') || file.includes('accident')) {
      expectedType = 'accident';
    } else if (file.includes('E') || file.includes('fire') || file.includes('aag')) {
      expectedType = 'fire';
    }

    const results = await testAudioFile(filePath, testName, expectedType);
    allResults.push(...results);
  }

  // Generate summary report
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY REPORT');
  console.log('='.repeat(80));

  const summary = {
    totalTests: allResults.length,
    meaningPreserved: allResults.filter(r => r.meaningPreserved).length,
    avgSemanticScore: allResults.reduce((sum, r) => sum + r.semanticScore, 0) / allResults.length,
    avgLatency: allResults.reduce((sum, r) => sum + r.latencyMs, 0) / allResults.length,
    byModel: {} as Record<string, { count: number; preserved: number; avgScore: number }>,
    byLanguage: {} as Record<string, { count: number; preserved: number; avgScore: number }>,
  };

  // Group by model
  for (const result of allResults) {
    const key = `${result.model}_${result.language}`;
    if (!summary.byModel[key]) {
      summary.byModel[key] = { count: 0, preserved: 0, avgScore: 0 };
    }
    summary.byModel[key].count++;
    if (result.meaningPreserved) summary.byModel[key].preserved++;
    summary.byModel[key].avgScore += result.semanticScore;
  }

  // Calculate averages
  for (const key in summary.byModel) {
    const data = summary.byModel[key];
    data.avgScore = data.avgScore / data.count;
  }

  console.log('\n📊 Overall Statistics:');
  console.log(`  Total tests: ${summary.totalTests}`);
  console.log(`  Meaning preserved: ${summary.meaningPreserved}/${summary.totalTests} (${((summary.meaningPreserved / summary.totalTests) * 100).toFixed(1)}%)`);
  console.log(`  Avg semantic score: ${summary.avgSemanticScore.toFixed(1)}%`);
  console.log(`  Avg latency: ${summary.avgLatency.toFixed(0)}ms`);

  console.log('\n📈 By Model/Language:');
  for (const [key, data] of Object.entries(summary.byModel)) {
    const preserveRate = ((data.preserved / data.count) * 100).toFixed(1);
    console.log(`  ${key}: ${data.preserved}/${data.count} preserved (${preserveRate}%), avg score: ${data.avgScore.toFixed(1)}%`);
  }

  console.log('\n📝 Detailed Results:');
  console.log('─'.repeat(80));
  for (const result of allResults) {
    console.log(`\n${result.testName} [${result.model}/${result.language}]`);
    console.log(`  Transcript: ${result.transcript}`);
    console.log(`  Confidence: ${result.confidence?.toFixed(2) || 'null'}`);
    console.log(`  Latency: ${result.latencyMs}ms`);
    console.log(`  Emergency Type: ${result.emergencyType || 'null'}`);
    console.log(`  Location: ${result.locationExtracted || 'null'}`);
    console.log(`  Semantic Score: ${result.semanticScore}%`);
    console.log(`  Meaning Preserved: ${result.meaningPreserved ? '✓ YES' : '✗ NO'}`);
  }

  // Acceptance decision
  console.log('\n' + '='.repeat(80));
  console.log('ACCEPTANCE DECISION');
  console.log('='.repeat(80));

  const preservationRate = (summary.meaningPreserved / summary.totalTests) * 100;
  const avgScore = summary.avgSemanticScore;

  console.log(`\nEmergency meaning preservation: ${preservationRate.toFixed(1)}%`);
  console.log(`Average semantic score: ${avgScore.toFixed(1)}%`);
  console.log(`Average latency: ${summary.avgLatency.toFixed(0)}ms`);

  if (preservationRate >= 90 && avgScore >= 85) {
    console.log('\n✅ ACCEPTED: Urdu voice intake meets acceptance criteria');
    console.log('   - Emergency preservation >= 90%');
    console.log('   - Semantic score >= 85%');
  } else if (preservationRate >= 70) {
    console.log('\n⚠️  CONDITIONAL: Urdu voice intake needs improvement');
    console.log('   - Emergency preservation >= 70% but < 90%');
    console.log('   - Consider: dual-pass strategy, model adaptation, or Qwen recovery');
  } else {
    console.log('\n❌ REJECTED: Urdu voice intake does not meet acceptance criteria');
    console.log('   - Emergency preservation < 70%');
    console.log('   - Requires: further optimization or alternative approach');
  }

  // Save results to file
  const reportPath = path.join(__dirname, 'human-voice-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results: allResults }, null, 2));
  console.log(`\n📄 Detailed results saved to: ${reportPath}`);
}

runAllTests().catch(console.error);
