"use client";
import { useEffect, useState } from "react";
import { Signal, getCandles, fmtPrice } from "@/lib/signs";
import { LEGEND, Guide, Overlay } from "@/lib/guides";
import { Candle, ema, squeeze, macdHist } from "@/lib/indicators";

const SHOW = 80;
const PERIOD: Record<string, string> = { "1d": "one day", "4h": "4 hours", "1h": "1 hour", "5m": "5 minutes" };   // candles drawn; more are loaded so the averages are settled at the left edge

/** The facts every strategy is described by, in the same order everywhere. */
export function StrategyGuide({ g, compact = false, noExpect = false }: { g: Guide; compact?: boolean; noExpect?: boolean }) {
  const facts: [string, string][] = [["Chart", g.chart], ["Enter", g.enter], ["Setups a week", g.perWeek], ["Hold", g.hold], ["Trades", g.sides]];
  if (!compact) facts.push(["Markets", g.markets]);
  return (
    <div>
      {!compact && <h2 className="display text-5xl" style={g.practice ? { color: "var(--rust)" } : {}}>{g.name}</h2>}
      <p className={compact ? "text-[1.05rem] font-semibold" : "text-lg mt-2 max-w-prose"}>{g.idea}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 mt-3 text-sm">
        {facts.map(([k, v]) => <div key={k} className="contents"><dt className="muted">{k}</dt><dd className={k === "Enter" ? "font-semibold" : ""}>{v}</dd></div>)}
      </dl>
      {compact ? (
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">What it looks for</summary>
          <ol className="list-decimal pl-5 mt-2 grid gap-1">{g.lookFor.map(x => <li key={x}>{x}</li>)}</ol></details>
      ) : (
        <div className="mt-4"><p className="text-sm font-semibold">What it looks for</p>
          <ol className="list-decimal pl-5 mt-1 grid gap-1 text-sm">{g.lookFor.map(x => <li key={x}>{x}</li>)}</ol></div>
      )}
      {!noExpect && <p className="text-sm mt-3" style={g.practice ? { color: "var(--rust)" } : {}}><b>What to expect:</b> {g.expect}</p>}
    </div>
  );
}

/** Candles with the lines a strategy actually uses, optional trade levels, and a plain-words legend. */
export function IndicatorChart({ symbol, g, levels, refresh }: { symbol: string; g: Guide; levels?: Pick<Signal, "entry" | "sl" | "tp"> | null; refresh?: string }) {
  const [all, setAll] = useState<Candle[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true; setErr(null);
    getCandles(symbol, g.tf, 240).then(d => on && setAll(d.candles)).catch(e => on && setErr(e.message));
    return () => { on = false; };
  }, [symbol, g.tf, refresh]);
  if (err) return <p className="muted text-sm">Chart unavailable: {err}</p>;
  if (!all) return <div className="h-[230px] rounded-xl" style={{ background: "var(--paper-2)" }} aria-busy="true" />;

  const has = (o: Overlay) => g.overlays.includes(o);
  const close = all.map(x => x.c); const from = Math.max(0, all.length - SHOW); const cut = <T,>(a: T[]) => a.slice(from);
  const c = cut(all);
  const sq = has("bands") ? squeeze(all) : null;
  const e21 = has("ema21") ? cut(ema(close, 21)) : null, e50 = has("ema50") ? cut(ema(close, 50)) : null;
  const mom = has("momentum") ? cut(macdHist(close)) : null;
  const bands = sq ? { bu: cut(sq.bbUp), bl: cut(sq.bbLo), ku: cut(sq.kUp), kl: cut(sq.kLo), on: cut(sq.on) } : null;

  const W = 480, H = 190, P = 6, right = levels ? 58 : 6, M = mom ? 46 : 0, gap = mom ? 10 : 0;
  const vals = [...c.flatMap(x => [x.h, x.l]), ...(levels ? [levels.sl, levels.tp] : []),
    ...(bands ? [...bands.bu, ...bands.bl, ...bands.ku, ...bands.kl] : []), ...(e21 || []), ...(e50 || [])].filter(isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const y = (v: number) => P + (hi - v) / (hi - lo || 1) * (H - 2 * P);
  const bw = (W - right) / c.length, x = (i: number) => i * bw + bw / 2;
  const path = (a: number[]) => a.map((v, i) => isFinite(v) ? `${i && isFinite(a[i - 1]) ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}` : "").join("");
  const area = (u: number[], d: number[]) => {
    const idx = u.map((v, i) => i).filter(i => isFinite(u[i]) && isFinite(d[i]));
    if (!idx.length) return "";
    return `M${idx.map(i => `${x(i).toFixed(1)},${y(u[i]).toFixed(1)}`).join("L")}L${idx.reverse().map(i => `${x(i).toFixed(1)},${y(d[i]).toFixed(1)}`).join("L")}Z`;
  };
  const mMax = mom ? Math.max(...mom.filter(isFinite).map(Math.abs), 1e-12) : 1;
  const mMid = H + gap + M / 2, my = (v: number) => mMid - v / mMax * (M / 2 - 2);
  // Weekly Trend ranks the last full week (Monday to Sunday) before this Monday
  let wk: [number, number] | null = null;
  if (has("lastWeek")) {
    const lastT = c[c.length - 1].t * 1000, d = new Date(lastT); const dow = (d.getUTCDay() + 6) % 7;
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) / 1000;
    const a = c.findIndex(k => k.t >= monday - 7 * 86400), b = c.findIndex(k => k.t >= monday);
    if (a >= 0) wk = [a, b < 0 ? c.length : b];
  }

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + gap + M}`} className="w-full h-auto" role="img"
        aria-label={`${symbol.replace("USDT", "")} ${g.chart} chart with the ${g.name} lines${levels ? " and the trade’s entry, stop and target" : ""}`}>
        {wk && <rect x={wk[0] * bw} y={0} width={(wk[1] - wk[0]) * bw} height={H} fill="var(--paper-2)" />}
        {bands && <path d={area(bands.ku, bands.kl)} fill="var(--paper-2)" />}
        {c.map((d, i) => {
          const up = d.c >= d.o;
          return (<g key={d.t}>
            <line x1={x(i)} x2={x(i)} y1={y(d.h)} y2={y(d.l)} stroke="var(--stone)" strokeWidth={1} />
            <rect x={x(i) - bw * .32} width={bw * .64} y={y(Math.max(d.o, d.c))} height={Math.max(1, Math.abs(y(d.o) - y(d.c)))}
              fill={up ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={.8} />
          </g>);
        })}
        {bands && <><path d={path(bands.bu)} fill="none" stroke="var(--violet)" strokeWidth={1.2} />
          <path d={path(bands.bl)} fill="none" stroke="var(--violet)" strokeWidth={1.2} />
          {bands.on.map((v, i) => v ? <circle key={i} cx={x(i)} cy={H - 3} r={2} fill="var(--violet)" /> : null)}</>}
        {e50 && <path d={path(e50)} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} strokeDasharray="5 4" />}
        {e21 && <path d={path(e21)} fill="none" stroke="var(--violet)" strokeWidth={1.6} />}
        {levels && ([["Target", levels.tp, "var(--violet)"], ["Entry", levels.entry, "var(--ink)"], ["Stop", levels.sl, "var(--rust)"]] as const).map(([k, v, col]) => (
          <g key={k}>
            <line x1={0} x2={W - right + 2} y1={y(v)} y2={y(v)} stroke={col} strokeDasharray={k === "Entry" ? "0" : "5 4"} strokeWidth={1.5} />
            <text x={W - right + 6} y={y(v) + 4} fontSize="11" fontWeight="700" fill={col}>{k}</text>
          </g>))}
        {mom && <>
          <line x1={0} x2={W - right} y1={mMid} y2={mMid} stroke="var(--line)" />
          {mom.map((v, i) => isFinite(v) ? <rect key={i} x={x(i) - bw * .3} width={bw * .6} y={Math.min(my(v), mMid)} height={Math.max(.5, Math.abs(my(v) - mMid))}
            fill={v >= 0 ? "var(--violet)" : "var(--rust)"} /> : null)}
        </>}
      </svg>
      <figcaption className="mt-2 grid gap-1 text-xs muted">
        <span>{g.chart} candles ({PERIOD[g.tf]} each), last {fmtPrice(c[c.length - 1].c)}</span>
        {g.overlays.map(o => <span key={o}>{LEGEND[o]}</span>)}
      </figcaption>
    </figure>
  );
}
