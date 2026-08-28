// Orihost / production entry — ONE container runs BOTH the website/API and the
// Discord bot. We generate the Prisma client, then fork the server (site + REST
// API) and the bot as children of this single process. If one crashes we still
// try to restart it so the site and bot come back on their own (the host will
// also restart the whole container if this supervisor dies).
const { fork, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRISMA_SCHEMA = path.resolve(__dirname, 'server/prisma/schema.prisma');
const DB_PATH = path.resolve(__dirname, 'server/prod.db');

// ---------------------------------------------------------------------------
// Pretty boot banner + configuration report so the host log is easy to read
// ---------------------------------------------------------------------------
const line = '============================================================';
console.log(line);
console.log('  BEYOND90 — STARTING (website + API + Discord bot)');
console.log(line);

const maskToken = (t) => (t ? `SET (${t.slice(0, 4)}…${t.slice(-4)}, hidden)` : 'NOT SET');
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:' + DB_PATH;
if (!process.env.API_URL) {
  process.env.API_URL = `http://127.0.0.1:${process.env.PORT || 4000}`;
}

console.log(`[CONFIG] NODE_ENV ...... ${process.env.NODE_ENV}`);
console.log(`[CONFIG] PORT .......... ${process.env.PORT || '(not set — API will use 4000)'}`);
console.log(`[CONFIG] API_URL ....... ${process.env.API_URL}`);
console.log(`[CONFIG] DATABASE ...... ${process.env.DATABASE_URL}`);
console.log(`[CONFIG] DISCORD_TOKEN . ${maskToken(process.env.DISCORD_TOKEN)}`);
console.log(line);

// ---------------------------------------------------------------------------
// Step 1/3 — Prisma client
// ---------------------------------------------------------------------------
console.log('[BOOT 1/3] Generating Prisma client...');
try {
  const prismaCli = path.join(__dirname, 'node_modules/prisma/build/index.js');
  const res = spawnSync('node', [prismaCli, 'generate', '--schema=' + PRISMA_SCHEMA], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:' + DB_PATH },
    shell: false,
    timeout: 60000,
  });
  if (res.status !== 0) {
    console.error(`[BOOT 1/3] ❌ prisma generate FAILED (exit code ${res.status}) — stopping.`);
    process.exit(res.status ?? 1);
  }
  console.log('[BOOT 1/3] ✅ Prisma client generated.');
} catch (err) {
  console.error('[BOOT 1/3] ❌ Failed to run prisma generate:', err.message);
  process.exit(1);
}

// The compiled files must exist — if the "npm run build" step above (during
// npm install) failed, these are missing and nothing can start. Fail loudly
// with instructions instead of a confusing crash later.
function requireBuilt(label, file) {
  if (!fs.existsSync(path.resolve(__dirname, file))) {
    console.error('');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error(`[BOOT] ❌ ${label} NOT FOUND: ${file}`);
    console.error('[BOOT]    This means the "npm run build" step FAILED earlier');
    console.error('[BOOT]    in the log. Scroll up and look for lines starting');
    console.error('[BOOT]    with "error TS" — fix that error and restart.');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    process.exit(1);
  }
}
requireBuilt('API server build', 'server/dist/index.js');
requireBuilt('Discord bot build', 'bot/dist/index.js');

// ---------------------------------------------------------------------------
// Steps 2/3 and 3/3 — start both processes, restart them if they crash
// ---------------------------------------------------------------------------
const children = new Map();

function start(name, file) {
  console.log(`[BOOT] ▶ Starting ${name} (${file})...`);
  const child = fork(path.resolve(__dirname, file), [], { stdio: 'inherit' });
  children.set(name, child);
  child.on('exit', (code) => {
    console.log(`[${name}] ⚠ exited with code ${code} — restarting in 3s`);
    children.delete(name);
    setTimeout(() => start(name, file), 3000);
  });
  child.on('error', (err) => {
    console.error(`[${name}] ❌ error:`, err.message);
  });
  return child;
}

console.log('[BOOT 2/3] Starting website + API server...');
start('API', 'server/dist/index.js');

if (process.env.DISCORD_TOKEN) {
  console.log('[BOOT 3/3] Starting Discord bot...');
  start('BOT', 'bot/dist/index.js');
} else {
  console.log('');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('[BOOT 3/3] ⚠ DISCORD_TOKEN IS NOT SET — THE BOT CANNOT START.');
  console.log('[BOOT]    The website + API are still running fine.');
  console.log('[BOOT]    FIX: in the Orihost panel open the server\'s');
  console.log('[BOOT]    "Startup" or "Variables" tab and add a variable:');
  console.log('[BOOT]      Name:  DISCORD_TOKEN');
  console.log('[BOOT]      Value: your bot token from the Discord');
  console.log('[BOOT]             Developer Portal (Bot → Reset Token)');
  console.log('[BOOT]    Then restart the server.');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

console.log(line);
console.log('  BEYOND90 boot finished — see status lines above.');
console.log(line);

process.on('SIGTERM', () => {
  for (const child of children.values()) child.kill('SIGTERM');
  process.exit(0);
});
process.on('SIGINT', () => {
  for (const child of children.values()) child.kill('SIGINT');
  process.exit(0);
});