// Public link via Cloudflare quick tunnel — prints a shareable
// https://….trycloudflare.com URL. Uses the full install path because VS Code
// terminals opened before the winget install don't have it on PATH.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// 127.0.0.1 on purpose — "localhost" can resolve to IPv6-only while Vite
// binds IPv4, and the tunnel then can't reach the site.
const args = ['tunnel', '--url', 'http://127.0.0.1:5173'];
const FULL = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';

const child = spawn(existsSync(FULL) ? FULL : 'cloudflared', args, { stdio: 'inherit' });

child.on('error', err => {
  console.error('[TUNNEL] Could not start cloudflared:', err.message);
  console.error('[TUNNEL] Install it with: winget install --id Cloudflare.cloudflared');
  process.exit(1);
});

child.on('exit', code => process.exit(code ?? 0));
