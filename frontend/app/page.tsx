"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Mark from "@/components/signs/Mark";
import SignalSheet from "@/components/signs/SignalSheet";
import Paper from "@/components/signs/Paper";
import Ask from "@/components/signs/Ask";
import Settings from "@/components/signs/Settings";
import Markets from "@/components/signs/Markets";
import Prop from "@/components/signs/Prop";
import Lab from "@/components/signs/Lab";
import Account from "@/components/signs/Account";
import Tools, { ToolView } from "@/components/signs/Tools";
import Deck from "@/components/signs/Deck";
import { GuideKey, ORDER } from "@/lib/guides";
import { useLiveScan } from "@/lib/live";
import type { User } from "firebase/auth";
import { listen, merge, pull, push, watchUser } from "@/lib/sync";
import { useHighRisk, useSignalWatch } from "@/lib/highrisk";
import { registerSW, unlockSound } from "@/lib/alerts";
import SessionBar from "@/components/signs/SessionBar";
import { DEFAULTS, Signal, Store, Weekly, getWeekly, load, save, stamp, usd } from "@/lib/signs";

type View = "deck" | "markets" | "paper" | "ask" | ToolView;
export default function Home() {
  const [store, setStoreState] = useState<Store>(DEFAULTS);
  const [view, setView] = useState<View>("deck");
  const [weekly, setWeekly] = useState<Weekly | null>(null); const [wErr, setWErr] = useState<string | null>(null); const [slow, setSlow] = useState(false);
  const [open, setOpen] = useState<Signal | null>(null); const [settings, setSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const scan = useLiveScan();
  const [strat, setStratState] = useState<GuideKey>("weekly");
  useEffect(() => { try { const k = localStorage.getItem("sev7n-strat") as GuideKey | null; if (k && ORDER.includes(k)) setStratState(k); } catch { /* blocked */ } }, []);
  const setStrat = (k: GuideKey) => { setStratState(k); try { localStorage.setItem("sev7n-strat", k); } catch { /* blocked */ } };

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

  const hr = useHighRisk(store, setStore, toast);
  useSignalWatch(store, toast);

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

      {view === "deck" && <Deck strat={strat} setStrat={setStrat} scan={scan} weekly={weekly} wErr={wErr} slow={slow} retryWeekly={loadWeekly}
        store={store} setStore={setStore} hr={hr} onOpen={setOpen} openSettings={() => setSettings(true)} />}

      {view === "markets" && <Markets pair={store.pair || "BTCUSDT"} setPair={p => setStore({ ...store, pair: p })} onOpen={setOpen} />}
      {view === "paper" && <Paper store={store} setStore={setStore} toast={toast} signedIn={!!user} onSignIn={() => setView("sync")} />}
      {view === "prop" && <Prop store={store} setStore={setStore} toast={toast} />}
      {view === "lab" && <Lab store={store} />}
      {!(view === "deck" && strat === "scalp") && <SessionBar hr={hr} onOpen={() => { setView("deck"); setStrat("scalp"); }} />}
      {view === "sync" && <Account user={user} syncedAt={syncedAt} toast={toast} trades={store.paper.length} />}
      {view === "ask" && <Ask />}

      <nav className="dock" aria-label="Main">
        {(["deck", "markets", "paper", "ask"] as View[]).map(v => (
          <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{({ deck: "Signals", markets: "Markets", paper: "Paper", ask: "Ask AI" } as Record<string, string>)[v]}</button>
        ))}
        <button aria-current={["prop", "lab", "sync"].includes(view) ? "page" : undefined} onClick={() => setTools(true)}>Tools</button>
      </nav>

      {open && <SignalSheet sig={open} balance={store.balance} riskPct={store.riskPct} onClose={() => setOpen(null)} onPaper={paperTrade}
        onRisk={r => r !== store.riskPct && setStore({ ...store, riskPct: r })} />}
      {tools && <Tools onClose={() => setTools(false)} onPick={v => { setTools(false); if (v === "settings") setSettings(true); else setView(v); }} />}
      {settings && <Settings store={store} setStore={setStore} onClose={() => setSettings(false)} toast={toast} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </main>
  );
}
