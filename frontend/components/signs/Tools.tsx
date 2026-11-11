"use client";
export type ToolView = "guide" | "shorts" | "prop" | "lab" | "highrisk" | "sync";
const TOOLS: [ToolView | "settings", string, string][] = [
  ["guide", "How the strategies work", "What each one looks for, when to enter, what to expect"],
  ["shorts", "Shorts", "Sell setups from the Trend Pullback rules"],
  ["prop", "Prop Mode", "Track a challenge: limits, risk per trade, payouts"],
  ["lab", "Strategy Lab", "Test any rule book on real market history"],
  ["highrisk", "High Risk Mode", "Practice scalps on the 5-minute chart. Loses money over time; paper only"],
  ["sync", "Account", "Sign in to keep your data on every device"],
  ["settings", "Settings", "Balance, risk and Telegram alerts"],
];
export default function Tools({ onPick, onClose }: { onPick: (v: ToolView | "settings") => void; onClose: () => void }) {
  return (<>
    <div className="scrim" onClick={onClose} />
    <aside className="sheet" role="dialog" aria-modal="true" aria-label="Tools">
      <div className="flex justify-between items-start"><h2 className="display text-6xl">Tools</h2><button className="btn btn-ghost !px-3 !py-2" onClick={onClose}>Close</button></div>
      <div className="mt-4">{TOOLS.map(([v, t, d]) => (
        <button key={v} className="row w-full text-left" onClick={() => onPick(v)}>
          <div className="display text-3xl" style={v === "highrisk" ? { color: "var(--rust)" } : {}}>{t}</div><div className="text-sm muted mt-1">{d}</div>
        </button>))}</div>
    </aside></>);
}
