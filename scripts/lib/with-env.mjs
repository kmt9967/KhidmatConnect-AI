/**
 * with-env.mjs — run any command with .env.local loaded into the environment.
 *
 * Usage: node scripts/lib/with-env.mjs <command> [args...]
 * Example: node scripts/lib/with-env.mjs npx prisma migrate dev --name x
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/lib/with-env.mjs <command> [args...]');
  process.exit(1);
}

const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
