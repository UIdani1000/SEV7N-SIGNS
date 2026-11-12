"use client";
import { useState } from "react";
import { Store, fmtPrice, usd } from "@/lib/signs";
import { HighRiskCtl, tickerOf } from "@/lib/highrisk";
import { usePrices } from "@/lib/usePrices";
import { unlockSound } from "@/lib/alerts";
import { GUIDES } from "@/lib/guides";
import { isOpen, left, nextClose, useClock, usePaperLive } from "@/lib/live";
import { LiveTag, Tick } from "./parts";
import { IndicatorChart } from "./Guide";
import { Dots, Head, RBar } from "./Live";

const MK = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "GOLD"];
export const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const hhmm = (iso: string | number) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** High Risk: a live dashboard while a session runs, a short setup screen otherwise. */
export default function HighRisk({ store, setStore, hr, openSettings, onInfo }: {
  store: Store; setStore: (s: Store) => void; hr: HighRiskCtl; openSettings: () => void; onInfo: () => void;
}) {
  const g = GUIDES.scalp; const now = useClock(1000);
  const [pick, setPick] = useState<string[]>(["BTCUSDT"]); const [mins, setMins] = useState(60); const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState<string | null>(null); const [edit, setEdit] = useState(false);
  const s = hr.session; const syms = s ? s.symbols : pick;
  const live = usePrices(s ? s.symbols : [], 5000);
  usePaperLive(store, setStore, t => t.strategy === "scalp");
  const risk = Math.min(store.riskPct, 2) / 100 * store.balance;
  const toggle = (m: string) => {
    const next = syms.includes(m) ? syms.filter(x => x !== m) : [...syms, m];
    if (!next.length) return;
    if (s) hr.setSymbols(next); else setPick(next);
    if (!syms.includes(m)) setTab(m);
  };
  const setupOf = (sym: string) => hr.views[sym]?.sides?.find(x => x.setup)?.setup;
  const hotSym = syms.find(setupOf);
  const active = (tab && syms.includes(tab) ? tab : hotSym) || syms[0];
  const v = hr.views[active]; const cur = setupOf(active);
  const px = (m: string) => live.prices[m]?.price ?? hr.views[m]?.price;

  // this session's scalps (auto paper trades)
  const mine = s ? store.paper.filter(t => t.strategy === "scalp" && new Date(t.opened_at).getTime() >= s.startedAt) : [];
  const done = mine.filter(t => !isOpen(t)); const won = done.filter(t => (t.result?.r ?? 0) > 0).length;
  const net = done.reduce((a, t) => a + (t.result?.r ?? 0), 0);

  if (!s) return (
    <>
      <Head g={g} onInfo={onInfo} line={<span style={{ color: "var(--rust)" }}>Practice only. Never real money.</span>} />
      <section className="mt-6 grid gap-5">
        <div><div className="text-sm font-semibold">Markets</div>
          <div className="flex flex-wrap gap-2 mt-2">{MK.map(m => <button key={m} aria-pressed={syms.includes(m)} className={`pill !py-2 !px-4 ${syms.includes(m) ? "pill-short" : ""}`} onClick={() => toggle(m)}>{tickerOf(m)}</button>)}</div></div>
        <div><div className="text-sm font-semibold">Session</div>
          <div className="flex gap-2 mt-2">{[30, 60, 120, 240].map(m => <button key={m} className={`pill !py-2 !px-4 ${mins === m ? "pill-short" : ""}`} onClick={() => setMins(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto paper-trade entries ({usd(risk)} each)</label>
        <button className="btn btn-ink" onClick={() => { unlockSound(); hr.start(pick, mins, auto); }}>Start session</button>
        <button className="text-xs muted underline justify-self-start" onClick={openSettings}>Sound, push and Telegram alerts</button>
      </section>
    </>
  );

  return (
    <section className="mt-5" aria-label="High Risk session">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="rec" aria-hidden="true" /><span className="font-bold text-sm" style={{ color: "var(--rust)" }}>High Risk live</span></div>
        <div className="flex gap-2"><button className="btn btn-ghost !py-1.5 !px-3 text-sm" onClick={() => hr.extend(30)}>+30 min</button><button className="btn btn-ghost !py-1.5 !px-3 text-sm" onClick={hr.stop}>End</button></div>
      </div>
      <div className="flex items-end justify-between mt-2">
        <div><div className="display text-8xl num leading-none">{clock(Math.max(0, s.endAt - now))}</div><div className="text-xs muted mt-1">left in session</div></div>
        <div className="text-right"><div className="display text-4xl num">{left(nextClose("5m", now) - now)}</div><div className="text-xs muted">to next 5-min close</div></div>
      </div>

      <div className="stats mt-5">{([["Entries", hr.log.length, null], ["Open", mine.filter(isOpen).length, null], ["Won", won, "var(--violet)"], ["Lost", done.length - won, "var(--rust)"],
        ["Net", done.length ? `${net >= 0 ? "+" : ""}${net.toFixed(1)}R` : "–", done.length ? (net >= 0 ? "var(--violet)" : "var(--rust)") : null]] as const).map(([k, val, col]) =>
        <div key={k}><div className="display text-3xl num" style={col ? { color: col } : {}}>{val}</div><div className="text-xs muted">{k}</div></div>)}</div>

      <div className="tiles mt-5">{syms.map(m => {
        const vw = hr.views[m]; const best = vw?.sides?.slice().sort((a, b) => b.met - a.met)[0]; const hot = !!setupOf(m);
        return (
          <button key={m} className={`tile ${hot ? "hot" : ""} ${m === active ? "sel" : ""}`} onClick={() => setTab(m)} aria-pressed={m === active}>
            <div className="flex justify-between items-baseline"><span className="display text-3xl">{tickerOf(m)}</span>{hot && <span className="badge hot">Entry</span>}</div>
            <div className="num text-sm mt-0.5">{px(m) != null ? fmtPrice(px(m)!) : "…"} <Tick value={px(m)} /></div>
            {best ? <div className="flex items-center gap-1.5 mt-2"><Dots met={best.met} total={best.total} hot={hot} sell={best.side === "short"} /><span className="text-xs muted">{best.side === "long" ? "Buy" : "Sell"}</span></div>
              : <div className="text-xs muted mt-2">{vw?.error ? "No data" : "Reading…"}</div>}
          </button>);
      })}
        <button className="tile add" onClick={() => setEdit(e => !e)} aria-expanded={edit}>{edit ? "Done" : "+ Markets"}</button>
      </div>
      {edit && <div className="flex flex-wrap gap-2 mt-3">{MK.map(m => <button key={m} aria-pressed={syms.includes(m)} className={`pill !py-1.5 !px-3 ${syms.includes(m) ? "pill-short" : ""}`} onClick={() => toggle(m)}>{tickerOf(m)}</button>)}</div>}

      {cur && (() => { const by = new Date(cur.candle_time).getTime() + 600000 - now; return (
        <div className="alert mt-5" role="alert">
          <div className="flex items-start justify-between gap-3">
            <div><div className="display text-5xl">{cur.side === "long" ? "Buy" : "Sell"} {tickerOf(active)}</div><div className="text-sm mt-1">Close by {hhmm(cur.expires)}</div></div>
            <div className="text-right"><div className="display text-4xl num">{by > 0 ? left(by) : "0:00"}</div><div className="text-xs">{by > 0 ? "to enter" : "too late, skip"}</div></div>
          </div>
          <div className="mt-4 alert-bar"><RBar t={cur} price={px(active)} /></div>
        </div>); })()}

      <div className="mt-5"><IndicatorChart symbol={active} g={g} levels={cur || null} refresh={v?.candle_time} /></div>

      {v?.sides && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Checklist for {tickerOf(active)}</summary>
        {v.sides.map(x => <div key={x.side} className="mt-3">
          <div className="flex items-center gap-2 text-sm"><b>{x.side === "long" ? "Buy" : "Sell"}</b><Dots met={x.met} total={x.total} sell={x.side === "short"} /><span className="muted num">{x.met}/{x.total}</span></div>
          <div className="grid gap-1 mt-2">{x.checks.map(c => <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>)}</div>
        </div>)}</details>}

      {hr.log.length > 0 && <div className="mt-5"><div className="text-sm font-semibold">Entries</div>
        {hr.log.slice(0, 6).map(l => <p key={l.at + l.text} className="text-sm num mt-1"><span className="muted">{hhmm(l.at)}</span> {l.text}</p>)}</div>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-6 text-xs">
        <LiveTag at={live.at} stale={live.stale} />
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.auto} onChange={e => hr.setAuto(e.target.checked)} /> Auto paper-trade</label>
        <span className="muted">{hr.server?.active ? (hr.server.telegram ? "Telegram on" : "Telegram off") : "Connecting…"}</span>
      </div>
    </section>
  );
}
