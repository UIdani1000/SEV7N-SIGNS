"use client";
import { useEffect, useState } from "react";
import { SCALP_STATS, Signal, Store, fmtPrice, usd } from "@/lib/signs";
import { HighRiskCtl, tickerOf } from "@/lib/highrisk";
import { usePrices } from "@/lib/usePrices";
import { unlockSound } from "@/lib/alerts";
import { Ladder, LiveTag } from "./parts";

const MK = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "GOLD"];
export const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function HighRisk({ store, hr, openSettings }: { store: Store; hr: HighRiskCtl; openSettings: () => void }) {
  const [pick, setPick] = useState<string[]>(["BTCUSDT"]); const [mins, setMins] = useState(60); const [auto, setAuto] = useState(true);
  const [now, setNow] = useState(Date.now()); const [tab, setTab] = useState<string | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = hr.session; const syms = s ? s.symbols : pick;
  const live = usePrices(s ? s.symbols : [], 5000);
  const active = tab && syms.includes(tab) ? tab : syms[0];
  const v = hr.views[active];
  const risk = Math.min(store.riskPct, 2) / 100 * store.balance;
  const toggle = (m: string) => {
    const next = syms.includes(m) ? syms.filter(x => x !== m) : [...syms, m];
    if (!next.length) return;
    if (s) hr.setSymbols(next); else setPick(next);
    if (!syms.includes(m)) setTab(m);
  };
  const setupOf = (sym: string) => hr.views[sym]?.sides?.find(x => x.setup)?.setup;
  const cur = v?.sides?.find(x => x.setup)?.setup;
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-40">
      <h1 className="display text-6xl sm:text-7xl" style={{ color: "var(--rust)" }}>High Risk Mode</h1>
      <div className="rounded-2xl p-4 mt-4 text-sm" style={{ background: "var(--rust)", color: "#fff" }} role="note">
        <b>Paper only.</b> Tested on {SCALP_STATS.years} years of BTC, ETH and gold: {SCALP_STATS.win_rate}% wins, {SCALP_STATS.avg_r}R per scalp after spreads. About −${Math.abs(SCALP_STATS.avg_r * 10).toFixed(2)} per 10 scalps risking $1.
      </div>

      <div className="mt-6 text-sm font-semibold">{s ? "Watching (tap to add or remove)" : "Markets to watch"}</div>
      <div className="flex flex-wrap gap-2 mt-2">{MK.map(m => {
        const on = syms.includes(m), hot = !!setupOf(m);
        return <button key={m} aria-pressed={on} className={`pill !py-2 !px-4 relative ${on ? "pill-short" : ""}`} onClick={() => toggle(m)}>{tickerOf(m)}
          {hot && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: "var(--rust)" }} aria-label="entry now" />}</button>;
      })}</div>

      {!s && <div className="mt-5 grid gap-4">
        <div className="text-sm font-semibold">Session length<div className="flex gap-2 mt-2">{[30, 60, 120, 240].map(m => <button key={m} className={`pill !py-2 !px-4 ${mins === m ? "pill-short" : ""}`} onClick={() => setMins(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Paper-trade every entry automatically (risk {usd(risk)}, capped at 2%)</label>
        <button className="btn btn-ink" onClick={() => { unlockSound(); hr.start(pick, mins, auto); }}>Start {mins < 60 ? `${mins}-minute` : `${mins / 60}-hour`} session</button>
        <p className="text-xs muted">The session keeps running if you switch screens or close the app. With Telegram connected, entries are sent there too. <button className="underline" onClick={openSettings}>Alert settings</button></p>
      </div>}

      {s && <div className="mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="display text-6xl num">{clock(Math.max(0, s.endAt - now))}</div>
          <div className="flex gap-2"><button className="btn btn-ghost !py-2" onClick={() => hr.extend(30)}>+30 min</button><button className="btn btn-ghost !py-2" onClick={hr.stop}>End</button></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm">
          <LiveTag at={live.at} stale={live.stale} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.auto} onChange={e => hr.setAuto(e.target.checked)} /> Auto paper-trade</label>
          <span className="muted">{hr.server?.active ? (hr.server.telegram ? "Telegram alerts on while you’re away" : "Connect Telegram to get alerts when the app is closed") : "Connecting the server watcher…"}</span>
        </div>

        {syms.length > 1 && <div className="flex gap-2 mt-5 overflow-x-auto" role="tablist">{syms.map(m => <button key={m} role="tab" aria-selected={m === active} className={`pill !py-1.5 shrink-0 ${m === active ? "pill-short" : ""}`} onClick={() => setTab(m)}>{tickerOf(m)}{setupOf(m) ? " 🚨" : ""}</button>)}</div>}
        <p className="text-sm mt-3 num"><b>{tickerOf(active)}</b> {live.prices[active] ? fmtPrice(live.prices[active].price) : v ? fmtPrice(v.price) : "…"} on 5-minute candles</p>
        {v?.error && <p className="text-sm mt-1" style={{ color: "var(--rust)" }}>{v.error}</p>}
        {cur && <div className="row mt-3 grid grid-cols-1 min-[400px]:grid-cols-[1fr_1fr] gap-5">
          <div><span className={`pill ${cur.side === "long" ? "pill-long" : "pill-short"}`}>{cur.side === "long" ? "Buy" : "Sell"} now</span>
            <p className="mt-2 text-sm">Close by <b>{new Date(cur.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b> if neither level hits.</p></div>
          <Ladder sig={cur as unknown as Signal} price={live.prices[active]?.price ?? v?.price} height={130} /></div>}
        {v?.sides?.map(x => <div key={x.side} className="row">
          <div className="flex justify-between"><span className="font-semibold">{x.side === "long" ? "Buy" : "Sell"} checklist</span><span className="num text-sm">{x.met} of {x.total}</span></div>
          <div className="grid gap-1.5 mt-2">{x.checks.map(c => <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>)}</div>
        </div>)}
        {!v && <p className="muted text-sm mt-3">Reading {tickerOf(active)}…</p>}
        {hr.log.length > 0 && <div className="mt-5"><div className="font-semibold text-sm">Entries this session</div>{hr.log.map(l => <p key={l.at + l.text} className="text-sm num mt-1">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {l.text}</p>)}</div>}
      </div>}
    </section>
  );
}
