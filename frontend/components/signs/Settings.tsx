"use client";
import { askNotify, notify, notifyPermission, notifySupported, siren, unlockSound } from "@/lib/alerts";
import { ALERT_DEFAULTS, sendSirenToTelegram } from "@/lib/signs";
import { useState } from "react";
import { Store, telegramStatus, telegramTest } from "@/lib/signs";

export default function Settings({ store, setStore, onClose, toast }: { store: Store; setStore: (s: Store) => void; onClose: () => void; toast: (m: string) => void }) {
  const [perm, setPerm] = useState<NotificationPermission | "denied">(typeof window === "undefined" ? "default" : notifyPermission());
  const [bal, setBal] = useState(store.balance); const [risk, setRisk] = useState(store.riskPct);
  const [tg, setTg] = useState<Awaited<ReturnType<typeof telegramStatus>> | null>(null); const [tgBusy, setTgBusy] = useState(false);
  const saveAll = () => { setStore({ ...store, balance: bal, riskPct: risk, startBalance: store.paper.length ? store.startBalance : bal }); toast("Settings saved."); onClose(); };
  const check = async () => { setTgBusy(true); try { setTg(await telegramStatus()); } catch (e: unknown) { setTg({ connected: false, error: (e as Error).message }); } setTgBusy(false); };
  const test = async () => { try { const r = await telegramTest(); toast(r.ok ? "Test message sent to Telegram." : r.error || "Telegram test failed."); } catch (e: unknown) { toast((e as Error).message); } };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="flex justify-between items-start"><h2 className="display text-6xl">Settings</h2><button className="btn btn-ghost !px-3 !py-2" onClick={onClose}>Close</button></div>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <label className="text-sm font-semibold">Account balance ($)<input className="field num mt-1" type="number" min={1} value={bal} onChange={e => setBal(Number(e.target.value))} /></label>
          <label className="text-sm font-semibold">Risk per trade (%)<input className="field num mt-1" type="number" min={0.25} max={25} step={0.25} value={risk} onChange={e => setRisk(Number(e.target.value))} /></label>
        </div>
        <p className="text-sm muted mt-2">Every setup is sized from these. Stops and targets come from the chart; your balance only changes the position size.</p>
        <button className="btn btn-ink w-full mt-4" onClick={saveAll}>Save settings</button>

        <h3 className="font-semibold mt-8">Entry alerts</h3>
        <p className="text-sm muted mt-1">While the app is open (or in a background tab), new entries play a siren and show a notification.</p>
        <div className="grid gap-2 mt-3 text-sm">
          {([["sound", "Siren sound"], ["push", "Notifications"], ["swing", "Alert on new long and short signals too"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={(store.alerts || ALERT_DEFAULTS)[k]} onChange={e => setStore({ ...store, alerts: { ...(store.alerts || ALERT_DEFAULTS), [k]: e.target.checked } })} /> {l}</label>))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-ghost text-sm !py-2" onClick={() => { unlockSound(); siren(); }}>Test the siren</button>
          {notifySupported() && perm !== "granted" && <button className="btn btn-ghost text-sm !py-2" onClick={async () => { const p = await askNotify(); setPerm(p); toast(p === "granted" ? "Notifications on." : "Notifications are blocked. Allow them in your browser’s site settings."); }}>Turn on notifications</button>}
          {perm === "granted" && <button className="btn btn-ghost text-sm !py-2" onClick={() => notify("🚨 Test alert", "This is how SEV7N entries will look.", "test")}>Test a notification</button>}
        </div>
        {!notifySupported() && <p className="text-xs muted mt-2">This browser can’t show notifications. On iPhone, add SEV7N SIGNS to your Home Screen first (Share, then Add to Home Screen).</p>}
        <p className="text-xs muted mt-2">When the app is fully closed, websites can’t play sounds. For a siren then, use Telegram below and set the SEV7N siren as that chat’s sound.</p>

        <h3 className="font-semibold mt-8">Telegram alerts</h3>
        <p className="text-sm muted mt-1">Get every new signal on your phone. The server scans every hour.</p>
        {!tg && <button className="btn btn-ghost mt-3 text-sm" onClick={check} disabled={tgBusy}>{tgBusy ? "Checking…" : "Check connection"}</button>}
        {tg && <div className="mt-3 text-sm grid gap-2">
          {tg.error && <p style={{ color: "var(--rust)" }}>{tg.error}</p>}
          {tg.connected ? <><p>Connected. Alerts go to chat {tg.chat_id_set}.</p><button className="btn btn-ghost text-sm justify-self-start" onClick={test}>Send a test message</button></> : tg.bot && <ol className="grid gap-1.5 list-decimal pl-5">
            <li>Open <a className="underline" href={`https://t.me/${tg.bot}`} target="_blank" rel="noreferrer">t.me/{tg.bot}</a> and press Start.</li>
            <li>Come back and tap <button className="underline" onClick={check}>check again</button> to see your chat ID.
              {tg.recent_chats?.map(c => <span key={c.id} className="flex items-center gap-2 mt-2"><b className="num text-base">{c.id}</b><span className="muted">from {c.name}</span>
                <button className="pill !py-1" onClick={() => { navigator.clipboard?.writeText(String(c.id)); toast("Chat ID copied."); }}>Copy</button></span>)}</li>
            <li>In Render, add <b>TELEGRAM_CHAT_ID</b> with just the number (no name or brackets). Alerts start on the next hourly scan.</li>
          </ol>}
        </div>}

        {tg?.connected && <div className="mt-4"><button className="btn btn-ghost text-sm !py-2" onClick={async () => { try { await sendSirenToTelegram(); toast("Siren sent to your Telegram chat. Follow the steps in its caption."); } catch (e: unknown) { toast((e as Error).message); } }}>Send the siren sound to Telegram</button>
          <p className="text-xs muted mt-2">In Telegram, open the audio’s menu and choose “Save for notifications”, then open the chat name, Notifications, Sound, and pick “sev7n-siren”.</p></div>}
        <h3 className="font-semibold mt-8">Coming next</h3>
        <p className="text-sm muted mt-1">Prop Mode, Strategy Lab and High Risk Mode (scalping sessions, paper-only at first).</p>
        <a className="text-sm underline mt-6 inline-block" href="/legacy">Open the old Aura dashboard</a>
        <p className="text-xs muted mt-6">SEV7N SIGNS shows backtested strategies. Past results are not a promise of future returns. Not financial advice. Powered by SEV7N FOLD.</p>
      </aside>
    </>
  );
}
