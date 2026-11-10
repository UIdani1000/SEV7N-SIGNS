"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Mark from "@/components/signs/Mark";
import { Ladder, LiveTag, NearRow, SignalRow } from "@/components/signs/parts";
import { usePrices } from "@/lib/usePrices";
import SignalSheet from "@/components/signs/SignalSheet";
import Paper from "@/components/signs/Paper";
import Ask from "@/components/signs/Ask";
import Settings from "@/components/signs/Settings";
import Markets from "@/components/signs/Markets";
import Prop from "@/components/signs/Prop";
import Lab from "@/components/signs/Lab";
import HighRisk from "@/components/signs/HighRisk";
import Account from "@/components/signs/Account";
import Tools, { ToolView } from "@/components/signs/Tools";
import type { User } from "firebase/auth";
import { listen, merge, pull, push, watchUser } from "@/lib/sync";
import { useHighRisk, useSignalWatch } from "@/lib/highrisk";
import { registerSW, unlockSound } from "@/lib/alerts";
import SessionBar from "@/components/signs/SessionBar";
import { DEFAULTS, ScanResult, Signal, Store, Weekly, getWeekly, load, plan, runScan, save, stamp, usd } from "@/lib/signs";

type View = "deck" | "markets" | "paper" | "ask" | ToolView;
const SWEEP_LONG = ["Reading 20 markets", "Checking daily trends", "Looking for 4h squeezes", "Checking 1h pullbacks", "Ranking this week’s trend"];
const SWEEP_SHORT = ["Reading 20 markets", "Finding daily downtrends", "Checking 4h momentum", "Waiting for 1h rejections"];

function useScan(side: "long" | "short") {
  const [res, setRes] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0); const [fill, setFill] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const go = useCallback(async () => {
    setBusy(true); setErr(null); setStep(0); setFill(6);
    const steps = side === "long" ? SWEEP_LONG : SWEEP_SHORT; let i = 0;
    timer.current = setInterval(() => { i++; setStep(Math.min(i, steps.length - 1)); setFill(f => Math.min(92, f + (92 - f) * 0.25)); }, 1100);
    try { setRes(await runScan(side)); setFill(100); }
    catch (e: unknown) { setErr((e as Error).message); setFill(0); }
    if (timer.current) clearInterval(timer.current);
    setBusy(false);
  }, [side]);
  return { res, busy, err, step, fill, go, steps: side === "long" ? SWEEP_LONG : SWEEP_SHORT };
}

export default function Home() {
  const [store, setStoreState] = useState<Store>(DEFAULTS);
  const [view, setView] = useState<View>("deck");
  const [weekly, setWeekly] = useState<Weekly | null>(null); const [wErr, setWErr] = useState<string | null>(null); const [slow, setSlow] = useState(false);
  const [open, setOpen] = useState<Signal | null>(null); const [settings, setSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const longScan = useScan("long"), shortScan = useScan("short");

  const [tools, setTools] = useState(false);
  const [user, setUser] = useState<User | null>(null); const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const storeRef = useRef<Store>(DEFAULTS); const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const s = load(); storeRef.current = s; setStoreState(s); }, []);
  useEffect(() => {   // service worker for notifications; first tap anywhere unlocks the siren on phones
    registerSW();
    const once = () => unlockSound(); window.addEventListener("pointerdown", once, { once: true });
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "open") window.focus(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { window.removeEventListener("pointerdown", once); navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, []);
  const apply = useCallback((s: Store) => { storeRef.current = s; setStoreState(s); save(s); }, []);
  const setStore = (s0: Store) => {
    const s = stamp(s0); apply(s);
    if (user) { if (pushTimer.current) clearTimeout(pushTimer.current); pushTimer.current = setTimeout(() => push(user.uid, s).then(() => setSyncedAt(Date.now())).catch(() => {}), 1200); }
  };
  useEffect(() => watchUser(async u => {
    setUser(u); if (!u) return;
    try { const merged = merge(storeRef.current, await pull(u.uid)); apply(merged); await push(u.uid, merged); setSyncedAt(Date.now()); } catch { /* shown in Sync */ }
  }), [apply]);
  useEffect(() => { if (!user) return; return listen(user.uid, remote => {
    if ((remote.updatedAt || 0) > (storeRef.current.updatedAt || 0)) { apply(merge(storeRef.current, remote)); setSyncedAt(Date.now()); }
  }); }, [user, apply]);
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 3200); }, []);
  const loadWeekly = useCallback(() => {
    setWErr(null); setSlow(false); const t = setTimeout(() => setSlow(true), 6000);
    getWeekly().then(setWeekly).catch(e => setWErr(e.message)).finally(() => clearTimeout(t));
  }, []);
  useEffect(() => { loadWeekly(); }, [loadWeekly]);

  const paperTrade = (s: Signal, riskUsd: number) => {
    if (store.paper.some(t => t.id === s.id)) { toast("This setup is already in your paper book."); return; }
    setStore({ ...store, paper: [...store.paper, { ...s, opened_at: new Date().toISOString(), risk_usd: riskUsd }] });
    setOpen(null); toast(`Paper trade opened: ${s.side === "long" ? "buy" : "sell"} ${s.ticker}, risking ${usd(riskUsd)}.`);
  };

  const pick = weekly?.pick;
  const live = usePrices(view === "deck" && pick ? [pick.symbol] : []);
  const pickPrice = pick ? (live.prices[pick.symbol]?.price ?? pick.price ?? null) : null;
  const hr = useHighRisk(store, setStore, toast);
  useSignalWatch(store, toast);
  const pickPlan = pick ? plan(pick, store.balance, store.riskPct) : null;
  const statusLine: Record<string, string> = { active: "Active this week", stopped: "Stopped out this week", target_hit: "Target hit this week" };

  return (
    <main className="min-h-dvh">
      <header className="max-w-6xl mx-auto px-5 pt-5 md:pt-20 flex items-center justify-between">
        <div className="flex items-center gap-3" aria-label="SEV7N SIGNS"><Mark size={30} /><span className="wordmark max-[359px]:hidden">SEV7N SIGNS</span></div>
        <div className="flex items-center gap-2">
          {user ? <button className="w-9 h-9 rounded-full grid place-items-center display text-lg shrink-0" style={{ background: "var(--violet)", color: "var(--violet-ink)" }} onClick={() => setView("sync")} aria-label={`Account: ${user.email}`}>{(user.email || "?")[0].toUpperCase()}</button>
            : <button className="pill !py-2 !px-3 font-semibold whitespace-nowrap" onClick={() => setView("sync")}>Sign in</button>}
          <button className="pill num !py-2 !px-3 whitespace-nowrap" onClick={() => setSettings(true)} aria-label={`Balance ${usd(store.balance)}, risk ${store.riskPct}% per trade. Edit`}>{usd(store.balance)} at {store.riskPct}%<span className="hidden min-[420px]:inline">&nbsp;risk</span></button>
        </div>
      </header>

      {view === "deck" && <div className="max-w-6xl mx-auto px-5 pb-32 grid lg:grid-cols-[1.25fr_1fr] gap-10 lg:gap-14 mt-6">
        {/* HERO: this week's Weekly Trend pick */}
        <section aria-label="This week's Weekly Trend pick">
          <p className="text-sm font-semibold">This week’s trend pick</p>
          {!weekly && !wErr && <div className="mt-4"><div className="display text-[22vw] lg:text-[9rem] opacity-20">Loading</div>
            <p className="muted text-sm">{slow ? "Waking the signal server. The first load can take up to a minute." : "Reading the majors…"}</p></div>}
          {wErr && <div className="mt-4"><p style={{ color: "var(--rust)" }}>{wErr}</p><button className="btn btn-ghost mt-3" onClick={loadWeekly}>Try again</button></div>}
          {weekly && !pick && <div className="mt-2">
            <h1 className="display text-[22vw] lg:text-[9.5rem]">Sitting out</h1>
            <p className="mt-3 max-w-prose">{weekly.note} Next pick: {new Date(weekly.next_scan).toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })}.</p>
          </div>}
          {pick && pickPlan && <div className="mt-1">
            <h1 className="display text-[26vw] lg:text-[11rem] leading-none">{pick.ticker}</h1>
            <p className="mt-3 text-[1.05rem] max-w-prose">Weekly Trend says <b>buy {pick.name}</b>. {statusLine[pick.status || "active"]}{pick.status === "active" ? `; exit by ${new Date(weekly!.next_scan).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "."}</p>
            <div className="grid sm:grid-cols-[1fr_1fr] gap-8 mt-7 items-start">
              <div><Ladder sig={pick} price={pickPrice} height={230} /><div className="mt-9"><LiveTag at={live.at} stale={live.stale} /></div></div>
              <div className="num grid gap-3 content-start">
                <div><div className="text-sm muted">Size on {usd(store.balance)} at {store.riskPct}%</div><div className="font-semibold text-lg">{pickPlan.unitLabel}</div>
                  {pickPlan.warnings[0] && <p className="text-sm mt-1" style={{ color: "var(--rust)" }}>{pickPlan.warnings[0]}</p>}</div>
                <div className="flex gap-6"><div><div className="text-sm muted">Risk</div><div className="font-semibold" style={{ color: "var(--rust)" }}>−{usd(pickPlan.riskUsd)}</div></div>
                  <div><div className="text-sm muted">Target</div><div className="font-semibold" style={{ color: "var(--violet)" }}>+{usd(pickPlan.targetUsd)}</div></div></div>
                <button className="btn btn-ink mt-2" onClick={() => setOpen(pick)}>Open the plan</button>
              </div>
            </div>
          </div>}
          {weekly && <div className="mt-10">
            <p className="text-sm font-semibold">Last week, volatility-adjusted</p>
            <div className="mt-3 grid grid-cols-5 gap-2 num">{weekly.leaderboard.map((b, i) => (
              <div key={b.symbol} className="text-center rounded-xl py-3" style={{ background: i === 0 && pick ? "var(--ink)" : "var(--paper-2)", color: i === 0 && pick ? "var(--paper)" : "var(--ink)" }}>
                <div className="display text-2xl">{b.ticker === "XAUUSD" ? "Gold" : b.ticker}</div>
                <div className="text-xs mt-1">{b.week_return_pct != null ? `${b.week_return_pct > 0 ? "+" : ""}${b.week_return_pct}%` : "–"}</div>
              </div>))}</div>
          </div>}
        </section>

        {/* SCAN */}
        <section aria-label="Scan markets">
          <ScanBlock scan={longScan} title="Scan markets" sub="Runs every strategy on 20 markets and shows what is ready, and what is close." onOpen={setOpen} />
          <div className="mt-10">
            <p className="text-sm font-semibold">What the scan runs</p>
            {[["Weekly Trend", "Strongest weekly uptrend among BTC, ETH, SOL, XRP and gold. Picked every Monday.", "48% wins, +0.20R, about 1 a week"],
              ["Squeeze Breakout", "A quiet 4h squeeze that breaks out in the direction of the daily trend.", "32% wins, +0.15R, about 1–2 a week"],
              ["Trend Pullback", "Your EMA and MACD rules, one timeframe up: daily trend, 4h momentum, 1h entry.", "35% wins, +0.08R, about 3–5 a week"]].map(([n, d, st]) => (
              <div key={n} className="row"><div className="flex justify-between gap-4"><span className="font-semibold">{n}</span><span className="text-xs muted num text-right">{st}</span></div>
                <p className="text-sm muted mt-1">{d}</p></div>))}
            <p className="text-xs muted mt-3">Records from 2020–2026 backtests at 1:3 with fees. R is the amount risked per trade.</p>
          </div>
        </section>
      </div>}

      {view === "shorts" && <div className="max-w-3xl mx-auto px-5 pt-6 pb-32">
        <h1 className="display text-7xl">Shorts</h1>
        <p className="muted mt-2 max-w-prose">Sell setups from the Trend Pullback rules, the only short-side logic that held up in testing (about 36% wins at 1:3). Stops and targets come from the chart.</p>
        <div className="mt-6"><ScanBlock scan={shortScan} title="Scan for short entries" sub="Looks for daily downtrends with a fresh 1h rejection." onOpen={setOpen} /></div>
      </div>}

      {view === "markets" && <Markets pair={store.pair || "BTCUSDT"} setPair={p => setStore({ ...store, pair: p })} onOpen={setOpen} />}
      {view === "paper" && <Paper store={store} setStore={setStore} toast={toast} signedIn={!!user} onSignIn={() => setView("sync")} />}
      {view === "prop" && <Prop store={store} setStore={setStore} toast={toast} />}
      {view === "lab" && <Lab store={store} />}
      {view === "highrisk" && <HighRisk store={store} hr={hr} openSettings={() => setSettings(true)} />}
      {view !== "highrisk" && <SessionBar hr={hr} onOpen={() => setView("highrisk")} />}
      {view === "sync" && <Account user={user} syncedAt={syncedAt} toast={toast} trades={store.paper.length} />}
      {view === "ask" && <Ask />}

      <nav className="dock" aria-label="Main">
        {(["deck", "markets", "paper", "ask"] as View[]).map(v => (
          <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{({ deck: "Deck", markets: "Markets", paper: "Paper", ask: "Ask AI" } as Record<string, string>)[v]}</button>
        ))}
        <button aria-current={["shorts", "prop", "lab", "highrisk", "sync"].includes(view) ? "page" : undefined} onClick={() => setTools(true)}>Tools</button>
      </nav>

      {open && <SignalSheet sig={open} balance={store.balance} riskPct={store.riskPct} onClose={() => setOpen(null)} onPaper={paperTrade}
        onRisk={r => r !== store.riskPct && setStore({ ...store, riskPct: r })} />}
      {tools && <Tools onClose={() => setTools(false)} onPick={v => { setTools(false); if (v === "settings") setSettings(true); else setView(v); }} />}
      {settings && <Settings store={store} setStore={setStore} onClose={() => setSettings(false)} toast={toast} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </main>
  );
}

function ScanBlock({ scan, title, sub, onOpen }: { scan: ReturnType<typeof useScan>; title: string; sub: string; onOpen: (s: Signal) => void }) {
  const { res, busy, err, step, fill, go, steps } = scan;
  return (
    <div>
      <button className="scan-slab" onClick={go} disabled={busy} aria-busy={busy}>
        <span className="fill" style={{ width: `${fill}%`, opacity: busy ? .9 : 0 }} />
        <span className="display text-4xl block">{busy ? steps[step] : res ? "Scan again" : title}</span>
        <span className="text-sm opacity-80 block mt-1">{busy ? "This takes a few seconds." : res ? `Last scan ${new Date(res.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, ${res.markets_scanned} markets in ${res.seconds}s.` : sub}</span>
      </button>
      {err && <p className="mt-3 text-sm" style={{ color: "var(--rust)" }}>{err}</p>}
      {res && !busy && <div className="mt-6">
        <h2 className="font-semibold">{res.signals.length ? `Ready now (${res.signals.length})` : "Nothing is ready right now"}</h2>
        {!res.signals.length && <p className="text-sm muted mt-1">{res.near.length ? "That is normal: these strategies wait for clean setups. The closest ones are below." : "No market is close yet either. The hourly scan will alert you on Telegram when one forms."}</p>}
        <div className="reveal">{res.signals.map(s => <SignalRow key={s.id} sig={s} onOpen={onOpen} />)}</div>
        {res.near.length > 0 && <><h2 className="font-semibold mt-6">Close to ready</h2>
          <div className="reveal">{res.near.map(n => <NearRow key={`${n.strategy}${n.symbol}${n.side}`} n={n} />)}</div></>}
        {res.errors.length > 0 && <p className="text-xs muted mt-4">Skipped {res.errors.map(e => e.symbol).join(", ")} (no data).</p>}
        <p className="text-xs muted mt-4">Signals use completed candles from live exchange data.</p>
      </div>}
    </div>
  );
}
