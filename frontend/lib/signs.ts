// SEV7N SIGNS client: types, API calls, sizing math and local storage.
export const API = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000";

export type Side = "long" | "short";
export interface Stats { name: string; win_rate: number; avg_r: number; per_week: string; years_positive: string; worst_losing_streak: number; hold: string; max_risk_hint: number }
export interface Signal {
  id: string; strategy: "weekly" | "squeeze" | "pullback"; strategy_name: string; symbol: string; ticker: string; name: string;
  side: Side; entry: number; sl: number; tp: number; rr: number; risk_pct_of_price: number; candle_time: string; expires: string;
  reasons: string[]; stats: Stats; status?: string; price?: number | null; closed_at?: string | null;
}
export interface Check { label: string; ok: boolean }
export interface Near { strategy: string; strategy_name: string; symbol: string; ticker: string; name: string; side: Side; checks: Check[]; met: number; total: number; watch: string }
export interface Board { symbol: string; ticker: string; name: string; week_return_pct?: number; strength?: number; error?: string }
export interface Weekly { week_start: string; next_scan: string; pick: Signal | null; leaderboard: Board[]; note: string | null }
export interface ScanResult { generated_at: string; seconds: number; side: string; weekly: Weekly | null; signals: Signal[]; near: Near[]; errors: { symbol: string; error: string }[]; markets_scanned: number }
export interface PaperTrade extends Signal { opened_at: string; risk_usd: number; result?: { status: string; r?: number; exit?: number; price?: number; closed_at?: string } }

async function call<T>(path: string, init?: RequestInit, timeoutMs = 90000): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server answered ${res.status}`);
    return data as T;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("The signal server took too long. It may be waking up; try again in a moment.");
    if (e instanceof TypeError) throw new Error("Couldn't reach the signal server. Check your connection, then try again.");
    throw e;
  } finally { clearTimeout(timer); }
}

export const getWeekly = () => call<Weekly>("/api/weekly");
export const runScan = (side: "all" | "long" | "short") => call<ScanResult>(`/api/scan?side=${side}`);
export const getCandles = (symbol: string, tf: string) => call<{ candles: { t: number; o: number; h: number; l: number; c: number }[] }>(`/api/candles?symbol=${symbol}&tf=${tf}&limit=80`);
export const explain = (signal: Signal) => call<{ text: string | null; error?: string }>("/api/explain", { method: "POST", body: JSON.stringify({ signal }) });
export const tradeStatus = (trades: PaperTrade[]) => call<{ trades: { id: string; status: string; r?: number; exit?: number; price?: number; closed_at?: string }[] }>("/api/trades/status", { method: "POST", body: JSON.stringify({ trades }) });
export const telegramStatus = () => call<{ connected: boolean; bot?: string; chat_id_set?: string; recent_chats?: { id: number; name: string }[]; error?: string }>("/api/telegram/status");
export const telegramTest = () => call<{ ok: boolean; error?: string }>("/api/telegram/test", { method: "POST" });
export const chat = (message: string, chatHistory: { role: string; text: string }[]) => call<{ response: string }>("/chat", { method: "POST", body: JSON.stringify({ message, chatHistory }) });

// ---------- sizing
export interface Plan { riskUsd: number; units: number; notional: number; targetUsd: number; unitLabel: string; warnings: string[] }
export function plan(sig: Pick<Signal, "entry" | "sl" | "tp" | "symbol" | "rr" | "stats">, balance: number, riskPct: number): Plan {
  const riskUsd = Math.max(0, balance * riskPct / 100);
  const perUnit = Math.abs(sig.entry - sig.sl);
  const units = perUnit > 0 ? riskUsd / perUnit : 0;
  const notional = units * sig.entry;
  const warnings: string[] = [];
  let unitLabel = `${fmtQty(units)} ${sig.symbol.replace("USDT", "")}`;
  if (sig.symbol === "GOLD") {
    const lots = units / 100;
    unitLabel = lots >= 0.01 ? `${lots.toFixed(2)} lots (${units.toFixed(2)} oz)` : `${units.toFixed(3)} oz of gold`;
    if (lots < 0.01) warnings.push(`Too small for a 0.01-lot CFD (1 oz), which would risk $${perUnit.toFixed(2)}. Use fractional gold (XAUT or PAXG on a crypto exchange) or a larger balance.`);
  } else if (notional < 5) warnings.push("Position is under $5, below most exchanges’ minimum order size.");
  if (riskPct > sig.stats.max_risk_hint) warnings.push(`${sig.stats.name} has had losing streaks of ${sig.stats.worst_losing_streak} trades. Above ${sig.stats.max_risk_hint}% risk, a streak like that can wipe out most of the account.`);
  if (notional > balance * 1.5) warnings.push(`Needs about ${(notional / Math.max(balance, 1)).toFixed(1)}x leverage on this balance.`);
  return { riskUsd, units, notional, targetUsd: riskUsd * sig.rr, unitLabel, warnings };
}
export function fmtQty(x: number) { return x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toPrecision(3); }
export function fmtPrice(x: number | null | undefined) { if (x == null || !isFinite(x)) return "–"; return x >= 1000 ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(x >= 100 ? 2 : 3) : x.toPrecision(4); }
export function usd(x: number) { return `$${x.toFixed(x < 10 ? 2 : 0)}`; }

// ---------- storage
const KEY = "sev7n-signs-v1";
export interface Store { balance: number; riskPct: number; paper: PaperTrade[]; startBalance: number }
export const DEFAULTS: Store = { balance: 25, riskPct: 6, paper: [], startBalance: 25 };
export function load(): Store { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s ? { ...DEFAULTS, ...s } : DEFAULTS; } catch { return DEFAULTS; } }
export function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }
export const STATS_LABEL = "Tested figures come from 2020–2026 backtests with fees and funding. A handful of paper trades will swing far from them; judge after 30+.";
