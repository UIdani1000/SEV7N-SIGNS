"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaperTrade, Store, tradeStatus, fmtPrice, usd, STATS_LABEL } from "@/lib/signs";
import { Ladder, LiveTag, Tick } from "./parts";
import ManualTrade from "./ManualTrade";
import { usePrices } from "@/lib/usePrices";

const LABEL: Record<string, string> = { target_hit: "Target hit", stopped: "Stopped out", expired: "Closed at time limit", closed: "Closed by you", open: "Open", unknown: "Checking" };

export default function Paper({ store, setStore, toast, signedIn = false, onSignIn = () => {} }: { store: Store; setStore: (s: Store) => void; toast: (m: string) => void; signedIn?: boolean; onSignIn?: () => void }) {
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false);
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
  const closeNow = (t: PaperTrade) => {
    const r = liveR(t); const px = live.prices[t.symbol]?.price;
    if (r == null || px == null) { toast("Waiting for a live price before closing."); return; }
    setStore({ ...store, paper: store.paper.map(x => x.id === t.id ? { ...x, result: { status: "closed", r, exit: px, closed_at: new Date().toISOString() } } : x) });
    toast(`Closed ${t.ticker} at ${fmtPrice(px)}: ${sign(r * t.risk_usd)}.`);
  };
  const remove = (t: PaperTrade) => { setStore({ ...store, paper: store.paper.filter(x => x.id !== t.id) }); toast(`Removed ${t.ticker} from the paper book.`); };
  const tone = (x: number) => ({ color: x > 0 ? "var(--violet)" : x < 0 ? "var(--rust)" : undefined });
  const byStrat = Object.entries(closed.reduce((acc: Record<string, PaperTrade[]>, t) => { (acc[t.strategy] ||= []).push(t); return acc; }, {}));
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-32">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h1 className="display text-7xl">Paper</h1>
        <button className="btn btn-ink" onClick={() => setAdding(true)}>Add a trade</button>
      </div>
      <p className="muted mt-2 max-w-prose">Practise with fake money. Trades are checked against real prices until they hit the target, the stop or the time limit, or you close them.</p>
      <div className="mt-6 num">
        <div className="text-sm muted">Paper balance{open.length > 0 ? ", including open trades" : ""}</div>
        <div className="display text-[18vw] sm:text-8xl leading-none tick" style={tone(total)}>{cents(equity)}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
          <span className="font-semibold" style={tone(total)}>{sign(total)} ({total >= 0 ? "+" : ""}{(total / Math.max(store.startBalance, 1) * 100).toFixed(1)}%) since {usd(store.startBalance)} <Tick value={Math.round(total * 100)} /></span>
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
          const mine = k === "manual";
          return <div key={k} className="row flex flex-wrap justify-between gap-x-4 gap-y-1 num text-sm"><span className="font-semibold">{mine ? "You (manual trades)" : ts[0].strategy_name}</span>
            <span>{ts.length} trades, {w}% wins{mine ? "" : ` (tested ${ts[0].stats.win_rate}%)`}, {avg >= 0 ? "+" : ""}{avg.toFixed(2)}R avg{mine ? "" : ` (tested ${ts[0].stats.avg_r >= 0 ? "+" : ""}${ts[0].stats.avg_r}R)`}</span></div>;
        })}
        <p className="text-xs muted mt-2">{STATS_LABEL}</p>
      </div>}

      <div className="flex items-center justify-between mt-8">
        <h2 className="font-semibold whitespace-nowrap">Open trades ({open.length})</h2>
        <button className="btn btn-ghost text-sm !py-2 whitespace-nowrap" onClick={refresh} disabled={busy || !open.length}>{busy ? "Checking…" : "Check now"}</button>
      </div>
      {!signedIn && store.paper.length > 0 && <p className="text-sm mt-4 rounded-2xl p-3" style={{ background: "var(--paper-2)" }}>These trades live only on this device. <button className="underline font-semibold" onClick={onSignIn}>Sign in</button> to keep them on all your devices.</p>}
      {!open.length && <p className="muted text-sm mt-3">No open paper trades. Tap “Add a trade”, or open a setup on the Deck and tap “Paper trade this”.</p>}
      {open.map(t => (
        <div key={t.id} className="row grid grid-cols-1 min-[400px]:grid-cols-[1fr_1fr] gap-5">
          <div>
            <span className={`pill ${t.side === "long" ? "pill-long" : "pill-short"}`}>{t.side === "long" ? "Buy" : "Sell"}</span>
            <div className="display text-4xl mt-2">{t.ticker}</div>
            <div className="text-sm muted">{t.strategy === "manual" ? "Your trade" : t.strategy_name}, risking {usd(t.risk_usd)}</div>
            {t.note && <div className="text-sm mt-1">“{t.note}”</div>}
            {liveR(t) != null && <div className="num font-semibold mt-2 tick" style={tone(liveR(t)!)}>{sign(liveR(t)! * t.risk_usd)} now <span className="text-sm">({liveR(t)! >= 0 ? "+" : ""}{liveR(t)!.toFixed(2)}R)</span></div>}
            {live.prices[t.symbol] && <div className="text-sm num mt-1">Price {fmtPrice(live.prices[t.symbol].price)} <Tick value={live.prices[t.symbol].price} /></div>}
          </div>
          <Ladder sig={t} price={live.prices[t.symbol]?.price ?? t.result?.price ?? null} height={130} />
          <div className="min-[400px]:col-span-2 flex gap-2 mt-4 items-center">
            <button className="btn btn-ghost text-sm !py-2" onClick={() => closeNow(t)}>Close now</button>
            <button className="text-sm underline muted" onClick={() => { if (confirm(`Remove this ${t.ticker} trade without recording a result?`)) remove(t); }}>Remove</button>
          </div>
        </div>
      ))}

      {closed.length > 0 && <>
        <h2 className="font-semibold mt-8">Closed</h2>
        {closed.slice().reverse().map(t => (
          <div key={t.id} className="row flex items-center justify-between num text-sm">
            <span><span className="font-semibold">{t.ticker}</span> {t.side === "long" ? "buy" : "sell"} at {fmtPrice(t.entry)}</span>
            <span>{LABEL[t.result!.status] ?? t.result!.status}, <b style={{ color: (t.result?.r ?? 0) >= 0 ? "var(--violet)" : "var(--rust)" }}>{sign((t.result?.r ?? 0) * t.risk_usd)}</b></span>
          </div>
        ))}
      </>}
      {adding && <ManualTrade store={store} onClose={() => setAdding(false)} onAdd={t => { setStore({ ...store, paper: [...store.paper, t] }); setAdding(false); toast(`Paper trade opened: ${t.side === "long" ? "buy" : "sell"} ${t.ticker} at ${fmtPrice(t.entry)}, risking ${usd(t.risk_usd)}.`); }} />}
      {store.paper.length > 0 && <button className="btn btn-ghost text-sm mt-8" onClick={() => { if (confirm("Delete all paper trades and reset the paper balance?")) { setStore({ ...store, paper: [] }); toast("Paper book cleared."); } }}>Clear paper book</button>}
    </section>
  );
}
