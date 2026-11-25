import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildRadar, parseSnapshot } from './lib/model.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const {values} = parseArgs({options:{
  input:{type:'string'}, output:{type:'string'}, preview:{type:'boolean'}, standalone:{type:'string'}
}});
const mounted = existsSync('/input/snapshot.json');
const input = resolve(values.input ?? (mounted ? '/input/snapshot.json' : join(root, 'input/snapshot.json')));
const inputFile = statSync(input).isDirectory() ? join(input,'snapshot.json') : input;
const out = resolve(values.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? (mounted ? '/output' : join(root,'out')));
const dash = join(out,'dashboard');
const source = join(root,'dashboard');
if (out === root || out === source) throw new Error('Choose a separate output directory.');
const snapshot = parseSnapshot(readFileSync(inputFile,'utf8'));
const {board,data} = buildRadar(snapshot);
mkdirSync(dash,{recursive:true});
const dataScript = 'window.LAUNCH_ATLAS = ' + JSON.stringify(data)
  .replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029') + ';\n';
writeFileSync(join(out,'board.json'),JSON.stringify({as_of:snapshot.as_of,unit:'USD',rows:board})+'\n');
writeFileSync(join(out,'data.js'),dataScript);
for (const name of ['index.html','app.css','app.js','plot.js']) copyFileSync(join(source,name),join(dash,name));
if (values.standalone) {
  const inline = (name:string) => readFileSync(join(source,name),'utf8');
  let html = inline('index.html').replace('<link rel="stylesheet" href="app.css">', () => '<style>'+inline('app.css')+'</style>');
  for (const [file, body] of [['../data.js',dataScript],['plot.js',inline('plot.js')],['app.js',inline('app.js')]]) {
    html = html.replace('<script src="'+file+'"></script>', () => '<script>'+body.replace(/<\/script/gi,'<\\/script')+'</script>');
  }
  const destination = resolve(values.standalone);
  writeFileSync(destination,html);
}
if (!values.preview) {
  const shots = join(root,'screenshots');
  const names = readdirSync(shots).filter(n => /\.(?:png|jpe?g)$/i.test(n)).sort();
  if (names.length < 3 || names.length > 4) throw new Error('Expected 3–4 captured views. Use --preview before capturing.');
  mkdirSync(join(out,'screenshots'),{recursive:true});
  for (const name of names) copyFileSync(join(shots,name),join(out,'screenshots',name));
  const bytes = buildDossier(out,{text_max_bytes:65536, screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}});
  if (bytes.byteLength > 1572864) throw new Error('Dossier exceeds 1.5 MiB.');
  writeFileSync(join(out,'dossier.json'),bytes);
}
console.log(snapshot.as_of + ' | ' + board.length + ' ranked | ' + data.meta.watch + ' official | ' + data.meta.peers + ' calibration peers');

