"use client";
import { useEffect, useRef, useState } from "react";
import { getPrices, PriceMap } from "./signs";

/** Polls live prices every `everyMs` while the tab is visible; refreshes immediately when you come back to it. */
export function usePrices(symbols: string[], everyMs = 10000) {
  const key = [...new Set(symbols.filter(Boolean))].sort().join(",");
  const [prices, setPrices] = useState<PriceMap>({});
  const [at, setAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try { const r = await getPrices(key.split(",")); if (alive) { setPrices(p => ({ ...p, ...r.prices })); setAt(Date.now()); setStale(false); } }
      catch { if (alive) setStale(true); }
      busy.current = false;
    };
    tick();
    const id = setInterval(tick, everyMs);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [key, everyMs]);
  return { prices, at, stale };
}
