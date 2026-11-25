// Launch Atlas entrypoint — clean-room implementation from the model spec.
// Reads the sealed snapshot, ranks pre-token protocols by implied launch
// value, and writes the board, the dashboard data, the screenshots and the
// dossier. Node 22, standard library only, no network. Deterministic.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildRadar, parseSnapshot } from './lib/model.ts';
import { makeFarmSteps } from './lib/plans.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    preview: { type: 'boolean' },
    standalone: { type: 'string' },
  },
});

// The sealed snapshot lives at /input/snapshot.json when the scorer mounts
// it; locally it sits under the repository's input/ directory.
const mounted = existsSync('/input/snapshot.json');
const inputArg = values.input ?? (mounted ? '/input/snapshot.json' : join(root, 'input/snapshot.json'));
const inputPath = resolve(inputArg);
const snapshotFile = statSync(inputPath).isDirectory() ? join(inputPath, 'snapshot.json') : inputPath;
const outDir = resolve(values.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? (mounted ? '/output' : join(root, 'out')));
const dashDir = join(outDir, 'dashboard');
const dashSource = join(root, 'dashboard');
if (outDir === root || outDir === dashSource) throw new Error('Choose a separate output directory.');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const result = buildRadar(snapshot, makeFarmSteps);
const { board, meta } = result;

mkdirSync(dashDir, { recursive: true });

// The dashboard reads window.LAUNCH_ATLAS. Escape the characters that would
// break out of a script tag or split a line.
const atlas = { meta, rows: board };
const dataScript =
  'window.LAUNCH_ATLAS = ' +
  JSON.stringify(atlas).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') +
  ';\n';
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ as_of: snapshot.as_of, unit: 'USD', rows: board }) + '\n');
writeFileSync(join(outDir, 'data.js'), dataScript);
for (const name of ['index.html', 'app.css', 'app.js', 'plot.js']) {
  copyFileSync(join(dashSource, name), join(dashDir, name));
}

// Optional single-file build: inline the stylesheet and every script into
// the page, so the dashboard works from one HTML file.
if (values.standalone) {
  const read = (name: string) => readFileSync(join(dashSource, name), 'utf8');
  let html = read('index.html').replace(
    '<link rel="stylesheet" href="app.css">',
    () => '<style>' + read('app.css') + '</style>',
  );
  const inlines: Array<[string, string]> = [
    ['../data.js', dataScript],
    ['plot.js', read('plot.js')],
    ['app.js', read('app.js')],
  ];
  for (const [file, body] of inlines) {
    html = html.replace('<script src="' + file + '"></script>', () => '<script>' + body.replace(/<\/script/gi, '<\\/script') + '</script>');
  }
  writeFileSync(resolve(values.standalone), html);
}

// A full run (not a preview) also copies the captured screenshots and writes
// the dossier, which is the machine-readable summary of the whole entry.
if (!values.preview) {
  const shotsDir = join(root, 'screenshots');
  const shots = readdirSync(shotsDir).filter((n) => /\.(?:png|jpe?g)$/i.test(n)).sort();
  if (shots.length < 3 || shots.length > 4) throw new Error('Expected 3-4 captured views. Use --preview before capturing.');
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  for (const name of shots) copyFileSync(join(shotsDir, name), join(outDir, 'screenshots', name));
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  if (dossier.byteLength > 1572864) throw new Error('Dossier exceeds 1.5 MiB.');
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

console.log(`${snapshot.as_of} | ${board.length} ranked | ${meta.watch} official | ${meta.peers} calibration peers`);
