"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { friendly, logOut, signIn, signUp } from "@/lib/sync";

export default function Account({ user, syncedAt, toast }: { user: User | null; syncedAt: number | null; toast: (m: string) => void }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async (fn: typeof signIn, label: string) => { setBusy(true); setErr(null); try { await fn(email, pw); toast(label); } catch (e) { setErr(friendly(e)); } setBusy(false); };
  return (
    <section className="max-w-md mx-auto px-5 pt-6 pb-32">
      <h1 className="display text-7xl">Sync</h1>
      <p className="muted mt-2">Sign in on each device to share your paper trades, balance, risk and Prop Mode numbers.</p>
      {user ? <div className="mt-6">
        <p>Signed in as <b>{user.email}</b>.</p>
        <p className="text-sm muted mt-1">{syncedAt ? `Last synced ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "Syncing…"}</p>
        <button className="btn btn-ghost mt-4" onClick={() => logOut().then(() => toast("Signed out. Your data stays on this device."))}>Sign out</button>
      </div> : <form className="mt-6 grid gap-3" onSubmit={e => { e.preventDefault(); go(signIn, "Signed in. Syncing now."); }}>
        <label className="text-sm font-semibold">Email<input className="field mt-1" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="text-sm font-semibold">Password<input className="field mt-1" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required /></label>
        {err && <p className="text-sm" style={{ color: "var(--rust)" }}>{err}</p>}
        <div className="flex gap-3"><button className="btn btn-ink flex-1" disabled={busy}>Sign in</button>
          <button type="button" className="btn btn-ghost flex-1" disabled={busy || !email || pw.length < 6} onClick={() => go(signUp, "Account created. Syncing now.")}>Create account</button></div>
        <p className="text-xs muted">Your trades on this device are merged into the account the first time you sign in.</p>
      </form>}
    </section>
  );
}
