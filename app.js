/**
 * KhidmatConnect AI — cPanel / Phusion Passenger production entry point.
 *
 * cPanel Passenger sets PORT to either:
 *   • a TCP port number      (e.g. "3000")
 *   • a Unix socket path     (e.g. "unix:/tmp/passenger.1.0.xxxxx/generation-1/...")
 *
 * This file starts the Next.js 15 production request handler on whichever
 * transport is supplied. It never starts a second dev server.
 *
 * ── cPanel configuration ────────────────────────────────────────────────────
 *   Node.js version  : 22.x
 *   Production mode  : enabled
 *   Application root : khidmatconnect   (the directory containing this file)
 *   Application URL  : <your-public-hostname>   (set in cPanel, not in this file)
 *   Startup file     : app.js
 *
 * ── Before activating the app in cPanel, SSH and run ────────────────────────
 *   cd khidmatconnect
 *   npm ci
 *   npx prisma generate
 *   npx prisma migrate deploy
 *   npm run build
 *
 * Then click "Restart" in cPanel → Setup Node.js App.
 *
 * No secrets or real domain names appear in this file.
 * All runtime configuration lives in process.env (set via cPanel env vars
 * or a .env.production file loaded by Passenger's NODE_ENV=production).
 */

'use strict';

const { createServer } = require('http');
const next = require('next');

// Force production regardless of what Passenger's environment says.
// This also prevents an accidental dev-mode server in production.
process.env.NODE_ENV = 'production';

const hostname = process.env.HOSTNAME || '0.0.0.0';

// Passenger on shared cPanel typically hands a unix socket path.
// On Passenger Standalone / VPS it supplies a numeric TCP port.
const portRaw = process.env.PORT || '3000';
const isUnixSocket = portRaw.startsWith('unix:');
const listenTarget = isUnixSocket ? portRaw.replace('unix:', '') : parseInt(portRaw, 10);

// `hostname` and `port` in next() are used for URL generation in server-side
// redirects — they are NOT the listen arguments. Pass the real values where
// available so Next.js doesn't mis-label log lines.
const app = next({
  dev: false,
  hostname,
  port: isUnixSocket ? undefined : listenTarget,
});

const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => handle(req, res));

    server.on('error', (err) => {
      console.error('[KhidmatConnect] HTTP server error:', err);
      process.exit(1);
    });

    const onReady = () => {
      if (isUnixSocket) {
        console.log(`[KhidmatConnect] Production server ready — unix socket: ${listenTarget}`);
      } else {
        console.log(`[KhidmatConnect] Production server ready — http://${hostname}:${listenTarget}`);
      }
    };

    if (isUnixSocket) {
      server.listen(listenTarget, onReady);
    } else {
      server.listen(listenTarget, hostname, onReady);
    }
  })
  .catch((err) => {
    console.error('[KhidmatConnect] Failed to start Next.js application:', err);
    process.exit(1);
  });
