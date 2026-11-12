"use client";
import { useEffect, useState } from "react";
import { Signal, plan, explain, usd, fmtPrice, whenLocal, entryClosed } from "@/lib/signs";
import { Ladder, LiveTag, MiniChart } from "./parts";
import { usePrices } from "@/lib/usePrices";
import { GUIDES, GuideKey } from "@/lib/guides";
import { IndicatorChart, StrategyGuide } from "./Guide";

const TF: Record<string, string> = { weekly: "1d", squeeze: "4h", pullback: "1h" };

export default function SignalSheet({ sig, balance, riskPct, onClose, onPaper, onRisk }: {
  sig: Signal; balance: number; riskPct: number; onClose: () => void; onPaper: (s: Signal, riskUsd: number) => void; onRisk: (r: number) => void;
}) {
  const [ai, setAi] = useState<{ text?: string | null; error?: string; loading?: boolean }>({});
  const [risk, setRisk] = useState(riskPct);
  const live = usePrices([sig.symbol]);
  const price = live.prices[sig.symbol]?.price ?? sig.price ?? null;
  // Taking the setup now fills at the live price; stop and target stay where the strategy put them.
  const entryNow = price ?? sig.entry;
  const up = sig.side === "long";
  const invalid = up ? (entryNow <= sig.sl ? "stop" : entryNow >= sig.tp ? "target" : null) : (entryNow >= sig.sl ? "stop" : entryNow <= sig.tp ? "target" : null);
  const rrNow = Math.abs(sig.tp - entryNow) / Math.abs(entryNow - sig.sl);
  const moved = Math.abs(entryNow - sig.entry) / sig.entry > 0.001;
  const p = plan({ ...sig, entry: entryNow, rr: invalid ? sig.rr : rrNow }, balance, risk);
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
  const late = entryClosed(sig);
  const guide = sig.strategy in GUIDES ? GUIDES[sig.strategy as GuideKey] : null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`${sig.ticker} ${sig.strategy_name} setup`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`pill ${sig.side === "long" ? "pill-long" : "pill-short"}`}>{sig.side === "long" ? "Buy" : "Sell"} setup</span>
            <h2 className="display text-6xl mt-3">{sig.ticker}</h2>
            <p className="muted text-sm mt-1">{sig.name}, {sig.strategy_name}.</p>
          </div>
          <button className="btn btn-ghost !px-3 !py-2" onClick={onClose} aria-label="Close">Close</button>
        </div>

        {sig.chart && (
          <dl className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div><dt className="muted text-xs">Chart</dt><dd className="font-semibold">{sig.chart}</dd></div>
            <div><dt className="muted text-xs">Signal</dt><dd className="font-semibold num">{whenLocal(sig.signal_at)}</dd></div>
            <div><dt className="muted text-xs">Enter by</dt><dd className="font-semibold num">{whenLocal(sig.enter_by)}</dd></div>
          </dl>
        )}
        {sig.how_to_enter && !late && !guide && <p className="text-sm mt-2">{sig.how_to_enter}</p>}
        {late && <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background: "var(--rust)", color: "#fff" }} role="alert">
          <b>The entry window closed {whenLocal(sig.enter_by)}.</b> The tested numbers only apply to prompt entries, so skip this one or paper-trade it only.</div>}
        <p className="text-xs muted mt-2">Exit by {expires.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })} if neither the stop nor the target hits.</p>

        <div className="mt-5">{guide ? <IndicatorChart symbol={sig.symbol} g={guide} levels={sig} /> : <MiniChart sig={sig} tf={TF[sig.strategy] || "1h"} />}</div>
        {guide && <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--paper-2)" }}>
          <p className="text-xs muted mb-1">How {guide.name} works</p><StrategyGuide g={guide} compact /></div>}

        <div className="grid grid-cols-1 min-[400px]:grid-cols-[1fr_1.1fr] gap-6 mt-6 items-start">
          <div><Ladder sig={sig} price={price} height={200} /><div className="mt-2"><LiveTag at={live.at} stale={live.stale} /></div></div>
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

        {moved && !invalid && <p className="text-sm mt-5 num">Entering now fills at <b>{fmtPrice(entryNow)}</b> (the setup’s entry was {fmtPrice(sig.entry)}), so reward to risk becomes <b>1:{rrNow.toFixed(1)}</b>.</p>}
        {invalid && <p className="text-sm mt-5 font-semibold" style={{ color: "var(--rust)" }}>Price is already past the {invalid}, so this setup is no longer valid to enter.</p>}
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
          <button className="btn btn-violet flex-1" disabled={!!invalid}
            onClick={() => onPaper({ ...sig, entry: entryNow, rr: Math.round(rrNow * 100) / 100, reasons: moved ? [...sig.reasons, `Setup entry was ${sig.entry}; filled at the live price`] : sig.reasons }, p.riskUsd)}>Paper trade this</button>
          <button className="btn btn-ghost" onClick={copy}>Copy levels</button>
        </div>
        {sig.symbol === "GOLD" && <p className="text-xs muted mt-4">Gold prices come from Tether Gold (XAUT), which tracks spot gold. Your broker’s XAUUSD can sit a few dollars away; shift the entry, stop and target by the same gap.</p>}
        <p className="text-xs muted mt-4">Backtested results are not a promise. Paper-trade first. Not financial advice.</p>
      </aside>
    </>
  );
}
