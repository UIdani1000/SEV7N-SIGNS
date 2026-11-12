"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaperTrade, ScanResult, Store, runScan, tradeStatus } from "./signs";

/** Re-renders every `ms`; returns the current time. */
export function useClock(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

const STEP: Record<string, number> = { "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
/** When the current candle closes (exchange candles are aligned to UTC). */
export function nextClose(tf: string, now = Date.now()) { const s = STEP[tf]; return Math.floor(now / s) * s + s; }

/** 1:42:05, 12:05 or 0:42 */
export function left(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  if (t >= 86400) { const d = Math.floor(t / 86400); return `${d}d ${h % 24}h`; }
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** One scan for every strategy, refreshed on its own: every 5 minutes, just after each hour closes, and when the app comes back into view. */
export function useLiveScan() {
  const [res, setRes] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return; running.current = true; setBusy(true);
    try { setRes(await runScan("all")); setErr(null); } catch (e) { setErr((e as Error).message); }
    running.current = false; setBusy(false);
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60000);
    let hourT: ReturnType<typeof setTimeout>;
    const atHour = () => { hourT = setTimeout(() => { refresh(); atHour(); }, nextClose("1h") - Date.now() + 90000); };   // 90 s after each close
    atHour();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); clearTimeout(hourT); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);
  return { res, busy, err, refresh };
}

export const isOpen = (t: PaperTrade) => !t.result || t.result.status === "open" || t.result.status === "unknown";

/** Keeps results of the matching open paper trades up to date (checked every minute). */
export function usePaperLive(store: Store, setStore: (s: Store) => void, match: (t: PaperTrade) => boolean) {
  const storeRef = useRef(store); storeRef.current = store;
  const matchRef = useRef(match); matchRef.current = match;
  const setRef = useRef(setStore); setRef.current = setStore;     // the parent's setter changes every render
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const open = storeRef.current.paper.filter(t => matchRef.current(t) && isOpen(t));
      if (!open.length) return;
      try {
        const r = await tradeStatus(open); if (!alive) return;
        const by = new Map(r.trades.map(u => [u.id, u]));
        const cur = storeRef.current;
        if (r.trades.some(u => u.status !== "open")) setRef.current({ ...cur, paper: cur.paper.map(t => by.has(t.id) ? { ...t, result: by.get(t.id)! } : t) });
      } catch { /* next minute */ }
    };
    run(); const id = setInterval(run, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);
}
