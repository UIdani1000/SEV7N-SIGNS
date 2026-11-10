"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { friendly, logOut, resetPassword, signIn, signUp } from "@/lib/sync";

export default function Account({ user, syncedAt, toast, trades }: { user: User | null; syncedAt: number | null; toast: (m: string) => void; trades: number }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try { if (mode === "in") { await signIn(email.trim(), pw); toast("Signed in. Your data is syncing."); } else { await signUp(email.trim(), pw); toast("Account created. Your data is syncing."); } }
    catch (e) { setErr(friendly(e)); }
    setBusy(false);
  };
  const forgot = async () => {
    setErr(null); setInfo(null);
    try { await resetPassword(email.trim()); setInfo(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox and spam folder.`); }
    catch (e) { setErr(friendly(e)); }
  };
  if (user) return (
    <section className="max-w-md mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Account</h1>
      <div className="flex items-center gap-4 mt-6">
        <span className="w-14 h-14 rounded-full grid place-items-center display text-3xl" style={{ background: "var(--violet)", color: "var(--violet-ink)" }}>{(user.email || "?")[0].toUpperCase()}</span>
        <div><div className="font-semibold break-all">{user.email}</div>
          <div className="text-sm muted">{syncedAt ? `Synced at ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}</div></div>
      </div>
      <p className="text-sm mt-6">Your paper trades, balance, risk and Prop Mode numbers are saved to your account and update on every device you sign in on.</p>
      <button className="btn btn-ghost mt-6" onClick={() => logOut().then(() => toast("Signed out. Your data stays on this device too."))}>Sign out</button>
    </section>
  );
  return (
    <section className="max-w-md mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">{mode === "in" ? "Sign in" : "Create account"}</h1>
      <p className="muted mt-2">{mode === "in" ? "Pick up your paper trades and settings on any device." : "Save your paper trades and settings, and use them on every device."}</p>
      <div className="flex gap-2 mt-6" role="tablist">
        <button role="tab" aria-selected={mode === "in"} className={`pill !py-2 !px-4 ${mode === "in" ? "pill-short" : ""}`} onClick={() => { setMode("in"); setErr(null); }}>Sign in</button>
        <button role="tab" aria-selected={mode === "up"} className={`pill !py-2 !px-4 ${mode === "up" ? "pill-short" : ""}`} onClick={() => { setMode("up"); setErr(null); }}>Create account</button>
      </div>
      <form className="mt-5 grid gap-3" onSubmit={e => { e.preventDefault(); submit(); }}>
        <label className="text-sm font-semibold">Email<input className="field mt-1 font-normal" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="text-sm font-semibold">Password
          <span className="flex gap-2 mt-1"><input className="field font-normal flex-1" type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
            <button type="button" className="btn btn-ghost !px-3 text-sm" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button></span>
          {mode === "up" && <span className="text-xs muted font-normal">At least 6 characters.</span>}</label>
        {err && <p className="text-sm" style={{ color: "var(--rust)" }} role="alert">{err}</p>}
        {info && <p className="text-sm" role="status">{info}</p>}
        <button className="btn btn-ink mt-1" disabled={busy || !email || pw.length < 6}>{busy ? (mode === "in" ? "Signing in…" : "Creating account…") : (mode === "in" ? "Sign in" : "Create account")}</button>
        {mode === "in" && <button type="button" className="text-sm underline justify-self-start" onClick={forgot}>Forgot password?</button>}
      </form>
      <p className="text-xs muted mt-6">{trades ? `Your ${trades} paper trade${trades > 1 ? "s" : ""} on this device will be added to the account when you sign in.` : "You can use SEV7N SIGNS without an account; your data then stays on this device."}</p>
    </section>
  );
}
