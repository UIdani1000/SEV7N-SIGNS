"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketInfo, MarketView, Signal, StrategyView, getMarket, getMarkets, fmtPrice } from "@/lib/signs";
import { PriceChart } from "./parts";

const TFS = [["1h", "1 hour"], ["4h", "4 hours"], ["1d", "1 day"]];

export default function Markets({ pair, setPair, onOpen }: { pair: string; setPair: (p: string) => void; onOpen: (s: Signal) => void }) {
  const [list, setList] = useState<MarketInfo[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<MarketView | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [tf, setTf] = useState("4h");
  useEffect(() => { getMarkets().then(setList).catch(() => setList([])); }, []);
  const load = useCallback(async (sym: string) => {
    setBusy(true); setErr(null);
    try { setView(await getMarket(sym)); } catch (e: unknown) { setErr((e as Error).message); }
    setBusy(false);
  }, []);
  useEffect(() => { load(pair); }, [pair, load]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = t ? list.filter(m => m.ticker.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)) : list;
    return [...l].sort((a, b) => Number(b.major) - Number(a.major));
  }, [list, q]);
  const current = list.find(m => m.symbol === pair);

  return (
    <section className="max-w-4xl mx-auto px-5 pt-6 pb-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-7xl">Markets</h1>
        <input className="field !w-56" placeholder="Search a pair" value={q} onChange={e => setQ(e.target.value)} aria-label="Search markets" />
      </div>
      <div className="flex gap-2 overflow-x-auto mt-5 pb-2 -mx-5 px-5" role="listbox" aria-label="Choose a market">
        {shown.map(m => (
          <button key={m.symbol} role="option" aria-selected={m.symbol === pair} onClick={() => setPair(m.symbol)}
            className={`pill !py-2 !px-4 shrink-0 ${m.symbol === pair ? "pill-short" : ""}`}>{m.ticker === "XAUUSD" ? "Gold" : m.ticker}</button>
        ))}
        {!shown.length && <span className="text-sm muted py-2">No market matches “{q}”.</span>}
      </div>

      {err && <div className="mt-6"><p style={{ color: "var(--rust)" }}>{err}</p><button className="btn btn-ghost mt-3" onClick={() => load(pair)}>Try again</button></div>}
      {!view && !err && <p className="muted mt-8">{busy ? `Reading ${current?.name ?? "the market"}…` : ""}</p>}

      {view && <div className={busy ? "opacity-50 transition-opacity" : ""}>
        <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-2">
          <h2 className="display text-[22vw] sm:text-[8rem] leading-none">{view.ticker}</h2>
          <div className="num pb-2">
            <div className="text-2xl font-semibold">{fmtPrice(view.price)}</div>
            <div className="text-sm"><span style={{ color: view.change_24h_pct >= 0 ? "var(--violet)" : "var(--rust)" }}>{view.change_24h_pct >= 0 ? "+" : ""}{view.change_24h_pct}%</span> <span className="muted">since yesterday&apos;s close, daily trend {view.daily_trend}</span></div>
          </div>
        </div>

        <div className="mt-5 flex gap-2" role="tablist" aria-label="Chart timeframe">
          {TFS.map(([k, l]) => <button key={k} role="tab" aria-selected={tf === k} className={`pill !py-1.5 ${tf === k ? "pill-short" : ""}`} onClick={() => setTf(k)}>{l}</button>)}
          <button className="pill !py-1.5 ml-auto" onClick={() => load(pair)} disabled={busy}>{busy ? "Updating…" : "Refresh"}</button>
        </div>
        <div className="mt-3"><PriceChart symbol={view.symbol} tf={tf} label={`${view.ticker} ${tf} chart`} /></div>

        {view.weekly && <div className="row mt-6">
          <div className="flex justify-between items-baseline gap-3"><span className="font-semibold">Weekly Trend</span>
            <span className="text-xs muted">{view.weekly.is_pick ? "This week’s pick" : `Ranked ${view.weekly.rank} of 5 last week`}</span></div>
          <p className="text-sm mt-1">{view.weekly.is_pick
            ? `${view.name} is this week’s pick. Exit by next Monday 00:00 UTC.`
            : `${view.name} moved ${view.weekly.row?.week_return_pct ?? "–"}% last week. ${view.weekly.pick_ticker ? `This week’s pick is ${view.weekly.pick_ticker === "XAUUSD" ? "Gold" : view.weekly.pick_ticker}.` : "Weekly Trend is sitting out this week."}`}</p>
          {view.weekly.pick && <button className="btn btn-ink mt-3 text-sm" onClick={() => onOpen(view.weekly!.pick!)}>Open the plan</button>}
        </div>}

        {view.strategies.map(s => <StrategyCard key={`${s.strategy}${s.side}`} s={s} onOpen={onOpen} />)}
        <p className="text-xs muted mt-4">Checked on completed candles. Updated {new Date(view.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
      </div>}
    </section>
  );
}

function StrategyCard({ s, onOpen }: { s: StrategyView; onOpen: (x: Signal) => void }) {
  const ready = !!s.signal;
  return (
    <div className="row">
      <div className="flex justify-between items-baseline gap-3">
        <span className="font-semibold">{s.strategy_name} <span className={`pill ml-1 ${s.side === "long" ? "pill-long" : "pill-short"}`}>{s.side === "long" ? "Buy" : "Sell"}</span></span>
        <span className="num text-sm font-semibold" style={{ color: ready ? "var(--violet)" : undefined }}>{ready ? "Ready now" : `${s.met} of ${s.total}`}</span>
      </div>
      {!s.tested_here && <p className="text-xs mt-1" style={{ color: "var(--rust)" }}>Not tested on this market yet. Shown for reference only.</p>}
      <div className="grid gap-1.5 mt-3">{s.checks.map(c => <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>)}</div>
      {ready ? <button className="btn btn-violet mt-3 text-sm" onClick={() => onOpen(s.signal!)}>Open the plan</button> : <p className="text-sm muted mt-2">{s.watch}</p>}
    </div>
  );
}
