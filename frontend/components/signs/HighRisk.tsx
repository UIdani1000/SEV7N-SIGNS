"use client";
import { useEffect, useRef, useState } from "react";
import { SCALP_STATS, ScalpView, Signal, Store, getScalp, fmtPrice, usd, PaperTrade } from "@/lib/signs";
import { Ladder, LiveTag } from "./parts";
import { usePrices } from "@/lib/usePrices";

const MK = [["BTCUSDT", "BTC"], ["ETHUSDT", "ETH"], ["SOLUSDT", "SOL"], ["XRPUSDT", "XRP"], ["GOLD", "Gold"]];

export default function HighRisk({ store, setStore, toast }: { store: Store; setStore: (s: Store) => void; toast: (m: string) => void }) {
  const [sym, setSym] = useState("BTCUSDT"); const [mins, setMins] = useState(60); const [auto, setAuto] = useState(true);
  const [endAt, setEndAt] = useState<number | null>(null); const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<ScalpView | null>(null); const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const storeRef = useRef(store); storeRef.current = store;
  const risk = Math.min(store.riskPct, 2) / 100 * store.balance;
  const tick = async () => {
    try {
      const v = await getScalp(sym); setView(v); setErr(null);
      for (const s of v.sides) if (s.setup) {
        const id = s.setup.id;
        if (auto && !storeRef.current.paper.some(t => t.id === id)) {
          const t = { ...s.setup, ticker: sym === "GOLD" ? "XAUUSD" : sym.replace("USDT", ""), name: sym, reasons: s.checks.map(c => c.label), risk_pct_of_price: 0,
            stats: { name: "High Risk scalp", win_rate: SCALP_STATS.win_rate, avg_r: SCALP_STATS.avg_r, per_week: "", years_positive: "0 of 3", worst_losing_streak: 0, hold: "60 min", max_risk_hint: 2 },
            opened_at: new Date().toISOString(), risk_usd: risk } as unknown as PaperTrade;
          setStore({ ...storeRef.current, paper: [...storeRef.current.paper, t] });
          toast(`Scalp paper trade opened: ${s.side === "long" ? "buy" : "sell"} ${sym.replace("USDT", "")}.`);
          setLog(l => [`${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${s.side === "long" ? "Buy" : "Sell"} at ${fmtPrice(s.setup!.entry)}, close by ${new Date(s.setup!.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, ...l]);
        }
      }
    } catch (e: unknown) { setErr((e as Error).message); }
  };
  useEffect(() => {
    if (!endAt) return;
    tick(); const poll = setInterval(tick, 60000); const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [endAt, sym]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (endAt && now >= endAt) { setEndAt(null); toast("Session finished. Results keep updating in Paper."); } }, [now, endAt, toast]);
  const left = endAt ? Math.max(0, endAt - now) : 0;
  const live = usePrices(endAt ? [sym] : [], 5000);
  const px = live.prices[sym]?.price ?? view?.price;
  const setup = view?.sides.find(s => s.setup)?.setup;
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl" style={{ color: "var(--rust)" }}>High Risk Mode</h1>
      <div className="rounded-2xl p-4 mt-4" style={{ background: "var(--rust)", color: "#fff" }} role="note">
        <b>Paper only.</b> These 5-minute scalps were tested on {SCALP_STATS.years} years of BTC, ETH and gold: {SCALP_STATS.win_rate}% wins and {SCALP_STATS.avg_r}R per scalp after spreads ({SCALP_STATS.scalps.toLocaleString()} scalps). That is about −${Math.abs(SCALP_STATS.avg_r * 10).toFixed(2)} per 10 scalps risking $1. Use it to practise, not to earn.
      </div>
      {!endAt && <div className="mt-6 grid gap-4">
        <div className="text-sm font-semibold">Market<div className="flex flex-wrap gap-2 mt-1">{MK.map(([s, l]) => <button key={s} className={`pill !py-2 !px-4 ${sym === s ? "pill-short" : ""}`} onClick={() => setSym(s)}>{l}</button>)}</div></div>
        <div className="text-sm font-semibold">Session length<div className="flex gap-2 mt-1">{[30, 60, 120].map(m => <button key={m} className={`pill !py-2 !px-4 ${mins === m ? "pill-short" : ""}`} onClick={() => setMins(m)}>{m} min</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Paper-trade every setup automatically (risk {usd(risk)}, capped at 2%)</label>
        <button className="btn btn-ink" onClick={() => { setLog([]); setView(null); setEndAt(Date.now() + mins * 60000); }}>Start {mins}-minute session</button>
      </div>}
      {endAt && <div className="mt-6">
        <div className="flex items-center justify-between"><div className="display text-6xl num">{String(Math.floor(left / 60000)).padStart(2, "0")}:{String(Math.floor(left / 1000) % 60).padStart(2, "0")}</div>
          <button className="btn btn-ghost" onClick={() => setEndAt(null)}>End session</button></div>
        <p className="text-sm muted">Watching {sym === "GOLD" ? "gold" : sym.replace("USDT", "")} on 5-minute candles. Checks every minute{px ? `; price ${fmtPrice(px)}` : ""}.</p>
        <LiveTag at={live.at} stale={live.stale} />
        {err && <p className="text-sm mt-2" style={{ color: "var(--rust)" }}>{err}</p>}
        {setup && <div className="row mt-4 grid grid-cols-1 min-[400px]:grid-cols-[1fr_1fr] gap-5">
          <div><span className={`pill ${setup.side === "long" ? "pill-long" : "pill-short"}`}>{setup.side === "long" ? "Buy" : "Sell"} now</span>
            <p className="mt-2 text-sm">Close by <b>{new Date(setup.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b> if neither level hits.</p></div>
          <Ladder sig={setup as unknown as Signal} price={px} height={130} /></div>}
        {view && view.sides.map(s => <div key={s.side} className="row">
          <div className="flex justify-between"><span className="font-semibold">{s.side === "long" ? "Buy" : "Sell"} checklist</span><span className="num text-sm">{s.met} of {s.total}</span></div>
          <div className="grid gap-1.5 mt-2">{s.checks.map(c => <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>)}</div>
        </div>)}
        {log.length > 0 && <div className="mt-4"><div className="font-semibold text-sm">This session</div>{log.map(l => <p key={l} className="text-sm num mt-1">{l}</p>)}</div>}
      </div>}
    </section>
  );
}
