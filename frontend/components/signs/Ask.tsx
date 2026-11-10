"use client";
import { useRef, useState } from "react";
import { chat } from "@/lib/signs";

const STARTERS = ["What is this week’s Weekly Trend pick, and why?", "How should I size trades on a $25 account?", "Explain the squeeze breakout like I’m new to trading", "What are the biggest risks with these strategies?"];

export default function Ask() {
  const [msgs, setMsgs] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history = [...msgs, { role: "user" as const, text }];
    setMsgs(history); setInput(""); setBusy(true); setErr(null);
    try { const r = await chat(text, history); setMsgs([...history, { role: "model", text: r.response }]); }
    catch (e: unknown) { setErr((e as Error).message); }
    setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  return (
    <section className="max-w-2xl mx-auto px-5 pt-6 pb-40">
      <h1 className="display text-7xl">Ask</h1>
      <p className="muted mt-2">The SEV7N analyst knows live prices and how each strategy works. It explains; it doesn’t promise.</p>
      {!msgs.length && <div className="grid gap-2 mt-6">{STARTERS.map(s => <button key={s} className="row text-left text-[0.95rem] hover:text-[var(--violet)]" onClick={() => send(s)}>{s}</button>)}</div>}
      <div className="grid gap-5 mt-6">{msgs.map((m, i) => (
        <div key={i} className={m.role === "user" ? "justify-self-end max-w-[85%] rounded-2xl px-4 py-3" : "max-w-prose leading-relaxed whitespace-pre-wrap"}
          style={m.role === "user" ? { background: "var(--ink)", color: "var(--paper)" } : {}}>{m.text}</div>
      ))}</div>
      {busy && <p className="muted mt-4">Thinking…</p>}
      {err && <p className="mt-4 text-sm" style={{ color: "var(--rust)" }}>{err}</p>}
      <div ref={end} />
      <form className="fixed left-0 right-0 bottom-[calc(4.8rem+env(safe-area-inset-bottom))] md:bottom-6 px-5" onSubmit={e => { e.preventDefault(); send(input); }}>
        <div className="max-w-2xl mx-auto flex gap-2">
          <input className="field flex-1" placeholder="Ask about a setup, a market or your risk…" value={input} onChange={e => setInput(e.target.value)} aria-label="Message" />
          <button className="btn btn-ink" disabled={busy || !input.trim()}>Send</button>
        </div>
      </form>
    </section>
  );
}
