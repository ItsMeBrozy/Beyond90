const c = (code, s) =>
  process.stdout.hasColors?.() ? `\x1b[${code}m${s}\x1b[0m` : s;

const gradient = (text) => {
  const hues = [213, 199, 185, 171, 157, 141];
  return text
    .split('\n')
    .map(
      (line) =>
        c(`38;5;${hues[Math.floor(Math.random() * hues.length)]}`, line)
    )
    .join('\n');
};

const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const cyan = (s) => c('96', s);
const magenta = (s) => c('95', s);
const yellow = (s) => c('93', s);

console.log(
  gradient(`
  ____  _____ _   _ ______   ___  ___________ 
 | __ )| ____| \\ | |/ ___\\ \\ / / _ \\____ / __|
 |  _ \\|  _| |  \\| | |    \\ V / | | |_  <\\__ \\
 | |_) | |___| |\\  | |___  | || |_| /__/ |___) |
 |____/|_____|_| \\_|\\____| |_| \\___/____/|____/ 
`)
);

console.log(`  ${bold(cyan('⚽ BEYOND90'))} ${dim('— dev stack launching…')}`);
console.log('');
console.log(`   ${cyan('[WEB]')} http://localhost:5173`);
console.log(`   ${magenta('[API]')} http://localhost:4000`);
console.log(`   ${yellow('[BOT]')} Discord gateway`);
console.log('');
console.log(dim('  Press Ctrl+C to stop everything.'));
console.log('');
