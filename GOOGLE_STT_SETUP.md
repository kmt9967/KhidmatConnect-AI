# Google Cloud Speech-to-Text Setup Guide

## Overview

This guide explains how to set up Google Cloud Speech-to-Text V2 for Urdu ASR support in KhidmatConnect AI.

**Current Status:** Code integration complete — requires manual GCP setup.

---

## Prerequisites

- Google Cloud account with billing enabled
- Project number: `600867488161`
- Expected project ID: `the-ease-assocation-member-app` (verify in GCP Console)

---

## Step 1: Enable Cloud Speech-to-Text API

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Select your project (project number: 600867488161)
3. Navigate to: **APIs & Services** → **Library**
4. Search for: **Cloud Speech-to-Text API**
5. Click **Enable**
6. Wait 1-2 minutes for API to activate

**Direct link:**  
https://console.developers.google.com/apis/api/speech.googleapis.com/overview?project=600867488161

---

## Step 2: Verify Project ID

1. In Google Cloud Console, go to: **IAM & Admin** → **Settings**
2. Note the **Project ID** (should be approximately `the-ease-assocation-member-app`)
3. Update `.env.local`:
   ```bash
   GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
   ```

---

## Step 3: Install Google Cloud SDK (gcloud CLI)

### Windows (using winget):
```powershell
winget install --id Google.CloudSDK
```

### Windows (manual installer):
Download from: https://cloud.google.com/sdk/docs/install

### After installation:
```powershell
# Restart your terminal, then:
gcloud --version
```

---

## Step 4: Set Up Application Default Credentials (ADC)

### Option A: Using gcloud CLI (Recommended for local development)

```powershell
# Authenticate with your Google account
gcloud auth application-default login

# When browser opens, sign in with: talal@easeassociation.com

# Set quota project (if required)
gcloud auth application-default set-quota-project your-project-id
```

**What this does:**
- Creates ADC credentials at: `%APPDATA%\gcloud\application_default_credentials.json`
- The `@google-cloud/speech` SDK automatically uses these credentials
- No need to set `GOOGLE_APPLICATION_CREDENTIALS`

### Option B: Using Service Account (For production)

1. In GCP Console, go to: **IAM & Admin** → **Service Accounts**
2. Create a new service account or use existing one
3. Grant role: **Cloud Speech Client**
4. Create and download JSON key
5. Save the JSON file securely (never commit to git)
6. Set environment variable:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

---

## Step 5: Verify Setup

After completing steps 1-4, verify the setup:

```powershell
# Check ADC credentials exist
Test-Path "$env:APPDATA\gcloud\application_default_credentials.json"

# Should return: True
```

---

## Step 6: Run Live Tests

Once setup is complete, run the Urdu ASR tests:

```powershell
cd f:\Hackathon\KhidmatConnect-AI
npx tsx scripts/google-urdu-asr-live-tests.ts
```

**Expected results:**
- Urdu script: ✓ High accuracy
- Roman Urdu: ✓ Good accuracy
- Mixed Urdu/English: ✓ Good accuracy
- English: ✓ Perfect accuracy

---

## Configuration Summary

### Environment Variables (.env.local)

```bash
# Google Cloud Speech-to-Text V2
GOOGLE_CLOUD_PROJECT_ID=your-project-id-here
GOOGLE_SPEECH_LOCATION=asia-southeast1
GOOGLE_SPEECH_MODEL=chirp_2

# Optional (if not using ADC):
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Code Configuration

**File:** `src/lib/voice/googleAsr.ts`

- Uses official `@google-cloud/speech` V2 SDK
- Automatic ADC detection
- Recognizer path: `projects/{PROJECT_ID}/locations/asia-southeast1/recognizers/_`
- Model: `chirp_2`
- Languages: `['ur-PK', 'en-US']` (configurable)
- Auto decoding for Twilio audio formats

---

## Troubleshooting

### Error: "Cloud Speech-to-Text API has not been used"

**Solution:** Enable the API in GCP Console (Step 1)

### Error: "Permission denied" or "403 Forbidden"

**Solutions:**
1. Verify ADC credentials exist: `Test-Path "$env:APPDATA\gcloud\application_default_credentials.json"`
2. Re-run: `gcloud auth application-default login`
3. Verify project ID is correct in `.env.local`
4. Check that your Google account has access to the project

### Error: "GOOGLE_CLOUD_PROJECT_ID missing"

**Solution:** Uncomment and set the project ID in `.env.local`:
```bash
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
```

### Error: "Speech client not initialized"

**Solutions:**
1. Check ADC credentials are valid
2. Verify `@google-cloud/speech` package is installed: `npm list @google-cloud/speech`
3. Re-install if needed: `npm install @google-cloud/speech`

---

## Architecture

### Voice Stack

```
Phone: Twilio
  ↓
Primary ASR: Google Cloud Speech-to-Text V2 (Chirp 2)
  - Model: chirp_2
  - Region: asia-southeast1
  - Languages: ur-PK, en-US
  - Auth: Application Default Credentials (ADC)
  ↓
Fallback ASR: Alibaba qwen3-asr-flash
  - English only (Urdu not supported)
  ↓
Fast Conversation: Alibaba qwen-turbo
  - Latency: 340-1124ms
  ↓
Full Analysis: Alibaba qwen3.7-plus (async)
  - Latency: ~10s
  ↓
TTS: Alibaba qwen3-tts-flash
  - Urdu: ✓ (needs listening evaluation)
  - English: ✓ Perfect
```

### Fallback Strategy

1. **Primary:** Google Chirp 2 (Urdu, English, mixed)
2. **Fallback:** Alibaba qwen3-asr-flash (English only)
3. **Failure:** Preserve case, ask caller to repeat
   - After 4+ failures → human review

---

## Security Notes

✅ **DO:**
- Use ADC for local development
- Use service accounts for production
- Keep credentials secure (never commit to git)
- Use environment variables for configuration

❌ **DON'T:**
- Use Maps API keys for Speech-to-Text
- Expose credentials client-side
- Commit service account JSON to git
- Share API keys or credentials

---

## Next Steps

1. ✅ Enable Cloud Speech-to-Text API
2. ✅ Verify project ID
3. ✅ Install gcloud CLI
4. ✅ Set up ADC credentials
5. ✅ Run live tests
6. ✅ Verify Urdu ASR accuracy
7. ✅ Configure Twilio webhook
8. ✅ Test end-to-end phone call

---

## Support

**Documentation:**
- Google Cloud Speech-to-Text V2: https://cloud.google.com/speech-to-text/v2/docs
- ADC setup: https://cloud.google.com/docs/authentication/application-default-credentials
- Chirp 2 model: https://cloud.google.com/speech-to-text/v2/docs/chirp-model

**Project Info:**
- Project number: 600867488161
- Expected project ID: the-ease-assocation-member-app (verify in GCP Console)
- Region: asia-southeast1
- Model: chirp_2

---

**Last updated:** August 31, 2026  
**Status:** Code complete — awaiting GCP setup
