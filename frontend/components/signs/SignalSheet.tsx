"use client";
import { useEffect, useState } from "react";
import { Signal, plan, explain, usd } from "@/lib/signs";
import { Ladder, LiveTag, MiniChart } from "./parts";
import { usePrices } from "@/lib/usePrices";

const TF: Record<string, string> = { weekly: "1d", squeeze: "4h", pullback: "1h" };

export default function SignalSheet({ sig, balance, riskPct, onClose, onPaper, onRisk }: {
  sig: Signal; balance: number; riskPct: number; onClose: () => void; onPaper: (s: Signal, riskUsd: number) => void; onRisk: (r: number) => void;
}) {
  const [ai, setAi] = useState<{ text?: string | null; error?: string; loading?: boolean }>({});
  const [risk, setRisk] = useState(riskPct);
  const p = plan(sig, balance, risk);
  const live = usePrices([sig.symbol]);
  const price = live.prices[sig.symbol]?.price ?? sig.price ?? null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const ask = async () => {
    setAi({ loading: true });
    try { const r = await explain(sig); setAi(r.text ? { text: r.text } : { error: r.error || "No explanation returned." }); }
    catch (e: unknown) { setAi({ error: (e as Error).message }); }
  };
  const copy = async () => {
    const txt = `${sig.side === "long" ? "BUY" : "SELL"} ${sig.ticker}\nEntry ${sig.entry}\nStop ${sig.sl}\nTarget ${sig.tp}`;
    try { await navigator.clipboard.writeText(txt); } catch { /* clipboard blocked */ }
  };
  const expires = new Date(sig.expires);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`${sig.ticker} ${sig.strategy_name} setup`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`pill ${sig.side === "long" ? "pill-long" : "pill-short"}`}>{sig.side === "long" ? "Buy" : "Sell"} setup</span>
            <h2 className="display text-6xl mt-3">{sig.ticker}</h2>
            <p className="muted text-sm mt-1">{sig.name}, {sig.strategy_name}. Valid until {expires.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.</p>
          </div>
          <button className="btn btn-ghost !px-3 !py-2" onClick={onClose} aria-label="Close">Close</button>
        </div>

        <div className="mt-5"><MiniChart sig={sig} tf={TF[sig.strategy]} /></div>

        <div className="grid grid-cols-1 min-[400px]:grid-cols-[1fr_1.1fr] gap-6 mt-6 items-start">
          <div><Ladder sig={sig} price={price} height={200} /><div className="mt-9"><LiveTag at={live.at} stale={live.stale} /></div></div>
          <div className="grid gap-3">
            <label className="text-sm font-semibold">Risk per trade
              <div className="flex items-center gap-2 mt-1">
                <input className="field num" type="number" min={0.25} max={25} step={0.25} value={risk}
                  onChange={e => setRisk(Math.max(0, Number(e.target.value)))} onBlur={() => onRisk(risk)} />
                <span className="muted">%</span>
              </div>
            </label>
            <div className="num">
              <div className="text-sm muted">Position</div><div className="font-semibold">{p.unitLabel}</div>
              <div className="text-sm muted mt-2">If stopped</div><div className="font-semibold" style={{ color: "var(--rust)" }}>−{usd(p.riskUsd)}</div>
              <div className="text-sm muted mt-2">If target hits</div><div className="font-semibold" style={{ color: "var(--violet)" }}>+{usd(p.targetUsd)}</div>
            </div>
          </div>
        </div>

        {p.warnings.length > 0 && (
          <div className="mt-5 rounded-2xl p-4 grid gap-2" style={{ background: "var(--paper-2)" }} role="status">
            <div className="font-semibold text-sm">Risk Guardian</div>
            {p.warnings.map(w => <p key={w} className="text-sm">{w}</p>)}
          </div>
        )}

        <div className="mt-6">
          <h3 className="font-semibold">Why this setup</h3>
          <ul className="mt-2 grid gap-1.5 text-sm">{sig.reasons.map(r => <li key={r} className="chk"><i className="on">✓</i><span>{r}</span></li>)}</ul>
          <p className="text-sm muted mt-3">Tested record: wins about {sig.stats.win_rate}% of trades, averages +{sig.stats.avg_r}R after costs, profitable in {sig.stats.years_positive} years. Worst losing streak: {sig.stats.worst_losing_streak} trades.</p>
          {!ai.text && <button className="btn btn-ghost mt-4 text-sm" onClick={ask} disabled={ai.loading}>{ai.loading ? "Asking the analyst…" : "Explain it in plain English"}</button>}
          {ai.text && <p className="mt-4 text-[0.95rem] leading-relaxed">{ai.text}</p>}
          {ai.error && <p className="mt-3 text-sm" style={{ color: "var(--rust)" }}>{ai.error}</p>}
        </div>

        <div className="flex flex-wrap gap-3 mt-7">
          <button className="btn btn-violet flex-1" onClick={() => onPaper(sig, p.riskUsd)}>Paper trade this</button>
          <button className="btn btn-ghost" onClick={copy}>Copy levels</button>
        </div>
        <p className="text-xs muted mt-4">Backtested results are not a promise. Paper-trade first. Not financial advice.</p>
      </aside>
    </>
  );
}
