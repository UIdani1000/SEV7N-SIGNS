"use client";
import { useEffect, useMemo, useState } from "react";
import { MANUAL_STATS, MARKET_LIST, PaperTrade, Side, Store, fmtPrice, usd } from "@/lib/signs";
import { usePrices } from "@/lib/usePrices";
import { Ladder, LiveTag } from "./parts";

const HOLDS: [number, string][] = [[1, "1 day"], [3, "3 days"], [7, "7 days"], [30, "30 days"]];

export default function ManualTrade({ store, onAdd, onClose }: { store: Store; onAdd: (t: PaperTrade) => void; onClose: () => void }) {
  const [sym, setSym] = useState(store.pair || "BTCUSDT");
  const [side, setSide] = useState<Side>("long");
  const [atMarket, setAtMarket] = useState(true);
  const [entryIn, setEntryIn] = useState(""); const [slIn, setSlIn] = useState(""); const [tpIn, setTpIn] = useState("");
  const [tpMode, setTpMode] = useState<"rr" | "price">("rr"); const [rr, setRr] = useState(3);
  const [riskUsd, setRiskUsd] = useState(Math.round(store.balance * store.riskPct) / 100);
  const [hold, setHold] = useState(7); const [note, setNote] = useState("");
  const live = usePrices([sym], 5000);
  const px = live.prices[sym]?.price;
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  useEffect(() => { setSlIn(""); setTpIn(""); setEntryIn(""); }, [sym]);

  const entry = atMarket ? px : Number(entryIn) || undefined;
  const sl = Number(slIn) || undefined;
  const tp = tpMode === "rr" ? (entry && sl ? entry + (side === "long" ? 1 : -1) * rr * Math.abs(entry - sl) : undefined) : Number(tpIn) || undefined;
  const [tk, nm] = (MARKET_LIST.find(m => m[0] === sym) || [sym, sym, sym]).slice(1);
  const error = useMemo(() => {
    if (!entry) return atMarket ? "Waiting for the live price…" : "Enter your entry price.";
    if (!sl) return "Enter a stop-loss price.";
    if (side === "long" && sl >= entry) return "For a buy, the stop must be below the entry.";
    if (side === "short" && sl <= entry) return "For a sell, the stop must be above the entry.";
    if (!tp) return "Enter a take-profit price.";
    if (side === "long" && tp <= entry) return "For a buy, the target must be above the entry.";
    if (side === "short" && tp >= entry) return "For a sell, the target must be below the entry.";
    if (!(riskUsd > 0)) return "Enter how much you are risking.";
    return null;
  }, [entry, sl, tp, side, riskUsd, atMarket]);
  const rrNow = entry && sl && tp ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0;
  const units = entry && sl ? riskUsd / Math.abs(entry - sl) : 0;
  const notional = entry ? units * entry : 0;
  const warnings: string[] = [];
  if (!error && entry && sl) {
    if (sym === "GOLD" && units < 1) warnings.push(`Too small for a 0.01-lot gold CFD (1 oz), which would risk $${Math.abs(entry - sl).toFixed(2)}. Fractional gold (XAUT or PAXG) works.`);
    else if (sym !== "GOLD" && notional < 5) warnings.push("Position is under $5, below most exchanges’ minimum order size.");
    if (notional > store.balance * 1.5) warnings.push(`Needs about ${(notional / Math.max(store.balance, 1)).toFixed(1)}x leverage on your ${usd(store.balance)} balance.`);
  }
  const quickStop = (pct: number) => entry && setSlIn(String(+(entry * (1 - (side === "long" ? 1 : -1) * pct / 100)).toPrecision(6)));

  const open = () => {
    if (error || !entry || !sl || !tp) return;
    const now = new Date();
    onAdd({ id: `manual:${sym}:${now.getTime()}`, strategy: "manual", strategy_name: "Manual", symbol: sym, ticker: tk, name: nm, side, entry, sl, tp, rr: Math.round(rrNow * 100) / 100,
      risk_pct_of_price: Math.abs(entry - sl) / entry * 100, candle_time: now.toISOString(), expires: new Date(now.getTime() + hold * 86400000).toISOString(),
      reasons: note ? [note] : [], stats: MANUAL_STATS, opened_at: now.toISOString(), risk_usd: riskUsd, note });
  };
  return (<>
    <div className="scrim" onClick={onClose} />
    <aside className="sheet" role="dialog" aria-modal="true" aria-label="Add a paper trade">
      <div className="flex justify-between items-start gap-3"><h2 className="display text-5xl sm:text-6xl">Add a trade</h2><button className="btn btn-ghost !px-3 !py-2" onClick={onClose}>Close</button></div>
      <div className="grid gap-4 mt-5">
        <label className="text-sm font-semibold">Market
          <select className="field mt-1" value={sym} onChange={e => setSym(e.target.value)}>{MARKET_LIST.map(([s, t, n]) => <option key={s} value={s}>{t === "XAUUSD" ? "Gold (XAUUSD)" : `${t}, ${n}`}</option>)}</select></label>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2" role="radiogroup" aria-label="Direction">
            {(["long", "short"] as Side[]).map(d => <button key={d} role="radio" aria-checked={side === d} className={`pill !py-2 !px-5 ${side === d ? (d === "long" ? "pill-long" : "pill-short") : ""}`} onClick={() => setSide(d)}>{d === "long" ? "Buy" : "Sell"}</button>)}
          </div>
          <div className="text-right num"><div className="font-semibold">{px ? fmtPrice(px) : "–"}</div><LiveTag at={live.at} stale={live.stale} /></div>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-semibold">Entry</span>
          <div className="flex gap-2 flex-wrap">
            <button className={`pill !py-2 ${atMarket ? "pill-short" : ""}`} onClick={() => setAtMarket(true)}>At market now</button>
            <button className={`pill !py-2 ${!atMarket ? "pill-short" : ""}`} onClick={() => { setAtMarket(false); if (!entryIn && px) setEntryIn(String(px)); }}>At my price</button>
          </div>
          {!atMarket && <input className="field num" type="number" inputMode="decimal" value={entryIn} onChange={e => setEntryIn(e.target.value)} placeholder="Entry price" aria-label="Entry price" />}
        </div>
        <label className="text-sm font-semibold">Stop-loss price
          <input className="field num mt-1" type="number" inputMode="decimal" value={slIn} onChange={e => setSlIn(e.target.value)} placeholder={side === "long" ? "Below the entry" : "Above the entry"} />
          <span className="flex gap-2 mt-2 flex-wrap">{[0.5, 1, 2, 3].map(p => <button type="button" key={p} className="pill !py-1" onClick={() => quickStop(p)} disabled={!entry}>{p}% away</button>)}</span></label>
        <div className="grid gap-2">
          <span className="text-sm font-semibold">Take-profit</span>
          <div className="flex gap-2 flex-wrap">
            {[1.5, 2, 3].map(x => <button key={x} className={`pill !py-2 ${tpMode === "rr" && rr === x ? "pill-short" : ""}`} onClick={() => { setTpMode("rr"); setRr(x); }}>{x}× the stop</button>)}
            <button className={`pill !py-2 ${tpMode === "price" ? "pill-short" : ""}`} onClick={() => { setTpMode("price"); if (!tpIn && tp) setTpIn(String(+tp.toPrecision(6))); }}>My price</button>
          </div>
          {tpMode === "price" && <input className="field num" type="number" inputMode="decimal" value={tpIn} onChange={e => setTpIn(e.target.value)} placeholder="Target price" aria-label="Target price" />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Risk ($)<input className="field num mt-1" type="number" inputMode="decimal" min={0} step={0.1} value={riskUsd} onChange={e => setRiskUsd(Number(e.target.value))} /></label>
          <label className="text-sm font-semibold">Close after<select className="field mt-1" value={hold} onChange={e => setHold(Number(e.target.value))}>{HOLDS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
        </div>
        <label className="text-sm font-semibold">Note (optional)<input className="field mt-1 font-normal" value={note} onChange={e => setNote(e.target.value)} placeholder="Why you're taking it" maxLength={140} /></label>
      </div>

      {entry && sl && tp && !error && <div className="grid grid-cols-1 min-[400px]:grid-cols-[1fr_1.1fr] gap-5 mt-6 items-start">
        <Ladder sig={{ entry, sl, tp, side }} price={px ?? null} height={170} />
        <div className="num grid gap-2 content-start">
          <div><div className="text-sm muted">Position</div><div className="font-semibold">{sym === "GOLD" ? `${units.toFixed(3)} oz` : `${units < 1 ? units.toPrecision(3) : units.toFixed(3)} ${tk}`}</div></div>
          <div><div className="text-sm muted">If stopped</div><div className="font-semibold" style={{ color: "var(--rust)" }}>−{usd(riskUsd)}</div></div>
          <div><div className="text-sm muted">If target hits</div><div className="font-semibold" style={{ color: "var(--violet)" }}>+{usd(riskUsd * rrNow)} ({rrNow.toFixed(2)}R)</div></div>
        </div>
      </div>}
      {warnings.length > 0 && <div className="mt-4 rounded-2xl p-4 grid gap-1" style={{ background: "var(--paper-2)" }}><div className="font-semibold text-sm">Risk Guardian</div>{warnings.map(w => <p key={w} className="text-sm">{w}</p>)}</div>}
      {riskUsd > store.balance * 0.1 && <p className="text-sm mt-3" style={{ color: "var(--rust)" }}>That is {Math.round(riskUsd / store.balance * 100)}% of your balance on one trade.</p>}
      {error && <p className="text-sm muted mt-4">{error}</p>}
      <button className="btn btn-violet w-full mt-6" onClick={open} disabled={!!error}>Open paper trade</button>
    </aside>
  </>);
}
