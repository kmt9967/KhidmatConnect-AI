/**
 * Test Google Speech-to-Text V2 using REST API directly (not SDK).
 * This gives us better control and error messages.
 */

import * as fs from 'fs';
import * as path from 'path';

async function getAccessToken(): Promise<string> {
  // Try to get ADC credentials
  const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  
  if (fs.existsSync(adcPath)) {
    console.log('Found ADC credentials at:', adcPath);
    const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
    
    // For user credentials, we need to refresh the token
    if (creds.type === 'authorized_user') {
      console.log('Refreshing access token...');
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
  }
  
  throw new Error('No ADC credentials found. Run: gcloud auth application-default login');
}

async function testRestApi() {
  console.log('══════════════════════════════════════════════════');
  console.log('Google Speech-to-Text V2 REST API Test');
  console.log('══════════════════════════════════════════════════\n');

  const projectId = 'the-ease-assocation-member-app';
  const location = 'asia-southeast1';
  const model = 'chirp_2';

  // Get access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
    console.log('✓ Access token obtained\n');
  } catch (error) {
    console.error('Failed to get access token:', error instanceof Error ? error.message : error);
    return;
  }

  // Create minimal test audio (silent WAV)
  const sampleRate = 8000;
  const duration = 1;
  const numSamples = sampleRate * duration;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const audioContent = buffer.toString('base64');
  console.log('Test audio created:', buffer.length, 'bytes');
  console.log();

  // Test with REST API - use regional endpoint for asia-southeast1
  const url = `https://${location}-speech.googleapis.com/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`;
  
  console.log('Testing REST API...');
  console.log('URL:', url);
  console.log('Model:', model);
  console.log();

  const requestBody = {
    config: {
      model: model,
      languageCodes: ['ur-PK'],  // Single language - chirp_2 will auto-detect other languages
      features: {
        enableAutomaticPunctuation: true,
      },
      autoDecodingConfig: {},
    },
    content: audioContent,
  };

  console.log('Request body:', JSON.stringify({
    config: requestBody.config,
    contentLength: requestBody.content.length,
  }, null, 2));
  console.log();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', responseText.substring(0, 500));

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✓ Success!');
      console.log('Results:', JSON.stringify(data.results, null, 2));
    } else {
      console.log('\n✗ Failed');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

testRestApi().catch(console.error);
