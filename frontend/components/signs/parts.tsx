"use client";
import { useEffect, useRef, useState } from "react";
import { Signal, Near, fmtPrice, getCandles, entryClosed } from "@/lib/signs";

/** Arrow that flashes up or down when a live value changes. */
export function Tick({ value }: { value: number | null | undefined }) {
  const prev = useRef<number | null>(null); const [dir, setDir] = useState<0 | 1 | -1>(0);
  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && value !== prev.current) { setDir(value > prev.current ? 1 : -1); const t = setTimeout(() => setDir(0), 2500); prev.current = value; return () => clearTimeout(t); }
    prev.current = value;
  }, [value]);
  if (!dir) return <span className="inline-block w-3" aria-hidden="true" />;
  return <span className="inline-block w-3 text-xs" style={{ color: dir > 0 ? "var(--violet)" : "var(--rust)" }} aria-label={dir > 0 ? "up" : "down"}>{dir > 0 ? "▲" : "▼"}</span>;
}

/** Small "Live" tag: a dot that pulses after each update, and how long ago it was. */
export function LiveTag({ at, stale }: { at: number | null; stale: boolean }) {
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(id); }, []);
  if (!at) return <span className="text-xs muted">Connecting to live prices…</span>;
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  return <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: stale ? "var(--rust)" : "var(--stone)" }} aria-live="off">
    <span key={at} className="live-dot" style={{ background: stale ? "var(--rust)" : "var(--violet)" }} />
    {stale ? `Live prices paused, last update ${sec}s ago` : `Live, updated ${sec < 2 ? "just now" : `${sec}s ago`}`}</span>;
}

/** The price ladder: stop, entry and target as rungs, with the live price pinned between them.
 *  Labels keep a minimum gap so close levels never print on top of each other; the "Now" line sits in normal flow below. */
export function Ladder({ sig, price, height = 220 }: { sig: Pick<Signal, "entry" | "sl" | "tp" | "side">; price?: number | null; height?: number }) {
  const top = sig.side === "long" ? sig.tp : sig.sl, bottom = sig.side === "long" ? sig.sl : sig.tp;
  const span = Math.abs(top - bottom) || 1;
  const y = (v: number) => Math.min(100, Math.max(0, ((top - v) / span) * 100));
  const rungs = [
    { k: "Target", v: sig.tp, c: "var(--violet)" },
    { k: "Entry", v: sig.entry, c: "var(--ink)" },
    { k: "Stop", v: sig.sl, c: "var(--rust)" },
  ].map(r => ({ ...r, px: y(r.v) / 100 * height })).sort((a, b) => a.px - b.px);
  const GAP = 22;                                                     // px between label rows
  for (let i = 1; i < rungs.length; i++) rungs[i].px = Math.max(rungs[i].px, rungs[i - 1].px + GAP);
  const over = rungs[rungs.length - 1].px - height;                    // pushed past the bottom: shift everything up
  if (over > 0) { rungs[rungs.length - 1].px = height; for (let i = rungs.length - 2; i >= 0; i--) rungs[i].px = Math.min(rungs[i].px, rungs[i + 1].px - GAP); }
  const gainTop = Math.min(y(sig.tp), y(sig.entry)), gainH = Math.abs(y(sig.tp) - y(sig.entry));
  const riskTop = Math.min(y(sig.sl), y(sig.entry)), riskH = Math.abs(y(sig.sl) - y(sig.entry));
  const r = price != null && isFinite(price) ? (price - sig.entry) / Math.abs(sig.entry - sig.sl) * (sig.side === "long" ? 1 : -1) : null;
  return (
    <div>
      <div className="ladder num" style={{ height }} aria-label={`Stop ${fmtPrice(sig.sl)}, entry ${fmtPrice(sig.entry)}, target ${fmtPrice(sig.tp)}`}>
        <div className="zone-gain" style={{ top: `${gainTop}%`, height: `${gainH}%`, left: -4 }} />
        <div className="zone-risk" style={{ top: `${riskTop}%`, height: `${riskH}%`, left: -4 }} />
        {rungs.map(g => (
          <div key={g.k} className="rung" style={{ top: g.px }}>
            <span className="dot" style={{ background: g.c }} />
            <span className="tag" style={{ color: g.c }}>{g.k}</span>
            <span className="lvl">{fmtPrice(g.v)}</span>
          </div>
        ))}
        {r != null && <div className="price-pin" style={{ top: `${y(price!)}%` }} />}
      </div>
      {r != null && <div className="text-xs num mt-4">Now <b>{fmtPrice(price!)}</b>, {r >= 0 ? "+" : ""}{r.toFixed(2)}R from entry</div>}
    </div>
  );
}

/** Candle chart; draws trade levels when a signal is given. */
export function PriceChart({ symbol, tf, levels, label }: { symbol: string; tf: string; levels?: Pick<Signal, "entry" | "sl" | "tp"> | null; label: string }) {
  const [data, setData] = useState<{ t: number; o: number; h: number; l: number; c: number }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let on = true; setData(null); setErr(null); getCandles(symbol, tf).then(d => on && setData(d.candles)).catch(e => on && setErr(e.message)); return () => { on = false; }; }, [symbol, tf]);
  if (err) return <p className="muted text-sm">Chart unavailable: {err}</p>;
  if (!data) return <div className="h-[180px] rounded-xl" style={{ background: "var(--paper-2)" }} aria-busy="true" />;
  const W = 480, H = 180, pad = 4;
  const extra = levels ? [levels.sl, levels.tp] : [];
  const lo = Math.min(...data.map(d => d.l), ...extra), hi = Math.max(...data.map(d => d.h), ...extra);
  const y = (v: number) => pad + (hi - v) / (hi - lo || 1) * (H - 2 * pad);
  const bw = (W - (levels ? 60 : 8)) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label}>
      {data.map((d, i) => {
        const x = i * bw + bw / 2, up = d.c >= d.o;
        return (<g key={d.t}>
          <line x1={x} x2={x} y1={y(d.h)} y2={y(d.l)} stroke="var(--stone)" strokeWidth={1} />
          <rect x={x - bw * .32} width={bw * .64} y={y(Math.max(d.o, d.c))} height={Math.max(1, Math.abs(y(d.o) - y(d.c)))} fill={up ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={.8} />
        </g>);
      })}
      {levels && [["TP", levels.tp, "var(--violet)"], ["Entry", levels.entry, "var(--ink)"], ["SL", levels.sl, "var(--rust)"]].map(([k, v, c]) => (
        <g key={k as string}>
          <line x1={0} x2={W - 56} y1={y(v as number)} y2={y(v as number)} stroke={c as string} strokeDasharray={k === "Entry" ? "0" : "5 4"} strokeWidth={1.5} />
          <text x={W - 52} y={y(v as number) + 4} fontSize="11" fontWeight="700" fill={c as string}>{k as string}</text>
        </g>
      ))}
    </svg>
  );
}

export function MiniChart({ sig, tf }: { sig: Signal; tf: string }) {
  return <PriceChart symbol={sig.symbol} tf={tf} levels={sig} label={`${sig.ticker} ${tf} chart with trade levels`} />;
}

export function SignalRow({ sig, onOpen }: { sig: Signal; onOpen: (s: Signal) => void }) {
  return (
    <button className="row w-full text-left flex items-center gap-4 group" onClick={() => onOpen(sig)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`pill ${sig.side === "long" ? "pill-long" : "pill-short"}`}>{sig.side === "long" ? "Buy" : "Sell"}</span>
          <span className="text-xs muted">{sig.strategy_name}{sig.chart ? ` · ${sig.chart} chart` : ""}</span>
          {entryClosed(sig) && <span className="text-xs font-semibold" style={{ color: "var(--rust)" }}>Entry window closed</span>}
        </div>
        <div className="display text-4xl">{sig.ticker}</div>
        <div className="text-sm muted num mt-1">Entry {fmtPrice(sig.entry)}, stop {fmtPrice(sig.sl)}, target {fmtPrice(sig.tp)}</div>
      </div>
      <span className="btn btn-ghost text-sm group-hover:border-[var(--ink)]">Plan it</span>
    </button>
  );
}

export function NearRow({ n }: { n: Near }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row">
      <button className="w-full text-left flex items-center gap-3" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="flex-1">
          <div className="flex items-baseline gap-2"><span className="display text-2xl">{n.ticker}</span><span className="text-xs muted">{n.strategy_name}, {n.side === "long" ? "buy" : "sell"}</span></div>
          <div className="text-sm muted mt-1">{n.watch}</div>
        </div>
        <span className="num text-sm font-semibold" aria-label={`${n.met} of ${n.total} conditions met`}>{n.met}/{n.total}</span>
      </button>
      {open && <div className="mt-3 grid gap-2">{n.checks.map(c => (
        <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>
      ))}</div>}
    </div>
  );
}
