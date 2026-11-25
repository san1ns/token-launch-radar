// Launch Atlas valuation model — clean-room implementation from the model spec.
// Reads a DeFiLlama snapshot and ranks pre-token protocols by implied launch value.
// No network, standard library only. Deterministic: same input -> same bytes.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelDetail {
  value: number;
  multiple: number;
  size: number;
  maturity: number;
  growth: number;
  age: number;
  weight: number;
  count: number;
  globalMultiple: number;
  groupMultiple: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  official: boolean;
  model: ModelDetail;
  peers: string[];
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
  rank: number;
  token_status: string;
  farm_steps: string[];
}

export interface RadarOutput {
  board: BoardRow[];
  meta: Record<string, unknown>;
  rows: BoardRow[];
  beta: number;
  pivot: number;
  validation: {
    count: number;
    error: number;
    baseline: number;
    low: number;
    high: number;
  };
}

// Keep a number to twelve significant digits, then use it as a plain number.
function sig12(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Number(x.toPrecision(12));
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Quantile by linear interpolation over ascending values. Median is q = 0.5.
function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

// A protocol has a token record when its market cap is present, or when it
// carries a CoinGecko id or a token symbol. A zero market cap still counts
// as a record, but it cannot enter a log fit.
export function hasTokenRecord(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || (p.gecko_id !== null && p.gecko_id !== '') || (p.symbol !== null && p.symbol !== '');
}

const CATEGORY_PRODUCT_WORDS = ['bridge', 'staking', 'restaked', 'wrapper', 'decentralized btc', 'token locker'];
const CATEGORY_PRODUCT_EXACT = new Set(['cex', 'anchor btc']);
const NAME_PRODUCT_WORDS = ['wrapped', 'bridged', 'staked', 'staking', 'restaking', 'wrapper', 'vault', 'vaults', 'pool', 'pools', 'pooling', 'validator', 'tranching'];
const EXCHANGE_PREFIXES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const ASSET_SUFFIXES = ['USD', 'USDC', 'USDT', 'ETH', 'BTC', 'HYPE', 'SOL', 'LP', 'Bill'];

// Heuristic product screen over the snapshot. It cannot verify real-world
// parent-protocol relationships; it only flags wrapped / bridged / staked /
// vault / pool / exchange products and asset suffixes.
export function isProduct(p: SnapshotProtocol): boolean {
  const cat = (p.category ?? '').toLowerCase();
  if (CATEGORY_PRODUCT_EXACT.has(cat)) return true;
  for (const word of CATEGORY_PRODUCT_WORDS) {
    if (cat.includes(word)) return true;
  }
  const name = p.name ?? '';
  const lowerName = name.toLowerCase();
  for (const word of NAME_PRODUCT_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(lowerName)) return true;
  }
  for (const prefix of EXCHANGE_PREFIXES) {
    if (new RegExp(`^${prefix}\\b`).test(lowerName)) return true;
  }
  // Trailing version marker: a whole word "v" plus an integer, optional decimal.
  if (/\bv\d+(\.\d+)?$/i.test(name)) return true;
  // Trailing dotted version: whitespace plus digits dot digits.
  if (/\s\d+\.\d+$/.test(name)) return true;
  // A lowercase letter glued to an uppercase V plus digits at the end.
  if (/[a-z]V\d+$/.test(name)) return true;
  // Asset suffix, case sensitive: whitespace, 1-7 letters, then a known
  // asset tag, optionally " Family", and nothing after it.
  const suffix = new RegExp(`\\s[A-Za-z]{1,7}(?:${ASSET_SUFFIXES.join('|')})(?:\\sFamily)?$`);
  if (suffix.test(name)) return true;
  return false;
}

// Normalise a name for family matching: lowercase, collapse each run of
// non-ASCII-alphanumeric characters into one space, trim. Under 3 chars
// the result is discarded by the caller.
function familyKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Strip a trailing " v<integer>[.decimal]" from a name before family matching.
function stripVersionTail(name: string): string {
  return name.replace(/\s+v\d+(\.\d+)?$/i, '');
}

function parseSnapshotDate(text: string | null): number | null {
  if (!text) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Whole days from the listing date up to the snapshot date, floored, never negative.
function listedDays(snapshotDay: number, listedAt: string | null): number | null {
  const listed = parseSnapshotDate(listedAt);
  if (listed === null) return null;
  return Math.max(0, Math.floor((snapshotDay - listed) / 86400000));
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!raw || typeof raw !== 'object') throw new Error('Snapshot must be an object.');
  if (!Array.isArray(raw.protocols)) throw new Error('Snapshot needs a protocols array.');
  if (!Array.isArray(raw.watchlist)) throw new Error('Snapshot needs a watchlist array.');
  if (typeof raw.floor_usd !== 'number' || !Number.isFinite(raw.floor_usd) || raw.floor_usd <= 0) {
    throw new Error('Snapshot needs a positive floor_usd.');
  }
  const seen = new Set<string>();
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || p.slug === '') throw new Error('Every protocol needs a non-empty slug.');
    if (typeof p.name !== 'string' || p.name === '') throw new Error('Every protocol needs a non-empty name.');
    if (seen.has(p.slug)) throw new Error(`Duplicate slug: ${p.slug}`);
    seen.add(p.slug);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0) {
      throw new Error(`Protocol ${p.slug} needs a finite positive TVL.`);
    }
    if (p.mcap_usd !== null && (typeof p.mcap_usd !== 'number' || !Number.isFinite(p.mcap_usd))) {
      throw new Error(`Protocol ${p.slug} has a non-finite market cap.`);
    }
    if (p.change_7d !== null && (typeof p.change_7d !== 'number' || !Number.isFinite(p.change_7d))) {
      throw new Error(`Protocol ${p.slug} has a non-finite 7d change.`);
    }
    if (p.category === null || p.category === '') p.category = 'Unclassified';
  }
  const watchSeen = new Set<string>();
  for (const slug of raw.watchlist) {
    if (watchSeen.has(slug)) throw new Error(`Duplicate watchlist slug: ${slug}`);
    watchSeen.add(slug);
    if (!seen.has(slug)) throw new Error(`Watchlist slug missing from protocols: ${slug}`);
  }
  return raw;
}

interface CalibrationSample {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  change7d: number | null;
  listedAt: string | null;
}

interface Fit {
  beta: number;
  pivot: number;
  global: number;
  rawMedian: number;
  byCategory: Map<string, { z: number[]; median: number; count: number }>;
}

// Fit the scale law on the calibration samples. Returns the slope, the
// reference scale, the market centre and the per-category centres.
function fitCalibration(samples: CalibrationSample[]): Fit {
  const tvls = samples.map((s) => s.tvl);
  const mcaps = samples.map((s) => s.mcap);
  let beta = 1;
  if (samples.length >= 8) {
    const slopes: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const logT = Math.log(tvls[i] / tvls[j]);
        if (Math.abs(logT) >= Math.log(2)) {
          slopes.push(Math.log(mcaps[i] / mcaps[j]) / logT);
        }
      }
    }
    if (slopes.length > 0) beta = clamp(median(slopes), 0.25, 1);
  }
  beta = sig12(beta);
  const logTvls = tvls.map((t) => Math.log(t));
  const pivot = samples.length === 0 ? 1 : sig12(Math.exp(median(logTvls)));
  const zValues = samples.map((s) => Math.log(s.mcap / s.tvl) + (beta - 1) * Math.log(pivot / s.tvl));
  const global = samples.length === 0 ? Math.log(0.25) : median(zValues);
  const rawMedian = samples.length === 0 ? Math.log(0.25) : median(samples.map((s) => Math.log(s.mcap / s.tvl)));
  const byCategory = new Map<string, { z: number[]; median: number; count: number }>();
  samples.forEach((s, idx) => {
    const bucket = byCategory.get(s.category) ?? { z: [], median: 0, count: 0 };
    bucket.z.push(zValues[idx]);
    bucket.count++;
    byCategory.set(s.category, bucket);
  });
  for (const bucket of byCategory.values()) bucket.median = median(bucket.z);
  return { beta, pivot, global, rawMedian, byCategory };
}

// The reference multiple and the size correction for one protocol.
function referenceMultiple(fit: Fit, category: string): { multiple: number; weight: number; count: number; groupMultiple: number } {
  const bucket = fit.byCategory.get(category);
  const count = bucket ? bucket.count : 0;
  const groupCentre = count === 0 ? fit.global : bucket!.median;
  const weight = count / (count + 6);
  const multiple = sig12(Math.exp((1 - weight) * fit.global + weight * groupCentre));
  return { multiple, weight, count, groupMultiple: sig12(Math.exp(groupCentre)) };
}

function sizeCorrection(fit: Fit, tvl: number): number {
  return sig12(Math.pow(tvl / fit.pivot, fit.beta - 1));
}

// Implied circulating value for one protocol, from the fitted model.
function impliedValue(
  fit: Fit,
  tvl: number,
  category: string,
  change7d: number | null,
  listedAt: string | null,
  snapshotDay: number,
): { value: number; detail: Omit<ModelDetail, 'value'> } {
  const ref = referenceMultiple(fit, category);
  const size = sizeCorrection(fit, tvl);
  const growth = 1 + 0.002 * clamp(change7d ?? 0, -50, 50);
  const days = listedDays(snapshotDay, listedAt);
  const age = days === null ? 182.5 : days;
  const maturity = 0.85 + 0.15 * clamp(age / 365, 0, 1);
  const value = Math.max(1, Math.round(tvl * ref.multiple * size * maturity * growth));
  return {
    value,
    detail: {
      multiple: ref.multiple,
      size,
      maturity,
      growth,
      age,
      weight: ref.weight,
      count: ref.count,
      globalMultiple: sig12(Math.exp(fit.global)),
      groupMultiple: ref.groupMultiple,
    },
  };
}

// Up to three reference protocols for the detail view: same category first,
// then the whole calibration set. Closest by |ln(Ti / T)|, ties by slug.
function nearestPeers(samples: CalibrationSample[], category: string, tvl: number): string[] {
  const same = samples.filter((s) => s.category === category);
  const pool = same.length > 0 ? same : samples;
  return [...pool]
    .sort((a, b) => {
      const da = Math.abs(Math.log(a.tvl / tvl));
      const db = Math.abs(Math.log(b.tvl / tvl));
      if (da !== db) return da - db;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .slice(0, 3)
    .map((s) => s.slug);
}

export function buildRadar(snapshot: Snapshot, makeFarmSteps: (p: SnapshotProtocol, rank: number) => string[]): RadarOutput {
  const protocols = snapshot.protocols;
  const watchlist = new Set(snapshot.watchlist);
  const snapshotDay = parseSnapshotDate(snapshot.as_of);
  if (snapshotDay === null) throw new Error('Snapshot as_of must be a YYYY-MM-DD date.');

  // Count the market: token records and positive market caps.
  const tokenRecords = protocols.filter(hasTokenRecord);
  const pricedCount = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;

  // Candidate set. A watchlist item with a token record is an input conflict.
  let aboveFloor = 0;
  let productCount = 0;
  let familyCount = 0;
  const familyNames = new Set<string>();
  for (const p of tokenRecords) {
    for (const source of [stripVersionTail(p.name), p.gecko_id ?? '']) {
      const key = familyKey(source);
      if (key.length >= 3) familyNames.add(key);
    }
  }
  const candidates: SnapshotProtocol[] = [];
  for (const p of protocols) {
    if (hasTokenRecord(p)) {
      if (watchlist.has(p.slug)) throw new Error(`Watchlist protocol has a token record: ${p.slug}`);
      continue;
    }
    if (watchlist.has(p.slug)) {
      candidates.push(p);
      continue;
    }
    if (p.tvl_usd >= snapshot.floor_usd) {
      aboveFloor++;
      continue;
    }
    if (isProduct(p)) {
      productCount++;
      continue;
    }
    const norm = familyKey(p.name);
    let blocked = false;
    if (norm.length >= 3) {
      for (const fam of familyNames) {
        if (norm === fam || norm.startsWith(fam + ' ')) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) {
      familyCount++;
      continue;
    }
    candidates.push(p);
  }

  // Calibration set: positive market cap, positive TVL, a CoinGecko id or a
  // symbol, not a product. One row per key (lowercase gecko id, else symbol),
  // keeping the largest TVL, ties broken by the smaller slug.
  const byKey = new Map<string, CalibrationSample>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (p.tvl_usd <= 0) continue;
    if (!((p.gecko_id !== null && p.gecko_id !== '') || (p.symbol !== null && p.symbol !== ''))) continue;
    if (isProduct(p)) continue;
    const key = ((p.gecko_id ?? '') !== '' ? p.gecko_id! : p.symbol!).toLowerCase();
    const sample: CalibrationSample = { slug: p.slug, name: p.name, category: p.category ?? 'Unclassified', tvl: p.tvl_usd, mcap: p.mcap_usd, change7d: p.change_7d, listedAt: p.listed_at };
    const prev = byKey.get(key);
    if (!prev || sample.tvl > prev.tvl || (sample.tvl === prev.tvl && sample.slug < prev.slug)) {
      byKey.set(key, sample);
    }
  }
  const calibration = [...byKey.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const fit = fitCalibration(calibration);

  // Leave-one-out validation over the calibration set.
  let validation = { count: 0, error: 0, baseline: 0, low: 0, high: 0 };
  if (calibration.length >= 3) {
    const residuals: number[] = [];
    const baselineResiduals: number[] = [];
    for (let i = 0; i < calibration.length; i++) {
      const held = calibration[i];
      const rest = calibration.filter((_, idx) => idx !== i);
      const foldFit = fitCalibration(rest);
      const pred = impliedValue(foldFit, held.tvl, held.category, held.change7d, held.listedAt, snapshotDay);
      residuals.push(Math.log(held.mcap / pred.value));
      const base = held.tvl * Math.exp(foldFit.rawMedian);
      baselineResiduals.push(Math.log(held.mcap / base));
    }
    const error = sig12(Math.exp(median(residuals.map((r) => Math.abs(r)))));
    const baseline = sig12(Math.exp(median(baselineResiduals.map((r) => Math.abs(r)))));
    const sortedRes = [...residuals].sort((a, b) => a - b);
    const low = sig12(Math.min(1, Math.exp(quantile(sortedRes, 0.1))));
    const high = sig12(Math.max(1, Math.exp(quantile(sortedRes, 0.9))));
    validation = { count: calibration.length, error, baseline, low, high };
  }

  // Rank every candidate.
  const scored = candidates.map((p) => {
    const { value, detail } = impliedValue(fit, p.tvl_usd, p.category ?? 'Unclassified', p.change_7d, p.listed_at, snapshotDay);
    const lowUsd = Math.max(1, Math.round(value * validation.low));
    const highUsd = Math.max(1, Math.round(value * validation.high));
    return {
      protocol: p,
      value,
      detail,
      lowUsd,
      highUsd,
      peers: nearestPeers(calibration, p.category ?? 'Unclassified', p.tvl_usd),
    };
  });
  scored.sort((a, b) => {
    if (a.value !== b.value) return b.value - a.value;
    return a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0;
  });
  const board: BoardRow[] = scored.map((s, idx) => {
    const p = s.protocol;
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Unclassified',
      chains: p.chains ?? [],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      official: watchlist.has(p.slug),
      model: { value: s.value, ...s.detail },
      peers: s.peers,
      implied_value_usd: s.value,
      low_usd: s.lowUsd,
      high_usd: s.highUsd,
      rank: idx + 1,
      token_status: 'no-token-recorded',
      farm_steps: makeFarmSteps(p, idx + 1),
    };
  });

  const meta = {
    asOf: snapshot.as_of,
    total: protocols.length,
    watch: snapshot.watchlist.length,
    floor: snapshot.floor_usd,
    early: candidates.filter((p) => !watchlist.has(p.slug)).length,
    market: tokenRecords.length,
    priced: pricedCount,
    peers: calibration.length,
    beta: fit.beta,
    pivot: fit.pivot,
    excluded: { above: aboveFloor, product: productCount, family: familyCount },
    validation: { ...validation },
  };
  return { board, meta, rows: board, beta: fit.beta, pivot: fit.pivot, validation };
}
