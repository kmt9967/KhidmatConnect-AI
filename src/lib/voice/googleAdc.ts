/**
 * Shared Google Application Default Credentials (ADC) resolution.
 *
 * Used by googleAsr.ts and googleTts.ts. Previously both files hard-coded the
 * Windows gcloud path (%APPDATA%/gcloud) which never exists on Linux servers.
 *
 * Resolution order (standard ADC semantics):
 *  1. GOOGLE_APPLICATION_CREDENTIALS — explicit path to a credentials JSON
 *  2. gcloud well-known location:
 *     - Windows: %APPDATA%/gcloud/application_default_credentials.json
 *     - Linux/macOS: $HOME/.config/gcloud/application_default_credentials.json
 *
 * Supported credential types:
 *  - authorized_user  (gcloud auth application-default login)  → refresh_token grant
 *  - service_account  (recommended for servers)                → JWT bearer grant (RS256)
 *
 * Voice remains secondary: if credentials are absent this throws a clear
 * error which callers already handle by falling back to the next provider.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export interface AdcAccessToken {
  token: string;
  expiryMs: number; // epoch ms when the token expires
}

function adcCredentialsPath(): string {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
  }
  return path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
}

async function refreshAuthorizedUser(creds: {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}): Promise<AdcAccessToken> {
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
    const t = await response.text();
    throw new Error('ADC token refresh failed: ' + response.status + ' - ' + t.substring(0, 200));
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { token: data.access_token, expiryMs: Date.now() + data.expires_in * 1000 };
}

async function mintServiceAccountToken(creds: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}): Promise<AdcAccessToken> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: creds.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(creds.private_key);
  const assertion = `${signingInput}.${signature.toString('base64url')}`;

  const response = await fetch(creds.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error('Service account token exchange failed: ' + response.status + ' - ' + t.substring(0, 200));
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { token: data.access_token, expiryMs: Date.now() + data.expires_in * 1000 };
}

/**
 * Obtain an OAuth2 access token from ADC. Throws a descriptive Error when
 * credentials are unavailable — callers treat that as "provider not configured".
 */
export async function getAdcAccessToken(): Promise<AdcAccessToken> {
  const adcPath = adcCredentialsPath();
  if (!adcPath || !fs.existsSync(adcPath)) {
    throw new Error(
      'ADC credentials not found. Run "gcloud auth application-default login" locally, ' +
        'or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file on the server.'
    );
  }
  const creds = JSON.parse(fs.readFileSync(adcPath, 'utf8'));

  if (creds.type === 'authorized_user') {
    return refreshAuthorizedUser(creds);
  }
  if (creds.type === 'service_account') {
    return mintServiceAccountToken(creds);
  }
  throw new Error(`Unsupported ADC credential type: ${creds.type}`);
}
