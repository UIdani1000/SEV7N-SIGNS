"use client";
import { useState } from "react";
import { PROP_ODDS, PROP_PRESETS, PropState, Store, money, propNumbers } from "@/lib/signs";

export default function Prop({ store, setStore, toast }: { store: Store; setStore: (s: Store) => void; toast: (m: string) => void }) {
  const st: PropState = store.prop || { presetId: PROP_PRESETS[0].id, phase: 1, balance: PROP_PRESETS[0].size, dayStart: PROP_PRESETS[0].size, payouts: 0 };
  const set = (patch: Partial<PropState>) => setStore({ ...store, prop: { ...st, ...patch } });
  const n = propNumbers(st); const c = n.p.currency;
  const [check, setCheck] = useState<number>(Math.round(n.risk));
  const verdict = check > n.roomToday ? `No. That could breach today's loss limit (${money(c, n.roomToday)} left today).`
    : check > n.roomTotal ? `No. That could breach the max-loss floor (${money(c, n.roomTotal)} left).`
    : check > n.p.size * 0.03 ? "Risky. Some firms fail any single loss above 3% of the account."
    : check > n.risk * 1.5 ? `Allowed, but above the tested ${n.riskPct}% (${money(c, n.risk)}). Tested odds drop with bigger risk.` : "Yes. Within every limit and the tested risk.";
  const ok = verdict.startsWith("Yes");
  return (
    <section className="max-w-4xl mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Prop Mode</h1>
      <p className="muted mt-2 max-w-prose">Pass the challenge by not breaking it. Keep these numbers updated after each trade.</p>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <label className="text-sm font-semibold">Account
          <select className="field mt-1" value={st.presetId} onChange={e => { const p = PROP_PRESETS.find(x => x.id === e.target.value)!; set({ presetId: p.id, balance: p.size, dayStart: p.size, payouts: 0, phase: 1 }); }}>
            {PROP_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <div className="text-sm font-semibold">Stage
          <div className="flex gap-2 mt-1">{([1, 2, 3] as const).map(ph => (
            <button key={ph} className={`pill !py-2 !px-4 ${st.phase === ph ? "pill-short" : ""}`} onClick={() => set({ phase: ph })}>{ph === 3 ? "Funded" : `Phase ${ph}`}</button>))}</div></div>
        <label className="text-sm font-semibold">Balance now ({c})<input className="field num mt-1" type="number" value={st.balance} onChange={e => set({ balance: Number(e.target.value) })} /></label>
        <label className="text-sm font-semibold">Balance at the start of today ({c})<input className="field num mt-1" type="number" value={st.dayStart} onChange={e => set({ dayStart: Number(e.target.value) })} /></label>
      </div>
      <button className="text-sm underline mt-2" onClick={() => { set({ dayStart: st.balance }); toast("New day started from your current balance."); }}>Start a new day from this balance</button>

      {n.breached && <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--rust)", color: "#fff" }} role="alert"><b>This balance is past a limit.</b> On a real challenge this would be a breach. Check the numbers with your firm.</div>}

      <div className="mt-8">
        <div className="flex justify-between text-sm"><span className="font-semibold">{n.funded ? `Progress to the next payout (${money(c, n.payoutGross)})` : `Progress to the ${n.p.target}% target`}</span><span className="num">{Math.round(Math.min(1, n.progress) * 100)}%</span></div>
        <div className="h-3 rounded-full mt-2 overflow-hidden" style={{ background: "var(--paper-2)" }}><div className="h-full" style={{ width: `${Math.min(100, n.progress * 100)}%`, background: "var(--violet)", transition: "width .6s ease" }} /></div>
        <p className="text-sm muted mt-2 num">{n.funded ? `Next payout pays you ${money(c, n.payoutNet)} (${n.nextSplit}% split, payout ${st.payouts + 1}).` : `Target balance ${money(c, n.targetBal)}.`}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-8 num">
        <div><div className="text-sm muted">Left today</div><div className="display text-4xl">{money(c, n.roomToday)}</div><div className="text-xs muted">limit {money(c, n.dailyLimit)}</div></div>
        <div><div className="text-sm muted">Left before floor</div><div className="display text-4xl">{money(c, n.roomTotal)}</div><div className="text-xs muted">floor {money(c, n.floor)}</div></div>
        <div><div className="text-sm muted">Risk per trade</div><div className="display text-4xl">{money(c, n.risk)}</div><div className="text-xs muted">{n.riskPct}% (tested)</div></div>
        <div><div className="text-sm muted">Losses you can take</div><div className="display text-4xl">{n.tradesLeftToday}</div><div className="text-xs muted">today, {n.tradesLeftTotal} in total</div></div>
      </div>

      <div className="row mt-8">
        <h2 className="font-semibold">Can I take this trade?</h2>
        <div className="flex gap-2 items-center mt-2"><span className="muted">If it hits the stop I lose</span>
          <input className="field num !w-40" type="number" value={check} onChange={e => setCheck(Number(e.target.value))} /><span className="muted">{c}</span></div>
        <p className="mt-3 font-semibold" style={{ color: ok ? "var(--violet)" : "var(--rust)" }}>{verdict}</p>
      </div>

      {n.funded && <div className="row"><h2 className="font-semibold">Payouts</h2>
        <p className="text-sm muted mt-1">Each payout is {n.p.payoutPct}% of the account. You keep {n.p.splits.slice(0, 4)[0]}% of the first four, then {n.p.splits.slice(4).join("%, ")}%.</p>
        <div className="flex gap-3 mt-3 items-center"><span className="num">Payouts taken: <b>{st.payouts}</b></span>
          <button className="btn btn-ghost text-sm !py-2" onClick={() => { set({ payouts: st.payouts + 1, balance: st.balance - n.payoutGross, dayStart: st.dayStart - n.payoutGross }); toast(`Payout recorded: ${money(c, n.payoutNet)} to you.`); }} disabled={n.progress < 1}>Record a payout</button></div>
        <p className="text-xs muted mt-2">After a payout your buffer resets to the 6% floor, so the tested funded risk is lower (0.75%).</p></div>}

      <div className="row"><h2 className="font-semibold">Tested odds on this account</h2>
        <p className="text-sm muted mt-1">Historical replays of {n.p.name.includes("1.5") ? "this exact account" : "the ₦1.5M version (same rules)"}, starting a challenge every week since 2020.</p>
        {PROP_ODDS.map(o => <div key={o.plan} className="flex justify-between text-sm num mt-2 gap-3"><span>{o.plan}</span><span className="text-right">passes {o.pass}%, about {o.days} days{o.perAttempt ? `, worth ${money("₦", o.perAttempt)} per attempt` : ""}</span></div>)}
        <p className="text-xs muted mt-3">About 1 in 4 attempts passes both phases. Budget for several attempts. Past results are not a promise.</p></div>
    </section>
  );
}
