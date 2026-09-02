# KhidmatConnect AI — Alibaba Cloud ECS Deployment Guide

**Architecture (hackathon demo):**

```
Internet ──▶ ECS (Ubuntu) ──▶ Nginx :80/:443 ──▶ Next.js (production) 127.0.0.1:3000
                                            └──▶ PostgreSQL 127.0.0.1:5432 (never public)
```

**Deployment style:** native (Node + systemd + PostgreSQL + Nginx).
Docker was evaluated and rejected for this milestone: the app is a single
Next.js server + one local PostgreSQL, so containers would add abstraction
without reducing risk or steps. systemd gives reboot survival and log
integration with zero extra tooling.

> **Never paste real secrets into this repo, git history, or chat.**
> All `<...>` placeholders below are values YOU generate or read from the
> Alibaba/Twilio/Google consoles.

---

## 0. Recommended ECS sizing (do not over-buy)

| Item | Recommendation | Why |
|---|---|---|
| Region | `ap-southeast-1` (Singapore) | Low latency to Pakistan + direct Alibaba Model Studio (dashscope-intl) access |
| OS | Ubuntu 24.04 LTS 64-bit | Matches all commands below |
| Instance | 2 vCPU / **4 GiB RAM** (e.g. `ecs.e-c1m2.large` burstable) | Node + Next.js + PostgreSQL on 2 GiB risks OOM crashes mid-demo |
| Disk | 40 GiB ESSD PL0 | OS + node_modules + `.next` + DB + audio cache |
| Bandwidth | Pay-by-traffic, peak 5 Mbps | Hackathon traffic is trivial; pay only for what we use |
| Billing | Pay-as-you-go (release after the demo) or 1-week subscription | Cheapest for a ≤1-week event |

Security group (section 8) is the only network exposure.

---

## 1. Create the instance (console)

1. ECS console → **Instances** → Create (region above, Ubuntu 24.04, size above).
2. Log-in key pair (recommended) or password.
3. After boot, note the **public IP** → `ECS_PUBLIC_IP`.
4. Enable a **fixed public IP** only if you want stability across restarts
   (not required for the hackathon).

## 2. Security group (exact rules)

Inbound — nothing else:

| Priority | Source | Port | Purpose |
|---|---|---|---|
| 1 | `<YOUR_ADMIN_IP>/32` | TCP 22 | SSH (restrict! never 0.0.0.0/0 if avoidable) |
| 1 | 0.0.0.0/0 | TCP 80 | HTTP → redirect + ACME challenge |
| 1 | 0.0.0.0/0 | TCP 443 | HTTPS |

**Do NOT add rules for 3000 or 5432.** Next.js and PostgreSQL bind to
127.0.0.1 only (enforced again by the systemd unit and postgresql.conf).

## 3. Connect + base packages

```bash
ssh <user>@<ECS_PUBLIC_IP>

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib ufw
```

Node.js 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

## 4. PostgreSQL (local-only, dedicated app user)

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
-- Generate a strong password locally first:  openssl rand -base64 24
-- Then replace <DB_PASSWORD> below BEFORE pasting. Never commit it.
CREATE USER khidmat WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE khidmatconnect OWNER khidmat;
\c khidmatconnect
GRANT ALL ON SCHEMA public TO khidmat;
SQL
```

Ubuntu's PostgreSQL already listens on 127.0.0.1 only — verify, don't change:

```bash
sudo -u postgres psql -tAc "SHOW listen_addresses;"   # expect: localhost
```

Confirm port 5432 is not reachable from outside (run on your laptop):

```powershell
Test-NetConnection <ECS_PUBLIC_IP> -Port 5432          # expect: failed
```

## 5. Application user + directories

```bash
sudo useradd -r -m -s /bin/bash khidmat
sudo install -d -o khidmat -g khidmat /var/www /var/lib/khidmatconnect /etc/khidmatconnect
```

## 6. Clone + install

```bash
sudo git clone https://github.com/<ORG>/KhidmatConnect-AI.git /var/www/KhidmatConnect-AI
sudo chown -R khidmat:khidmat /var/www/KhidmatConnect-AI
sudo -u khidmat bash -c '
  cd /var/www/KhidmatConnect-AI
  git checkout feature/twilio-voice-intake
  npm ci
  npx prisma generate
'
```

## 7. Environment configuration

Create the real env file **outside the repo** (systemd loads it; it can never
be committed by accident):

```bash
sudo nano /etc/khidmatconnect/khidmatconnect.env
sudo chmod 600 /etc/khidmatconnect/khidmatconnect.env
sudo chown khidmat:khidmat /etc/khidmatconnect/khidmatconnect.env
```

Contents (see `.env.example` for full documentation of each variable):

```ini
DATABASE_URL=postgresql://khidmat:<DB_PASSWORD>@127.0.0.1:5432/khidmatconnect?schema=public
SESSION_SECRET=<openssl rand -base64 48>
APP_BASE_URL=https://<DOMAIN_OR_IP>
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<maps-browser-key>
GOOGLE_MAPS_SERVER_API_KEY=<maps-server-key>
ALIBABA_MODEL_STUDIO_API_KEY=<model-studio-key>
ALIBABA_MODEL_STUDIO_BASE_URL=<model-studio-base-url>
ALIBABA_MODEL_NAME=qwen3.7-plus
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_PHONE_NUMBER=<number>
TWILIO_WEBHOOK_BASE_URL=https://<DOMAIN_OR_IP>
VOICE_AUDIO_DIR=/var/lib/khidmatconnect/audio
GOOGLE_CLOUD_PROJECT_ID=<gcp-project>
GOOGLE_APPLICATION_CREDENTIALS=/etc/khidmatconnect/gcp-service-account.json
```

Voice variables (Twilio / Google / `GOOGLE_APPLICATION_CREDENTIALS`) may be
**left empty** — the app starts and the citizen→operator→responder flow works
without them; only voice endpoints degrade gracefully.

`SESSION_SECRET` is the one hard requirement: production refuses to sign
sessions without it. Generate: `openssl rand -base64 48`.

## 8. Database migrations + demo seed

```bash
sudo -u khidmat bash -c '
  cd /var/www/KhidmatConnect-AI
  KC_ENV_FILE=/etc/khidmatconnect/khidmatconnect.env \
  npx prisma migrate deploy
'
```

Seed the judge-ready demo scenario (§14 of the milestone — the destructive
`demo:reset` is deliberately dev-only; on the server we only ever seed):

```bash
sudo -u khidmat bash -c '
  cd /var/www/KhidmatConnect-AI
  KC_ENV_FILE=/etc/khidmatconnect/khidmatconnect.env npm run demo:seed
'
```

(The seed guard requires `DATABASE_URL` to point at localhost/127.0.0.1 —
true here, and it means the seed can never be aimed at some remote DB by
accident.)

## 9. Build

```bash
sudo -u khidmat bash -c '
  cd /var/www/KhidmatConnect-AI
  NODE_ENV=production npm run build
'
```

## 10. systemd service (survives SSH logout + reboot)

```bash
sudo cp /var/www/KhidmatConnect-AI/deploy/systemd/khidmatconnect.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now khidmatconnect
systemctl status khidmatconnect --no-pager
journalctl -u khidmatconnect -n 30 --no-pager
```

Test from the server itself:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/    # expect 200
```

## 11. Nginx

```bash
sudo cp /var/www/KhidmatConnect-AI/deploy/nginx/khidmatconnect.conf /etc/nginx/sites-available/khidmatconnect
sudo nano /etc/nginx/sites-available/khidmatconnect    # replace demo.example.org (or use _ pre-domain)
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/khidmatconnect /etc/nginx/sites-enabled/khidmatconnect
sudo nginx -t && sudo systemctl reload nginx
```

If HTTPS isn't configured yet, temporarily comment out the two `listen 443
ssl*` server blocks / `ssl_certificate*` lines and keep only the port-80
server without the redirect, so you can browse over HTTP during testing.

## 12. DNS (needed once a domain is chosen)

At your registrar (or Alibaba Cloud DNS):

```
Type:  A
Name:  demo   (or @ for the apex → demo.example.org / example.org)
Value: <ECS_PUBLIC_IP>
TTL:   600
```

Wait for propagation: `nslookup demo.example.org` must return the ECS IP.
If no domain is selected yet, stop here and use `http://<ECS_PUBLIC_IP>`
temporarily (browser geolocation will be blocked on plain HTTP + IP —
HTTPS is required before the final demo).

## 13. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
sudo certbot --nginx -d demo.example.org
sudo certbot renew --dry-run
```

Then set `APP_BASE_URL=https://demo.example.org` and
`TWILIO_WEBHOOK_BASE_URL=https://demo.example.org` in
`/etc/khidmatconnect/khidmatconnect.env` and restart the app:

```bash
sudo systemctl restart khidmatconnect
```

## 14. Post-deploy at a real domain (one-time console tasks)

1. **Twilio console** → phone number → A Voice webhook →
   `https://demo.example.org/api/voice/twilio/incoming` (POST).
   (Do this LAST — it switches live call handling.)
2. **Google Maps console** → browser key → HTTP referrer restriction:
   `https://demo.example.org/*`
   Server key → API restrictions already set (Geocoding/Routes/Distance
   Matrix) + IP address restriction: `<ECS_PUBLIC_IP>`.
3. Quick manual check: open `https://demo.example.org`, submit a test
   emergency, assign as operator (Ahmed Khan), progress as responder.

## 15. Operations

```bash
# Logs
journalctl -u khidmatconnect -f

# Restart after config change
sudo systemctl restart khidmatconnect

# Deploy a new version (rollback = checkout previous tag/commit and rerun)
cd /var/www/KhidmatConnect-AI
sudo -u khidmat git pull
sudo -u khidmat npm ci
sudo -u khidmat npx prisma migrate deploy
sudo -u khidmat bash -c 'NODE_ENV=production npm run build'
sudo systemctl restart khidmatconnect

# Re-seed demo scenario before recording/judging (safe, idempotent)
sudo -u khidmat bash -c 'cd /var/www/KhidmatConnect-AI && KC_ENV_FILE=/etc/khidmatconnect/khidmatconnect.env npm run demo:seed'
```

## 16. Verification checklist

- [ ] `https://demo.example.org/` loads; branding "KhidmatConnect AI"
- [ ] `/emergency` submits a case (AI triage completes in ~20–30 s)
- [ ] `/case/<code>` tracking page updates
- [ ] `/login` → Operator: demo queue shows 8 seeded cases, counts match
- [ ] Assign Ahmed Khan + AKF-07 → `/login` → Responder: accept → en route → arrived → complete
- [ ] Maps show real positions (browser geolocation works because HTTPS)
- [ ] `5432` unreachable from internet; `3000` unreachable from internet
- [ ] `sudo reboot` → service returns without manual action

## 17. Known non-blockers

- Voice endpoints degrade gracefully if Twilio/Google creds are absent.
- `/dashboard`, `/voice-ai`, `/nearby` still use static mock data (M13 scope).
- "Open Next.js Dev Tools" overlay never appears in production builds.
- Prisma needs one query connection; no pooler required at this scale.
