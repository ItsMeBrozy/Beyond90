import { parseLineupText, buildLineupImage } from './src/lineup';
const resolve = (t: string): string => (t === '<@111>' ? 'striker_boi' : t === '<@222>' ? 'WallGK' : '');
const sample = "```\nGK - <@222>\nCB - John_Doe\n2. LB - <@111>\nST : FastRunner\nLW = WingerX\n```";
const r = parseLineupText(sample, resolve);
console.log(JSON.stringify(r.players));
console.log('cancel test:', JSON.stringify(parseLineupText('cancel', resolve).error));
console.log('garbage test:', (parseLineupText('hello world', resolve).error || '').slice(0, 30));
buildLineupImage('home', 'Real Madrid', 'MATCH #12', r.players).then((b: Buffer) => {
  require('fs').writeFileSync('C:/Users/barza/AppData/Local/Temp/opencode/lineup-test.png', b);
  console.log('png bytes:', b.length);
});
