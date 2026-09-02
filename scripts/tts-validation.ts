/**
 * TTS Validation: Test Alibaba qwen3-tts-flash with Urdu emergency responses
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

interface TTSResult {
  text: string;
  success: boolean;
  latencyMs: number;
  audioSize?: number;
  error?: string;
}

async function generateTTS(text: string, voice: string = 'alloy'): Promise<TTSResult> {
  const startTime = Date.now();
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.ALIBABA_MODEL_STUDIO_API_KEY,
      baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    const response = await openai.audio.speech.create({
      model: 'qwen3-tts-flash',
      voice: voice,
      input: text,
      response_format: 'wav',
    });

    const latencyMs = Date.now() - startTime;
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      text,
      success: true,
      latencyMs,
      audioSize: audioBuffer.length,
    };

  } catch (error) {
    return {
      text,
      success: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   TTS Validation: Urdu Emergency Responses               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const testResponses = [
    {
      name: 'Location clarification',
      text: 'جی، براہِ کرم اپنی لوکیشن یا قریب ترین نشان بتائیں۔',
      expected: 'Asks for location/landmark',
    },
    {
      name: 'Emergency confirmation',
      text: 'آپ کی ایمرجنسی درخواست محفوظ ہو گئی ہے۔ براہِ کرم اس نمبر پر دستیاب رہیں۔',
      expected: 'Confirms request, asks to stay available',
    },
    {
      name: 'Medical emergency',
      text: 'میں نے آپ کی ایمرجنسی نوٹ کر لی ہے۔ ایمبولینس بھیج دی گئی ہے۔ براہِ کرم فون پر رہیں۔',
      expected: 'Acknowledges emergency, confirms ambulance',
    },
    {
      name: 'Fire emergency',
      text: 'آگ کی اطلاع مل گئی ہے۔ فائر بریگیڈ کو اطلاع دے دی گئی ہے۔ براہِ کرم محفوظ جگہ پر رہیں۔',
      expected: 'Acknowledges fire, confirms fire brigade',
    },
    {
      name: 'Accident with injuries',
      text: 'ایکسیڈنٹ کی اطلاع مل گئی ہے۔ ایمبولینس اور ریسکیو ٹیم بھیج دی گئی ہے۔ زخمی لوگوں کو ہوشیار رکھیں۔',
      expected: 'Acknowledges accident, confirms rescue team',
    },
  ];

  const results: TTSResult[] = [];

  for (const test of testResponses) {
    console.log(`\nTesting: ${test.name}`);
    console.log(`Text: ${test.text}`);
    console.log(`Expected: ${test.expected}`);

    const result = await generateTTS(test.text);
    results.push(result);

    if (result.success) {
      console.log(`  ✓ TTS success`);
      console.log(`  ✓ Latency: ${result.latencyMs}ms`);
      console.log(`  ✓ Audio size: ${result.audioSize} bytes`);
    } else {
      console.log(`  ✗ TTS failed: ${result.error}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TTS SUMMARY');
  console.log('='.repeat(80));

  const successCount = results.filter(r => r.success).length;
  const avgLatency = results.filter(r => r.success).reduce((sum, r) => sum + r.latencyMs, 0) / successCount;
  const avgSize = results.filter(r => r.success).reduce((sum, r) => sum + (r.audioSize || 0), 0) / successCount;

  console.log(`\nTotal tests: ${results.length}`);
  console.log(`Success: ${successCount}/${results.length}`);
  console.log(`Average latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`Average audio size: ${avgSize.toFixed(0)} bytes`);

  if (successCount === results.length) {
    console.log('\n✅ TTS VALIDATED: All Urdu responses generated successfully');
  } else {
    console.log('\n⚠️  TTS PARTIAL: Some responses failed');
  }
}

main().catch(console.error);
