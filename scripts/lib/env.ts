/**
 * Shared env loader for standalone scripts.
 *
 * Loads .env.local (dotenv-style: KEY="value" or KEY=value) into
 * process.env without overriding variables already present.
 *
 * Used by seed-demo-data / reset-demo scripts because the tsx runner
 * does not auto-load Next.js's .env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvLocal(dir = process.cwd()) {
  const envPath = resolve(dir, '.env.local');
  if (!existsSync(envPath)) return;

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
