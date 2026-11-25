import { makePlan } from './plans.ts';

export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[];
}
type Peer = { p: Protocol; logRatio: number };
const dayMs = 86_400_000;
// Stable reported factors across Node/V8 math library versions. The board multiplies these same factors.
const precise = (x: number) => Number(x.toPrecision(12));
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clip = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cat = (p: Protocol) => p.category || 'Unclassified';
const hasToken = (p: Protocol) => p.mcap_usd !== null || Boolean(p.gecko_id || p.symbol);
const productCategory = /bridge|staking|restaked|wrapper|^cex$|^anchor btc$|decentralized btc|token locker/i;
const productName = /\b(?:wrapped|bridged|staked|staking|restaking|wrapper|vaults?|pools?|pooling|validator|tranching)\b/i;
const exchangeStart = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
const version = /(?:\bv\d+(?:\.\d+)?|\s\d+\.\d+)$/i;
const assetSuffix = /\s[A-Za-z]{1,7}(?:USD[CT]?|ETH|BTC|HYPE|SOL|LP|Bill)(?:\sFamily)?$/;
const product = (p: Protocol) => productCategory.test(cat(p)) || productName.test(p.name) ||
  exchangeStart.test(p.name) || version.test(p.name) || /[a-z]V\d+$/.test(p.name) || assetSuffix.test(p.name);

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text);
  if (!raw || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) ||
      !Number.isFinite(Date.parse(raw.as_of)) || !(raw.floor_usd > 0)) {
    throw new Error('Expected a dated make.fun protocol snapshot and watchlist.');
  }
  const seen = new Set<string>();
  for (const p of raw.protocols) {
    if (!p || typeof p.slug !== 'string' || !p.slug || seen.has(p.slug) ||
        typeof p.name !== 'string' || !p.name || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0 ||
        !Array.isArray(p.chains) || !p.chains.every((c: unknown) => typeof c === 'string') ||
        ![p.change_7d,p.mcap_usd].every(v => v === null || Number.isFinite(v))) {
      throw new Error('Invalid or repeated protocol in snapshot: ' + String(p?.slug));
    }
    seen.add(p.slug);
  }
  if (new Set(raw.watchlist).size !== raw.watchlist.length || raw.watchlist.some((s: string) => !seen.has(s))) {
    throw new Error('Watchlist contains repeated or unlisted identifiers.');
  }
  return raw;
}

function quantile(values: number[], q: number): number {
  const v = [...values].sort((a,b) => a-b);
  const pos = q * (v.length - 1);
  const i = Math.floor(pos);
  return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (pos - i);
}

function calibrationPeers(protocols: Protocol[]): Peer[] {
  const unique = new Map<string, Protocol>();
  for (const p of protocols) {
    if (!(p.mcap_usd !== null && p.mcap_usd > 0 && (p.gecko_id || p.symbol)) || product(p)) continue;
    const id = (p.gecko_id || p.symbol)!.toLowerCase();
    const old = unique.get(id);
    if (!old || p.tvl_usd > old.tvl_usd || (p.tvl_usd === old.tvl_usd && cmp(p.slug, old.slug) < 0)) unique.set(id, p);
  }
  return [...unique.values()].sort((a,b) => cmp(a.slug,b.slug))
    .map(p => ({p, logRatio: Math.log(p.mcap_usd! / p.tvl_usd)}));
}

function fitPeers(peers: Peer[]) {
  const slopes: number[] = [];
  for (let i=0; i<peers.length; i++) {
    for (let j=i+1; j<peers.length; j++) {
      const a = peers[i].p, b = peers[j].p;
      const dx = Math.log(a.tvl_usd / b.tvl_usd);
      if (Math.abs(dx) >= Math.LN2) slopes.push(Math.log(a.mcap_usd! / b.mcap_usd!) / dx);
    }
  }
  const beta = peers.length >= 8 && slopes.length ? precise(clip(quantile(slopes,0.5),0.25,1)) : 1;
  const pivot = peers.length ? precise(Math.exp(quantile(peers.map(x => Math.log(x.p.tvl_usd)),0.5))) : 1;
  const normalized = peers.map(x => x.logRatio + (beta - 1) * Math.log(pivot / x.p.tvl_usd));
  const byCategory = new Map<string,number[]>();
  peers.forEach((x,i) => {
    const group = cat(x.p);
    if (!byCategory.has(group)) byCategory.set(group, []);
    byCategory.get(group)!.push(normalized[i]);
  });
  return {beta, pivot, byCategory,
    globalLog:peers.length ? quantile(normalized,0.5) : Math.log(0.25),
    plainLog:peers.length ? quantile(peers.map(x => x.logRatio),0.5) : Math.log(0.25)};
}

function factors(p: Protocol, fit: ReturnType<typeof fitPeers>, date: string) {
  const group = fit.byCategory.get(cat(p)) || [];
  const groupLog = group.length ? quantile(group,0.5) : fit.globalLog;
  const weight = group.length / (group.length + 6);
  const multiple = precise(Math.exp((1-weight) * fit.globalLog + weight * groupLog));
  const size = precise(Math.pow(p.tvl_usd / fit.pivot, fit.beta - 1));
  const age = p.listed_at ? Math.max(0, Math.floor((Date.parse(date) - Date.parse(p.listed_at)) / dayMs)) : null;
  const maturity = 0.85 + 0.15 * clip((age ?? 182.5) / 365, 0, 1);
  const growth = 1 + 0.002 * clip(p.change_7d ?? 0, -50, 50);
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * size * maturity * growth));
  return {value, multiple, size, maturity, growth, age, weight, count:group.length,
    globalMultiple:precise(Math.exp(fit.globalLog)), groupMultiple:group.length ? precise(Math.exp(groupLog)) : null};
}

function holdout(peers: Peer[], date: string) {
  if (peers.length < 3) return {count:0, error:null, baseline:null, low:null, high:null};
  const residuals: number[] = [];
  const baselineErrors: number[] = [];
  for (const held of peers) {
    const remaining = peers.filter(x => x !== held);
    const fit = fitPeers(remaining);
    const f = factors(held.p, fit, date);
    residuals.push(Math.log(held.p.mcap_usd! / f.value));
    baselineErrors.push(Math.abs(Math.log(held.p.mcap_usd! / (held.p.tvl_usd * Math.exp(fit.plainLog)))));
  }
  return {count:peers.length, error:precise(Math.exp(quantile(residuals.map(Math.abs),0.5))),
    baseline:precise(Math.exp(quantile(baselineErrors,0.5))),
    low:precise(Math.min(1,Math.exp(quantile(residuals,0.1)))), high:precise(Math.max(1,Math.exp(quantile(residuals,0.9))))};
}

function tokenFamilies(protocols: Protocol[]) {
  const roots = new Set<string>();
  for (const p of protocols.filter(hasToken)) {
    for (const name of [p.name.replace(/\s+v\d+(?:\.\d+)?$/i,''), p.gecko_id || '']) {
      const base = key(name);
      if (base.length >= 3) roots.add(base);
    }
  }
  return [...roots];
}

export function buildRadar(snapshot: Snapshot) {
  const watch = new Set(snapshot.watchlist);
  const all = snapshot.protocols;
  const peers = calibrationPeers(all);
  const fit = fitPeers(peers);
  const validation = holdout(peers,snapshot.as_of);
  const peerSlugs = new Set(peers.map(x => x.p.slug));
  const families = tokenFamilies(all);
  const excluded: Record<string, number> = {above:0,product:0,family:0};
  const candidates = all.filter(p => {
    if (hasToken(p)) {
      if (watch.has(p.slug)) throw new Error('Watchlist row has a recorded token: ' + p.slug);
      return false;
    }
    // The sealed list applied parentProtocol upstream. Below the floor that field is unavailable.
    if (watch.has(p.slug)) return true;
    if (p.tvl_usd >= snapshot.floor_usd) { excluded.above++; return false; }
    if (product(p)) { excluded.product++; return false; }
    const name = key(p.name);
    if (families.some(root => name === root || name.startsWith(root + ' '))) { excluded.family++; return false; }
    return true;
  });
  const market = all.filter(hasToken).map(p => ({...p, used:peerSlugs.has(p.slug)}))
    .sort((a,b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) || cmp(a.slug,b.slug));
  const scored = candidates.map(p => {
    const f = factors(p,fit,snapshot.as_of);
    const close = peers.filter(x => !f.count || cat(x.p) === cat(p))
      .sort((a,b) => Math.abs(Math.log(a.p.tvl_usd / p.tvl_usd)) - Math.abs(Math.log(b.p.tvl_usd / p.tvl_usd)) || cmp(a.p.slug,b.p.slug))
      .slice(0,3).map(x => x.p.slug);
    const plan = makePlan(p,p.change_7d);
    return {...p, official:watch.has(p.slug), model:f, peers:close, plan, implied_value_usd:f.value,
      low_usd:validation.low === null ? null : Math.max(1,Math.round(f.value * validation.low)),
      high_usd:validation.high === null ? null : Math.max(1,Math.round(f.value * validation.high))};
  }).sort((a,b) => b.implied_value_usd - a.implied_value_usd || cmp(a.slug,b.slug));
  const rows = scored.map((r,i) => ({...r, rank:i+1}));
  const board = rows.map(({plan,...r}) => ({...r, token_status:'no-token-recorded',
    farm_steps:plan.map(s => s.title[1] + '. ' + s.text[1] + ' Actual cost $0 (paper exercise). About ' + s.minutes + ' minutes.')}));
  const meta = {asOf:snapshot.as_of, total:all.length, watch:watch.size, floor:snapshot.floor_usd, early:rows.length-watch.size,
    market:market.length, priced:market.filter(p => (p.mcap_usd ?? 0) > 0).length, peers:peers.length, beta:fit.beta, pivot:fit.pivot, excluded, validation};
  return {board, data:{meta,rows,market}};
}

