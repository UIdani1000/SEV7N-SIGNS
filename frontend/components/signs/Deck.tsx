"use client";
import { useMemo, useState } from "react";
import { Near, PaperTrade, ScanResult, Signal, Store, Weekly, fmtPrice, plan, usd } from "@/lib/signs";
import { GUIDES, GuideKey, ORDER, SWITCH_LABEL } from "@/lib/guides";
import { isOpen, left, nextClose, useClock, usePaperLive } from "@/lib/live";
import { usePrices } from "@/lib/usePrices";
import { HighRiskCtl } from "@/lib/highrisk";
import { IndicatorChart, StrategyGuide } from "./Guide";
import { Dots, Empty, Head, RBar } from "./Live";
import HighRisk from "./HighRisk";

/* ------------------------------------------------------------------ your trades for one strategy */

function MyTrades({ trades, prices }: { trades: PaperTrade[]; prices: Record<string, { price: number } | undefined> }) {
  const open = trades.filter(isOpen), closed = trades.filter(t => !isOpen(t));
  if (!trades.length) return null;
  const net = closed.reduce((a, t) => a + (t.result?.r ?? 0), 0), wins = closed.filter(t => (t.result?.r ?? 0) > 0).length;
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between"><h2 className="font-semibold">Your paper trades</h2>
        {closed.length > 0 && <span className="text-sm num">{wins}/{closed.length} won, <b style={{ color: net >= 0 ? "var(--violet)" : "var(--rust)" }}>{net >= 0 ? "+" : ""}{net.toFixed(1)}R</b></span>}</div>
      {open.map(t => <div key={t.id} className="row">
        <div className="flex justify-between items-baseline mb-2"><span><span className="display text-2xl">{t.ticker}</span> <span className="text-xs muted">{t.side === "long" ? "Buy" : "Sell"}</span></span>
          <span className="text-xs muted num">{fmtPrice(prices[t.symbol]?.price ?? t.entry)}</span></div>
        <RBar t={t} price={prices[t.symbol]?.price ?? t.result?.price} /></div>)}
    </section>
  );
}

/* ------------------------------------------------------------------ Weekly: one calm pick a week */

function WeeklyView({ weekly, wErr, slow, store, onOpen, onInfo, retry, trades }: {
  weekly: Weekly | null; wErr: string | null; slow: boolean; store: Store; onOpen: (s: Signal) => void; onInfo: () => void; retry: () => void; trades: PaperTrade[];
}) {
  const now = useClock(1000); const g = GUIDES.weekly; const pick = weekly?.pick;
  const live = usePrices([...new Set([...(pick ? [pick.symbol] : []), ...trades.filter(isOpen).map(t => t.symbol)])]);
  const price = pick ? (live.prices[pick.symbol]?.price ?? pick.price ?? null) : null;
  const p = pick ? plan(pick, store.balance, store.riskPct) : null;
  const max = Math.max(1, ...(weekly?.leaderboard || []).map(b => Math.abs(b.week_return_pct ?? 0)));
  return (
    <>
      <Head g={g} onInfo={onInfo} line={weekly ? <>Next pick in <b>{left(new Date(weekly.next_scan).getTime() - now)}</b></> : "Reading the majors…"} />
      <section className="mt-6">
        {!weekly && !wErr && <Empty>{slow ? "Waking the signal server, up to a minute." : "Loading this week’s pick…"}</Empty>}
        {wErr && <Empty><span style={{ color: "var(--rust)" }}>{wErr}</span><br /><button className="btn btn-ghost mt-3" onClick={retry}>Try again</button></Empty>}
        {weekly && !pick && <Empty><span className="display text-4xl block" style={{ color: "var(--ink)" }}>Sitting out</span>Nothing went up last week.</Empty>}
        {pick && p && <>
          <div className="flex items-end justify-between gap-3">
            <div className="display text-[24vw] sm:text-[8rem] leading-none">{pick.ticker === "XAUUSD" ? "Gold" : pick.ticker}</div>
            <span className={`pill ${pick.status === "active" ? "pill-long" : ""} mb-2`}>{pick.status === "active" ? "Buy, active" : pick.status === "target_hit" ? "Target hit" : "Stopped"}</span>
          </div>
          <div className="mt-4"><RBar t={pick} price={pick.status === "active" ? price : null} /></div>
          <div className="grid grid-cols-3 gap-3 mt-5 num">
            <div><div className="text-xs muted">Entry</div><div className="font-semibold">{fmtPrice(pick.entry)}</div></div>
            <div><div className="text-xs muted">Risk</div><div className="font-semibold" style={{ color: "var(--rust)" }}>−{usd(p.riskUsd)}</div></div>
            <div><div className="text-xs muted">Now</div><div className="font-semibold">{price != null ? fmtPrice(price) : "…"}</div></div>
          </div>
          {p.warnings[0] && <p className="text-xs mt-3" style={{ color: "var(--rust)" }}>{p.warnings[0]}</p>}
          <button className="btn btn-ink mt-5 w-full sm:w-auto" onClick={() => onOpen(pick)}>Open the plan</button>
        </>}
        {weekly && <div className="mt-8">
          <h2 className="text-sm font-semibold">Last week</h2>
          <div className="mt-2 grid gap-1.5">{weekly.leaderboard.map((b, i) => { const v = b.week_return_pct ?? 0; return (
            <div key={b.symbol} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-sm num">
              <span className={i === 0 && pick ? "font-bold" : ""}>{b.ticker === "XAUUSD" ? "Gold" : b.ticker}</span>
              <span className="h-2 rounded-full" style={{ background: "var(--paper-2)" }}><span className="block h-2 rounded-full" style={{ width: `${Math.abs(v) / max * 100}%`, background: v >= 0 ? (i === 0 && pick ? "var(--violet)" : "var(--ink-2)") : "var(--rust)" }} /></span>
              <span className="text-right">{v > 0 ? "+" : ""}{v.toFixed(1)}%</span></div>); })}</div>
        </div>}
      </section>
      <MyTrades trades={trades} prices={live.prices} />
    </>
  );
}

/* ------------------------------------------------------------------ Squeeze / Pullback: a live watchlist */

function Watchlist({ k, scan, onOpen, onInfo, trades }: { k: "squeeze" | "pullback"; scan: { res: ScanResult | null; busy: boolean; err: string | null; refresh: () => void }; onOpen: (s: Signal) => void; onInfo: () => void; trades: PaperTrade[] }) {
  const g = GUIDES[k]; const now = useClock(1000);
  const [side, setSide] = useState<"all" | "long" | "short">("all");
  const [chartSym, setChartSym] = useState<string | null>(null);
  const keep = (x: { strategy: string; side: string }) => x.strategy === k && (side === "all" || x.side === side);
  const ready = (scan.res?.signals || []).filter(keep), near = (scan.res?.near || []).filter(keep);
  const sym = chartSym || ready[0]?.symbol || near[0]?.symbol || g.example;
  const live = usePrices([...new Set([...ready.map(s => s.symbol), ...trades.filter(isOpen).map(t => t.symbol)])]);
  const updated = scan.res ? Math.round((now - new Date(scan.res.generated_at).getTime()) / 60000) : null;
  return (
    <>
      <Head g={g} onInfo={onInfo} line={<span className="flex flex-wrap gap-x-4 gap-y-1">
        <span>Next {g.chart.toLowerCase()} close in <b>{left(nextClose(g.tf, now) - now)}</b></span>
        <span className="muted">{scan.busy ? "Checking now…" : updated == null ? "" : `Checked ${updated < 1 ? "just now" : `${updated} min ago`}`}</span></span>} />
      {k === "pullback" && <div className="flex gap-1.5 mt-4" role="tablist" aria-label="Direction">{([["all", "All"], ["long", "Buys"], ["short", "Sells"]] as const).map(([v, l]) =>
        <button key={v} role="tab" aria-selected={side === v} className={`pill !py-1.5 !px-3.5 ${side === v ? "pill-short" : ""}`} onClick={() => setSide(v)}>{l}</button>)}</div>}

      <section className="mt-6">
        <h2 className="font-semibold flex items-center gap-2">Ready now {ready.length > 0 && <span className="count">{ready.length}</span>}</h2>
        {scan.err && !scan.res && <Empty><span style={{ color: "var(--rust)" }}>{scan.err}</span><br /><button className="btn btn-ghost mt-3" onClick={scan.refresh}>Try again</button></Empty>}
        {!scan.res && !scan.err && <Empty>Checking 20 markets…</Empty>}
        {scan.res && !ready.length && <Empty>Nothing ready. Next chance at the {g.chart.toLowerCase()} close.</Empty>}
        <div className="grid gap-3 mt-2">{ready.map(s => { const by = s.enter_by ? new Date(s.enter_by).getTime() - now : null; return (
          <button key={s.id} className="ready" onClick={() => onOpen(s)}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-baseline gap-2"><span className="display text-4xl">{s.ticker}</span><span className={`pill ${s.side === "long" ? "pill-long" : "pill-short"}`}>{s.side === "long" ? "Buy" : "Sell"}</span></span>
              {by != null && <span className="text-xs num text-right" style={{ color: by > 0 ? "var(--ink)" : "var(--rust)" }}>{by > 0 ? <>Enter within<br /><b className="text-base">{left(by)}</b></> : "Too late, skip"}</span>}
            </div>
            <div className="mt-3"><RBar t={s} price={live.prices[s.symbol]?.price} /></div>
          </button>); })}</div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Getting close</h2>
        {scan.res && !near.length && <p className="text-sm muted mt-1">No market is close yet.</p>}
        <div className="mt-1">{near.map(n => <NearLine key={n.symbol + n.side} n={n} active={sym === n.symbol} onPick={() => setChartSym(n.symbol)} />)}</div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold mb-2">{sym.replace("USDT", "") === "GOLD" ? "Gold" : sym.replace("USDT", "")} on the {g.chart.toLowerCase()} chart</h2>
        <IndicatorChart symbol={sym} g={g} levels={ready.find(s => s.symbol === sym) || null} />
      </section>
      <MyTrades trades={trades} prices={live.prices} />
    </>
  );
}

function NearLine({ n, active, onPick }: { n: Near; active: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row !py-3">
      <div className="flex items-center gap-3">
        <button className="flex-1 flex items-center gap-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="display text-2xl w-16">{n.ticker === "XAUUSD" ? "Gold" : n.ticker}</span>
          <span className="text-xs muted w-8">{n.side === "long" ? "Buy" : "Sell"}</span>
          <Dots met={n.met} total={n.total} sell={n.side === "short"} /><span className="text-xs num muted">{n.met}/{n.total}</span>
        </button>
        <button className={`pill !py-1 ${active ? "pill-short" : ""}`} onClick={onPick} aria-pressed={active}>Chart</button>
      </div>
      {open && <div className="mt-3 grid gap-1.5">{n.checks.map(c => <div key={c.label} className="chk"><i className={c.ok ? "on" : "off"}>{c.ok ? "✓" : ""}</i><span className={c.ok ? "" : "muted"}>{c.label}</span></div>)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ the deck */

export default function Deck({ strat, setStrat, scan, weekly, wErr, slow, retryWeekly, store, setStore, hr, onOpen, openSettings }: {
  strat: GuideKey; setStrat: (k: GuideKey) => void; scan: { res: ScanResult | null; busy: boolean; err: string | null; refresh: () => void };
  weekly: Weekly | null; wErr: string | null; slow: boolean; retryWeekly: () => void;
  store: Store; setStore: (s: Store) => void; hr: HighRiskCtl; onOpen: (s: Signal) => void; openSettings: () => void;
}) {
  const [info, setInfo] = useState<GuideKey | null>(null);
  const tradesOf = useMemo(() => (k: GuideKey) => store.paper.filter(t => t.strategy === k), [store.paper]);
  usePaperLive(store, setStore, t => t.strategy !== "scalp");
  const count = (k: GuideKey) => (scan.res?.signals || []).filter(s => s.strategy === k).length;
  const hot = hr.session && hr.session.symbols.some(s => hr.views[s]?.sides?.some(x => x.setup));
  return (
    <div className="max-w-3xl mx-auto px-5 pb-36">
      <div className="switch-wrap"><div className="switch" role="tablist" aria-label="Strategy">
        {ORDER.map(k => (
          <button key={k} role="tab" aria-selected={strat === k} onClick={() => setStrat(k)} className={k === "scalp" ? "hr" : ""}>
            {SWITCH_LABEL[k]}
            {k === "weekly" && weekly?.pick?.status === "active" && <span className="badge" aria-label="active pick">1</span>}
            {(k === "squeeze" || k === "pullback") && count(k) > 0 && <span className="badge" aria-label={`${count(k)} ready`}>{count(k)}</span>}
            {k === "scalp" && hr.session && <span className={`badge live ${hot ? "hot" : ""}`}>{hot ? "Entry" : "Live"}</span>}
          </button>))}
      </div></div>

      {strat === "weekly" && <WeeklyView weekly={weekly} wErr={wErr} slow={slow} store={store} onOpen={onOpen} onInfo={() => setInfo("weekly")} retry={retryWeekly} trades={tradesOf("weekly")} />}
      {(strat === "squeeze" || strat === "pullback") && <Watchlist key={strat} k={strat} scan={scan} onOpen={onOpen} onInfo={() => setInfo(strat)} trades={tradesOf(strat)} />}
      {strat === "scalp" && <HighRisk store={store} setStore={setStore} hr={hr} openSettings={openSettings} onInfo={() => setInfo("scalp")} />}

      {info && <>
        <div className="scrim" onClick={() => setInfo(null)} />
        <aside className="sheet" role="dialog" aria-modal="true" aria-label={`How ${GUIDES[info].name} works`}>
          <div className="flex justify-end"><button className="btn btn-ghost !px-3 !py-2" onClick={() => setInfo(null)}>Close</button></div>
          <StrategyGuide g={GUIDES[info]} />
        </aside></>}
    </div>
  );
}
