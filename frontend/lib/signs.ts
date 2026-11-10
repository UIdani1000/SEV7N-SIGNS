// SEV7N SIGNS client: types, API calls, sizing math and local storage.
export const API = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000";

export type Side = "long" | "short";
export interface Stats { name: string; win_rate: number; avg_r: number; per_week: string; years_positive: string; worst_losing_streak: number; hold: string; max_risk_hint: number }
export interface Signal {
  id: string; strategy: "weekly" | "squeeze" | "pullback" | "manual" | "scalp"; strategy_name: string; symbol: string; ticker: string; name: string;
  side: Side; entry: number; sl: number; tp: number; rr: number; risk_pct_of_price: number; candle_time: string; expires: string;
  reasons: string[]; stats: Stats; status?: string; price?: number | null; closed_at?: string | null;
}
export interface Check { label: string; ok: boolean }
export interface Near { strategy: string; strategy_name: string; symbol: string; ticker: string; name: string; side: Side; checks: Check[]; met: number; total: number; watch: string }
export interface Board { symbol: string; ticker: string; name: string; week_return_pct?: number; strength?: number; error?: string }
export interface Weekly { week_start: string; next_scan: string; pick: Signal | null; leaderboard: Board[]; note: string | null }
export interface ScanResult { generated_at: string; seconds: number; side: string; weekly: Weekly | null; signals: Signal[]; near: Near[]; errors: { symbol: string; error: string }[]; markets_scanned: number }
export interface PaperTrade extends Signal { opened_at: string; risk_usd: number; note?: string; result?: { status: string; r?: number; exit?: number; price?: number; closed_at?: string } }

async function call<T>(path: string, init?: RequestInit, timeoutMs = 90000): Promise<T> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { cache: "no-store", ...init, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
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
export interface Store { balance: number; riskPct: number; paper: PaperTrade[]; startBalance: number; pair?: string; prop?: PropState; updatedAt?: number; alerts?: AlertPrefs }
export interface AlertPrefs { sound: boolean; push: boolean; swing: boolean }
export const ALERT_DEFAULTS: AlertPrefs = { sound: true, push: true, swing: true };
export const DEFAULTS: Store = { balance: 25, riskPct: 6, paper: [], startBalance: 25 };
export function load(): Store { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s ? { ...DEFAULTS, ...s } : DEFAULTS; } catch { return DEFAULTS; } }
export function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }
export function stamp(s: Store): Store { return { ...s, updatedAt: Date.now() }; }
export const STATS_LABEL = "Tested figures come from 2020–2026 backtests with fees and funding. A handful of paper trades will swing far from them; judge after 30+.";

// ---------- markets
export interface MarketInfo { symbol: string; ticker: string; name: string; major: boolean }
export interface StrategyView { strategy: string; strategy_name: string; side: Side; checks: Check[]; met: number; total: number; watch: string; signal: Signal | null; tested_here: boolean }
export interface MarketView {
  symbol: string; ticker: string; name: string; price: number; change_24h_pct: number; daily_trend: "up" | "down"; tested: boolean;
  strategies: StrategyView[]; generated_at: string;
  weekly: { is_pick: boolean; pick: Signal | null; row: Board | null; rank: number | null; pick_ticker: string | null; next_scan: string } | null;
}
export const getMarkets = () => call<MarketInfo[]>("/api/markets");
export const getMarket = (symbol: string) => call<MarketView>(`/api/market?symbol=${symbol}`);

// ---------- High Risk Mode
export interface ScalpSide { side: Side; checks: Check[]; met: number; total: number; setup: (Pick<Signal, "id" | "symbol" | "side" | "entry" | "sl" | "tp" | "rr" | "candle_time" | "expires"> & { strategy: "scalp"; strategy_name: string }) | null }
export interface ScalpView { symbol: string; price: number; candle_time: string; next_check: string; sides: ScalpSide[]; rules: { rr: number; hold_minutes: number; stop_atr: number } }
export const getScalp = (symbol: string) => call<ScalpView>(`/api/scalp?symbol=${symbol}`);
export const SCALP_STATS = { win_rate: 38, avg_r: -0.21, scalps: 4634, years: 3 };

// ---------- Strategy Lab
export type Rules = Record<string, unknown> & { name?: string; symbol: string; timeframe: string; long: Cond[]; short: Cond[]; stop: { type: string; [k: string]: unknown }; target: { type: string; value?: number }; max_hold_bars: number; assumptions?: { text: string; choice: string; alternatives?: string[] }[]; claimed?: { win_rate?: number | null; notes?: string } };
export type Cond = Record<string, unknown> & { type: string; tf?: string };
export interface LabReport { trades: number; per_week: number; win_rate?: number; avg_r?: number; avg_r_before_costs?: number; profit_factor?: number | null; longest_losing_streak?: number; target_hit_pct?: number; max_drawdown_r?: number;
  by_year?: Record<string, { trades: number; avg_r: number; win_rate: number }>; early_vs_late?: { first_two_thirds_avg_r: number; last_third_avg_r: number | null }; equity_r?: number[];
  account?: { start: number; risk_pct: number; end: number; blown: boolean }; last_trades?: { time: string; side: string; outcome: string; r: number }[]; flags: string[]; period: string[]; market: string; name: string; cost_pct: number }
export const labParse = (text: string) => call<{ rules: Rules }>("/api/lab/parse", { method: "POST", body: JSON.stringify({ text }) }, 120000);
export const labRun = (rules: Rules, balance: number, risk_pct: number) => call<LabReport>("/api/lab/run", { method: "POST", body: JSON.stringify({ rules, balance, risk_pct }) }, 180000);

// ---------- Prop Mode
export interface PropPreset { id: string; name: string; size: number; currency: string; fee: number; target: number; daily: number; dailyFunded: number; maxLoss: number; phases: number; inactivityDays: number; payoutPct: number; splits: number[] }
export const PROP_PRESETS: PropPreset[] = [
  { id: "ec-1.5m", name: "Express Classic ₦1.5M", size: 1500000, currency: "₦", fee: 4999, target: 10, daily: 4, dailyFunded: 3, maxLoss: 6, phases: 2, inactivityDays: 18, payoutPct: 10, splits: [50, 50, 50, 50, 70, 80, 95] },
  { id: "ec-600k", name: "Express Classic ₦600K", size: 600000, currency: "₦", fee: 2999, target: 10, daily: 4, dailyFunded: 3, maxLoss: 6, phases: 2, inactivityDays: 18, payoutPct: 10, splits: [50, 50, 50, 50, 70, 80, 95] },
];
export interface PropState { presetId: string; phase: 1 | 2 | 3; balance: number; dayStart: number; payouts: number; lastTradeDate?: string; custom?: PropPreset }
export function propPreset(st: PropState): PropPreset { return st.custom && st.presetId === "custom" ? st.custom : (PROP_PRESETS.find(p => p.id === st.presetId) || PROP_PRESETS[0]); }
export function propNumbers(st: PropState) {
  const p = propPreset(st); const funded = st.phase === 3;
  const floor = p.size * (1 - p.maxLoss / 100);
  const dailyLimit = st.dayStart * (funded ? p.dailyFunded : p.daily) / 100;
  const dailyFloor = st.dayStart - dailyLimit;
  const roomToday = Math.max(0, st.balance - dailyFloor), roomTotal = Math.max(0, st.balance - floor);
  const riskPct = funded ? 0.75 : 1.0;                       // from the prop replays
  const risk = p.size * riskPct / 100;
  const targetBal = p.size * (1 + p.target / 100);
  const progress = funded ? Math.max(0, (st.balance - p.size) / (p.size * p.payoutPct / 100)) : Math.max(0, (st.balance - p.size) / (p.size * p.target / 100));
  const nextSplit = p.splits[Math.min(st.payouts, p.splits.length - 1)];
  return { p, funded, floor, dailyLimit, dailyFloor, roomToday, roomTotal, riskPct, risk, targetBal, progress,
    tradesLeftToday: Math.floor(roomToday / risk), tradesLeftTotal: Math.floor(roomTotal / risk),
    payoutGross: p.size * p.payoutPct / 100, payoutNet: p.size * p.payoutPct / 100 * nextSplit / 100, nextSplit,
    breached: st.balance <= floor || st.balance <= dailyFloor };
}
export const PROP_ODDS = [
  { plan: "Weekly Trend + Squeeze, 1% challenge / 0.75% funded (recommended)", pass: 33, days: 105, perAttempt: 36700, payout: 68 },
  { plan: "Weekly Trend + Squeeze, 0.75% / 0.5%", pass: 38, days: 163, perAttempt: 25300, payout: 75 },
  { plan: "Squeeze only, 1% / 0.75%", pass: 24, days: 78, perAttempt: 15600, payout: 44 },
];
export function money(cur: string, x: number) { return `${x < 0 ? "−" : ""}${cur}${Math.abs(Math.round(x)).toLocaleString()}`; }

// ---------- live prices
export type PriceMap = Record<string, { price: number; change_24h_pct: number | null }>;
export const getPrices = (symbols: string[]) => call<{ prices: PriceMap; at: string }>(`/api/prices?symbols=${symbols.join(",")}`, undefined, 15000);

export const MANUAL_STATS: Stats = { name: "Manual", win_rate: 0, avg_r: 0, per_week: "", years_positive: "", worst_losing_streak: 0, hold: "", max_risk_hint: 6 };
export const MARKET_LIST: [string, string, string][] = [["BTCUSDT", "BTC", "Bitcoin"], ["ETHUSDT", "ETH", "Ethereum"], ["SOLUSDT", "SOL", "Solana"], ["XRPUSDT", "XRP", "XRP"], ["GOLD", "XAUUSD", "Gold"],
  ["BNBUSDT", "BNB", "BNB"], ["ADAUSDT", "ADA", "Cardano"], ["DOGEUSDT", "DOGE", "Dogecoin"], ["AVAXUSDT", "AVAX", "Avalanche"], ["LINKUSDT", "LINK", "Chainlink"], ["DOTUSDT", "DOT", "Polkadot"],
  ["LTCUSDT", "LTC", "Litecoin"], ["TRXUSDT", "TRX", "TRON"], ["ATOMUSDT", "ATOM", "Cosmos"], ["NEARUSDT", "NEAR", "NEAR"], ["UNIUSDT", "UNI", "Uniswap"], ["BCHUSDT", "BCH", "Bitcoin Cash"],
  ["XLMUSDT", "XLM", "Stellar"], ["ETCUSDT", "ETC", "Ethereum Classic"], ["FILUSDT", "FIL", "Filecoin"], ["AAVEUSDT", "AAVE", "Aave"]];

export const getScalpMany = (symbols: string[]) => call<{ markets: (ScalpView & { error?: string })[] }>(`/api/scalp?symbols=${symbols.join(",")}`, undefined, 45000);
export const setServerSession = (symbols: string[], end_at: string) => call<{ active: boolean; telegram: boolean }>("/api/alerts/session", { method: "POST", body: JSON.stringify({ symbols, end_at }) });
export const stopServerSession = () => call<{ active: boolean }>("/api/alerts/session", { method: "DELETE" });
export const sendSirenToTelegram = () => call<{ ok: boolean; error?: string }>("/api/telegram/siren", { method: "POST" }, 30000);
