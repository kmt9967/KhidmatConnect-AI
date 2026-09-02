/**
 * Shared env loader for standalone scripts.
 *
 * Loads an env file (dotenv-style: KEY="value" or KEY=value) into
 * process.env without overriding variables already present.
 *
 * Used by seed-demo-data / reset-demo scripts because the tsx runner
 * does not auto-load Next.js's env files.
 *
 * File resolution order (first existing wins):
 *   1. $KC_ENV_FILE            — explicit override on servers
 *   2. .env.local              — local development
 *   3. .env.production         — deployed demo server (systemd already
 *                                injecting env is also fine — values
 *                                already present are never overwritten)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadEnvLocal(dir = process.cwd()) {
  const candidates = [
    process.env.KC_ENV_FILE,
    resolve(dir, '.env.local'),
    resolve(dir, '.env.production'),
  ].filter(Boolean) as string[];

  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
