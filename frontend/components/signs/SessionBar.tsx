"use client";
import { useEffect, useState } from "react";
import { HighRiskCtl, tickerOf } from "@/lib/highrisk";
import { clock } from "./HighRisk";

/** Floating High Risk status on every screen while a session runs. */
export default function SessionBar({ hr, onOpen }: { hr: HighRiskCtl; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = hr.session; if (!s) return null;
  const hot = s.symbols.map(sym => ({ sym, st: hr.views[sym]?.sides?.find(x => x.setup)?.setup })).find(x => x.st);
  return (
    <button className={`session-bar ${hot ? "hot" : ""}`} onClick={onOpen} aria-label="Open High Risk session">
      <span className="font-bold tracking-wide">HIGH RISK</span>
      <span className="num font-semibold">{clock(Math.max(0, s.endAt - now))}</span>
      <span className="truncate">{hot ? `🚨 ${hot.st!.side === "long" ? "Buy" : "Sell"} ${tickerOf(hot.sym)} now` : `Watching ${s.symbols.map(tickerOf).join(", ")}`}</span>
    </button>
  );
}
