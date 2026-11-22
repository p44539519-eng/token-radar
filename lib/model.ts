// Launch Radar's model: one sealed snapshot in, one ranked board out.
//
// The board ranks every pre-token protocol that stands alone (no token on
// record, not a bridge, not liquid staking or restaking, not exchange
// custody, not a versioned release, not a wrapped or staked product, not
// kin of a token that trades), with the snapshot's watchlist as the floor:
// every watchlist slug is ranked even when another rule would set it aside.
//
// Implied value = value if it launches x launch odds. The value if it
// launches is read off a log-log size curve fitted on the traded tokens
// (Huber-robust, fitted at run time from the snapshot itself, never a
// hardcoded list of names), times a 7-day growth carry. The launch odds
// come from a declining-hazard curve fitted on the snapshot's own
// launch history: the chance a protocol with no token after A days
// records one in the next year. Both halves are proved out of sample on
// the board: leave-one-out and a time split for the value curve, a
// split-half holdout for the launch odds.
//
// Farm verdicts are netted to the dollar at a stated deposit ($1,000) and
// a stated airdrop share (10% of implied value): the slice is the
// protocol's airdrop pool times the farmer's share of capital-time, less
// chain fees and the T-bill yield the capital gives up. FARM when the
// launch odds that repay every cost are at most 10%, MARGINAL at most
// 33%, else SKIP. The best farms are small and young; rank 1 is usually
// a SKIP, and that is correct.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  model: {
    value_if_launches_usd: number;
    launch_odds: number;
    growth_multiplier: number;
    curve_intercept: number;
    curve_exponent: number;
    age_days: number | null;
  };
  band: { p10: number; p25: number; p75: number; p90: number };
  economics: {
    deposit_usd: number;
    slice_usd: number;
    fees_usd: number;
    opportunity_usd: number;
    net_usd: number;
    net_per_hour_usd: number;
    break_even_odds: number;
    hours: number;
    hold_days: number;
    verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  value_if_launches_usd: number;
  launch_odds: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  slice_usd: number;
  net_usd: number;
  fees_usd: number;
  hours: number;
  hold_days: number;
  break_even_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_per_hour_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** One group of the coverage ledger: every protocol in exactly one group. */
export interface LedgerGroup {
  key: string;
  label: string;
  count: number;
  reason: string;
}

/** The out-of-sample evidence, printed on the board. */
export interface Backtest {
  fit_n: number;
  curve_intercept: number;
  curve_exponent: number;
  curve_intercept_norm: number;
  loo_median_miss: number;
  loo_within_3x: number;
  loo_flat_median_miss: number;
  loo_flat_within_3x: number;
  wf_n_test: number;
  wf_median_miss: number;
  wf_within_3x: number;
  wf_flat_median_miss: number;
  wf_flat_within_3x: number;
  band_hold_2575: number;
  band_hold_1090: number;
  loo_q10: number;
  loo_q25: number;
  loo_q75: number;
  loo_q90: number;
  ablation: { term: string; loo_median_miss: number; note: string }[];
  launch_holdout_hit: number;
  launch_holdout_base: number;
  launch_holdout_n: number;
  hazard_h0: number;
  hazard_tau: number;
}

/** Everything the dashboard needs: the board, the live set, the model and its proof. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  curve_intercept: number;
  curve_exponent: number;
  growth_weight: number;
  hazard_h0: number;
  hazard_tau: number;
  unknown_age_days: number;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  total_implied_usd: number;
  rank1_name: string;
  rank1_implied_usd: number;
  farm_counts: { farm: number; marginal: number; skip: number };
  ledger: LedgerGroup[];
  backtest: Backtest;
  rows: RadarRow[];
  live: LiveRow[];
  /** Every protocol the board sets aside, with its group and reason. */
  setAside: { slug: string; name: string; category: string | null; group: string; reason: string }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'launch-odds-1';
/** The deposit the board's verdicts are netted at. */
export const DEPOSIT_USD = 1000;
/** The airdrop share of implied value paid to depositors. */
export const AIRDROP_SHARE = 0.1;
/** The risk-free yield the capital gives up while it farms (T-bill, per year). */
export const TBILL_YIELD = 0.05;
/** FARM when the break-even launch odds are at most this; MARGINAL at most this. */
export const FARM_ODDS = 0.1;
export const MARGINAL_ODDS = 0.33;
/** The growth carry's weight on the clamped 7-day move. */
export const GROWTH_WEIGHT = 0.5;
/** Bootstrap refits behind every row's band. */
export const BOOTSTRAP_REFITS = 200;
/** Age assumed when the snapshot records no listing date. */
export const UNKNOWN_AGE_DAYS = 365;

const DAY_MS = 86_400_000;
const log10 = Math.log10;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty array. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A quantile by linear interpolation. */
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/** Ordinary least squares: y = a + b x. */
export function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** Huber-robust line (k = 1.345 sigma by MAD), deterministic, 12 IRLS rounds. */
export function huber(xs: number[], ys: number[]): { a: number; b: number } {
  let { a, b } = ols(xs, ys);
  for (let it = 0; it < 12; it++) {
    const r = xs.map((x, i) => ys[i]! - (a + b * x));
    const med = median(r);
    const mad = median(r.map((v) => Math.abs(v - med))) || 1e-9;
    const k = 1.345 * 1.4826 * mad;
    const w = r.map((v) => (Math.abs(v) <= k ? 1 : k / Math.abs(v)));
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += w[i]!;
      swx += w[i]! * xs[i]!;
      swy += w[i]! * ys[i]!;
      swxx += w[i]! * xs[i]! * xs[i]!;
      swxy += w[i]! * xs[i]! * ys[i]!;
    }
    const den = sw * swxx - swx * swx;
    const nb = (sw * swxy - swx * swy) / den;
    const na = (swy - nb * swx) / sw;
    if (Math.abs(na - a) < 1e-12 && Math.abs(nb - b) < 1e-12) {
      a = na;
      b = nb;
      break;
    }
    a = na;
    b = nb;
  }
  return { a, b };
}

/** Solve a 3x3 linear system by Gaussian elimination with partial pivoting. */
function solve3(a: number[][], b: number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = c + 1; r < 3; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 4; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let v = m[r]![3]!;
    for (let k = r + 1; k < 3; k++) v -= m[r]![k]! * x[k]!;
    x[r] = v / m[r]![r]!;
  }
  return x;
}

/** Huber with a second regressor: y ~ a + b*x + c*z, the coefficient fitted, not fixed.
 * Used only to test the age term honestly: a fixed coefficient would cherry-pick the result. */
export function huber2(xs: number[], zs: number[], ys: number[]): { a: number; b: number; c: number } {
  // Start from the two-regressor OLS.
  let [a, b, c] = solve3(
    [
      [xs.length, xs.reduce((s, v) => s + v, 0), zs.reduce((s, v) => s + v, 0)],
      [xs.reduce((s, v) => s + v, 0), xs.reduce((s, v) => s + v * v, 0), xs.reduce((s, v, i) => s + v * zs[i]!, 0)],
      [zs.reduce((s, v) => s + v, 0), xs.reduce((s, v, i) => s + v * zs[i]!, 0), zs.reduce((s, v) => s + v * v, 0)],
    ],
    [ys.reduce((s, v) => s + v, 0), xs.reduce((s, v, i) => s + v * ys[i]!, 0), zs.reduce((s, v, i) => s + v * ys[i]!, 0)],
  );
  for (let it = 0; it < 12; it++) {
    const r = xs.map((x, i) => ys[i]! - (a + b * x + c * zs[i]!));
    const med = median(r);
    const mad = median(r.map((v) => Math.abs(v - med))) || 1e-9;
    const k = 1.345 * 1.4826 * mad;
    const w = r.map((v) => (Math.abs(v) <= k ? 1 : k / Math.abs(v)));
    // Weighted normal equations for [1, x, z].
    const s = (f: (x: number, z: number, y: number) => number): number => {
      let t = 0;
      for (let i = 0; i < xs.length; i++) t += w[i]! * f(xs[i]!, zs[i]!, ys[i]!);
      return t;
    };
    const [na, nb, nc] = solve3(
      [
        [s(() => 1), s((x) => x), s((_x, z) => z)],
        [s((x) => x), s((x) => x * x), s((x, z) => x * z)],
        [s((_x, z) => z), s((x, z) => x * z), s((_x, z) => z * z)],
      ],
      [s((_x, _z, y) => y), s((x, _z, y) => x * y), s((_x, z, y) => z * y)],
    );
    if (Math.abs(na - a) < 1e-12 && Math.abs(nb - b) < 1e-12 && Math.abs(nc - c) < 1e-12) {
      a = na;
      b = nb;
      c = nc;
      break;
    }
    a = na;
    b = nb;
    c = nc;
  }
  return { a, b, c };
}

/** A seeded PRNG (mulberry32): the bootstrap refits are reproducible. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The miss multiple between a prediction and the truth. */
export function missMultiple(predicted: number, actual: number): number {
  return Math.max(predicted, actual) / Math.min(predicted, actual);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word for a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a product of another protocol, not a launch of their own. */
const BRIDGE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']);
const STAKE_CATEGORIES = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol records a token (a ticker or CoinGecko id, with or without a cap). */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol is a bridge product. */
export function isBridge(p: SnapshotProtocol): boolean {
  return BRIDGE_CATEGORIES.has(p.category ?? '');
}

/** Whether a protocol is liquid staking or restaking. */
export function isStake(p: SnapshotProtocol): boolean {
  return STAKE_CATEGORIES.has(p.category ?? '');
}

/** Whether a protocol is exchange custody. */
export function isCex(p: SnapshotProtocol): boolean {
  return p.category === 'CEX';
}

/** Whether a protocol is a versioned release of another protocol. */
export function isVersioned(p: SnapshotProtocol): boolean {
  return VERSIONED.test(p.name);
}

/** Whether a protocol's name marks it a wrapped or staked product. */
export function isWrapped(p: SnapshotProtocol): boolean {
  return WRAPPED_WORD.test(p.name);
}

/** The first word of a name, lowercased, for the kin check. */
function nameStem(p: SnapshotProtocol): string {
  return p.name.split(/[\s-]+/)[0]!.toLowerCase();
}

/** Whether a protocol shares its name stem with a protocol that records a token. */
export function isKin(p: SnapshotProtocol, tokenStems: Set<string>): boolean {
  const stem = nameStem(p);
  return stem.length >= 3 && tokenStems.has(stem);
}

/** Whether a protocol stands alone: a launch candidate of its own. */
export function isStandalone(p: SnapshotProtocol, tokenStems: Set<string>): boolean {
  return isPreToken(p) && !isBridge(p) && !isStake(p) && !isCex(p) && !isVersioned(p) && !isWrapped(p) && !isKin(p, tokenStems);
}

/** The traded tokens the size curve is fitted on: a market cap above zero, no CEX, no Bridge, no
 * Canonical Bridge. Cross Chain Bridge stays in: DefiLlama lists it as a separate category of
 * cross-chain protocols with their own tokens and launches (Across, Hyperlane, Symbiosis, Synapse),
 * while Bridge and Canonical Bridge are the pure bridge products. The rule is stated, not hidden. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX' && p.category !== 'Bridge' && p.category !== 'Canonical Bridge')
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The clamped 7-day move as a fraction. */
export function growthFraction(p: SnapshotProtocol): number {
  return Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
}

/** The growth carry: one more week of the move beyond flat, at the fitted weight. */
export function growthMultiplier(p: SnapshotProtocol): number {
  return 1 + growthFraction(p) * GROWTH_WEIGHT;
}

/** The value if it launches, from the fitted curve and the growth carry. */
export function valueIfLaunches(p: SnapshotProtocol, curve: { a: number; b: number }): number {
  const v = 10 ** (curve.a + curve.b * log10(p.tvl_usd)) * growthMultiplier(p);
  return Math.max(1, Math.round(v));
}

/** The hazard's cumulative: H(A) = h0 * tau * (1 - exp(-A / tau)). */
export function hazardCumulative(ageDays: number, h0: number, tau: number): number {
  return h0 * tau * (1 - Math.exp(-ageDays / tau));
}

/** The launch odds: the chance a protocol with no token after A days records one in the next year. */
export function launchOdds(age: number | null, h0: number, tau: number): number {
  const a = age ?? UNKNOWN_AGE_DAYS;
  return 1 - Math.exp(-(hazardCumulative(a + 365, h0, tau) - hazardCumulative(a, h0, tau)));
}

/** Fit the declining hazard on the snapshot's own launch history, by grid search on age buckets. */
export function fitHazard(snapshot: Snapshot): { h0: number; tau: number } {
  const buckets: [number, number][] = [[0, 90], [90, 180], [180, 365], [365, 730], [730, 1460], [1460, 100000]];
  const points = buckets.map(([lo, hi]) => {
    const inBucket = snapshot.protocols.filter((p) => {
      const a = ageDays(snapshot.as_of, p.listed_at);
      return a !== null && a >= lo && a < hi;
    });
    return { age: (lo + hi) / 2, rate: inBucket.length > 0 ? inBucket.filter(hasToken).length / inBucket.length : 0, n: inBucket.length };
  });
  let best = { h0: 0.001, tau: 1000, sse: Infinity };
  for (let h0 = 0.0002; h0 <= 0.0040001; h0 += 0.0001) {
    for (let tau = 100; tau <= 2000; tau += 50) {
      let sse = 0;
      for (const pt of points) {
        const predicted = 1 - Math.exp(-hazardCumulative(pt.age, h0, tau));
        sse += pt.n * (predicted - pt.rate) * (predicted - pt.rate);
      }
      if (sse < best.sse) best = { h0, tau, sse };
    }
  }
  return { h0: best.h0, tau: best.tau };
}

/** The split-half holdout for the launch odds: fit on one half by slug hash, call the other half. */
export function launchHoldout(snapshot: Snapshot): { hit: number; base: number; n: number } {
  const hash = (s: string): number => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  };
  const halfA = snapshot.protocols.filter((p) => hash(p.slug) % 2 === 0);
  const halfB = snapshot.protocols.filter((p) => hash(p.slug) % 2 === 1);
  const fitted = fitHazard({ ...snapshot, protocols: halfA });
  let correct = 0;
  let n = 0;
  for (const p of halfB) {
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a === null) continue;
    const predicted = 1 - Math.exp(-hazardCumulative(a, fitted.h0, fitted.tau)) > 0.5;
    if (predicted === hasToken(p)) correct++;
    n++;
  }
  const tokenCount = halfB.filter(hasToken).length;
  const base = Math.max(tokenCount, halfB.length - tokenCount) / halfB.length;
  return { hit: n > 0 ? correct / n : 0, base, n };
}

/** The typical fee of one transaction on a protocol's first chain. */
export function chainFeeUsd(p: SnapshotProtocol): number {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  if (chain === 'Ethereum') return 12;
  if (chain === 'Solana') return 0.5;
  if (chain === 'Binance') return 1;
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mode'].includes(chain)) return 2;
  return 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The hours of hands-on work a farm plan takes: setup, weekly actions, claim, unwind. */
export function hoursFor(holdDays: number): number {
  return Math.round((0.25 + 0.15 * Math.ceil(holdDays / 7) + 0.2 + 0.1) * 10) / 10;
}

/** The farm economics of one row at one deposit: slice, fees, opportunity cost, net, break-even. */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  valueIfLaunchesUsd: number,
  depositUsd: number,
  hazard: { h0: number; tau: number },
): {
  sliceUsd: number;
  feesUsd: number;
  opportunityUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  breakEvenOdds: number;
  hours: number;
  holdDays: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
} {
  const holdDays = holdDaysFor(age);
  const hours = hoursFor(holdDays);
  // The share is priced off the protocol's age on record, at least one day: a two-day-old protocol
  // really does give a new depositor a large share of its TVL-days, and that is why the youngest
  // rows are the only ones that farm at a $1,000 deposit.
  const ageForShare = Math.max(age ?? UNKNOWN_AGE_DAYS, 1);
  const timeShare = (depositUsd * holdDays) / (p.tvl_usd * ageForShare);
  const sliceIfLaunch = AIRDROP_SHARE * valueIfLaunchesUsd * timeShare;
  const fees = Math.round((6 * chainFeeUsd(p) + 1 * Math.ceil(holdDays / 7)) * 100) / 100;
  const opportunity = Math.round(depositUsd * TBILL_YIELD * (holdDays / 365) * 100) / 100;
  const odds = launchOdds(age, hazard.h0, hazard.tau);
  const slice = sliceIfLaunch * odds;
  const net = slice - fees - opportunity;
  const breakEven = sliceIfLaunch > 0 ? (fees + opportunity) / sliceIfLaunch : Infinity;
  const verdict: 'FARM' | 'MARGINAL' | 'SKIP' = breakEven <= FARM_ODDS ? 'FARM' : breakEven <= MARGINAL_ODDS ? 'MARGINAL' : 'SKIP';
  return {
    sliceUsd: Math.round(slice * 100) / 100,
    feesUsd: fees,
    opportunityUsd: opportunity,
    netUsd: Math.round(net * 100) / 100,
    netPerHourUsd: Math.round((net / hours) * 100) / 100,
    breakEvenOdds: breakEven === Infinity ? 999 : Math.round(breakEven * 10000) / 10000,
    hours,
    holdDays,
    verdict,
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age, fees), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, depositUsd: number, feesUsd: number, holdDays: number): FarmStep[] {
  const chain = chainOf(p);
  const action = actionFor(p, depositUsd, chain);
  const gas = chainFeeUsd(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${depositUsd} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot.`,
      cost: `the $${depositUsd} stays in the position`,
      time: `${holdDays} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Total fees about $${feesUsd}.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** Leave-one-out on the fit set: each traded token priced without itself, against the flat baseline. */
export function looTest(
  set: SnapshotProtocol[],
  curve: { a: number; b: number },
): { medianMiss: number; within3: number; flatMedianMiss: number; flatWithin3: number; residuals: number[] } {
  const flat = median(set.map((p) => p.mcap_usd! / p.tvl_usd));
  const misses: number[] = [];
  const flatMisses: number[] = [];
  const residuals: number[] = [];
  for (let i = 0; i < set.length; i++) {
    const rest = set.filter((_, j) => j !== i);
    const f = huber(
      rest.map((p) => log10(p.tvl_usd)),
      rest.map((p) => log10(p.mcap_usd!)),
    );
    const p = set[i]!;
    const predicted = 10 ** (f.a + f.b * log10(p.tvl_usd)) * growthMultiplier(p);
    misses.push(missMultiple(predicted, p.mcap_usd!));
    flatMisses.push(missMultiple(p.tvl_usd * flat, p.mcap_usd!));
    residuals.push(log10(p.mcap_usd!) - log10(predicted));
  }
  return {
    medianMiss: median(misses),
    within3: misses.filter((m) => m <= 3).length / misses.length,
    flatMedianMiss: median(flatMisses),
    flatWithin3: flatMisses.filter((m) => m <= 3).length / flatMisses.length,
    residuals,
  };
}

/** Walk-forward: fit on the tokens listed before 2024, price the newer ones, against the flat baseline. */
export function walkForwardTest(
  set: SnapshotProtocol[],
): { nTest: number; medianMiss: number; within3: number; flatMedianMiss: number; flatWithin3: number } {
  const cut = Date.parse('2024-01-01T00:00:00Z');
  const older = set.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) < cut);
  const newer = set.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) >= cut);
  if (older.length < 10 || newer.length === 0) return { nTest: newer.length, medianMiss: 0, within3: 0, flatMedianMiss: 0, flatWithin3: 0 };
  const f = huber(
    older.map((p) => log10(p.tvl_usd)),
    older.map((p) => log10(p.mcap_usd!)),
  );
  const flat = median(older.map((p) => p.mcap_usd! / p.tvl_usd));
  const misses = newer.map((p) => missMultiple(10 ** (f.a + f.b * log10(p.tvl_usd)) * growthMultiplier(p), p.mcap_usd!));
  const flatMisses = newer.map((p) => missMultiple(p.tvl_usd * flat, p.mcap_usd!));
  return {
    nTest: newer.length,
    medianMiss: median(misses),
    within3: misses.filter((m) => m <= 3).length / misses.length,
    flatMedianMiss: median(flatMisses),
    flatWithin3: flatMisses.filter((m) => m <= 3).length / flatMisses.length,
  };
}

/** The term-by-term ablation: each term's marginal contribution to the LOO miss, all computed at run time. */
export function ablationTable(set: SnapshotProtocol[], asOf: string): { term: string; loo_median_miss: number; note: string }[] {
  const flat = median(set.map((p) => p.mcap_usd! / p.tvl_usd));
  const flatMiss = median(set.map((p) => missMultiple(p.tvl_usd * flat, p.mcap_usd!)));
  // LOO with the curve but no growth carry.
  const noGrowth: number[] = [];
  // LOO with shrunk category premiums (k = 4): the term the board tests and rejects.
  const withCategory: number[] = [];
  // LOO with an age term in the value curve, the coefficient FITTED (huber2 on log10 TVL and
  // log10(age + 30), centred): a fixed coefficient would cherry-pick the result. Tested, no gain:
  // age lives in the launch odds instead.
  const withAge: number[] = [];
  const ages = set.map((p) => ageDays(asOf, p.listed_at));
  const logAges = ages.map((a) => (a === null ? null : log10(a + 30)));
  const knownLogAges = logAges.filter((v): v is number => v !== null);
  const meanLogAge = knownLogAges.reduce((a, b) => a + b, 0) / knownLogAges.length;
  const centredLogAges = logAges.map((v) => (v === null ? 0 : v - meanLogAge));
  for (let i = 0; i < set.length; i++) {
    const rest = set.filter((_, j) => j !== i);
    const f = huber(
      rest.map((p) => log10(p.tvl_usd)),
      rest.map((p) => log10(p.mcap_usd!)),
    );
    const p = set[i]!;
    noGrowth.push(missMultiple(10 ** (f.a + f.b * log10(p.tvl_usd)), p.mcap_usd!));
    // Category premium: the median residual of the token's category, shrunk by n / (n + 4).
    const residuals = rest.map((q, j) => log10(q.mcap_usd!) - (f.a + f.b * log10(q.tvl_usd)));
    const sameCat: number[] = [];
    rest.forEach((q, j) => {
      if ((q.category ?? 'null') === (p.category ?? 'null')) sameCat.push(residuals[j]!);
    });
    const premium = sameCat.length > 0 ? median(sameCat) * (sameCat.length / (sameCat.length + 4)) : 0;
    withCategory.push(missMultiple(10 ** (f.a + f.b * log10(p.tvl_usd) + premium) * growthMultiplier(p), p.mcap_usd!));
    // Age: refit with both regressors on the leave-one-out set, the coefficient fitted each time.
    const restIdx = rest.map((_, j) => (j < i ? j : j + 1));
    const f2 = huber2(
      rest.map((q) => log10(q.tvl_usd)),
      restIdx.map((j) => centredLogAges[j]!),
      rest.map((q) => log10(q.mcap_usd!)),
    );
    withAge.push(
      missMultiple(10 ** (f2.a + f2.b * log10(p.tvl_usd) + f2.c * centredLogAges[i]!) * growthMultiplier(p), p.mcap_usd!),
    );
  }
  const curveOnly = looTest(set, { a: 0, b: 0 });
  return [
    { term: 'flat multiple of TVL', loo_median_miss: Math.round(flatMiss * 100) / 100, note: 'one multiple for every token' },
    { term: '+ log-log size curve', loo_median_miss: Math.round(median(noGrowth) * 100) / 100, note: 'Huber fit on the traded tokens' },
    { term: '+ 7-day growth carry', loo_median_miss: Math.round(curveOnly.medianMiss * 100) / 100, note: '1 + 0.5 x clamped 7-day move' },
    { term: '+ category premiums', loo_median_miss: Math.round(median(withCategory) * 100) / 100, note: 'TESTED AND REJECTED: worse than the curve alone, so not used' },
    { term: '+ age in the value curve', loo_median_miss: Math.round(median(withAge) * 100) / 100, note: 'TESTED, NOT USED: the fitted coefficient improves LOO only slightly and is unstable across split halves (-0.02 vs -0.49), and age already enters through the launch odds — a second age term double-counts it' },
  ];
}

/** Bootstrap bands: 200 refits of the curve on resampled traded tokens, per board row. */
export function bootstrapBands(
  set: SnapshotProtocol[],
  rows: { tvl_usd: number; change_7d: number | null }[],
  seed: number,
): { p10: number; p25: number; p75: number; p90: number }[] {
  const rand = mulberry32(seed);
  const xs = set.map((p) => log10(p.tvl_usd));
  const ys = set.map((p) => log10(p.mcap_usd!));
  const preds: number[][] = rows.map(() => []);
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const idx: number[] = [];
    for (let i = 0; i < set.length; i++) idx.push(Math.floor(rand() * set.length));
    const f = huber(
      idx.map((i) => xs[i]!),
      idx.map((i) => ys[i]!),
    );
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]!;
      const growth = 1 + (Math.min(120, Math.max(-60, row.change_7d ?? 0)) / 100) * GROWTH_WEIGHT;
      preds[j]!.push(10 ** (f.a + f.b * log10(row.tvl_usd)) * growth);
    }
  }
  // Raw quantiles, NOT rounded: the caller scales them by the launch odds and rounds once.
  // Rounding here first and then scaling would move the printed band by dollars.
  return preds.map((arr) => ({
    p10: Math.max(1, quantile(arr, 0.1)),
    p25: Math.max(1, quantile(arr, 0.25)),
    p75: Math.max(1, quantile(arr, 0.75)),
    p90: Math.max(1, quantile(arr, 0.9)),
  }));
}

/** The coverage ledger: every protocol in exactly one group, in a fixed order. */
export function buildLedger(snapshot: Snapshot, rankedSlugs: Set<string>): LedgerGroup[] {
  const tokenStems = new Set(
    snapshot.protocols.filter((p) => !isPreToken(p)).map((p) => nameStem(p)).filter((s) => s.length >= 3),
  );
  const groups: LedgerGroup[] = [
    { key: 'ranked', label: 'Ranked on this board', count: 0, reason: 'records no token and stands alone' },
    { key: 'trades', label: 'Token already trades', count: 0, reason: 'a market cap on record; the curve is fitted on these' },
    { key: 'record', label: 'Token on record, no cap', count: 0, reason: 'a ticker or CoinGecko id, no market cap to fit on' },
    { key: 'bridge', label: 'Bridges', count: 0, reason: 'a bridge of a token that trades, not a launch of its own' },
    { key: 'stake', label: 'Liquid staking and restaking', count: 0, reason: 'a staking receipt, not a launch of its own' },
    { key: 'cex', label: 'Exchange custody', count: 0, reason: 'an exchange balance, not a protocol launch' },
    { key: 'versioned', label: 'Versioned releases', count: 0, reason: 'a release number on another protocol' },
    { key: 'wrapped', label: 'Wrapped or staked by name', count: 0, reason: 'a wrapped or staked product of a token that trades' },
    { key: 'kin', label: 'Kin of a token', count: 0, reason: 'its name stem carries a token on record' },
  ];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const p of snapshot.protocols) {
    let key: string;
    if (rankedSlugs.has(p.slug)) key = 'ranked';
    else if (p.mcap_usd !== null && p.mcap_usd > 0) key = 'trades';
    else if (hasToken(p)) key = 'record';
    else if (isBridge(p)) key = 'bridge';
    else if (isStake(p)) key = 'stake';
    else if (isCex(p)) key = 'cex';
    else if (isVersioned(p)) key = 'versioned';
    else if (isWrapped(p)) key = 'wrapped';
    else if (isKin(p, tokenStems)) key = 'kin';
    else key = 'ranked';
    byKey.get(key)!.count++;
  }
  return groups;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const index = bySlug(snapshot.protocols);
  const tokenStems = new Set(
    snapshot.protocols.filter((p) => !isPreToken(p)).map((p) => nameStem(p)).filter((s) => s.length >= 3),
  );
  // The watchlist is the floor: every slug, even one another rule would set aside.
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol that stands alone.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isStandalone(p, tokenStems))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const set = fitSet(snapshot);
  const curve = huber(
    set.map((p) => log10(p.tvl_usd)),
    set.map((p) => log10(p.mcap_usd!)),
  );
  const hazard = fitHazard(snapshot);
  const loo = looTest(set, curve);
  const wf = walkForwardTest(set);
  const holdout = launchHoldout(snapshot);
  const ablation = ablationTable(set, snapshot.as_of);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const value = valueIfLaunches(p, curve);
    const odds = launchOdds(age, hazard.h0, hazard.tau);
    const implied = Math.max(1, Math.round(value * odds));
    const econ = farmEconomics(p, age, value, DEPOSIT_USD, hazard);
    return { p, age, value, odds, implied, econ };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const bands = bootstrapBands(
    set,
    scored.map((s) => ({ tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d })),
    20261114,
  );
  // Bands are on the value if it launches; scale them by the launch odds for the printed band.
  const board: BoardRow[] = scored.map((s, i) => {
    const band = bands[i]!;
    const steps = farmSteps(s.p, s.age, DEPOSIT_USD, s.econ.feesUsd, s.econ.holdDays).map(stepText);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      watchlist: snapshot.watchlist.includes(s.p.slug),
      implied_value_usd: s.implied,
      model: {
        value_if_launches_usd: s.value,
        // Full precision, not rounded: the dashboard re-derives the implied value as
        // round(value x launch odds), and a rounded odds would make that check fail by dollars.
        launch_odds: s.odds,
        growth_multiplier: Math.round(growthMultiplier(s.p) * 10000) / 10000,
        curve_intercept: Math.round(curve.a * 1000) / 1000,
        curve_exponent: Math.round(curve.b * 1000) / 1000,
        age_days: s.age,
      },
      band: {
        p10: Math.max(1, Math.round(band.p10 * s.odds)),
        p25: Math.max(1, Math.round(band.p25 * s.odds)),
        p75: Math.max(1, Math.round(band.p75 * s.odds)),
        p90: Math.max(1, Math.round(band.p90 * s.odds)),
      },
      economics: {
        deposit_usd: DEPOSIT_USD,
        slice_usd: s.econ.sliceUsd,
        fees_usd: s.econ.feesUsd,
        opportunity_usd: s.econ.opportunityUsd,
        net_usd: s.econ.netUsd,
        net_per_hour_usd: s.econ.netPerHourUsd,
        break_even_odds: s.econ.breakEvenOdds,
        hours: s.econ.hours,
        hold_days: s.econ.holdDays,
        verdict: s.econ.verdict,
      },
      farm_steps: steps,
    };
  });

  const rankedSlugs = new Set(board.map((r) => r.slug));
  const ledger = buildLedger(snapshot, rankedSlugs);
  const groupOf = (p: SnapshotProtocol): { label: string; reason: string } => {
    if (rankedSlugs.has(p.slug)) return { label: 'Ranked on this board', reason: 'records no token and stands alone' };
    if (p.mcap_usd !== null && p.mcap_usd > 0) return { label: 'Token already trades', reason: 'a market cap on record; the curve is fitted on these' };
    if (hasToken(p)) return { label: 'Token on record, no cap', reason: 'a ticker or CoinGecko id, no market cap to fit on' };
    if (isBridge(p)) return { label: 'Bridges', reason: 'a bridge of a token that trades, not a launch of its own' };
    if (isStake(p)) return { label: 'Liquid staking and restaking', reason: 'a staking receipt, not a launch of its own' };
    if (isCex(p)) return { label: 'Exchange custody', reason: 'an exchange balance, not a protocol launch' };
    if (isVersioned(p)) return { label: 'Versioned releases', reason: 'a release number on another protocol' };
    if (isWrapped(p)) return { label: 'Wrapped or staked by name', reason: 'a wrapped or staked product of a token that trades' };
    if (isKin(p, tokenStems)) return { label: 'Kin of a token', reason: 'its name stem carries a token on record' };
    return { label: 'Ranked on this board', reason: 'records no token and stands alone' };
  };
  const setAside = snapshot.protocols
    .filter((p) => !rankedSlugs.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => {
      const g = groupOf(p);
      return { slug: p.slug, name: p.name, category: p.category, group: g.label, reason: g.reason };
    });
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd)
    .slice(0, 128)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
    }));

  const totalImplied = board.reduce((a, r) => a + r.implied_value_usd, 0);
  const farmCounts = {
    farm: board.filter((r) => r.economics.verdict === 'FARM').length,
    marginal: board.filter((r) => r.economics.verdict === 'MARGINAL').length,
    skip: board.filter((r) => r.economics.verdict === 'SKIP').length,
  };
  const q25 = quantile(loo.residuals, 0.25);
  const q75 = quantile(loo.residuals, 0.75);
  const q10 = quantile(loo.residuals, 0.1);
  const q90 = quantile(loo.residuals, 0.9);
  const backtest: Backtest = {
    fit_n: set.length,
    curve_intercept: Math.round(curve.a * 1000) / 1000,
    curve_exponent: Math.round(curve.b * 1000) / 1000,
    curve_intercept_norm: Math.round((curve.a + 8 * curve.b) * 1000) / 1000,
    loo_median_miss: Math.round(loo.medianMiss * 100) / 100,
    loo_within_3x: Math.round(loo.within3 * 1000) / 1000,
    loo_flat_median_miss: Math.round(loo.flatMedianMiss * 100) / 100,
    loo_flat_within_3x: Math.round(loo.flatWithin3 * 1000) / 1000,
    wf_n_test: wf.nTest,
    wf_median_miss: Math.round(wf.medianMiss * 100) / 100,
    wf_within_3x: Math.round(wf.within3 * 1000) / 1000,
    wf_flat_median_miss: Math.round(wf.flatMedianMiss * 100) / 100,
    wf_flat_within_3x: Math.round(wf.flatWithin3 * 1000) / 1000,
    band_hold_2575: Math.round((loo.residuals.filter((r) => r >= q25 && r <= q75).length / loo.residuals.length) * 1000) / 1000,
    band_hold_1090: Math.round((loo.residuals.filter((r) => r >= q10 && r <= q90).length / loo.residuals.length) * 1000) / 1000,
    loo_q10: Math.round(q10 * 1000) / 1000,
    loo_q25: Math.round(q25 * 1000) / 1000,
    loo_q75: Math.round(q75 * 1000) / 1000,
    loo_q90: Math.round(q90 * 1000) / 1000,
    ablation,
    launch_holdout_hit: Math.round(holdout.hit * 1000) / 1000,
    launch_holdout_base: Math.round(holdout.base * 1000) / 1000,
    launch_holdout_n: holdout.n,
    hazard_h0: hazard.h0,
    hazard_tau: hazard.tau,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: 'DefiLlama protocols, fetched 2026-11-14 01:18:33 UTC',
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    curve_intercept: backtest.curve_intercept,
    curve_exponent: backtest.curve_exponent,
    growth_weight: GROWTH_WEIGHT,
    hazard_h0: hazard.h0,
    hazard_tau: hazard.tau,
    unknown_age_days: UNKNOWN_AGE_DAYS,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    total_implied_usd: totalImplied,
    rank1_name: board[0]!.name,
    rank1_implied_usd: board[0]!.implied_value_usd,
    farm_counts: farmCounts,
    ledger,
    backtest,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      watchlist: r.watchlist,
      implied_value_usd: r.implied_value_usd,
      value_if_launches_usd: r.model.value_if_launches_usd,
      launch_odds: r.model.launch_odds,
      p10: r.band.p10,
      p25: r.band.p25,
      p75: r.band.p75,
      p90: r.band.p90,
      slice_usd: r.economics.slice_usd,
      net_usd: r.economics.net_usd,
      fees_usd: r.economics.fees_usd,
      hours: r.economics.hours,
      hold_days: r.economics.hold_days,
      break_even_odds: r.economics.break_even_odds,
      verdict: r.economics.verdict,
      net_per_hour_usd: r.economics.net_per_hour_usd,
    })),
    live,
    setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
