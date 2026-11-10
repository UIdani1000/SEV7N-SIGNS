"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaperTrade, Store, tradeStatus, fmtPrice, usd, STATS_LABEL } from "@/lib/signs";
import { Ladder, LiveTag } from "./parts";
import { usePrices } from "@/lib/usePrices";

const LABEL: Record<string, string> = { target_hit: "Target hit", stopped: "Stopped out", expired: "Closed at time limit", open: "Open", unknown: "Checking" };

export default function Paper({ store, setStore, toast }: { store: Store; setStore: (s: Store) => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const open = store.paper.filter(t => !t.result || t.result.status === "open" || t.result.status === "unknown");
  const closed = store.paper.filter(t => t.result && !["open", "unknown"].includes(t.result.status));
  const refresh = useCallback(async () => {
    if (!open.length) return;
    setBusy(true);
    try {
      const r = await tradeStatus(open);
      const byId = new Map(r.trades.map(x => [x.id, x]));
      let changed = 0;
      const paper = store.paper.map(t => {
        const u = byId.get(t.id); if (!u) return t;
        if (u.status !== "open" && t.result?.status !== u.status) changed++;
        return { ...t, result: u };
      });
      setStore({ ...store, paper });
      if (changed) toast(`${changed} paper trade${changed > 1 ? "s" : ""} closed. Scorecard updated.`);
    } catch (e: unknown) { toast((e as Error).message); }
    setBusy(false);
  }, [open, store, setStore, toast]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 60000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const live = usePrices(open.map(t => t.symbol));
  const rawR = (t: PaperTrade) => { const px = live.prices[t.symbol]?.price; if (px == null) return t.result?.r ?? null; return (px - t.entry) / Math.abs(t.entry - t.sl) * (t.side === "long" ? 1 : -1); };
  // An open trade can't lose more than its stop or gain more than its target: that's where it closes.
  const liveR = (t: PaperTrade) => { const r = rawR(t); return r == null ? null : Math.round(Math.min(t.rr || 3, Math.max(-1, r)) * 100) / 100; };
  const pnl = closed.reduce((a, t) => a + (t.result?.r ?? 0) * t.risk_usd, 0);
  const openPnl = open.reduce((a, t) => a + (liveR(t) ?? 0) * t.risk_usd, 0);
  const equity = store.startBalance + pnl + openPnl, total = pnl + openPnl;
  const lastCheck = useRef(0);
  useEffect(() => {   // a live price crossed a stop or target: confirm the close right away instead of waiting a minute
    const crossed = open.some(t => { const r = rawR(t); return r != null && (r <= -1 || r >= (t.rr || 3)); });
    if (crossed && Date.now() - lastCheck.current > 15000) { lastCheck.current = Date.now(); refresh(); }
  }, [live.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const cents = (x: number) => `$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sign = (x: number) => (x >= 0 ? "+" : "−") + cents(x);
  const tone = (x: number) => ({ color: x > 0 ? "var(--violet)" : x < 0 ? "var(--rust)" : undefined });
  const byStrat = Object.entries(closed.reduce((acc: Record<string, PaperTrade[]>, t) => { (acc[t.strategy] ||= []).push(t); return acc; }, {}));
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Paper</h1>
      <p className="muted mt-2 max-w-prose">Practice with fake money. Each trade is checked against real prices until it hits its target, its stop, or its time limit.</p>
      <div className="mt-6 num">
        <div className="text-sm muted">Paper balance{open.length > 0 ? ", including open trades" : ""}</div>
        <div className="display text-[18vw] sm:text-8xl leading-none tick" style={tone(total)}>{cents(equity)}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
          <span className="font-semibold" style={tone(total)}>{sign(total)} ({total >= 0 ? "+" : ""}{(total / Math.max(store.startBalance, 1) * 100).toFixed(1)}%) since {usd(store.startBalance)}</span>
          {open.length > 0 && <LiveTag at={live.at} stale={live.stale} />}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 num">
        <div><div className="text-sm muted">Open P&amp;L</div><div className="display text-4xl tick" style={tone(openPnl)}>{sign(openPnl)}</div><div className="text-xs muted">{open.length} open</div></div>
        <div><div className="text-sm muted">Closed P&amp;L</div><div className="display text-4xl" style={tone(pnl)}>{sign(pnl)}</div><div className="text-xs muted">{closed.length} closed</div></div>
        <div><div className="text-sm muted">Wins</div><div className="display text-4xl">{closed.length ? Math.round(closed.filter(t => (t.result?.r ?? 0) > 0).length / closed.length * 100) : 0}%</div><div className="text-xs muted">of closed trades</div></div>
        <div><div className="text-sm muted">Average</div><div className="display text-4xl" style={tone(closed.length ? closed.reduce((a, t) => a + (t.result?.r ?? 0), 0) : 0)}>{closed.length ? `${(closed.reduce((a, t) => a + (t.result?.r ?? 0), 0) / closed.length).toFixed(2)}R` : "–"}</div><div className="text-xs muted">per closed trade</div></div>
      </div>

      {byStrat.length > 0 && <div className="mt-8">
        <h2 className="font-semibold">Scorecard against the backtest</h2>
        {byStrat.map(([k, ts]) => {
          const w = Math.round(ts.filter(t => (t.result?.r ?? 0) > 0).length / ts.length * 100);
          const avg = ts.reduce((a, t) => a + (t.result?.r ?? 0), 0) / ts.length;
          return <div key={k} className="row flex justify-between num text-sm"><span className="font-semibold">{ts[0].strategy_name}</span>
            <span>{ts.length} trades, {w}% wins (tested {ts[0].stats.win_rate}%), {avg >= 0 ? "+" : ""}{avg.toFixed(2)}R avg (tested +{ts[0].stats.avg_r}R)</span></div>;
        })}
        <p className="text-xs muted mt-2">{STATS_LABEL}</p>
      </div>}

      <div className="flex items-center justify-between mt-8">
        <h2 className="font-semibold">Open ({open.length})</h2>
        <div className="flex items-center gap-3">{open.length > 0 && <LiveTag at={live.at} stale={live.stale} />}<button className="btn btn-ghost text-sm !py-2" onClick={refresh} disabled={busy || !open.length}>{busy ? "Checking prices…" : "Check now"}</button></div>
      </div>
      {!open.length && <p className="muted text-sm mt-3">No open paper trades. Open a setup on the Deck and tap “Paper trade this”.</p>}
      {open.map(t => (
        <div key={t.id} className="row grid grid-cols-[1fr_1fr] gap-5">
          <div>
            <span className={`pill ${t.side === "long" ? "pill-long" : "pill-short"}`}>{t.side === "long" ? "Buy" : "Sell"}</span>
            <div className="display text-4xl mt-2">{t.ticker}</div>
            <div className="text-sm muted">{t.strategy_name}, risking {usd(t.risk_usd)}</div>
            {liveR(t) != null && <div className="num font-semibold mt-2 tick" style={tone(liveR(t)!)}>{sign(liveR(t)! * t.risk_usd)} now <span className="text-sm">({liveR(t)! >= 0 ? "+" : ""}{liveR(t)!.toFixed(2)}R)</span></div>}
          </div>
          <Ladder sig={t} price={live.prices[t.symbol]?.price ?? t.result?.price ?? null} height={130} />
        </div>
      ))}

      {closed.length > 0 && <>
        <h2 className="font-semibold mt-8">Closed</h2>
        {closed.slice().reverse().map(t => (
          <div key={t.id} className="row flex items-center justify-between num text-sm">
            <span><span className="font-semibold">{t.ticker}</span> {t.side === "long" ? "buy" : "sell"} at {fmtPrice(t.entry)}</span>
            <span>{LABEL[t.result!.status] ?? t.result!.status}, <b style={{ color: (t.result?.r ?? 0) >= 0 ? "var(--violet)" : "var(--rust)" }}>{(t.result?.r ?? 0) >= 0 ? "+" : ""}{usd((t.result?.r ?? 0) * t.risk_usd)}</b></span>
          </div>
        ))}
      </>}
      {store.paper.length > 0 && <button className="btn btn-ghost text-sm mt-8" onClick={() => { if (confirm("Delete all paper trades and reset the paper balance?")) { setStore({ ...store, paper: [] }); toast("Paper book cleared."); } }}>Clear paper book</button>}
    </section>
  );
}
