/**
 * Full Human Voice ASR Test Suite
 * Tests all 6 recordings with Google Chirp 2 V2
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

interface TestResult {
  file: string;
  expectedType: string;
  transcript: string | null;
  confidence: number | null;
  language: string | null;
  latencyMs: number;
  success: boolean;
  error?: string;
}

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

async function transcribeAudio(filePath: string, languageCode: string = 'ur-PK'): Promise<TestResult> {
  const fileName = path.basename(filePath);
  const audioBuffer = fs.readFileSync(filePath);
  
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    return {
      file: fileName,
      expectedType: getExpectedType(fileName),
      transcript: null,
      confidence: null,
      language: null,
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
      languageCodes: [languageCode],
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
        file: fileName,
        expectedType: getExpectedType(fileName),
        transcript: null,
        confidence: null,
        language: null,
        latencyMs,
        success: false,
        error: `API_ERROR_${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    const data = JSON.parse(responseText);
    const results = data.results || [];

    if (results.length === 0 || !results[0].alternatives || results[0].alternatives.length === 0) {
      return {
        file: fileName,
        expectedType: getExpectedType(fileName),
        transcript: null,
        confidence: null,
        language: null,
        latencyMs,
        success: false,
        error: 'NO_RESULTS',
      };
    }

    const best = results[0].alternatives[0];
    return {
      file: fileName,
      expectedType: getExpectedType(fileName),
      transcript: best.transcript || null,
      confidence: best.confidence || null,
      language: results[0].languageCode || null,
      latencyMs,
      success: true,
    };

  } catch (error) {
    return {
      file: fileName,
      expectedType: getExpectedType(fileName),
      transcript: null,
      confidence: null,
      language: null,
      latencyMs: Date.now() - startTime,
      success: false,
      error: 'REQUEST_FAILED: ' + (error instanceof Error ? error.message : String(error)),
    };
  }
}

function getExpectedType(fileName: string): string {
  if (fileName.includes('urdu-A')) return 'unconscious';
  if (fileName.includes('urdu-B')) return 'location';
  if (fileName.includes('urdu-C')) return 'breathing';
  if (fileName.includes('urdu-D')) return 'accident';
  if (fileName.includes('urdu-E')) return 'fire';
  if (fileName.includes('roman-F')) return 'roman_unconscious';
  return 'unknown';
}

function evaluateSemanticPreservation(result: TestResult): { preserved: boolean; details: string[] } {
  if (!result.success || !result.transcript) {
    return { preserved: false, details: ['ASR failed'] };
  }

  const transcript = result.transcript;
  const details: string[] = [];
  let preserved = false;

  switch (result.expectedType) {
    case 'unconscious':
    case 'roman_unconscious':
      // Should contain: unconscious (بے ہوش / بیہوش / behosh) + mother (والدہ / امی / ammi)
      const hasUnconscious = /بے\s*ہوش|بیہوش|behosh|unconscious/i.test(transcript);
      const hasMother = /والد|والدہ|امی|امّی|ammi|mother/i.test(transcript);
      preserved = hasUnconscious && hasMother;
      if (hasUnconscious) details.push('✓ unconscious detected');
      else details.push('✗ unconscious missing');
      if (hasMother) details.push('✓ mother detected');
      else details.push('✗ mother missing');
      break;

    case 'location':
      // Should contain: Gulshan (گلشن) + Block 7 (بلاک سات / بلاک 7)
      const hasGulshan = /گلشن|Gulshan/i.test(transcript);
      const hasBlock7 = /بلاک\s*سات|بلاک\s*7|block\s*7/i.test(transcript);
      preserved = hasGulshan && hasBlock7;
      if (hasGulshan) details.push('✓ Gulshan detected');
      else details.push('✗ Gulshan missing');
      if (hasBlock7) details.push('✓ Block 7 detected');
      else details.push('✗ Block 7 missing');
      break;

    case 'breathing':
      // Should contain: not breathing (سانس نہیں / sans nahi) + brother (بھائی / bhai)
      const hasBreathing = /سانس\s*نہیں|sans\s*nahi|not\s*breathing/i.test(transcript);
      const hasBrother = /بھائی|بھایا|bhai|brother/i.test(transcript);
      preserved = hasBreathing && hasBrother;
      if (hasBreathing) details.push('✓ not breathing detected');
      else details.push('✗ not breathing missing');
      if (hasBrother) details.push('✓ brother detected');
      else details.push('✗ brother missing');
      break;

    case 'accident':
      // Should contain: accident (ایکسیڈنٹ / حادثہ / accident) + 2 people (دو لوگ / do log)
      const hasAccident = /ایکسیڈنٹ|حادثہ|accident/i.test(transcript);
      const hasTwoPeople = /دو\s*لوگ|دو\s*افراد|do\s*log|two\s*people|2\s*people/i.test(transcript);
      preserved = hasAccident && hasTwoPeople;
      if (hasAccident) details.push('✓ accident detected');
      else details.push('✗ accident missing');
      if (hasTwoPeople) details.push('✓ 2 people detected');
      else details.push('✗ 2 people missing');
      break;

    case 'fire':
      // Should contain: fire (آگ / fire) + help (مدد / help)
      const hasFire = /آگ|fire/i.test(transcript);
      const hasHelp = /مدد|help/i.test(transcript);
      preserved = hasFire && hasHelp;
      if (hasFire) details.push('✓ fire detected');
      else details.push('✗ fire missing');
      if (hasHelp) details.push('✓ help detected');
      else details.push('✗ help missing');
      break;

    default:
      details.push('Unknown expected type');
  }

  return { preserved, details };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Human Voice ASR Test Suite - Full Run                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const audioDir = path.join(__dirname, 'voice-test-audio');
  const files = [
    'urdu-A.webm',
    'urdu-B.webm',
    'urdu-C.webm',
    'urdu-D.webm',
    'urdu-E.webm',
    'roman-F.webm',
  ];

  const results: TestResult[] = [];

  for (const file of files) {
    const filePath = path.join(audioDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠ Skipping ${file} (not found)`);
      continue;
    }

    console.log(`\nTesting: ${file}`);
    const result = await transcribeAudio(filePath, 'ur-PK');
    results.push(result);

    if (result.success) {
      console.log(`  ✓ Transcript: ${result.transcript}`);
      console.log(`  ✓ Confidence: ${result.confidence?.toFixed(4)}`);
      console.log(`  ✓ Language: ${result.language}`);
      console.log(`  ✓ Latency: ${result.latencyMs}ms`);

      const eval_ = evaluateSemanticPreservation(result);
      console.log(`  Semantic preservation: ${eval_.preserved ? '✓ YES' : '✗ NO'}`);
      eval_.details.forEach(d => console.log(`    ${d}`));
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nTotal files: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length === 0) {
    console.log('\n⚠ TEST INVALID — no successful ASR results.');
    console.log('Fix provider/auth/audio configuration before evaluating Urdu quality.');
    return;
  }

  // Calculate semantic preservation
  const preserved = results.filter(r => r.success && evaluateSemanticPreservation(r).preserved);
  const preservationRate = (preserved.length / successful.length) * 100;

  console.log(`\nSemantic preservation: ${preserved.length}/${successful.length} (${preservationRate.toFixed(1)}%)`);

  // Average latency
  const avgLatency = successful.reduce((sum, r) => sum + r.latencyMs, 0) / successful.length;
  console.log(`Average latency: ${avgLatency.toFixed(0)}ms`);

  // Average confidence
  const avgConfidence = successful.reduce((sum, r) => sum + (r.confidence || 0), 0) / successful.length;
  console.log(`Average confidence: ${avgConfidence.toFixed(4)}`);

  // Detailed results table
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('='.repeat(80));

  results.forEach(r => {
    console.log(`\n${r.file} [${r.expectedType}]`);
    if (r.success) {
      console.log(`  Transcript: ${r.transcript}`);
      console.log(`  Confidence: ${r.confidence?.toFixed(4)}`);
      console.log(`  Language: ${r.language}`);
      console.log(`  Latency: ${r.latencyMs}ms`);
      const eval_ = evaluateSemanticPreservation(r);
      console.log(`  Semantic: ${eval_.preserved ? '✓ PRESERVED' : '✗ NOT PRESERVED'}`);
      eval_.details.forEach(d => console.log(`    ${d}`));
    } else {
      console.log(`  ✗ FAILED: ${r.error}`);
    }
  });

  // Acceptance decision
  console.log('\n' + '='.repeat(80));
  console.log('ACCEPTANCE DECISION');
  console.log('='.repeat(80));

  if (preservationRate >= 90) {
    console.log('\n✅ ACCEPTED: Urdu voice intake meets acceptance criteria');
    console.log(`   Semantic preservation: ${preservationRate.toFixed(1)}% (≥90%)`);
  } else if (preservationRate >= 70) {
    console.log('\n⚠️  CONDITIONAL: Urdu voice intake needs improvement');
    console.log(`   Semantic preservation: ${preservationRate.toFixed(1)}% (70-89%)`);
    console.log('   Consider: dual-pass strategy, model adaptation, or Qwen recovery');
  } else {
    console.log('\n❌ REJECTED: Urdu voice intake does not meet acceptance criteria');
    console.log(`   Semantic preservation: ${preservationRate.toFixed(1)}% (<70%)`);
  }
}

main().catch(console.error);
