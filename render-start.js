// Render entry — ONE free web service runs BOTH the website/API and the Discord
// bot. We fork the server (site + REST API) and the bot as children of this
// single process. If one crashes we still try to restart it so the site and bot
// come back on their own (Render will also restart the whole service).
const { fork } = require('child_process');
const path = require('path');

const children = new Map();

function start(name, file) {
  const child = fork(path.resolve(__dirname, file), [], { stdio: 'inherit' });
  children.set(name, child);
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}, restarting in 3s`);
    children.delete(name);
    setTimeout(() => start(name, file), 3000);
  });
  child.on('error', (err) => {
    console.error(`[${name}] error:`, err.message);
  });
  return child;
}

start('API', 'server/dist/index.js');
start('BOT', 'bot/dist/index.js');

process.on('SIGTERM', () => {
  for (const child of children.values()) child.kill('SIGTERM');
  process.exit(0);
});
process.on('SIGINT', () => {
  for (const child of children.values()) child.kill('SIGINT');
  process.exit(0);
});
