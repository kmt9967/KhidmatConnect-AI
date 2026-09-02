/**
 * Quick test: qwen-turbo conversational quality across languages.
 */

import * as fs from 'fs';
import * as path from 'path';

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const apiKey = process.env.ALIBABA_MODEL_STUDIO_API_KEY!;
const baseUrl = process.env.ALIBABA_MODEL_STUDIO_BASE_URL!;

async function testConversation(label: string, userMsg: string, model: string = 'qwen-turbo') {
  const start = Date.now();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are KhidmatConnect AI emergency assistant. Match the caller language. Be concise (under 20 words).' },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 100,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json();
  const ms = Date.now() - start;
  const text = data?.choices?.[0]?.message?.content || '(empty)';
  console.log(`[${model}] ${label} (${ms}ms): ${text.substring(0, 200)}`);
}

async function run() {
  console.log('══════════════════════════════════════════════════');
  console.log('qwen-turbo Conversational Quality Test');
  console.log('══════════════════════════════════════════════════\n');

  // Test qwen-turbo
  console.log('── qwen-turbo ──');
  await testConversation('Urdu script emergency', 'میری امی بے ہوش ہیں۔');
  await testConversation('Roman Urdu emergency', 'Meri ami behosh hain.');
  await testConversation('English emergency', 'My mother is unconscious.');
  await testConversation('Mixed Urdu/English', 'Meri mother behosh hain, ambulance chahiye.');
  await testConversation('Urdu location', 'ہم گلشن بلاک سات میں ہیں۔');
  await testConversation('English location', 'We are near Gulshan Block 7.');

  // Compare with qwen-plus
  console.log('\n── qwen-plus (for comparison) ──');
  await testConversation('Urdu script emergency', 'میری امی بے ہوش ہیں۔', 'qwen-plus');
  await testConversation('Roman Urdu emergency', 'Meri ami behosh hain.', 'qwen-plus');
  await testConversation('English emergency', 'My mother is unconscious.', 'qwen-plus');
  await testConversation('Mixed Urdu/English', 'Meri mother behosh hain, ambulance chahiye.', 'qwen-plus');

  // Test qwen3.7-plus for full analysis (with longer timeout)
  console.log('\n── qwen3.7-plus (full analysis, longer timeout) ──');
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3.7-plus',
        messages: [
          { role: 'system', content: 'You are KhidmatConnect AI emergency analyst. Extract: category, urgency, location, action. Be concise.' },
          { role: 'user', content: 'Transcript: "Meri walida behosh hain. Hum Gulshan Block 7 mein hain. Ambulance chahiye."' },
        ],
        max_tokens: 300,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json();
    const ms = Date.now() - start;
    const text = data?.choices?.[0]?.message?.content || '(empty)';
    console.log(`[qwen3.7-plus] Full analysis (${ms}ms):\n${text.substring(0, 500)}`);
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[qwen3.7-plus] Timed out after ${ms}ms`);
  }
}

run().catch(console.error);
