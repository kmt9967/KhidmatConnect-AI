/**
 * Debug script: Test ONE audio file with full error reporting
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

async function getAccessToken(): Promise<string> {
  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  
  if (!fs.existsSync(adcPath)) {
    throw new Error('ADC credentials not found at: ' + adcPath);
  }

  console.log('✓ ADC credentials file found');

  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
  console.log('✓ ADC credential type:', creds.type);
  
  if (creds.type === 'authorized_user') {
    console.log('→ Refreshing OAuth token...');
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
      const errorText = await response.text();
      console.error('✗ Token refresh failed:', response.status, errorText.substring(0, 200));
      throw new Error('Token refresh failed: ' + response.status);
    }
    
    const data = await response.json() as any;
    console.log('✓ Access token obtained (expires in', data.expires_in, 'seconds)');
    return data.access_token;
  }
  
  throw new Error('Unsupported credential type: ' + creds.type);
}

async function testAudioFile(filePath: string) {
  console.log('\n' + '='.repeat(80));
  console.log('DEBUG: Testing audio file');
  console.log('='.repeat(80));
  console.log('File:', filePath);
  
  if (!fs.existsSync(filePath)) {
    console.error('✗ File not found');
    return;
  }
  
  const audioBuffer = fs.readFileSync(filePath);
  console.log('✓ File size:', audioBuffer.length, 'bytes');
  
  // Check file signature
  const header = audioBuffer.slice(0, 4).toString('ascii');
  console.log('✓ File header:', header);
  
  if (header === 'RIFF') {
    console.log('  → Format: WAV');
  } else if (audioBuffer.slice(0, 4).toString('hex') === '1a45dfa3') {
    console.log('  → Format: WebM');
  } else {
    console.log('  → Format: Unknown');
  }
  
  // Get access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    console.error('\n✗ AUTHENTICATION FAILED');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('\nFIX: Run this command to reauthenticate:');
    console.error('  gcloud auth application-default login');
    return;
  }
  
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'the-ease-assocation-member-app';
  const location = 'asia-southeast1';
  const model = 'chirp_2';
  const languageCode = 'ur-PK';
  
  console.log('\n→ Configuration:');
  console.log('  Project:', projectId);
  console.log('  Location:', location);
  console.log('  Model:', model);
  console.log('  Language:', languageCode);
  
  const audioContent = audioBuffer.toString('base64');
  console.log('✓ Audio encoded to base64:', audioContent.length, 'chars');
  
  const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;
  console.log('→ API URL:', url);
  
  const requestBody = {
    config: {
      model: model,
      languageCodes: [languageCode],
      features: { enableAutomaticPunctuation: true },
      autoDecodingConfig: {},
    },
    content: audioContent,
  };
  
  console.log('\n→ Sending request...');
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
    console.log('✓ Response received in', latencyMs, 'ms');
    console.log('✓ HTTP status:', response.status);
    
    const responseText = await response.text();
    console.log('✓ Response body length:', responseText.length, 'chars');
    
    if (!response.ok) {
      console.error('\n✗ API ERROR');
      console.error('Status:', response.status);
      console.error('Body:', responseText.substring(0, 500));
      
      try {
        const errorData = JSON.parse(responseText);
        console.error('\nError details:');
        console.error('  Code:', errorData.error?.code);
        console.error('  Message:', errorData.error?.message);
        console.error('  Status:', errorData.error?.status);
      } catch (e) {
        // Not JSON
      }
      return;
    }
    
    // Success - parse response
    console.log('\n✓ API call succeeded');
    const data = JSON.parse(responseText);
    
    console.log('\n→ Response structure:');
    console.log('  Has metadata:', !!data.metadata);
    console.log('  Has results:', !!data.results);
    console.log('  Results count:', data.results?.length || 0);
    
    if (data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      console.log('  First result alternatives:', firstResult.alternatives?.length || 0);
      
      if (firstResult.alternatives && firstResult.alternatives.length > 0) {
        const best = firstResult.alternatives[0];
        console.log('\n✓ TRANSCRIPTION SUCCESS');
        console.log('  Transcript:', best.transcript);
        console.log('  Confidence:', best.confidence);
        console.log('  Language:', firstResult.languageCode);
      } else {
        console.error('\n✗ No alternatives in result');
      }
    } else {
      console.error('\n✗ No results in response');
      console.error('Full response:', JSON.stringify(data, null, 2).substring(0, 500));
    }
    
  } catch (error) {
    console.error('\n✗ REQUEST FAILED');
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Human Voice ASR Debug - Single File Test              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const testFile = path.join(__dirname, 'voice-test-audio', 'urdu-A.webm');
  await testAudioFile(testFile);
}

main().catch(console.error);
