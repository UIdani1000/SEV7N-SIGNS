"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_DEFAULTS, PaperTrade, SCALP_STATS, ScalpView, Store, fmtPrice, getScalpMany, runScan, setServerSession, stopServerSession } from "./signs";
import { alertEntry } from "./alerts";

export interface HRSession { endAt: number; symbols: string[]; auto: boolean; startedAt: number }
export interface HRLog { at: number; text: string }
const KEY = "sev7n-hr-session";
export const tickerOf = (s: string) => (s === "GOLD" ? "Gold" : s.replace("USDT", ""));

/** App-level High Risk session: keeps running across screens and reloads; markets can change mid-session. */
export function useHighRisk(store: Store, setStore: (s: Store) => void, toast: (m: string) => void) {
  const [session, setSessionState] = useState<HRSession | null>(null);
  const [views, setViews] = useState<Record<string, ScalpView & { error?: string }>>({});
  const [log, setLog] = useState<HRLog[]>([]);
  const [server, setServer] = useState<{ active: boolean; telegram: boolean } | null>(null);
  const storeRef = useRef(store); storeRef.current = store;
  const seen = useRef<Set<string>>(new Set());
  const liveId = useRef<number | null>(null);            // startedAt of the running session; null once ended
  const pendingPost = useRef<Promise<unknown> | null>(null);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.endAt > Date.now()) save(s); } catch { /* none */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (s: HRSession | null) => { liveId.current = s ? s.startedAt : null; setSessionState(s); try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* blocked */ } };

  const tick = useCallback(async (s: HRSession) => {
    if (liveId.current !== s.startedAt) return;       // ended while this check was queued
    pendingPost.current = setServerSession(s.symbols, new Date(s.endAt).toISOString()).then(setServer).catch(() => setServer(null));
    try {
      const r = await getScalpMany(s.symbols);
      const next: Record<string, ScalpView & { error?: string }> = {};
      for (const m of r.markets) {
        next[m.symbol] = m;
        for (const side of m.sides || []) {
          const st = side.setup; if (!st || seen.current.has(st.id)) continue;
          seen.current.add(st.id);
          const prefs = storeRef.current.alerts || ALERT_DEFAULTS;
          const what = `${st.side === "long" ? "Buy" : "Sell"} ${tickerOf(m.symbol)} at ${fmtPrice(st.entry)}`;
          alertEntry({ title: `🚨 High Risk entry: ${what}`, body: `Stop ${fmtPrice(st.sl)}, target ${fmtPrice(st.tp)}. Close by ${new Date(st.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Paper only.`, tag: st.id, sound: prefs.sound, push: prefs.push });
          setLog(l => [{ at: Date.now(), text: `${what}, close by ${new Date(st.expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` }, ...l].slice(0, 30));
          toast(`High Risk entry: ${what}.`);
          if (s.auto && !storeRef.current.paper.some(t => t.id === st.id)) {
            const risk = Math.min(storeRef.current.riskPct, 2) / 100 * storeRef.current.balance;
            const t = { ...st, ticker: m.symbol === "GOLD" ? "XAUUSD" : m.symbol.replace("USDT", ""), name: tickerOf(m.symbol), reasons: side.checks.map(c => c.label), risk_pct_of_price: 0,
              stats: { name: "High Risk scalp", win_rate: SCALP_STATS.win_rate, avg_r: SCALP_STATS.avg_r, per_week: "", years_positive: "0 of 3", worst_losing_streak: 0, hold: "60 min", max_risk_hint: 2 },
              opened_at: new Date().toISOString(), risk_usd: risk } as unknown as PaperTrade;
            setStore({ ...storeRef.current, paper: [...storeRef.current.paper, t] });
          }
        }
      }
      setViews(v => ({ ...v, ...next }));
    } catch { /* keep the last view; the bar shows how old it is */ }
  }, [setStore, toast]);

  useEffect(() => {
    if (!session) return;
    tick(session);
    const id = setInterval(() => tick(session), 60000);
    const endT = setTimeout(() => { save(null); Promise.resolve(pendingPost.current).catch(() => {}).then(() => stopServerSession()).catch(() => {}); toast("High Risk session finished. Results keep updating in Paper."); }, Math.max(0, session.endAt - Date.now()));
    const onVis = () => { if (document.visibilityState === "visible") tick(session); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); clearTimeout(endT); document.removeEventListener("visibilitychange", onVis); };
  }, [session, tick, toast]);

  return {
    session, views, log, server,
    start: (symbols: string[], minutes: number, auto: boolean) => { setLog([]); setViews({}); save({ symbols, endAt: Date.now() + minutes * 60000, auto, startedAt: Date.now() }); },
    stop: () => {
      save(null); toast("High Risk session ended.");
      // wait for any in-flight registration so the stop always lands last
      Promise.resolve(pendingPost.current).catch(() => {}).then(() => stopServerSession()).catch(() => {});
    },
    setSymbols: (symbols: string[]) => session && symbols.length && save({ ...session, symbols }),
    extend: (minutes: number) => session && save({ ...session, endAt: Math.min(session.endAt + minutes * 60000, Date.now() + 240 * 60000) }),
    setAuto: (auto: boolean) => session && save({ ...session, auto }),
  };
}
export type HighRiskCtl = ReturnType<typeof useHighRisk>;

/** Alerts for new swing signals (longs, shorts) while the app is open; checks every 10 minutes. */
export function useSignalWatch(store: Store, toast: (m: string) => void) {
  const storeRef = useRef(store); storeRef.current = store;
  useEffect(() => {
    let alive = true;
    const KEY_SEEN = "sev7n-seen-signals";
    const run = async () => {
      const prefs = storeRef.current.alerts || ALERT_DEFAULTS;
      if (!prefs.swing) return;
      try {
        const r = await runScan("all");
        const raw = localStorage.getItem(KEY_SEEN); const firstEver = raw === null;
        const seen = new Set<string>(JSON.parse(raw || "[]"));
        const fresh = r.signals.filter(s => !seen.has(s.id));
        r.signals.forEach(s => seen.add(s.id));
        localStorage.setItem(KEY_SEEN, JSON.stringify([...seen].slice(-300)));
        if (!alive || firstEver) return;            // first visit: remember current signals without alerting on them
        for (const s of fresh) {
          const what = `${s.side === "long" ? "Buy" : "Sell"} ${s.ticker} (${s.strategy_name})`;
          alertEntry({ title: `🚨 New signal: ${what}`, body: `Entry ${fmtPrice(s.entry)}, stop ${fmtPrice(s.sl)}, target ${fmtPrice(s.tp)}.`, tag: s.id, sound: prefs.sound, push: prefs.push });
          toast(`New signal: ${what}.`);
        }
      } catch { /* try again next time */ }
    };
    run();
    const id = setInterval(run, 600000);
    return () => { alive = false; clearInterval(id); };
  }, []);
}
