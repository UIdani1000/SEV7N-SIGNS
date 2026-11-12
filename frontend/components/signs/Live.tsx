"use client";
import { Signal, fmtPrice } from "@/lib/signs";
import { GUIDES, GuideKey } from "@/lib/guides";

/* ------------------------------------------------------------------ small live pieces */

/** Where price sits between stop (−1R) and target, as one bar. */
export function RBar({ t, price }: { t: Pick<Signal, "entry" | "sl" | "tp" | "side">; price?: number | null }) {
  const risk = Math.abs(t.entry - t.sl) || 1, rr = Math.abs(t.tp - t.entry) / risk;
  const r = price == null ? null : (price - t.entry) / risk * (t.side === "long" ? 1 : -1);
  const pos = (x: number) => `${Math.min(100, Math.max(0, (x + 1) / (rr + 1) * 100))}%`;
  return (
    <div className="rbar" aria-label={r == null ? "Waiting for price" : `${r.toFixed(2)}R: ${r >= 0 ? "in profit" : "in loss"}`}>
      <div className="track"><span className="loss" style={{ width: pos(0) }} /><span className="gain" style={{ left: pos(0) }} />
        {r != null && <span className="now" style={{ left: pos(r) }} />}</div>
      <div className="flex justify-between text-xs num mt-1"><span style={{ color: "var(--rust)" }}>Stop {fmtPrice(t.sl)}</span>
        <b style={{ color: r == null ? "var(--stone)" : r >= 0 ? "var(--violet)" : "var(--rust)" }}>{r == null ? "…" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`}</b>
        <span style={{ color: "var(--violet)" }}>Target {fmtPrice(t.tp)}</span></div>
    </div>
  );
}

/** ●●●○ readiness meter */
export function Dots({ met, total, hot = false, sell = false }: { met: number; total: number; hot?: boolean; sell?: boolean }) {
  return <span className={`dots ${sell ? "sell" : ""}`} aria-label={`${met} of ${total} ready`}>{Array.from({ length: total }, (_, i) =>
    <i key={i} className={i < met ? (hot ? "hot" : "on") : ""} />)}</span>;
}

export function Head({ g, line, onInfo }: { g: (typeof GUIDES)[GuideKey]; line: React.ReactNode; onInfo: () => void }) {
  return (
    <div className="mt-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="display text-6xl sm:text-7xl" style={g.practice ? { color: "var(--rust)" } : {}}>{g.name}</h1>
        <button className="info" onClick={onInfo} aria-label={`How ${g.name} works`}>i</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">{[g.chart + " chart", g.short.enter, g.short.week, g.short.wins].map((x, i) =>
        <span key={x} className="pill" style={g.practice && i === 3 ? { borderColor: "var(--rust)", color: "var(--rust)" } : {}}>{x}</span>)}</div>
      <div className="mt-3 text-sm num">{line}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl p-5 text-center text-sm muted" style={{ background: "var(--paper-2)" }}>{children}</div>;
}

