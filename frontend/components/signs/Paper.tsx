"use client";
import { useCallback, useEffect, useState } from "react";
import { PaperTrade, Store, tradeStatus, fmtPrice, usd, STATS_LABEL } from "@/lib/signs";
import { Ladder } from "./parts";

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

  const pnl = closed.reduce((a, t) => a + (t.result?.r ?? 0) * t.risk_usd, 0);
  const byStrat = Object.entries(closed.reduce((acc: Record<string, PaperTrade[]>, t) => { (acc[t.strategy] ||= []).push(t); return acc; }, {}));
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Paper</h1>
      <p className="muted mt-2 max-w-prose">Practice with fake money. Each trade is checked against real prices until it hits its target, its stop, or its time limit.</p>
      <div className="grid grid-cols-3 gap-4 mt-6 num">
        <div><div className="text-sm muted">Paper balance</div><div className="display text-4xl">{usd(store.startBalance + pnl)}</div></div>
        <div><div className="text-sm muted">Closed trades</div><div className="display text-4xl">{closed.length}</div></div>
        <div><div className="text-sm muted">Wins</div><div className="display text-4xl">{closed.length ? Math.round(closed.filter(t => (t.result?.r ?? 0) > 0).length / closed.length * 100) : 0}%</div></div>
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
        <button className="btn btn-ghost text-sm !py-2" onClick={refresh} disabled={busy || !open.length}>{busy ? "Checking prices…" : "Check now"}</button>
      </div>
      {!open.length && <p className="muted text-sm mt-3">No open paper trades. Open a setup on the Deck and tap “Paper trade this”.</p>}
      {open.map(t => (
        <div key={t.id} className="row grid grid-cols-[1fr_1fr] gap-5">
          <div>
            <span className={`pill ${t.side === "long" ? "pill-long" : "pill-short"}`}>{t.side === "long" ? "Buy" : "Sell"}</span>
            <div className="display text-4xl mt-2">{t.ticker}</div>
            <div className="text-sm muted">{t.strategy_name}, risking {usd(t.risk_usd)}</div>
            {t.result?.r != null && <div className="num font-semibold mt-2">{t.result.r >= 0 ? "+" : ""}{t.result.r.toFixed(2)}R now</div>}
          </div>
          <Ladder sig={t} price={t.result?.price ?? null} height={130} />
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
