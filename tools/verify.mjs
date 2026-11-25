import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = resolve(process.argv[2] || join(root,'out'));
const dataFile = resolve(process.argv[3] || join(root,'input/snapshot.json'));
const snapshot = JSON.parse(readFileSync(dataFile,'utf8'));
const source = new Map(snapshot.protocols.map(p=>[p.slug,p]));
const read = path => readFileSync(join(dir,path));
const names = rel => readdirSync(join(dir,rel)).sort();
const plain = (file) => assert(statSync(join(dir,file)).isFile(), file);
const pass = label => console.log('OK   '+label);
const assets = names('dashboard');
assert(assets.includes('index.html') && assets.some(x=>x.endsWith('.css')) && assets.some(x=>x.endsWith('.js')));
assert(assets.length<=400 && assets.reduce((sum,k)=>sum+read('dashboard/'+k).length,0)<=4194304);
for (const n of assets) {
  plain('dashboard/'+n);
  assert(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(n));
  assert(!/https?:\/\//i.test(read('dashboard/'+n).toString()), 'Network address in '+n);
}
pass('dashboard files, size and offline sources');
const bytes=read('board.json');
assert(bytes.length<=8388608);
const {rows}=JSON.parse(bytes.toString());
assert(rows.length>=100 && rows.length<=4000);
const slugs=new Set();
for(const r of rows){
  assert(!slugs.has(r.slug)&&source.has(r.slug)&&/^\S{1,128}$/.test(r.slug));
  slugs.add(r.slug);
  const p=source.get(r.slug);
  assert(r.name===p.name && r.name.trim());
  assert(p.symbol===null && p.gecko_id===null && p.mcap_usd===null);
  assert(Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd>0 && r.implied_value_usd<=1e14);
  const m=r.model;
  assert.equal(r.implied_value_usd,Math.max(1,Math.round(r.tvl_usd*m.multiple*m.size*m.maturity*m.growth)));
}
pass('board records, token fields and valuation arithmetic');
assert(rows.every((r,i)=>r.rank===i+1 && (!i || r.implied_value_usd<=rows[i-1].implied_value_usd)));
assert(new Set(rows.map(r=>r.implied_value_usd)).size>1);
pass('contiguous ranks and value order');
assert(snapshot.watchlist.every(slug=>slugs.has(slug)));
pass('official coverage '+snapshot.watchlist.length+'/'+snapshot.watchlist.length);
for(const r of rows)assert(r.farm_steps.length>=3 && r.farm_steps.length<=12 && r.farm_steps.every(s=>typeof s==='string'&&s.trim().length>=20&&s.trim().length<=600));
pass('per-protocol research steps');
const shots=names('screenshots');
assert(shots.length>=3&&shots.length<=4);
for(const name of shots){
  const img=read('screenshots/'+name);
  assert(img.length<=524288 && img.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  const w=img.readUInt32BE(16),h=img.readUInt32BE(20);
  assert(Math.max(w,h)<=1440 && Math.min(w,h)>=800);
}
pass('screenshot count, dimensions and byte limits');
const dossier=read('dossier.json');
assert(dossier.length<=1572864);
assert(Buffer.from(buildDossier(dir,{text_max_bytes:65536})).equals(dossier));
const text=JSON.parse(dossier.toString()).text;
assert(Buffer.byteLength(text)<=65536);
pass('dossier matches make.fun buildDossier byte for byte');
console.log('board SHA-256 '+createHash('sha256').update(bytes).digest('hex'));

