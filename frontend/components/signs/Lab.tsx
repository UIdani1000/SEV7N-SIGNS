"use client";
import { useState } from "react";
import { Cond, LabReport, Rules, Store, labParse, labRun, usd } from "@/lib/signs";

const MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "GOLD"];
const SAMPLE = `Trend: on the 1 hour chart, the 21 EMA must be above the 50 EMA for buys (below for sells).
Entry on the 15 minute chart: price pulls back to touch the 21 EMA, then a bullish engulfing or hammer candle closes above it.
Filters: RSI(14) above 48 and MACD histogram above 0 for buys (RSI below 52 and histogram below 0 for sells).
Stop loss just beyond the pullback low/high. Take profit at 3 times the stop distance. Claimed win rate: 42%.`;

function ser(s: Record<string, unknown> | undefined): string {
  if (!s) return "?"; if ("value" in s) return String(s.value);
  const p = s.period as number | undefined;
  return ({ close: "price", open: "open", high: "high", low: "low", ema: `${p} EMA`, sma: `${p} SMA`, rsi: `RSI(${p ?? 14})`, macd: "MACD line", macd_signal: "MACD signal",
    macd_hist: "MACD histogram", atr: `ATR(${p ?? 14})`, bb_upper: "upper Bollinger band", bb_mid: "middle Bollinger band", bb_lower: "lower Bollinger band", stoch_k: "Stochastic %K", stoch_d: "Stochastic %D" } as Record<string, string>)[s.ind as string] || String(s.ind);
}
function say(c: Cond, base: string): string {
  const tf = c.tf && c.tf !== base ? `${c.tf}: ` : "";
  const a = c.a as Record<string, unknown>, b = c.b as Record<string, unknown>;
  switch (c.type) {
    case "compare": return `${tf}${ser(a)} ${c.op === ">" ? "above" : "below"} ${ser(b)}`;
    case "cross": return `${tf}${ser(a)} crosses ${c.dir} ${ser(b)} (within ${c.within} candle${c.within === 1 ? "" : "s"})`;
    case "touch": return `${tf}price ${c.from === "above" ? "pulls back down to" : "rallies up to"} the ${ser(c.level as Record<string, unknown>)} (within ${c.within} candles)`;
    case "candle": return `${tf}${String(c.pattern).replace("_", " ")} candle`;
    default: return `${tf}${ser(a)} ${c.type} for ${c.bars} candles`;
  }
}

export default function Lab({ store }: { store: Store }) {
  const [text, setText] = useState(""); const [rules, setRules] = useState<Rules | null>(null); const [json, setJson] = useState("");
  const [rep, setRep] = useState<LabReport | null>(null); const [busy, setBusy] = useState<"" | "parse" | "run">(""); const [err, setErr] = useState<string | null>(null);
  const [adv, setAdv] = useState(false);
  const parse = async () => { setBusy("parse"); setErr(null); setRep(null); try { const r = await labParse(text); setRules(r.rules); setJson(JSON.stringify(r.rules, null, 2)); } catch (e: unknown) { setErr((e as Error).message); } setBusy(""); };
  const upd = (patch: Partial<Rules>) => { if (!rules) return; const r = { ...rules, ...patch } as Rules; setRules(r); setJson(JSON.stringify(r, null, 2)); };
  const run = async () => {
    let r = rules; if (adv) { try { r = JSON.parse(json); } catch { setErr("The rules JSON has a syntax error."); return; } }
    setBusy("run"); setErr(null); try { setRep(await labRun(r!, store.balance, store.riskPct)); } catch (e: unknown) { setErr((e as Error).message); } setBusy("");
  };
  const upFile = async (f: File | undefined) => { if (f) setText(await f.text()); };
  const good = rep && (rep.avg_r ?? -1) > 0 && rep.trades >= 30;
  return (
    <section className="max-w-3xl mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Strategy Lab</h1>
      <p className="muted mt-2 max-w-prose">Paste any rule book. The AI only translates it into exact rules; the test itself is plain code on real market history, with spreads.</p>
      <textarea className="field mt-6 min-h-[180px] font-normal leading-relaxed" placeholder="Paste the strategy rules here, or the text of a PDF rule book…" value={text} onChange={e => setText(e.target.value)} aria-label="Rule book" />
      <div className="flex flex-wrap gap-3 mt-3 items-center">
        <button className="btn btn-ink" onClick={parse} disabled={busy !== "" || text.trim().length < 40}>{busy === "parse" ? "Translating the rules…" : "Translate the rules"}</button>
        <label className="btn btn-ghost text-sm cursor-pointer">Upload .txt<input type="file" accept=".txt,.md" className="hidden" onChange={e => upFile(e.target.files?.[0])} /></label>
        {!text && <button className="text-sm underline" onClick={() => setText(SAMPLE)}>Try a sample rule book</button>}
      </div>
      {err && <p className="mt-4 text-sm" style={{ color: "var(--rust)" }}>{err}</p>}

      {rules && <div className="mt-8">
        <h2 className="display text-4xl">What the AI understood</h2>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <label className="text-sm font-semibold">Market<select className="field mt-1" value={rules.symbol} onChange={e => upd({ symbol: e.target.value })}>{MARKETS.map(m => <option key={m} value={m}>{m === "GOLD" ? "Gold" : m.replace("USDT", "")}</option>)}</select></label>
          <label className="text-sm font-semibold">Entry chart<select className="field mt-1" value={rules.timeframe} onChange={e => upd({ timeframe: e.target.value })}>{["15m", "1h", "4h"].map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="text-sm font-semibold">Target (reward : risk)<input className="field num mt-1" type="number" step={0.5} min={0.5} value={rules.target?.type === "rr" ? (rules.target.value ?? 3) : 3} onChange={e => upd({ target: { type: "rr", value: Number(e.target.value) } })} /></label>
        </div>
        {(["long", "short"] as const).map(side => rules[side]?.length ? <div key={side} className="row mt-4">
          <span className={`pill ${side === "long" ? "pill-long" : "pill-short"}`}>{side === "long" ? "Buy when all are true" : "Sell when all are true"}</span>
          <ul className="grid gap-1.5 mt-3 text-sm">{rules[side].map((c, i) => <li key={i} className="chk"><i className="on">✓</i><span>{say(c, rules.timeframe)}</span></li>)}</ul>
        </div> : null)}
        <p className="text-sm mt-3">Stop: <b>{rules.stop.type === "atr" ? `${rules.stop.mult} × ATR` : rules.stop.type === "swing" ? `beyond the ${rules.stop.lookback}-candle swing` : rules.stop.type === "ema" ? `at the ${rules.stop.period} EMA` : `${rules.stop.value}%`}</b>. Close after {rules.max_hold_bars} candles if neither level is hit.</p>
        {!!rules.assumptions?.length && <div className="rounded-2xl p-4 mt-5" style={{ background: "var(--paper-2)" }}>
          <div className="font-semibold text-sm">Choices the AI had to make</div>
          {rules.assumptions.map((a, i) => <p key={i} className="text-sm mt-2"><b>{a.text}</b> Chose: {a.choice}{a.alternatives?.length ? `. Other readings: ${a.alternatives.join("; ")}.` : "."}</p>)}
        </div>}
        <button className="text-sm underline mt-4" onClick={() => setAdv(a => !a)}>{adv ? "Hide" : "Edit"} the exact rules (JSON)</button>
        {adv && <textarea className="field mt-2 min-h-[220px] font-mono text-xs" value={json} onChange={e => setJson(e.target.value)} aria-label="Rules JSON" />}
        <button className="btn btn-violet w-full mt-5" onClick={run} disabled={busy !== ""}>{busy === "run" ? "Testing on real history… (up to a minute)" : `Test it on real data`}</button>
      </div>}

      {rep && <div className="mt-10" aria-live="polite">
        <h2 className="display text-5xl" style={{ color: rep.trades === 0 ? undefined : good ? "var(--violet)" : "var(--rust)" }}>
          {rep.trades === 0 ? "No trades" : good ? "Makes money after costs" : (rep.avg_r ?? 0) > 0 ? "Too few trades to trust" : "Loses money after costs"}</h2>
        <p className="muted text-sm mt-1">{rep.name}, {rep.period[0]} to {rep.period[1]}, costs {rep.cost_pct.toFixed(2)}% per trade.</p>
        {rep.trades > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-5 num">
          {[["Trades", `${rep.trades}`, `${rep.per_week}/week`], ["Wins", `${rep.win_rate}%`, `${rep.target_hit_pct}% hit target`], ["Per trade", `${(rep.avg_r ?? 0) >= 0 ? "+" : ""}${rep.avg_r}R`, `${rep.avg_r_before_costs}R before costs`],
            ["Worst streak", `${rep.longest_losing_streak}`, `losses in a row`]].map(([k, v, s]) => <div key={k}><div className="text-sm muted">{k}</div><div className="display text-4xl">{v}</div><div className="text-xs muted">{s}</div></div>)}
        </div>}
        {rep.account && <p className="mt-4 num">Starting with {usd(rep.account.start)} at {rep.account.risk_pct}% risk per trade, you would have ended with <b>{usd(rep.account.end)}</b>{rep.account.blown ? " (account wiped out)" : ""}.</p>}
        {rep.flags.length > 0 && <div className="rounded-2xl p-4 mt-5 grid gap-2" style={{ background: "var(--paper-2)" }}><div className="font-semibold text-sm">Red flags</div>{rep.flags.map(f => <p key={f} className="text-sm">{f}</p>)}</div>}
        {rep.equity_r && rep.equity_r.length > 2 && <Spark pts={rep.equity_r} />}
        {rep.by_year && <div className="mt-5"><div className="font-semibold text-sm">By year</div>{Object.entries(rep.by_year).map(([y, v]) =>
          <div key={y} className="row !py-2 flex justify-between num text-sm"><span>{y}</span><span>{v.trades} trades, {v.win_rate}% wins, <b style={{ color: v.avg_r >= 0 ? "var(--violet)" : "var(--rust)" }}>{v.avg_r >= 0 ? "+" : ""}{v.avg_r}R</b></span></div>)}</div>}
      </div>}
    </section>
  );
}

function Spark({ pts }: { pts: number[] }) {
  const W = 600, H = 120, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const x = (i: number) => i / (pts.length - 1) * W, y = (v: number) => H - (v - lo) / (hi - lo || 1) * H;
  return <figure className="mt-6"><svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative result in R over the test">
    <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />
    <polyline fill="none" stroke={pts[pts.length - 1] >= 0 ? "var(--violet)" : "var(--rust)"} strokeWidth={2} points={pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
  </svg><figcaption className="text-xs muted">Running total in R (1R = one stop-loss)</figcaption></figure>;
}
