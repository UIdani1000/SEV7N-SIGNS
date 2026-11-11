/** Indicator math for the chart overlays. Mirrors backend/indicators.py closely enough to draw; signals still come from the server. */
export interface Candle { t: number; o: number; h: number; l: number; c: number }

export function ema(v: number[], n: number): number[] {
  const out: number[] = new Array(v.length).fill(NaN); const k = 2 / (n + 1);
  if (v.length < n) return out;
  let prev = v.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = prev;          // seeded with the SMA, like the backend
  for (let i = n; i < v.length; i++) { prev = v[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

function rma(v: number[], n: number): number[] {
  const out: number[] = new Array(v.length).fill(NaN); let prev = NaN;
  for (let i = 0; i < v.length; i++) {
    if (i === n - 1) prev = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else if (i >= n) prev = (prev * (n - 1) + v[i]) / n;
    out[i] = i >= n - 1 ? prev : NaN;
  }
  return out;
}

export function atr(c: Candle[], n = 14): number[] {
  const tr = c.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)));
  return rma(tr, n);
}

export function bollinger(v: number[], n = 20, k = 2) {
  const mid: number[] = [], up: number[] = [], lo: number[] = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { mid.push(NaN); up.push(NaN); lo.push(NaN); continue; }
    const w = v.slice(i - n + 1, i + 1); const m = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n);
    mid.push(m); up.push(m + k * sd); lo.push(m - k * sd);
  }
  return { mid, up, lo };
}

/** The squeeze: Bollinger Bands (20, 2) inside a Keltner channel (EMA21 ± 1.5 ATR), as in backend/strategies.py. */
export function squeeze(c: Candle[]) {
  const close = c.map(x => x.c); const bb = bollinger(close); const e = ema(close, 21); const a = atr(c);
  const kUp = e.map((x, i) => x + 1.5 * a[i]), kLo = e.map((x, i) => x - 1.5 * a[i]);
  const on = bb.up.map((u, i) => isFinite(u) && isFinite(kUp[i]) && u < kUp[i] && bb.lo[i] > kLo[i]);
  return { bbUp: bb.up, bbLo: bb.lo, kUp, kLo, on };
}

export function macdHist(v: number[]): number[] {
  const f = ema(v, 12), s = ema(v, 26); const line = f.map((x, i) => x - s[i]);
  const first = line.findIndex(isFinite); const sig = new Array(v.length).fill(NaN);
  if (first >= 0) ema(line.slice(first), 9).forEach((x, i) => { sig[first + i] = x; });
  return line.map((x, i) => x - sig[i]);
}
