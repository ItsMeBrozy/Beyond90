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

// Windows terminals default to a legacy codepage that mangles the box-drawing
// characters/emoji in the banner below (Orihost's own log viewer is already
// UTF-8, this only matters when running `node prod.js` locally on Windows).
if (process.platform === 'win32') {
  try {
    require('child_process').spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
  } catch {
    /* best effort — cosmetic only */
  }
}

// ---------------------------------------------------------------------------
// Tiny ANSI color helper — no dependency, works on any Orihost/Pterodactyl
// terminal that supports ANSI (which the panel's log viewer does).
// ---------------------------------------------------------------------------
const NO_COLOR = process.env.NO_COLOR || process.env.FORCE_COLOR === '0';
function wrap(code) {
  return (s) => (NO_COLOR ? String(s) : `\x1b[${code}m${s}\x1b[0m`);
}
const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  white: wrap('37'),
  gray: wrap('90'),
  boldGreen: wrap('1;32'),
  boldRed: wrap('1;31'),
  boldCyan: wrap('1;36'),
};
const PREFIX_COLOR = { API: c.cyan, BOT: c.magenta };

// Load env files so settings stored there (PORT, DISCORD_TOKEN, …) are picked
// up too. Panel variables always win — we never overwrite an existing value.
function loadEnvFile(rel) {
  try {
    const file = path.resolve(__dirname, rel);
    if (!fs.existsSync(file)) return;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
    console.log(`[CONFIG] Loaded environment values from ${rel}`);
  } catch {
    /* a broken .env must never stop the boot */
  }
}
loadEnvFile('.env');
loadEnvFile('bot/.env');

// ---------------------------------------------------------------------------
// Pretty boot banner + configuration report so the host log is easy to read
// ---------------------------------------------------------------------------
const line = c.gray('─'.repeat(64));
console.log('');
console.log(c.boldCyan('  ██████╗ ███████╗██╗   ██╗ ██████╗ ███╗   ██╗██████╗  █████╗ '));
console.log(c.boldCyan('  ██╔══██╗██╔════╝╚██╗ ██╔╝██╔═══██╗████╗  ██║██╔══██╗██╔══██╗'));
console.log(c.boldCyan('  ██████╔╝█████╗   ╚████╔╝ ██║   ██║██╔██╗ ██║██║  ██║╚██████║'));
console.log(c.boldCyan('  ██╔══██╗██╔══╝    ╚██╔╝  ██║   ██║██║╚██╗██║██║  ██║ ╚═══██║'));
console.log(c.boldCyan('  ██████╔╝███████╗   ██║   ╚██████╔╝██║ ╚████║██████╔╝ █████╔╝'));
console.log(c.boldCyan('  ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚═════╝  ╚════╝ '));
console.log(c.dim('                                        website · api · discord bot'));
console.log(line);

const maskToken = (t) => (t ? `${c.green('SET')} (${t.slice(0, 4)}…${t.slice(-4)}, hidden)` : c.red('NOT SET'));
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:' + DB_PATH;
if (!process.env.API_URL) {
  process.env.API_URL = `http://127.0.0.1:${process.env.PORT || 4000}`;
}

const cfg = (label, value) => console.log(`  ${c.dim(label.padEnd(14, '.'))} ${value}`);
cfg('NODE_ENV', process.env.NODE_ENV);
cfg('PORT', process.env.PORT || c.yellow('(not set — API will use 4000)'));
cfg('API_URL', process.env.API_URL);
cfg('DATABASE', process.env.DATABASE_URL);
cfg('DISCORD_TOKEN', maskToken(process.env.DISCORD_TOKEN));
console.log(line);

// ---------------------------------------------------------------------------
// Step 1/3 — Prisma client
// ---------------------------------------------------------------------------
console.log(c.bold('[BOOT 1/3]') + ' Generating Prisma client...');
try {
  const prismaCli = path.join(__dirname, 'node_modules/prisma/build/index.js');
  const res = spawnSync('node', [prismaCli, 'generate', '--schema=' + PRISMA_SCHEMA], {
    cwd: __dirname,
    stdio: 'inherit',
    // hides the "update available" network check — noisy on every boot and
    // some shells (PowerShell) misreport its stderr output as a command error
    env: { ...process.env, DATABASE_URL: 'file:' + DB_PATH, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
    shell: false,
    timeout: 60000,
  });
  if (res.status !== 0) {
    console.error(c.boldRed(`[BOOT 1/3] ❌ prisma generate FAILED (exit code ${res.status}) — stopping.`));
    process.exit(res.status ?? 1);
  }
  console.log(c.boldGreen('[BOOT 1/3] ✅ Prisma client generated.'));
} catch (err) {
  console.error(c.boldRed('[BOOT 1/3] ❌ Failed to run prisma generate:'), err.message);
  process.exit(1);
}

// Apply any pending migrations (e.g. a new table added since the last deploy)
// to the live database. Idempotent — safe to run on every boot.
console.log(c.bold('[BOOT 1/3]') + ' Applying database migrations...');
try {
  const prismaCli = path.join(__dirname, 'node_modules/prisma/build/index.js');
  const res = spawnSync('node', [prismaCli, 'migrate', 'deploy', '--schema=' + PRISMA_SCHEMA], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:' + DB_PATH, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
    shell: false,
    timeout: 60000,
  });
  if (res.status !== 0) {
    console.error(c.boldRed(`[BOOT 1/3] ❌ prisma migrate deploy FAILED (exit code ${res.status}) — stopping.`));
    process.exit(res.status ?? 1);
  }
  console.log(c.boldGreen('[BOOT 1/3] ✅ Database migrations applied.'));
} catch (err) {
  console.error(c.boldRed('[BOOT 1/3] ❌ Failed to run prisma migrate deploy:'), err.message);
  process.exit(1);
}

// The compiled files must exist — if the "npm run build" step above (during
// npm install) failed, these are missing and nothing can start. Fail loudly
// with instructions instead of a confusing crash later.
function requireBuilt(label, file) {
  if (!fs.existsSync(path.resolve(__dirname, file))) {
    console.error('');
    console.error(c.boldRed('!'.repeat(58)));
    console.error(c.boldRed(`[BOOT] ❌ ${label} NOT FOUND: ${file}`));
    console.error(c.red('[BOOT]    This means the "npm run build" step FAILED earlier'));
    console.error(c.red('[BOOT]    in the log. Scroll up and look for lines starting'));
    console.error(c.red('[BOOT]    with "error TS" — fix that error and restart.'));
    console.error(c.boldRed('!'.repeat(58)));
    process.exit(1);
  }
}
requireBuilt('API server build', 'server/dist/index.js');
requireBuilt('Discord bot build', 'bot/dist/index.js');
if (!fs.existsSync(path.resolve(__dirname, 'client/dist/index.html'))) {
  console.error(c.boldRed('[BOOT] ❌ client build NOT FOUND: client/dist/index.html'));
  console.error(c.red('[BOOT]    The website will not load until "npm --workspace=client run build" succeeds.'));
  console.error(c.red('[BOOT]    Scroll up to the "[BUILD 1/3]" section for the Vite error.'));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Steps 2/3 and 3/3 — start both processes, restart them if they crash.
// Output is piped (not inherited) so every line can be prefixed with a
// colored [API]/[BOT] tag — makes it obvious which process is talking.
// ---------------------------------------------------------------------------
const children = new Map();

function pipeWithPrefix(stream, name, writer) {
  const color = PREFIX_COLOR[name] || c.white;
  const tag = color(`[${name}]`);
  // the child processes already tag their own lines (e.g. "[API] ...",
  // "[BOT] ...") — skip re-tagging those so lines don't end up doubled.
  const ownTag = new RegExp(`^\\[${name}\\]\\s*`);
  const format = (l) => (ownTag.test(l) ? l.replace(ownTag, `${tag} `) : `${tag} ${l}`);
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const l of lines) writer(format(l));
  });
  stream.on('close', () => {
    if (buffer) writer(format(buffer));
  });
}

function start(name, file) {
  console.log(c.dim(`[BOOT] ▶ Starting ${name} (${file})...`));
  // force the same DATABASE_URL the migrations just ran against — a stray .env
  // file setting a different value here would silently point the live API/bot
  // at a stale, unmigrated database
  const child = fork(path.resolve(__dirname, file), [], {
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, DATABASE_URL: 'file:' + DB_PATH },
  });
  pipeWithPrefix(child.stdout, name, (l) => console.log(l));
  pipeWithPrefix(child.stderr, name, (l) => console.error(l));
  children.set(name, child);
  child.on('exit', (code) => {
    const ok = code === 0 || code === null;
    console.log((ok ? c.yellow : c.boldRed)(`[${name}] ⚠ exited with code ${code} — restarting in 3s`));
    children.delete(name);
    setTimeout(() => start(name, file), 3000);
  });
  child.on('error', (err) => {
    console.error(c.boldRed(`[${name}] ❌ error:`), err.message);
  });
  return child;
}

console.log(c.bold('[BOOT 2/3]') + ' Starting website + API server...');
start('API', 'server/dist/index.js');

if (process.env.DISCORD_TOKEN) {
  console.log(c.bold('[BOOT 3/3]') + ' Starting Discord bot...');
  start('BOT', 'bot/dist/index.js');
} else {
  console.log('');
  console.log(c.boldRed('!'.repeat(58)));
  console.log(c.boldRed('[BOOT 3/3] ⚠ DISCORD_TOKEN IS NOT SET — THE BOT CANNOT START.'));
  console.log(c.yellow('[BOOT]    The website + API are still running fine.'));
  console.log(c.yellow('[BOOT]    FIX: in the Orihost panel open the server\'s'));
  console.log(c.yellow('[BOOT]    "Startup" or "Variables" tab and add a variable:'));
  console.log(c.yellow('[BOOT]      Name:  DISCORD_TOKEN'));
  console.log(c.yellow('[BOOT]      Value: your bot token from the Discord'));
  console.log(c.yellow('[BOOT]             Developer Portal (Bot → Reset Token)'));
  console.log(c.yellow('[BOOT]    Then restart the server.'));
  console.log(c.boldRed('!'.repeat(58)));
}

console.log(line);
console.log(c.boldGreen('  🚀 BEYOND90 is up — website: ') + c.bold(`http://0.0.0.0:${process.env.PORT || 4000}`) + c.boldGreen(' (mapped to your Orihost public port)'));
console.log(line);

process.on('SIGTERM', () => {
  for (const child of children.values()) child.kill('SIGTERM');
  process.exit(0);
});
process.on('SIGINT', () => {
  for (const child of children.values()) child.kill('SIGINT');
  process.exit(0);
});