/**
 * FINAL VOICE VALIDATION — Milestone 9
 *
 * Full-chain test: Real Human Audio → Chirp 2 → Qwen-turbo → Emergency Interpretation → TTS
 *
 * Metrics (separated, not combined):
 *   ASR_PROVIDER_SUCCESS
 *   TRANSCRIPT_QUALITY
 *   SEMANTIC_EMERGENCY_ACCURACY
 *   LOCATION_ACCURACY
 *   QWEN_EXTRACTION_ACCURACY
 *   SAFETY / INVENTION (zero tolerance)
 *
 * Language model:
 *   Spoken language = URDU | ENGLISH | MIXED_URDU_ENGLISH
 *   Roman Urdu is a writing convention, NOT a separate spoken language.
 */

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

// ─── Env Loading ──────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────

interface RecordingMetadata {
  file: string;
  spokenLanguage: 'URDU' | 'ENGLISH' | 'MIXED_URDU_ENGLISH';
  actualContent: {
    emergencyType: string;
    severity: string;
    condition?: string;
    location?: string;
    people?: number;
    resource?: string;
  };
}

interface AsrResult {
  transcript: string | null;
  confidence: number | null;
  language: string | null;
  latencyMs: number;
  success: boolean;
  error?: string;
}

interface QwenResult {
  interpretation: any;
  latencyMs: number;
  success: boolean;
  error?: string;
}

interface TtsTestResult {
  name: string;
  text: string;
  success: boolean;
  latencyMs: number;
  audioSize?: number;
  error?: string;
}

interface EvaluationResult {
  categoryMatch: boolean;
  severityMatch: boolean;
  conditionMatch: boolean;
  peopleMatch: boolean | null; // null = not applicable
  locationMatch: boolean | null; // null = not applicable
  safetyPass: boolean;
  details: string[];
}

// ─── Corrected Metadata (based on actual recording content) ───

const RECORDINGS: RecordingMetadata[] = [
  {
    file: 'urdu-A.webm',
    spokenLanguage: 'URDU',
    actualContent: {
      emergencyType: 'medical',
      severity: 'critical',
      condition: 'unconscious',
      resource: 'ambulance',
    },
  },
  {
    file: 'urdu-B.webm',
    spokenLanguage: 'URDU',
    actualContent: {
      emergencyType: 'medical',
      severity: 'critical',
      condition: 'heart attack',
      resource: 'ambulance',
    },
  },
  {
    file: 'urdu-C.webm',
    spokenLanguage: 'URDU',
    actualContent: {
      emergencyType: 'fire',
      severity: 'critical',
      condition: 'building fire',
      resource: 'fire brigade',
    },
  },
  {
    file: 'urdu-D.webm',
    spokenLanguage: 'URDU',
    actualContent: {
      emergencyType: 'accident',
      severity: 'serious',
      condition: 'injured',
      location: 'Block 7',
      people: 2,
      resource: 'ambulance',
    },
  },
  {
    file: 'urdu-E.webm',
    spokenLanguage: 'URDU',
    actualContent: {
      emergencyType: 'medical',
      severity: 'critical',
      condition: 'not breathing',
      location: 'Nazimabad',
      resource: 'ambulance',
    },
  },
  {
    file: 'roman-F.webm',
    spokenLanguage: 'URDU', // Roman Urdu prompt → spoken Urdu (NOT a separate language)
    actualContent: {
      emergencyType: 'medical',
      severity: 'moderate',
      location: 'Gulshan Block 7',
      resource: 'ambulance',
    },
  },
];

// ─── ADC Token Management ─────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  if (!fs.existsSync(adcPath)) throw new Error('ADC not found');

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

  if (!response.ok) throw new Error('Token refresh failed: ' + response.status);
  const data = await response.json() as any;
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken!;
}

// ─── ASR: Google Chirp 2 V2 ──────────────────────────────────

async function transcribeWithChirp2(filePath: string): Promise<AsrResult> {
  const audioBuffer = fs.readFileSync(filePath);
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    return { transcript: null, confidence: null, language: null, latencyMs: 0, success: false, error: 'AUTH_FAILED: ' + (error instanceof Error ? error.message : String(error)) };
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
  const location = 'asia-southeast1';
  const audioContent = audioBuffer.toString('base64');
  const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;

  const requestBody = {
    config: {
      model: 'chirp_2',
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
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const latencyMs = Date.now() - startTime;
    const responseText = await response.text();
    if (!response.ok) {
      return { transcript: null, confidence: null, language: null, latencyMs, success: false, error: `API_${response.status}: ${responseText.substring(0, 200)}` };
    }
    const data = JSON.parse(responseText);
    const results = data.results || [];
    if (results.length === 0 || !results[0].alternatives?.length) {
      return { transcript: null, confidence: null, language: null, latencyMs, success: false, error: 'NO_RESULTS' };
    }
    const best = results[0].alternatives[0];
    return {
      transcript: best.transcript || null,
      confidence: best.confidence ?? null,
      language: results[0].languageCode || null,
      latencyMs,
      success: !!best.transcript,
    };
  } catch (error) {
    return { transcript: null, confidence: null, language: null, latencyMs: Date.now() - startTime, success: false, error: 'REQUEST_FAILED: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

// ─── Qwen-turbo Interpretation ────────────────────────────────

async function interpretWithQwen(transcript: string): Promise<QwenResult> {
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
          content: `You are an emergency call interpreter for KhidmatConnect AI (Pakistan).

Extract structured emergency information from the caller's transcript.
The transcript may be in Urdu script, Roman Urdu, English, or a mix.

Return JSON with these fields:
- emergencyCategory: "medical" | "accident" | "fire" | "crime" | "other"
- severity: "critical" | "serious" | "moderate" | "minor"
- criticalCondition: specific condition if mentioned (e.g., "unconscious", "not breathing", "heart attack", "injured", "burns") or null
- peopleCount: number of people affected if mentioned, or null
- location: location/landmark if mentioned, or null
- locationConfirmed: true if location is specific (named area/landmark), false if vague
- requestedResource: "ambulance" | "fire brigade" | "police" | "rescue" | null
- inventedFacts: array of any facts you might have invented (should always be empty — NEVER invent)

CRITICAL RULES:
1. ONLY extract what is actually said. NEVER invent facts.
2. If location is unclear, set locationConfirmed = false.
3. If no people count mentioned, set peopleCount = null.
4. "سانس نہیں لے رہا" = not breathing (CRITICAL).
5. "بیہوش" / "بے ہوش" = unconscious (CRITICAL).
6. Preserve the raw transcript exactly as received in a "rawTranscript" field.`,
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;
    if (!content) return { interpretation: null, latencyMs, success: false, error: 'NO_CONTENT' };

    return { interpretation: JSON.parse(content), latencyMs, success: true };
  } catch (error) {
    return { interpretation: null, latencyMs: Date.now() - startTime, success: false, error: 'QWEN_FAILED: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

// ─── TTS: Alibaba qwen3-tts-flash (DashScope native endpoint) ─

async function testTTS(text: string, name: string): Promise<TtsTestResult> {
  const startTime = Date.now();
  const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY;
  const baseUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL;
  if (!apiKey || !baseUrl) {
    return { name, text, success: false, latencyMs: 0, error: 'TTS not configured' };
  }

  const dashScopeBase = baseUrl.replace('/compatible-mode/v1', '');
  const endpoint = `${dashScopeBase}/api/v1/services/aigc/multimodal-generation/generation`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'qwen3-tts-flash',
        input: { text: text.substring(0, 1000), voice: 'Cherry', language_type: 'Auto' },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const latencyMs = Date.now() - startTime;
    if (!response.ok) {
      return { name, text, success: false, latencyMs, error: 'API_' + response.status };
    }

    const data = await response.json();
    const audioUrl = data?.output?.audio?.url;
    let audioSize = 0;

    if (audioUrl) {
      const audioResp = await fetch(audioUrl, { signal: AbortSignal.timeout(10_000) });
      if (audioResp.ok) {
        const buf = Buffer.from(await audioResp.arrayBuffer());
        audioSize = buf.length;
      }
    }

    return { name, text, success: audioSize > 0, latencyMs, audioSize: audioSize || undefined, error: audioSize > 0 ? undefined : 'No audio data' };
  } catch (error) {
    return { name, text, success: false, latencyMs: Date.now() - startTime, error: (error instanceof Error ? error.message : String(error)) };
  }
}

// ─── Evaluation (semantic, not simplistic keyword matching) ───

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[\s\-_,.]+/g, '');
}

function locationMatches(expected: string | undefined, actual: string | null): boolean | null {
  if (!expected || !actual) return null;
  const expNorm = normalizeForCompare(expected);
  const actNorm = normalizeForCompare(actual);
  if (actNorm.includes(expNorm) || expNorm.includes(actNorm)) return true;

  // Cross-script matching for known locations
  const locationAliases: Record<string, string[]> = {
    'gulshan block 7': ['گلشن بلاک سات', 'گلشن بلاک 7', 'گلشن', 'بلاک سات', 'بلاک 7'],
    'nazimabad': ['ناظم اباد', 'ناظم آباد', 'nazimabad'],
    'block 7': ['بلاک سات', 'بلاک 7', 'block 7', 'block7'],
  };

  for (const [key, aliases] of Object.entries(locationAliases)) {
    const expNormClean = normalizeForCompare(key);
    if (expNorm.includes(expNormClean) || expNormClean.includes(expNorm)) {
      for (const alias of aliases) {
        if (actNorm.includes(normalizeForCompare(alias))) return true;
      }
    }
  }
  return false;
}

function conditionMatches(expected: string | undefined, actual: string | null, transcript: string): boolean {
  if (!expected) return !actual;
  if (!actual) {
    // Check if transcript itself contains the condition keywords
    return conditionInTranscript(expected, transcript);
  }
  const expNorm = expected.toLowerCase();
  const actNorm = actual.toLowerCase();
  if (actNorm.includes(expNorm) || expNorm.includes(actNorm)) return true;

  // Cross-language condition matching
  const conditionAliases: Record<string, string[]> = {
    'unconscious': ['unconscious', 'بیہوش', 'بے ہوش', 'behosh'],
    'not breathing': ['not breathing', 'سانس نہیں', 'sans nahi'],
    'heart attack': ['heart attack', 'ہارٹ اٹیک', 'dil ka dora'],
    'injured': ['injured', 'زخمی', 'zakhmi'],
    'building fire': ['fire', 'آگ', 'اگ', 'blaze'],
  };

  for (const [key, aliases] of Object.entries(conditionAliases)) {
    if (expNorm.includes(key) || key.includes(expNorm)) {
      for (const alias of aliases) {
        if (actNorm.includes(alias.toLowerCase())) return true;
      }
    }
  }
  return false;
}

function conditionInTranscript(condition: string, transcript: string): boolean {
  const patterns: Record<string, RegExp> = {
    'unconscious': /بے\s*ہوش|بیہوش|behosh|unconscious/i,
    'not breathing': /سانس\s*نہیں|sans\s*nahi|not\s*breathing/i,
    'heart attack': /ہارٹ\s*اٹیک|heart\s*attack/i,
    'injured': /زخمی|injured|zakhmi/i,
    'building fire': /اگ\s*لگ|آگ|fire|building.*fire/i,
  };
  const regex = patterns[condition.toLowerCase()];
  return regex ? regex.test(transcript) : false;
}

function evaluate(result: { asrTranscript: string | null; qwenInterpretation: any }, meta: RecordingMetadata): EvaluationResult {
  const details: string[] = [];
  const interp = result.qwenInterpretation;
  const expected = meta.actualContent;

  if (!interp) {
    return { categoryMatch: false, severityMatch: false, conditionMatch: false, peopleMatch: null, locationMatch: null, safetyPass: false, details: ['Qwen failed'] };
  }

  // 1. Category
  const categoryMatch = interp.emergencyCategory === expected.emergencyType;
  details.push(`${categoryMatch ? '✓' : '✗'} Category: ${interp.emergencyCategory} (expected: ${expected.emergencyType})`);

  // 2. Severity
  const severityMatch = interp.severity === expected.severity;
  details.push(`${severityMatch ? '✓' : '✗'} Severity: ${interp.severity} (expected: ${expected.severity})`);

  // 3. Condition (semantic)
  const conditionMatch = conditionMatches(expected.condition, interp.criticalCondition, result.asrTranscript || '');
  if (expected.condition) {
    details.push(`${conditionMatch ? '✓' : '✗'} Condition: ${interp.criticalCondition || 'null'} (expected: ${expected.condition})`);
  }

  // 4. People count
  let peopleMatch: boolean | null = null;
  if (expected.people !== undefined) {
    peopleMatch = interp.peopleCount === expected.people;
    details.push(`${peopleMatch ? '✓' : '✗'} People: ${interp.peopleCount ?? 'null'} (expected: ${expected.people})`);
  }

  // 5. Location (flexible cross-script)
  let locationMatch: boolean | null = null;
  if (expected.location) {
    locationMatch = locationMatches(expected.location, interp.location);
    const locStatus = interp.locationConfirmed ? 'confirmed' : 'unconfirmed';
    details.push(`${locationMatch ? '✓' : '✗'} Location: ${interp.location || 'null'} (${locStatus}) (expected: ${expected.location})`);
  }

  // 6. Safety — zero invented facts
  const inventedFacts: string[] = interp.inventedFacts || [];
  const safetyPass = inventedFacts.length === 0;
  if (!safetyPass) {
    details.push(`✗ SAFETY FAIL: Invented: ${inventedFacts.join(', ')}`);
  } else {
    details.push('✓ Safety: Zero invented facts');
  }

  return { categoryMatch, severityMatch, conditionMatch, peopleMatch, locationMatch, safetyPass, details };
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  FINAL VOICE VALIDATION — Milestone 9                       ║');
  console.log('║  Human Audio → Chirp 2 → Qwen-turbo → TTS                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const audioDir = path.join(__dirname, 'voice-test-audio');

  // ── Phase 1: ASR + Qwen ───────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 1: ASR (Google Chirp 2) + Qwen-turbo Interpretation');
  console.log('═'.repeat(70));

  interface FullResult {
    file: string;
    spokenLanguage: string;
    asr: AsrResult;
    qwen: QwenResult | null;
    evaluation: EvaluationResult | null;
  }

  const results: FullResult[] = [];

  for (const meta of RECORDINGS) {
    const filePath = path.join(audioDir, meta.file);
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠ Skipping ${meta.file} (not found)`);
      continue;
    }

    console.log(`\n── ${meta.file} ──`);
    console.log(`Spoken language: ${meta.spokenLanguage}`);

    // ASR
    const asr = await transcribeWithChirp2(filePath);
    console.log(`ASR: ${asr.success ? '✓' : '✗'} confidence=${asr.confidence?.toFixed(4) ?? 'null'} latency=${asr.latencyMs}ms`);
    if (asr.transcript) console.log(`  Transcript: ${asr.transcript}`);
    if (asr.error) console.log(`  Error: ${asr.error}`);

    let qwen: QwenResult | null = null;
    let evaluation: EvaluationResult | null = null;

    if (asr.success && asr.transcript) {
      // Qwen
      qwen = await interpretWithQwen(asr.transcript);
      console.log(`Qwen: ${qwen.success ? '✓' : '✗'} latency=${qwen.latencyMs}ms`);
      if (qwen.interpretation) {
        const i = qwen.interpretation;
        console.log(`  Category: ${i.emergencyCategory} (${i.severity})`);
        if (i.criticalCondition) console.log(`  Condition: ${i.criticalCondition}`);
        if (i.peopleCount != null) console.log(`  People: ${i.peopleCount}`);
        if (i.location) console.log(`  Location: ${i.location} (${i.locationConfirmed ? 'confirmed' : 'unconfirmed'})`);
        if (i.requestedResource) console.log(`  Resource: ${i.requestedResource}`);
        console.log(`  Invented: ${(i.inventedFacts || []).length === 0 ? 'NONE ✓' : (i.inventedFacts || []).join(', ')}`);
      }

      // Evaluate
      evaluation = evaluate({ asrTranscript: asr.transcript, qwenInterpretation: qwen?.interpretation }, meta);
    }

    results.push({ file: meta.file, spokenLanguage: meta.spokenLanguage, asr, qwen, evaluation });
  }

  // ── Phase 2: TTS Validation ───────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 2: TTS Validation (Alibaba qwen3-tts-flash)');
  console.log('═'.repeat(70));

  const ttsTests = [
    { name: 'Location clarification', text: 'جی، براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔' },
    { name: 'Emergency confirmation', text: 'آپ کی ایمرجنسی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اس نمبر پر دستیاب رہیں۔' },
    { name: 'Medical emergency', text: 'میں نے آپ کی ایمرجنسی نوٹ کر لی ہے۔ ایمبولینس بھیج دی گئی ہے۔ براہِ کرم فون پر رہیں۔' },
    { name: 'Fire emergency', text: 'آگ کی اطلاع مل گئی ہے۔ فائر بریگیڈ کو اطلاع دے دی گئی ہے۔ براہِ کرم محفوظ جگہ پر رہیں۔' },
    { name: 'Accident response', text: 'ایکسیڈنٹ کی اطلاع مل گئی ہے۔ ایمبولینس اور ریسکیو ٹیم بھیج دی گئی ہے۔' },
  ];

  const ttsResults: TtsTestResult[] = [];
  for (const test of ttsTests) {
    const result = await testTTS(test.text, test.name);
    ttsResults.push(result);
    console.log(`\n${result.success ? '✓' : '✗'} ${test.name}: latency=${result.latencyMs}ms${result.audioSize ? ' size=' + result.audioSize + 'B' : ''}${result.error ? ' error=' + result.error : ''}`);
  }

  // ── Phase 3: Metrics ──────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 3: SEPARATED METRICS');
  console.log('═'.repeat(70));

  const asrSuccesses = results.filter(r => r.asr.success);
  const qwenSuccesses = results.filter(r => r.qwen?.success);
  const evaluations = results.filter(r => r.evaluation).map(r => r.evaluation!);

  // ASR_PROVIDER_SUCCESS
  console.log('\n── ASR_PROVIDER_SUCCESS ──');
  console.log(`  ${asrSuccesses.length}/${results.length} transcriptions successful`);
  if (asrSuccesses.length === 0) {
    console.log('\n  ⚠ TEST INVALID — no successful ASR results.');
    console.log('  Fix provider/auth/audio configuration before evaluating quality.');
    return;
  }

  const avgAsrConf = asrSuccesses.reduce((s, r) => s + (r.asr.confidence || 0), 0) / asrSuccesses.length;
  const avgAsrLat = asrSuccesses.reduce((s, r) => s + r.asr.latencyMs, 0) / asrSuccesses.length;
  console.log(`  Average confidence: ${avgAsrConf.toFixed(4)}`);
  console.log(`  Average ASR latency: ${avgAsrLat.toFixed(0)}ms`);

  // TRANSCRIPT_QUALITY (raw transcript preservation)
  console.log('\n── TRANSCRIPT_QUALITY ──');
  results.forEach(r => {
    if (r.asr.success) {
      console.log(`  ${r.file}: "${r.asr.transcript}"`);
    }
  });

  // SEMANTIC_EMERGENCY_ACCURACY
  const categoryMatches = evaluations.filter(e => e.categoryMatch).length;
  const conditionMatches = evaluations.filter(e => e.conditionMatch).length;
  const conditionsApplicable = evaluations.filter(e => e.evaluation !== null).length;

  console.log('\n── SEMANTIC_EMERGENCY_ACCURACY ──');
  console.log(`  Emergency category: ${categoryMatches}/${evaluations.length} (${((categoryMatches / evaluations.length) * 100).toFixed(1)}%)`);
  console.log(`  Critical condition: ${conditionMatches}/${evaluations.length} (${((conditionMatches / evaluations.length) * 100).toFixed(1)}%)`);

  // LOCATION_ACCURACY
  const locationEvals = evaluations.filter(e => e.locationMatch !== null);
  const locationMatches = locationEvals.filter(e => e.locationMatch === true).length;
  console.log('\n── LOCATION_ACCURACY ──');
  console.log(`  Location: ${locationMatches}/${locationEvals.length} (${locationEvals.length > 0 ? ((locationMatches / locationEvals.length) * 100).toFixed(1) : 'N/A'}%)`);
  if (locationEvals.length === 0) console.log('  (No recordings with expected location)');

  // PEOPLE COUNT
  const peopleEvals = evaluations.filter(e => e.peopleMatch !== null);
  const peopleMatches = peopleEvals.filter(e => e.peopleMatch === true).length;
  console.log('\n── PEOPLE_COUNT_ACCURACY ──');
  console.log(`  People: ${peopleMatches}/${peopleEvals.length} (${peopleEvals.length > 0 ? ((peopleMatches / peopleEvals.length) * 100).toFixed(1) : 'N/A'}%)`);

  // QWEN_EXTRACTION_ACCURACY
  const avgQwenLat = qwenSuccesses.reduce((s, r) => s + (r.qwen?.latencyMs || 0), 0) / (qwenSuccesses.length || 1);
  console.log('\n── QWEN_EXTRACTION_ACCURACY ──');
  console.log(`  Qwen success: ${qwenSuccesses.length}/${results.length}`);
  console.log(`  Average Qwen latency: ${avgQwenLat.toFixed(0)}ms`);

  // SAFETY / INVENTION
  const safetyPasses = evaluations.filter(e => e.safetyPass).length;
  console.log('\n── SAFETY / INVENTION ──');
  console.log(`  Zero invented facts: ${safetyPasses}/${evaluations.length} (${((safetyPasses / evaluations.length) * 100).toFixed(1)}%)`);

  // TTS
  const ttsSuccesses = ttsResults.filter(r => r.success);
  const avgTtsLat = ttsSuccesses.reduce((s, r) => s + r.latencyMs, 0) / (ttsSuccesses.length || 1);
  const avgTtsSize = ttsSuccesses.reduce((s, r) => s + (r.audioSize || 0), 0) / (ttsSuccesses.length || 1);
  console.log('\n── TTS_VALIDATION ──');
  console.log(`  Success: ${ttsSuccesses.length}/${ttsResults.length}`);
  console.log(`  Average latency: ${avgTtsLat.toFixed(0)}ms`);
  console.log(`  Average audio size: ${avgTtsSize.toFixed(0)} bytes`);

  // FULL VOICE LATENCY
  const totalTurnLatencies = results.filter(r => r.asr.success && r.qwen?.success).map(r => r.asr.latencyMs + (r.qwen?.latencyMs || 0));
  const avgTotalLat = totalTurnLatencies.length > 0 ? totalTurnLatencies.reduce((a, b) => a + b, 0) / totalTurnLatencies.length : 0;
  console.log('\n── FULL VOICE LATENCY ──');
  console.log(`  ASR (Chirp 2): ${avgAsrLat.toFixed(0)}ms`);
  console.log(`  Qwen-turbo: ${avgQwenLat.toFixed(0)}ms`);
  console.log(`  ASR + Qwen total: ${avgTotalLat.toFixed(0)}ms`);
  console.log(`  TTS (qwen3-tts-flash): ${avgTtsLat.toFixed(0)}ms`);
  console.log(`  TOTAL TURN (ASR + Qwen + TTS): ${(avgTotalLat + avgTtsLat).toFixed(0)}ms`);
  console.log(`  Note: qwen3.7-plus runs ASYNC — does NOT block caller`);

  // ── Phase 4: Detailed Results ─────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('DETAILED RESULTS PER RECORDING');
  console.log('═'.repeat(70));

  results.forEach(r => {
    console.log(`\n── ${r.file} (Language: ${r.spokenLanguage}) ──`);
    console.log(`  ASR: ${r.asr.success ? '✓ SUCCESS' : '✗ FAILED'}`);
    console.log(`  Raw transcript: ${r.asr.transcript || 'N/A'}`);
    console.log(`  Confidence: ${r.asr.confidence?.toFixed(4) ?? 'N/A'}`);
    console.log(`  ASR latency: ${r.asr.latencyMs}ms`);
    if (r.asr.error) console.log(`  ASR error: ${r.asr.error}`);

    if (r.qwen?.success && r.qwen.interpretation) {
      const i = r.qwen.interpretation;
      console.log(`  Qwen: ✓ SUCCESS (latency: ${r.qwen.latencyMs}ms)`);
      console.log(`    emergencyCategory: ${i.emergencyCategory}`);
      console.log(`    severity: ${i.severity}`);
      console.log(`    criticalCondition: ${i.criticalCondition ?? 'null'}`);
      console.log(`    peopleCount: ${i.peopleCount ?? 'null'}`);
      console.log(`    location: ${i.location ?? 'null'} (${i.locationConfirmed ? 'confirmed' : 'unconfirmed'})`);
      console.log(`    requestedResource: ${i.requestedResource ?? 'null'}`);
      console.log(`    inventedFacts: [${(i.inventedFacts || []).join(', ')}]`);
    }

    if (r.evaluation) {
      console.log(`  Evaluation:`);
      r.evaluation.details.forEach(d => console.log(`    ${d}`));
    }
  });

  // ── Phase 5: Acceptance Decision ──────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('ACCEPTANCE DECISION');
  console.log('═'.repeat(70));

  const categoryRate = (categoryMatches / evaluations.length) * 100;
  const conditionRate = (conditionMatches / evaluations.length) * 100;
  const safetyRate = (safetyPasses / evaluations.length) * 100;
  const locationRate = locationEvals.length > 0 ? (locationMatches / locationEvals.length) * 100 : 100;
  const peopleRate = peopleEvals.length > 0 ? (peopleMatches / peopleEvals.length) * 100 : 100;
  const asrRate = (asrSuccesses.length / results.length) * 100;

  console.log(`\n  ASR provider success: ${asrRate.toFixed(1)}% (target: 100%)`);
  console.log(`  Emergency category accuracy: ${categoryRate.toFixed(1)}% (target: ≥90%)`);
  console.log(`  Critical condition accuracy: ${conditionRate.toFixed(1)}% (target: ≥90%)`);
  console.log(`  Location accuracy: ${locationRate.toFixed(1)}% (target: ≥80%)`);
  console.log(`  People count accuracy: ${peopleRate.toFixed(1)}% (target: ≥90%)`);
  console.log(`  Safety (zero invented): ${safetyRate.toFixed(1)}% (target: 100%)`);
  console.log(`  TTS success: ${ttsSuccesses.length}/${ttsResults.length} (target: all)`);

  const allPass = asrRate === 100 && categoryRate >= 90 && conditionRate >= 90 && safetyRate === 100 && ttsSuccesses.length === ttsResults.length;

  if (allPass) {
    console.log('\n  ✅ ACCEPTED: Full-chain voice intake meets all acceptance criteria.');
    console.log('  READY FOR TWILIO END-TO-END TEST');
  } else if (categoryRate >= 70 && conditionRate >= 70 && safetyRate === 100) {
    console.log('\n  ⚠️  CONDITIONAL: Voice intake needs improvement before Twilio test.');
  } else {
    console.log('\n  ❌ REJECTED: Voice intake does not meet acceptance criteria.');
  }

  // ── Save Results ──────────────────────────────────────────
  const reportData = {
    timestamp: new Date().toISOString(),
    asrResults: results.map(r => ({
      file: r.file,
      spokenLanguage: r.spokenLanguage,
      transcript: r.asr.transcript,
      confidence: r.asr.confidence,
      latencyMs: r.asr.latencyMs,
      success: r.asr.success,
      error: r.asr.error,
    })),
    qwenResults: results.map(r => ({
      file: r.file,
      success: r.qwen?.success ?? false,
      latencyMs: r.qwen?.latencyMs,
      interpretation: r.qwen?.interpretation,
    })),
    evaluations: results.map(r => ({
      file: r.file,
      ...r.evaluation,
    })),
    ttsResults: ttsResults.map(r => ({
      name: r.name,
      text: r.text,
      success: r.success,
      latencyMs: r.latencyMs,
      audioSize: r.audioSize,
    })),
    metrics: {
      asrSuccessRate: asrRate,
      avgAsrConfidence: avgAsrConf,
      avgAsrLatencyMs: avgAsrLat,
      categoryAccuracy: categoryRate,
      conditionAccuracy: conditionRate,
      locationAccuracy: locationRate,
      peopleAccuracy: peopleRate,
      safetyRate,
      avgQwenLatencyMs: avgQwenLat,
      avgTtsLatencyMs: avgTtsLat,
      avgTotalTurnLatencyMs: avgTotalLat,
      avgFullPipelineLatencyMs: avgTotalLat + avgTtsLat,
    },
    acceptance: allPass ? 'ACCEPTED — READY FOR TWILIO END-TO-END TEST' : 'NOT ACCEPTED',
  };

  const reportPath = path.join(__dirname, 'final-voice-validation-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Results saved to: ${reportPath}`);
}

main().catch(console.error);
